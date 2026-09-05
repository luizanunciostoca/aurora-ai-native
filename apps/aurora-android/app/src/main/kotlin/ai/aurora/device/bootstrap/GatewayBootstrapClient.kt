package ai.aurora.device.bootstrap

import ai.aurora.device.network.GatewayHttpChannelFactory
import ai.aurora.device.network.GatewayTransportException
import ai.aurora.device.network.StrictJson
import ai.aurora.device.network.jsonBoolean
import ai.aurora.device.network.jsonLong
import ai.aurora.device.network.jsonObject
import ai.aurora.device.network.jsonString

private const val EXCHANGE_PATH = "/v1/gateway/bootstrap/exchange"
private val REFERENCE = Regex("gbr_[A-Za-z0-9_-]{43,128}")

data class GatewayBootstrapBinding(
    val tenantId: String,
    val deviceId: String,
    val deviceSessionId: String,
) {
    init {
        require(tenantId.isNotBlank())
        require(deviceId.isNotBlank())
        require(deviceSessionId.isNotBlank())
    }
}

data class GatewayBootstrapCredential(
    val gatewaySessionId: String,
    val credential: String,
    val tenantId: String,
    val deviceId: String,
    val deviceSessionId: String,
    val expiresAtMs: Long,
    val authorizesExecution: Boolean,
) {
    init {
        require(gatewaySessionId.isNotBlank())
        require(credential.isNotBlank())
        require(expiresAtMs > 0)
        require(!authorizesExecution)
    }
}

enum class GatewayBootstrapClientError {
    REFERENCE_INVALID,
    REFERENCE_MISSING,
    BOOTSTRAP_EXPIRED,
    DEVICE_SESSION_MISMATCH,
    PROTOCOL_MALFORMED,
    SERVER_REJECTED,
    TRANSPORT_UNCERTAIN,
    CONNECTION_UNAVAILABLE,
}

sealed interface GatewayBootstrapClientResult<out T> {
    data class Success<T>(val value: T) : GatewayBootstrapClientResult<T>

    data class Rejected(
        val error: GatewayBootstrapClientError,
        val requiresFreshBootstrap: Boolean = true,
        val requiresReconciliation: Boolean = false,
    ) : GatewayBootstrapClientResult<Nothing>
}

fun interface GatewayBootstrapCredentialProvider {
    fun currentCredential(): String
}

/**
 * Process-local consumer for a server-staged W14 bootstrap reference and its one-shot credential.
 * Neither value is written to Android storage, BuildConfig, logs or semantic state.
 */
internal class GatewayBootstrapClient(
    private val channelFactory: GatewayHttpChannelFactory,
    private val binding: GatewayBootstrapBinding,
) {
    private var reference: String? = null
    private var credential: GatewayBootstrapCredential? = null

    @Synchronized
    fun stageReference(value: String): GatewayBootstrapClientResult<Unit> {
        if (!REFERENCE.matches(value)) {
            clear()
            return GatewayBootstrapClientResult.Rejected(GatewayBootstrapClientError.REFERENCE_INVALID)
        }
        reference = value
        credential = null
        return GatewayBootstrapClientResult.Success(Unit)
    }

    @Synchronized
    fun exchange(nowMs: Long): GatewayBootstrapClientResult<GatewayBootstrapCredential> {
        val current = reference
            ?: return GatewayBootstrapClientResult.Rejected(GatewayBootstrapClientError.REFERENCE_MISSING)
        val body = StrictJson.encodeObject(listOf("bootstrapReference" to current))
        val channel = try {
            channelFactory.open()
        } catch (error: GatewayTransportException) {
            return rejectedTransport(error)
        } catch (_: Exception) {
            return GatewayBootstrapClientResult.Rejected(GatewayBootstrapClientError.CONNECTION_UNAVAILABLE)
        }
        val response = try {
            channel.post(EXCHANGE_PATH, body)
        } catch (error: GatewayTransportException) {
            clear()
            return rejectedTransport(error)
        } catch (_: Exception) {
            clear()
            return GatewayBootstrapClientResult.Rejected(
                GatewayBootstrapClientError.TRANSPORT_UNCERTAIN,
                requiresReconciliation = true,
            )
        } finally {
            channel.close()
        }
        reference = null
        return try {
            val root = StrictJson.parseObject(response.body)
            if (!root.jsonBoolean("ok")) {
                clear()
                GatewayBootstrapClientResult.Rejected(GatewayBootstrapClientError.SERVER_REJECTED)
            } else {
                val value = root.jsonObject("value")
                val grant = GatewayBootstrapCredential(
                    gatewaySessionId = value.jsonString("gatewaySessionId"),
                    credential = value.jsonString("credential"),
                    tenantId = value.jsonString("tenantId"),
                    deviceId = value.jsonString("deviceId"),
                    deviceSessionId = value.jsonString("deviceSessionId"),
                    expiresAtMs = value.jsonLong("expiresAtMs"),
                    authorizesExecution = value.jsonBoolean("authorizesExecution"),
                )
                if (
                    grant.tenantId != binding.tenantId ||
                    grant.deviceId != binding.deviceId ||
                    grant.deviceSessionId != binding.deviceSessionId
                ) {
                    clear()
                    GatewayBootstrapClientResult.Rejected(
                        GatewayBootstrapClientError.DEVICE_SESSION_MISMATCH,
                    )
                } else if (grant.expiresAtMs <= nowMs) {
                    clear()
                    GatewayBootstrapClientResult.Rejected(
                        GatewayBootstrapClientError.BOOTSTRAP_EXPIRED,
                    )
                } else {
                    credential = grant
                    GatewayBootstrapClientResult.Success(grant)
                }
            }
        } catch (_: Exception) {
            clear()
            GatewayBootstrapClientResult.Rejected(GatewayBootstrapClientError.PROTOCOL_MALFORMED)
        }
    }

    @Synchronized
    fun credentialProvider(nowMs: Long): GatewayBootstrapClientResult<GatewayBootstrapCredentialProvider> {
        val current = credential
            ?: return GatewayBootstrapClientResult.Rejected(GatewayBootstrapClientError.REFERENCE_MISSING)
        if (nowMs >= current.expiresAtMs) {
            clear()
            return GatewayBootstrapClientResult.Rejected(GatewayBootstrapClientError.BOOTSTRAP_EXPIRED)
        }
        return GatewayBootstrapClientResult.Success(GatewayBootstrapCredentialProvider { current.credential })
    }

    @Synchronized
    fun clear() {
        reference = null
        credential = null
    }

    private fun rejectedTransport(error: GatewayTransportException): GatewayBootstrapClientResult<Nothing> {
        clear()
        return GatewayBootstrapClientResult.Rejected(
            error = if (error.requestMayHaveReachedPeer) {
                GatewayBootstrapClientError.TRANSPORT_UNCERTAIN
            } else {
                GatewayBootstrapClientError.CONNECTION_UNAVAILABLE
            },
            requiresReconciliation = error.requestMayHaveReachedPeer,
        )
    }
}
