package ai.aurora.device.bootstrap

import ai.aurora.device.network.GatewayHttpChannelFactory
import ai.aurora.device.network.GatewayTransportException
import ai.aurora.device.network.JsonValue
import ai.aurora.device.network.PersistentGatewayHttpChannel
import ai.aurora.device.network.StrictJson
import ai.aurora.device.network.jsonBoolean
import ai.aurora.device.network.jsonLong
import ai.aurora.device.network.jsonObject
import ai.aurora.device.network.jsonString

private const val BOOTSTRAP_EXCHANGE_PATH = "/v1/gateway/bootstrap/exchange"
private const val BOOTSTRAP_AUTH_VERSION = "w14-bootstrap-v1"
private val BOOTSTRAP_REFERENCE = Regex("gbr_[A-Za-z0-9_-]{43,128}")
private val GATEWAY_CREDENTIAL = Regex("gwc_[A-Za-z0-9_-]{43,128}")
private val GATEWAY_SESSION_ID = Regex("gws_[A-Za-z0-9_-]{22,86}")
private val DEVICE_ID = Regex("dvc_[0-9A-HJKMNP-TV-Z]{26}")
private val SAFE_TOKEN = Regex("[A-Za-z0-9._:/+-]{1,256}")
private val ACTOR_KINDS = setOf("HUMAN", "AGENT", "SERVICE", "SYSTEM")

internal data class GatewayBootstrapActor(
    val kind: String,
    val identityId: String,
)

internal data class GatewayBootstrapGrant(
    val gatewaySessionId: String,
    val credential: String,
    val tenantId: String,
    val actor: GatewayBootstrapActor,
    val correlationId: String,
    val deviceId: String,
    val deviceSessionId: String,
    val issuedAtMs: Long,
    val expiresAtMs: Long,
    val authVersion: String,
    val authorizesExecution: Boolean = false,
    val provesExecutionSuccess: Boolean = false,
    val retryAuthorized: Boolean = false,
) {
    init {
        require(GATEWAY_SESSION_ID.matches(gatewaySessionId))
        require(GATEWAY_CREDENTIAL.matches(credential))
        require(SAFE_TOKEN.matches(tenantId))
        require(actor.kind in ACTOR_KINDS)
        require(SAFE_TOKEN.matches(actor.identityId))
        require(SAFE_TOKEN.matches(correlationId))
        require(DEVICE_ID.matches(deviceId))
        require(SAFE_TOKEN.matches(deviceSessionId))
        require(issuedAtMs >= 0 && expiresAtMs > issuedAtMs)
        require(authVersion == BOOTSTRAP_AUTH_VERSION)
        require(!authorizesExecution)
        require(!provesExecutionSuccess)
        require(!retryAuthorized)
    }
}

internal enum class GatewayBootstrapClientError {
    REFERENCE_INVALID,
    CONNECTION_UNAVAILABLE,
    TRANSPORT_UNCERTAIN,
    PROTOCOL_REJECTED,
    PROTOCOL_MALFORMED,
    BINDING_MISMATCH,
    GRANT_EXPIRED,
}

internal sealed interface GatewayBootstrapClientResult<out T> {
    data class Success<T>(val value: T) : GatewayBootstrapClientResult<T>

    data class Rejected(
        val error: GatewayBootstrapClientError,
        val requiresFreshBootstrap: Boolean = true,
        val authorizesExecution: Boolean = false,
        val provesExecutionSuccess: Boolean = false,
        val retryAuthorized: Boolean = false,
    ) : GatewayBootstrapClientResult<Nothing> {
        init {
            require(!authorizesExecution)
            require(!provesExecutionSuccess)
            require(!retryAuthorized)
        }
    }
}

/**
 * Exchanges a single server-staged bootstrap reference for one W14 gateway credential.
 *
 * The caller supplies only local expected device/session binding for comparison. Tenant, actor,
 * correlation and credential material are never accepted as Android authority input. A post-write
 * loss is TRANSPORT_UNCERTAIN and requires a fresh bootstrap; this client never retries it.
 */
internal class GatewayBootstrapClient(
    private val channelFactory: GatewayHttpChannelFactory,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    fun exchange(
        bootstrapReference: String,
        expectedDeviceId: String,
        expectedDeviceSessionId: String,
    ): GatewayBootstrapClientResult<GatewayBootstrapGrant> {
        if (
            !BOOTSTRAP_REFERENCE.matches(bootstrapReference) ||
            !DEVICE_ID.matches(expectedDeviceId) ||
            !SAFE_TOKEN.matches(expectedDeviceSessionId)
        ) {
            return rejected(GatewayBootstrapClientError.REFERENCE_INVALID)
        }

        val channel =
            try {
                channelFactory.open()
            } catch (_: Exception) {
                return rejected(GatewayBootstrapClientError.CONNECTION_UNAVAILABLE)
            }
        return try {
            val response =
                channel.post(
                    BOOTSTRAP_EXCHANGE_PATH,
                    StrictJson.encodeObject(listOf("bootstrapReference" to bootstrapReference)),
                )
            if (response.statusCode != 200) {
                rejected(GatewayBootstrapClientError.PROTOCOL_REJECTED)
            } else {
                parseGrant(response.body, expectedDeviceId, expectedDeviceSessionId)
            }
        } catch (error: GatewayTransportException) {
            rejected(
                if (error.requestMayHaveReachedPeer) {
                    GatewayBootstrapClientError.TRANSPORT_UNCERTAIN
                } else {
                    GatewayBootstrapClientError.CONNECTION_UNAVAILABLE
                },
            )
        } catch (_: Exception) {
            rejected(GatewayBootstrapClientError.PROTOCOL_MALFORMED)
        } finally {
            runCatching { channel.close() }
        }
    }

    private fun parseGrant(
        body: String,
        expectedDeviceId: String,
        expectedDeviceSessionId: String,
    ): GatewayBootstrapClientResult<GatewayBootstrapGrant> {
        val root = runCatching { StrictJson.parseObject(body) }.getOrNull()
            ?: return rejected(GatewayBootstrapClientError.PROTOCOL_MALFORMED)
        if (root.fields.keys != setOf("ok", "value") || !runCatching { root.jsonBoolean("ok") }.getOrDefault(false)) {
            return rejected(GatewayBootstrapClientError.PROTOCOL_MALFORMED)
        }
        val value = runCatching { root.jsonObject("value") }.getOrNull()
            ?: return rejected(GatewayBootstrapClientError.PROTOCOL_MALFORMED)
        val expectedFields =
            setOf(
                "gatewaySessionId",
                "credential",
                "tenantId",
                "actor",
                "correlationId",
                "deviceId",
                "deviceSessionId",
                "issuedAtMs",
                "expiresAtMs",
                "authVersion",
                "authorizesExecution",
                "provesExecutionSuccess",
                "retryAuthorized",
            )
        if (value.fields.keys != expectedFields) {
            return rejected(GatewayBootstrapClientError.PROTOCOL_MALFORMED)
        }
        val actor = runCatching { value.jsonObject("actor") }.getOrNull()
            ?: return rejected(GatewayBootstrapClientError.PROTOCOL_MALFORMED)
        if (actor.fields.keys != setOf("kind", "identityId")) {
            return rejected(GatewayBootstrapClientError.PROTOCOL_MALFORMED)
        }

        val grant =
            runCatching {
                GatewayBootstrapGrant(
                    gatewaySessionId = value.jsonString("gatewaySessionId"),
                    credential = value.jsonString("credential"),
                    tenantId = value.jsonString("tenantId"),
                    actor =
                        GatewayBootstrapActor(
                            kind = actor.jsonString("kind"),
                            identityId = actor.jsonString("identityId"),
                        ),
                    correlationId = value.jsonString("correlationId"),
                    deviceId = value.jsonString("deviceId"),
                    deviceSessionId = value.jsonString("deviceSessionId"),
                    issuedAtMs = value.jsonLong("issuedAtMs"),
                    expiresAtMs = value.jsonLong("expiresAtMs"),
                    authVersion = value.jsonString("authVersion"),
                    authorizesExecution = value.jsonBoolean("authorizesExecution"),
                    provesExecutionSuccess = value.jsonBoolean("provesExecutionSuccess"),
                    retryAuthorized = value.jsonBoolean("retryAuthorized"),
                )
            }.getOrNull() ?: return rejected(GatewayBootstrapClientError.PROTOCOL_MALFORMED)

        if (grant.deviceId != expectedDeviceId || grant.deviceSessionId != expectedDeviceSessionId) {
            return rejected(GatewayBootstrapClientError.BINDING_MISMATCH)
        }
        val now = nowMs()
        if (grant.issuedAtMs > now || now >= grant.expiresAtMs) {
            return rejected(GatewayBootstrapClientError.GRANT_EXPIRED)
        }
        return GatewayBootstrapClientResult.Success(grant)
    }

    companion object {
        fun physicalAdbReverse(
            port: Int = 8081,
            nowMs: () -> Long = { System.currentTimeMillis() },
        ): GatewayBootstrapClient =
            GatewayBootstrapClient(
                PersistentGatewayHttpChannel.physicalAdbReverseFactory(port),
                nowMs,
            )
    }
}

/** Process-local only. No reference or credential is written to disk or BuildConfig. */
internal class ProcessLocalGatewayBootstrapRuntime(
    private val client: GatewayBootstrapClient,
) {
    private var bootstrapReference: String? = null
    private var grant: GatewayBootstrapGrant? = null

    @Synchronized
    fun installReference(reference: String): Boolean {
        if (!BOOTSTRAP_REFERENCE.matches(reference)) return false
        bootstrapReference = reference
        grant = null
        return true
    }

    @Synchronized
    fun hasPendingReference(): Boolean = bootstrapReference != null

    @Synchronized
    fun exchangeAndHold(
        expectedDeviceId: String,
        expectedDeviceSessionId: String,
    ): GatewayBootstrapClientResult<Unit> {
        val reference = bootstrapReference
            ?: return rejected(GatewayBootstrapClientError.REFERENCE_INVALID)
        // Consume before network I/O. Ambiguous delivery therefore requires a new server reference.
        bootstrapReference = null
        grant = null
        return when (val result = client.exchange(reference, expectedDeviceId, expectedDeviceSessionId)) {
            is GatewayBootstrapClientResult.Success -> {
                grant = result.value
                GatewayBootstrapClientResult.Success(Unit)
            }
            is GatewayBootstrapClientResult.Rejected -> result
        }
    }

    @Synchronized
    fun consumeGrant(): GatewayBootstrapGrant? {
        val current = grant
        grant = null
        return current
    }

    @Synchronized
    fun clear() {
        bootstrapReference = null
        grant = null
    }
}

private fun rejected(error: GatewayBootstrapClientError): GatewayBootstrapClientResult.Rejected =
    GatewayBootstrapClientResult.Rejected(error = error)
