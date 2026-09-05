package ai.aurora.device.voice

import ai.aurora.device.bootstrap.GatewayBootstrapActor
import ai.aurora.device.bootstrap.GatewayBootstrapClientError
import ai.aurora.device.bootstrap.GatewayBootstrapClientResult
import ai.aurora.device.bootstrap.GatewayBootstrapGrant
import ai.aurora.device.session.LocalDeviceKeyMetadata
import ai.aurora.device.session.LocalDeviceRegistrationMetadata
import ai.aurora.device.session.LocalDeviceSessionMetadata
import ai.aurora.device.session.LocalDeviceSessionState
import ai.aurora.device.session.W14DeviceLifecycleState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class GatewayVoiceRuntimeCompositionTest {
    @Test
    fun `fresh install consumes server grant with no client binding and composes ingress`() {
        var expectedDeviceId: String? = "unset"
        var expectedDeviceSessionId: String? = "unset"
        var observedGrant: GatewayBootstrapGrant? = null
        var observedRegistrationVersion: Int? = -1
        var clearCount = 0
        val composition =
            GatewayVoiceRuntimeComposition(
                grantSource = GatewayBootstrapGrantSource { deviceId, deviceSessionId ->
                    expectedDeviceId = deviceId
                    expectedDeviceSessionId = deviceSessionId
                    GatewayBootstrapClientResult.Success(grant())
                },
                bindingProvider = { LocalGatewayBinding.FreshInstall },
                connector = GatewayVoiceRuntimeConnector { value, registrationVersion ->
                    observedGrant = value
                    observedRegistrationVersion = registrationVersion
                    true
                },
                clearRuntime = { clearCount += 1 },
            )

        assertTrue(composition.compose() is GatewayVoiceRuntimeCompositionResult.Composed)
        assertEquals(null, expectedDeviceId)
        assertEquals(null, expectedDeviceSessionId)
        assertEquals(grant().deviceId, observedGrant?.deviceId)
        assertEquals(null, observedRegistrationVersion)
        assertEquals(1, clearCount)
    }

    @Test
    fun `known local binding is enforced and tenant drift never reaches connector`() {
        val state = boundState()
        val binding = localGatewayBindingFrom(state)
        assertTrue(binding is LocalGatewayBinding.Bound)
        binding as LocalGatewayBinding.Bound
        assertEquals(DEVICE_ID, binding.deviceId)
        assertEquals(DEVICE_SESSION_ID, binding.deviceSessionId)
        assertEquals(TENANT_ID, binding.tenantId)
        assertEquals(REGISTRATION_VERSION, binding.registrationVersion)

        var observedDeviceId: String? = null
        var observedSessionId: String? = null
        var connectorCalls = 0
        val mismatch = grant(tenantId = "tenant:other")
        val composition =
            GatewayVoiceRuntimeComposition(
                grantSource = GatewayBootstrapGrantSource { deviceId, deviceSessionId ->
                    observedDeviceId = deviceId
                    observedSessionId = deviceSessionId
                    GatewayBootstrapClientResult.Success(mismatch)
                },
                bindingProvider = { binding },
                connector = GatewayVoiceRuntimeConnector { _, _ ->
                    connectorCalls += 1
                    true
                },
                clearRuntime = {},
            )

        val result = composition.compose()
        assertTrue(result is GatewayVoiceRuntimeCompositionResult.Rejected)
        result as GatewayVoiceRuntimeCompositionResult.Rejected
        assertEquals(GatewayVoiceRuntimeCompositionError.TENANT_BINDING_MISMATCH, result.error)
        assertEquals(DEVICE_ID, observedDeviceId)
        assertEquals(DEVICE_SESSION_ID, observedSessionId)
        assertEquals(0, connectorCalls)
        assertFalse(result.authorizesExecution)
        assertFalse(result.provesExecutionSuccess)
        assertFalse(result.retryAuthorized)
    }

    @Test
    fun `partial or inactive local state fails before bootstrap transport`() {
        var sourceCalls = 0
        val partial =
            LocalDeviceSessionState(
                key = LocalDeviceKeyMetadata("key", 1, REGISTRATION_VERSION),
                registration =
                    LocalDeviceRegistrationMetadata(
                        DEVICE_ID,
                        TENANT_ID,
                        REGISTRATION_VERSION,
                        W14DeviceLifecycleState.ACTIVE,
                    ),
            )
        val inactive = boundState(W14DeviceLifecycleState.REVOKED)
        for (state in listOf(partial, inactive)) {
            val composition =
                GatewayVoiceRuntimeComposition(
                    grantSource = GatewayBootstrapGrantSource { _, _ ->
                        sourceCalls += 1
                        GatewayBootstrapClientResult.Success(grant())
                    },
                    bindingProvider = { localGatewayBindingFrom(state) },
                    connector = GatewayVoiceRuntimeConnector { _, _ -> true },
                    clearRuntime = {},
                )
            val result = composition.compose()
            assertTrue(result is GatewayVoiceRuntimeCompositionResult.Rejected)
            assertEquals(
                GatewayVoiceRuntimeCompositionError.LOCAL_BINDING_INVALID,
                (result as GatewayVoiceRuntimeCompositionResult.Rejected).error,
            )
        }
        assertEquals(0, sourceCalls)
    }

    @Test
    fun `bootstrap and connection failures remain fail closed`() {
        var clearCount = 0
        val bootstrapRejected =
            GatewayVoiceRuntimeComposition(
                grantSource = GatewayBootstrapGrantSource { _, _ ->
                    GatewayBootstrapClientResult.Rejected(GatewayBootstrapClientError.TRANSPORT_UNCERTAIN)
                },
                bindingProvider = { LocalGatewayBinding.FreshInstall },
                connector = GatewayVoiceRuntimeConnector { _, _ -> fail("connector must not run") },
                clearRuntime = { clearCount += 1 },
            ).compose()
        assertTrue(bootstrapRejected is GatewayVoiceRuntimeCompositionResult.Rejected)
        bootstrapRejected as GatewayVoiceRuntimeCompositionResult.Rejected
        assertEquals(GatewayVoiceRuntimeCompositionError.BOOTSTRAP_REJECTED, bootstrapRejected.error)
        assertEquals(GatewayBootstrapClientError.TRANSPORT_UNCERTAIN, bootstrapRejected.bootstrapError)
        assertFalse(bootstrapRejected.retryAuthorized)

        val connectionRejected =
            GatewayVoiceRuntimeComposition(
                grantSource = GatewayBootstrapGrantSource { _, _ ->
                    GatewayBootstrapClientResult.Success(grant())
                },
                bindingProvider = { LocalGatewayBinding.FreshInstall },
                connector = GatewayVoiceRuntimeConnector { _, _ -> false },
                clearRuntime = { clearCount += 1 },
            ).compose()
        assertTrue(connectionRejected is GatewayVoiceRuntimeCompositionResult.Rejected)
        assertEquals(
            GatewayVoiceRuntimeCompositionError.CONNECTION_REJECTED,
            (connectionRejected as GatewayVoiceRuntimeCompositionResult.Rejected).error,
        )
        assertEquals(3, clearCount)
    }

    @Test
    fun `bootstrap credential provider is process local one shot and clearable`() {
        val provider = OneShotGatewayCredentialProvider("gwc_${"c".repeat(43)}")
        assertTrue(provider.currentCredential().startsWith("gwc_"))
        assertThrowsConsumed(provider)

        val cleared = OneShotGatewayCredentialProvider("gwc_${"d".repeat(43)}")
        cleared.clear()
        assertThrowsConsumed(cleared)
    }

    private fun assertThrowsConsumed(provider: OneShotGatewayCredentialProvider) {
        try {
            provider.currentCredential()
            fail("credential reuse must fail")
        } catch (error: IllegalStateException) {
            assertTrue(error.message.orEmpty().contains("already consumed"))
        }
    }

    private fun boundState(
        state: W14DeviceLifecycleState = W14DeviceLifecycleState.ACTIVE,
    ): LocalDeviceSessionState =
        LocalDeviceSessionState(
            key = LocalDeviceKeyMetadata("key", 1, REGISTRATION_VERSION),
            registration =
                LocalDeviceRegistrationMetadata(
                    DEVICE_ID,
                    TENANT_ID,
                    REGISTRATION_VERSION,
                    state,
                ),
            session =
                LocalDeviceSessionMetadata(
                    DEVICE_SESSION_ID,
                    "connection:1",
                    1_788_700_000_000L,
                    1_788_600_000_000L,
                ),
        )

    private fun grant(tenantId: String = TENANT_ID): GatewayBootstrapGrant =
        GatewayBootstrapGrant(
            gatewaySessionId = "gws_${"s".repeat(22)}",
            credential = "gwc_${"c".repeat(43)}",
            tenantId = tenantId,
            actor = GatewayBootstrapActor("HUMAN", "identity:operator"),
            correlationId = "correlation:voice-runtime",
            deviceId = DEVICE_ID,
            deviceSessionId = DEVICE_SESSION_ID,
            issuedAtMs = 1_788_600_000_000L,
            expiresAtMs = 1_788_700_000_000L,
            authVersion = "w14-bootstrap-v1",
        )

    private companion object {
        const val DEVICE_ID = "dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV"
        const val DEVICE_SESSION_ID = "device-session:android"
        const val TENANT_ID = "tenant:alpha"
        const val REGISTRATION_VERSION = 2
    }
}
