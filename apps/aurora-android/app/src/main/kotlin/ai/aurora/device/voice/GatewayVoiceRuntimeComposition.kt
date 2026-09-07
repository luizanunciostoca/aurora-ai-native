package ai.aurora.device.voice

import ai.aurora.device.bootstrap.GatewayBootstrapClientError
import ai.aurora.device.bootstrap.GatewayBootstrapClientResult
import ai.aurora.device.bootstrap.GatewayBootstrapGrant
import ai.aurora.device.network.GatewayCredentialProvider
import ai.aurora.device.session.LocalDeviceSessionState
import ai.aurora.device.session.W14DeviceLifecycleState

internal sealed interface LocalGatewayBinding {
    data object FreshInstall : LocalGatewayBinding

    data class Bound(
        val deviceId: String,
        val deviceSessionId: String,
        val tenantId: String,
        val registrationVersion: Int,
    ) : LocalGatewayBinding

    data class Invalid(val reason: String) : LocalGatewayBinding {
        init {
            require(reason.isNotBlank())
        }
    }
}

internal fun localGatewayBindingFrom(state: LocalDeviceSessionState): LocalGatewayBinding {
    val registration = state.registration
    val session = state.session
    if (registration == null && session == null) return LocalGatewayBinding.FreshInstall
    if (registration == null || session == null) {
        return LocalGatewayBinding.Invalid("local device/session binding is incomplete")
    }
    if (registration.state != W14DeviceLifecycleState.ACTIVE) {
        return LocalGatewayBinding.Invalid("local device registration is not active")
    }
    return LocalGatewayBinding.Bound(
        deviceId = registration.deviceId,
        deviceSessionId = session.deviceSessionId,
        tenantId = registration.tenantId,
        registrationVersion = registration.registrationVersion,
    )
}

internal fun interface GatewayBootstrapGrantSource {
    fun exchange(
        expectedDeviceId: String?,
        expectedDeviceSessionId: String?,
    ): GatewayBootstrapClientResult<GatewayBootstrapGrant>
}

internal fun interface GatewayVoiceRuntimeConnector {
    /**
     * Connects the already-authenticated W14 device plane and installs only the governed W07
     * evaluation ingress. Returning true never means action authority or execution success.
     */
    fun connectAndInstall(grant: GatewayBootstrapGrant, expectedRegistrationVersion: Int?): Boolean
}

internal enum class GatewayVoiceRuntimeCompositionError {
    LOCAL_RUNTIME_UNAVAILABLE,
    LOCAL_BINDING_INVALID,
    BOOTSTRAP_REJECTED,
    TENANT_BINDING_MISMATCH,
    CONNECTION_REJECTED,
}

internal sealed interface GatewayVoiceRuntimeCompositionResult {
    data object Composed : GatewayVoiceRuntimeCompositionResult

    data class Rejected(
        val error: GatewayVoiceRuntimeCompositionError,
        val bootstrapError: GatewayBootstrapClientError? = null,
        val authorizesExecution: Boolean = false,
        val provesExecutionSuccess: Boolean = false,
        val retryAuthorized: Boolean = false,
    ) : GatewayVoiceRuntimeCompositionResult {
        init {
            require(!authorizesExecution)
            require(!provesExecutionSuccess)
            require(!retryAuthorized)
        }
    }
}

/**
 * Process-local W15-G composition boundary.
 *
 * The bootstrap grant is authenticated server output, not voice intelligence. Existing W15-B
 * metadata is used only to fail closed on binding drift. This class never derives tenant/actor
 * truth from wake state and never treats successful composition as action authority or outcome.
 */
internal class GatewayVoiceRuntimeComposition(
    private val grantSource: GatewayBootstrapGrantSource,
    private val bindingProvider: () -> LocalGatewayBinding,
    private val connector: GatewayVoiceRuntimeConnector,
    private val clearRuntime: () -> Unit,
) {
    @Synchronized
    fun compose(): GatewayVoiceRuntimeCompositionResult {
        // Any new composition attempt first returns voice evaluation to the fail-closed default and
        // closes the previous process-local device-plane client through the injected owner callback.
        clearRuntime()

        val binding = runCatching { bindingProvider() }.getOrElse {
            return rejected(GatewayVoiceRuntimeCompositionError.LOCAL_BINDING_INVALID)
        }
        if (binding is LocalGatewayBinding.Invalid) {
            return rejected(GatewayVoiceRuntimeCompositionError.LOCAL_BINDING_INVALID)
        }

        val expectedDeviceId = (binding as? LocalGatewayBinding.Bound)?.deviceId
        val expectedDeviceSessionId = binding.deviceSessionIdOrNull()
        val exchange =
            runCatching { grantSource.exchange(expectedDeviceId, expectedDeviceSessionId) }.getOrElse {
                return rejected(GatewayVoiceRuntimeCompositionError.BOOTSTRAP_REJECTED)
            }
        val grant =
            when (exchange) {
                is GatewayBootstrapClientResult.Success -> exchange.value
                is GatewayBootstrapClientResult.Rejected ->
                    return rejected(
                        GatewayVoiceRuntimeCompositionError.BOOTSTRAP_REJECTED,
                        exchange.error,
                    )
            }

        val bound = binding as? LocalGatewayBinding.Bound
        if (bound != null && grant.tenantId != bound.tenantId) {
            return rejected(GatewayVoiceRuntimeCompositionError.TENANT_BINDING_MISMATCH)
        }

        val connected =
            runCatching { connector.connectAndInstall(grant, bound?.registrationVersion) }
                .getOrDefault(false)
        if (!connected) {
            clearRuntime()
            return rejected(GatewayVoiceRuntimeCompositionError.CONNECTION_REJECTED)
        }
        return GatewayVoiceRuntimeCompositionResult.Composed
    }
}

/** One-use process-memory credential adapter. It cannot authorize retry and is explicitly clearable. */
internal class OneShotGatewayCredentialProvider(credential: String) : GatewayCredentialProvider {
    private var current: String? = credential

    init {
        require(credential.isNotBlank())
    }

    @Synchronized
    override fun currentCredential(): String {
        val value = current ?: error("gateway bootstrap credential already consumed")
        current = null
        return value
    }

    @Synchronized
    fun clear() {
        current = null
    }
}

private fun LocalGatewayBinding.deviceSessionIdOrNull(): String? =
    (this as? LocalGatewayBinding.Bound)?.deviceSessionId

private fun rejected(
    error: GatewayVoiceRuntimeCompositionError,
    bootstrapError: GatewayBootstrapClientError? = null,
): GatewayVoiceRuntimeCompositionResult.Rejected =
    GatewayVoiceRuntimeCompositionResult.Rejected(error = error, bootstrapError = bootstrapError)
