package ai.aurora.device.network

import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.config.RuntimeEnvironmentConfig
import ai.aurora.device.security.AndroidKeystoreSigningKeyStore
import ai.aurora.device.session.DeviceSessionClientResult
import ai.aurora.device.session.SecureDeviceSessionClient
import ai.aurora.device.session.W14DeviceLifecycleState
import ai.aurora.device.session.W14DeviceRefView
import ai.aurora.device.session.W14DeviceRegistrationView
import ai.aurora.device.session.W14DeviceSessionTrustState
import ai.aurora.device.session.W14DeviceSessionTrustView
import ai.aurora.device.voice.GovernedVoiceCandidateSubmission
import ai.aurora.device.voice.GovernedVoiceCandidateTransport
import ai.aurora.device.voice.GovernedVoiceCandidateTransportResult
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

fun interface GatewayCredentialProvider {
    /** Returns one current credential. The client does not retain it after composing the open request. */
    fun currentCredential(): String
}

enum class GatewayDevicePlaneClientError {
    CONFIGURATION_REJECTED,
    CONNECTION_UNAVAILABLE,
    TRANSPORT_UNCERTAIN,
    PROTOCOL_REJECTED,
    PROTOCOL_MALFORMED,
    LOCAL_SESSION_REJECTED,
    NOT_CONNECTED,
}

sealed interface GatewayDevicePlaneResult<out T> {
    data class Success<T>(val value: T) : GatewayDevicePlaneResult<T>

    data class Rejected(
        val error: GatewayDevicePlaneClientError,
        val upstreamCode: String? = null,
        val requiresReconciliation: Boolean = false,
        val retryAuthorized: Boolean = false,
    ) : GatewayDevicePlaneResult<Nothing> {
        init {
            require(!retryAuthorized) { "W15-J network transport cannot authorize retry" }
        }
    }
}

data class GatewayDevicePlaneConnectRequest(
    val gatewaySessionId: String,
    val tenantId: String,
    val actorKind: String,
    val actorIdentityId: String,
    val correlationId: String,
    val deviceId: String,
    val deviceSessionId: String,
    val credentialProvider: GatewayCredentialProvider,
    val expectedRegistrationVersion: Int? = null,
) {
    init {
        requireSafeToken(gatewaySessionId, "gatewaySessionId")
        requireSafeToken(tenantId, "tenantId", 128)
        requireSafeToken(actorKind, "actorKind", 64)
        requireSafeToken(actorIdentityId, "actorIdentityId", 128)
        requireSafeToken(correlationId, "correlationId", 128)
        require(DEVICE_ID.matches(deviceId)) { "deviceId must be a canonical dvc_<ULID>" }
        requireSafeToken(deviceSessionId, "deviceSessionId")
        require(expectedRegistrationVersion == null || expectedRegistrationVersion > 0) {
            "expectedRegistrationVersion must be positive when provided"
        }
    }
}

data class GatewaySessionNetworkView(
    val protocolVersion: String,
    val sessionId: String,
    val connectionId: String,
    val generation: Int,
    val tenantId: String,
    val actorKind: String,
    val actorIdentityId: String,
    val correlationId: String,
    val authExpiresAtMs: Long,
    val authorizesExecution: Boolean = false,
) {
    init {
        require(protocolVersion == GATEWAY_PROTOCOL_VERSION)
        require(generation > 0)
        require(authExpiresAtMs > 0)
        require(!authorizesExecution)
    }
}

data class GatewayDevicePlaneSnapshot(
    val gateway: GatewaySessionNetworkView,
    val registration: W14DeviceRegistrationView,
    val deviceSession: W14DeviceSessionTrustView,
    val authorizesExecution: Boolean = false,
    val retryAuthorized: Boolean = false,
) {
    init {
        require(!authorizesExecution)
        require(!retryAuthorized)
    }
}

data class GatewayCommandDeliveryView(
    val disposition: String,
    val deliveryReference: String,
    val commandId: String,
    val executionId: String,
    val state: String,
    val envelopePresent: Boolean,
    val deadlineMs: Long?,
    val authorizesExecution: Boolean = false,
    val provesExecutionSuccess: Boolean = false,
    val retryAuthorized: Boolean = false,
) {
    init {
        require(!authorizesExecution)
        require(!provesExecutionSuccess)
        require(!retryAuthorized)
    }
}

enum class DeviceReceiptReportedState {
    COMPLETED,
    FAILED,
    UNCERTAIN,
}

data class GatewayReceiptEvidence(
    val receiptId: String,
    val evidenceId: String? = null,
    val commandId: String,
    val executionId: String,
    val deliveryReference: String,
    val reportedState: DeviceReceiptReportedState,
    val sourceReference: String,
    val capturedAtMs: Long,
    /** Optional earlier binding for a genuine late-after-reconnect receipt. */
    val reportedConnectionId: String? = null,
    val reportedGatewayGeneration: Int? = null,
) {
    init {
        requireSafeToken(receiptId, "receiptId", 128)
        if (evidenceId != null) requireSafeToken(evidenceId, "evidenceId", 128)
        requireSafeToken(commandId, "commandId", 128)
        requireSafeToken(executionId, "executionId", 128)
        requireSafeToken(deliveryReference, "deliveryReference")
        requireSafeToken(sourceReference, "sourceReference")
        require(capturedAtMs >= 0) { "capturedAtMs must be non-negative" }
        if (reportedConnectionId != null) requireSafeToken(reportedConnectionId, "reportedConnectionId")
        require(reportedGatewayGeneration == null || reportedGatewayGeneration > 0) {
            "reportedGatewayGeneration must be positive"
        }
        require((reportedConnectionId == null) == (reportedGatewayGeneration == null)) {
            "late receipt binding requires both connection id and gateway generation"
        }
    }
}

data class GatewayReceiptIngressView(
    val classification: String,
    val requiresW07Reconciliation: Boolean,
    val authorizesExecution: Boolean = false,
    val provesExecutionSuccess: Boolean = false,
    val retryAuthorized: Boolean = false,
) {
    init {
        require(!authorizesExecution)
        require(!provesExecutionSuccess)
        require(!retryAuthorized)
    }
}

internal interface DeviceSessionAcceptance {
    fun acceptRegistration(registration: W14DeviceRegistrationView): Boolean

    fun acceptSession(session: W14DeviceSessionTrustView, nowMs: Long): Boolean
}

internal class W15BDeviceSessionAcceptance(
    private val client: SecureDeviceSessionClient,
) : DeviceSessionAcceptance {
    override fun acceptRegistration(registration: W14DeviceRegistrationView): Boolean =
        client.acceptRegistration(registration) is DeviceSessionClientResult.Success

    override fun acceptSession(session: W14DeviceSessionTrustView, nowMs: Long): Boolean =
        client.acceptSession(session, nowMs) is DeviceSessionClientResult.Success
}

/**
 * W15-J physical integration client over the accepted W14 same-socket HTTP device plane.
 *
 * This class owns transport composition only. It cannot create W07 authority, permission, outcome
 * truth, or retry eligibility. A lost response after a request write is surfaced as
 * [GatewayDevicePlaneClientError.TRANSPORT_UNCERTAIN] and requires upstream reconciliation.
 *
 * The same already-authenticated channel also realizes [GovernedVoiceCandidateTransport]. Voice
 * candidates therefore inherit the current W14 socket/device-session binding instead of opening a
 * second voice-only network stack. A 202 reply is only an acknowledgement of receipt for W07
 * evaluation; it is never action authority, proof of execution, verified outcome or retry grant.
 */
class GatewayDevicePlaneClient internal constructor(
    private val channelFactory: GatewayHttpChannelFactory,
    private val proofFactory: DeviceProofFactory,
    private val sessionAcceptance: DeviceSessionAcceptance,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) : AutoCloseable, GovernedVoiceCandidateTransport {
    private var channel: GatewayHttpChannel? = null
    private var context: ConnectionContext? = null
    private var gateway: GatewaySessionNetworkView? = null
    private var registration: W14DeviceRegistrationView? = null
    private var deviceSession: W14DeviceSessionTrustView? = null

    @Synchronized
    fun connect(request: GatewayDevicePlaneConnectRequest): GatewayDevicePlaneResult<GatewayDevicePlaneSnapshot> {
        close()
        val openedChannel = tryOpenChannel() ?: return transportRejected()
        channel = openedChannel
        context = ConnectionContext.from(request)

        val gatewayResult = openGateway(request)
        if (gatewayResult is GatewayDevicePlaneResult.Rejected) {
            close()
            return gatewayResult
        }
        val gatewayView = (gatewayResult as GatewayDevicePlaneResult.Success).value
        gateway = gatewayView

        val registrationResult = registerAndActivate(request, gatewayView)
        if (registrationResult is GatewayDevicePlaneResult.Rejected) {
            close()
            return registrationResult
        }
        val registrationView = (registrationResult as GatewayDevicePlaneResult.Success).value
        if (!sessionAcceptance.acceptRegistration(registrationView)) {
            close()
            return rejected(GatewayDevicePlaneClientError.LOCAL_SESSION_REJECTED)
        }
        registration = registrationView

        val sessionResult = openDeviceSession(request.deviceSessionId, gatewayView, registrationView)
        if (sessionResult is GatewayDevicePlaneResult.Rejected) {
            close()
            return sessionResult
        }
        val sessionView = (sessionResult as GatewayDevicePlaneResult.Success).value
        if (!sessionAcceptance.acceptSession(sessionView, nowMs())) {
            close()
            return rejected(GatewayDevicePlaneClientError.LOCAL_SESSION_REJECTED)
        }
        deviceSession = sessionView
        return GatewayDevicePlaneResult.Success(snapshot())
    }

    @Synchronized
    fun reconnect(
        credentialProvider: GatewayCredentialProvider,
    ): GatewayDevicePlaneResult<GatewayDevicePlaneSnapshot> {
        val currentContext = context ?: return rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)
        val previousGateway = gateway ?: return rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)
        val currentRegistration = registration ?: return rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)
        val currentDeviceSession = deviceSession ?: return rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)

        channel?.close()
        channel = tryOpenChannel() ?: return transportRejected()

        val reconnectBody = withCredential(credentialProvider) { credential ->
            StrictJson.encodeObject(
                listOf(
                    "protocolVersion" to GATEWAY_PROTOCOL_VERSION,
                    "sessionId" to currentContext.gatewaySessionId,
                    "credential" to credential,
                    "tenantId" to currentContext.tenantId,
                    "actor" to linkedMapOf(
                        "kind" to currentContext.actorKind,
                        "identityId" to currentContext.actorIdentityId,
                    ),
                    "correlation" to linkedMapOf("correlationId" to currentContext.correlationId),
                    "previousConnectionId" to previousGateway.connectionId,
                ),
            )
        } ?: return rejected(GatewayDevicePlaneClientError.CONFIGURATION_REJECTED)

        val gatewayResult = postAndParseGateway(
            "/v1/gateway/sessions/reconnect",
            reconnectBody,
            currentContext,
        )
        if (gatewayResult is GatewayDevicePlaneResult.Rejected) {
            close()
            return gatewayResult
        }
        val nextGateway = (gatewayResult as GatewayDevicePlaneResult.Success).value
        if (nextGateway.generation <= previousGateway.generation) {
            close()
            return rejected(GatewayDevicePlaneClientError.PROTOCOL_MALFORMED)
        }
        gateway = nextGateway

        // W14 device bindings are socket-local. Rebind the already-accepted canonical DeviceRef
        // on the fresh authenticated socket before asking W14-E to resume trust. This call cannot
        // create a new local identity: any state/version drift fails closed.
        val rebindProof = proofFactory.sign(registrationMessage(nextGateway, currentContext.deviceId))
        val rebindResponse = post(
            "/v1/device/registrations/register",
            StrictJson.encodeObject(
                listOf(
                    "deviceId" to currentContext.deviceId,
                    "proof" to rebindProof,
                ),
            ),
        ) ?: run {
            close()
            return transportRejected()
        }
        val rebindResult = parseRegistration(rebindResponse)
        if (rebindResult is GatewayDevicePlaneResult.Rejected) {
            close()
            return rebindResult
        }
        val reboundRegistration = (rebindResult as GatewayDevicePlaneResult.Success).value
        if (
            reboundRegistration.state != W14DeviceLifecycleState.ACTIVE ||
            reboundRegistration.ref != currentRegistration.ref
        ) {
            close()
            return rejected(GatewayDevicePlaneClientError.PROTOCOL_MALFORMED)
        }
        registration = reboundRegistration

        val proof = proofFactory.sign(
            attestationMessage(
                nextGateway,
                reboundRegistration,
                currentDeviceSession.deviceSessionId,
                previousGateway.connectionId,
            ),
        )
        val resumeResult = postDeviceSession(
            "/v1/device/sessions/resume",
            StrictJson.encodeObject(
                listOf(
                    "deviceSessionId" to currentDeviceSession.deviceSessionId,
                    "previousConnectionId" to previousGateway.connectionId,
                    "proof" to proof,
                ),
            ),
        )
        if (resumeResult is GatewayDevicePlaneResult.Rejected) {
            close()
            return resumeResult
        }
        val nextSession = (resumeResult as GatewayDevicePlaneResult.Success).value
        if (!sessionAcceptance.acceptSession(nextSession, nowMs())) {
            close()
            return rejected(GatewayDevicePlaneClientError.LOCAL_SESSION_REJECTED)
        }
        deviceSession = nextSession
        return GatewayDevicePlaneResult.Success(snapshot())
    }

    @Synchronized
    fun claimCommand(commandId: String): GatewayDevicePlaneResult<GatewayCommandDeliveryView> {
        requireSafeToken(commandId, "commandId", 128)
        if (context == null || gateway == null || registration == null || deviceSession == null) {
            return rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)
        }
        return postCommandDelivery(
            "/v1/device/commands/claim",
            StrictJson.encodeObject(listOf("commandId" to commandId)),
        )
    }

    @Synchronized
    fun acknowledgeCommand(
        commandId: String,
        deliveryReference: String,
        ackReference: String,
    ): GatewayDevicePlaneResult<GatewayCommandDeliveryView> {
        requireSafeToken(commandId, "commandId", 128)
        requireSafeToken(deliveryReference, "deliveryReference")
        requireSafeToken(ackReference, "ackReference")
        if (context == null || gateway == null || registration == null || deviceSession == null) {
            return rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)
        }
        return postCommandDelivery(
            "/v1/device/commands/acknowledge",
            StrictJson.encodeObject(
                listOf(
                    "commandId" to commandId,
                    "deliveryReference" to deliveryReference,
                    "ackReference" to ackReference,
                ),
            ),
        )
    }

    @Synchronized
    fun submitReceipt(
        evidence: GatewayReceiptEvidence,
    ): GatewayDevicePlaneResult<GatewayReceiptIngressView> {
        val currentContext = context ?: return rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)
        val currentGateway = gateway ?: return rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)
        val currentRegistration = registration ?: return rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)
        val currentSession = deviceSession ?: return rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)
        val receiptConnectionId = evidence.reportedConnectionId ?: currentGateway.connectionId
        val receiptGeneration = evidence.reportedGatewayGeneration ?: currentGateway.generation

        val integrityDigest = receiptIntegrityDigest(evidence, receiptConnectionId, receiptGeneration)
        val proofMessage = listOf(
            "AURORA_DEVICE_RECEIPT_V1",
            currentContext.tenantId,
            currentContext.actorIdentityId,
            currentContext.correlationId,
            currentRegistration.ref.deviceId,
            currentRegistration.ref.registrationVersion.toString(),
            currentSession.deviceSessionId,
            currentGateway.sessionId,
            receiptConnectionId,
            receiptGeneration.toString(),
            evidence.receiptId,
            evidence.commandId,
            evidence.executionId,
            evidence.sourceReference,
            evidence.capturedAtMs.toString(),
            integrityDigest,
        ).joinToString("\n")
        val proof = proofFactory.sign(proofMessage)
        val bodyFields = mutableListOf<Pair<String, Any?>>()
        bodyFields += "receiptId" to evidence.receiptId
        if (evidence.evidenceId != null) bodyFields += "evidenceId" to evidence.evidenceId
        bodyFields += listOf(
            "commandId" to evidence.commandId,
            "executionId" to evidence.executionId,
            "connectionId" to receiptConnectionId,
            "gatewayGeneration" to receiptGeneration,
            "deliveryReference" to evidence.deliveryReference,
            "reportedState" to evidence.reportedState.name,
            "sourceReference" to evidence.sourceReference,
            "proofReference" to proof,
            "capturedAtMs" to evidence.capturedAtMs,
        )
        val response = post("/v1/device/receipts/ingest", StrictJson.encodeObject(bodyFields))
            ?: return transportRejected()
        return parseReceipt(response)
    }

    /**
     * Submits one non-authoritative voice candidate over the current authenticated W14 socket.
     * The body deliberately contains no tenant/actor/device/session/policy/authority/outcome/retry
     * fields; the server-side W14 route derives all trusted context from the live connection.
     */
    @Synchronized
    override fun submit(
        candidate: GovernedVoiceCandidateSubmission,
    ): GovernedVoiceCandidateTransportResult {
        if (context == null || gateway == null || registration == null || deviceSession == null) {
            return GovernedVoiceCandidateTransportResult.Unavailable(
                reason = "device-plane session not connected",
            )
        }

        val response = post(
            VOICE_CANDIDATE_DEVICE_ROUTE,
            StrictJson.encodeObject(
                listOf(
                    "commandId" to candidate.commandId,
                    "capabilityId" to candidate.capabilityId,
                    "normalizedTranscript" to candidate.normalizedTranscript,
                    "requiresW07Authorization" to candidate.requiresW07Authorization,
                    "authorizesExecution" to candidate.authorizesExecution,
                ),
            ),
        ) ?: return voiceTransportUnavailable()

        return parseVoiceCandidateResponse(response)
    }

    @Synchronized
    fun currentSnapshot(): GatewayDevicePlaneResult<GatewayDevicePlaneSnapshot> =
        if (context == null || gateway == null || registration == null || deviceSession == null) {
            rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)
        } else {
            GatewayDevicePlaneResult.Success(snapshot())
        }

    @Synchronized
    override fun close() {
        channel?.close()
        channel = null
        context = null
        gateway = null
        registration = null
        deviceSession = null
    }

    private fun openGateway(
        request: GatewayDevicePlaneConnectRequest,
    ): GatewayDevicePlaneResult<GatewaySessionNetworkView> {
        val body = withCredential(request.credentialProvider) { credential ->
            StrictJson.encodeObject(
                listOf(
                    "protocolVersion" to GATEWAY_PROTOCOL_VERSION,
                    "sessionId" to request.gatewaySessionId,
                    "credential" to credential,
                    "tenantId" to request.tenantId,
                    "actor" to linkedMapOf(
                        "kind" to request.actorKind,
                        "identityId" to request.actorIdentityId,
                    ),
                    "correlation" to linkedMapOf("correlationId" to request.correlationId),
                ),
            )
        } ?: return rejected(GatewayDevicePlaneClientError.CONFIGURATION_REJECTED)
        return postAndParseGateway(
            "/v1/gateway/sessions/open",
            body,
            ConnectionContext.from(request),
        )
    }

    private fun registerAndActivate(
        request: GatewayDevicePlaneConnectRequest,
        gateway: GatewaySessionNetworkView,
    ): GatewayDevicePlaneResult<W14DeviceRegistrationView> {
        val proof = proofFactory.sign(registrationMessage(gateway, request.deviceId))
        val fields = mutableListOf<Pair<String, Any?>>(
            "deviceId" to request.deviceId,
            "proof" to proof,
        )
        if (request.expectedRegistrationVersion != null) {
            fields += "expectedVersion" to request.expectedRegistrationVersion
        }
        val registerResponse = post(
            "/v1/device/registrations/register",
            StrictJson.encodeObject(fields),
        ) ?: return transportRejected()
        val registered = parseRegistration(registerResponse)
        if (registered is GatewayDevicePlaneResult.Rejected) return registered

        val activateResponse = post(
            "/v1/device/registrations/activate",
            StrictJson.encodeObject(emptyList()),
        ) ?: return transportRejected()
        return parseRegistration(activateResponse)
    }

    private fun openDeviceSession(
        deviceSessionId: String,
        gateway: GatewaySessionNetworkView,
        registration: W14DeviceRegistrationView,
    ): GatewayDevicePlaneResult<W14DeviceSessionTrustView> {
        val proof = proofFactory.sign(attestationMessage(gateway, registration, deviceSessionId, null))
        return postDeviceSession(
            "/v1/device/sessions/open",
            StrictJson.encodeObject(
                listOf(
                    "deviceSessionId" to deviceSessionId,
                    "proof" to proof,
                ),
            ),
        )
    }

    private fun postDeviceSession(
        path: String,
        body: String,
    ): GatewayDevicePlaneResult<W14DeviceSessionTrustView> {
        val response = post(path, body) ?: return transportRejected()
        if (response.statusCode != 200) return protocolRejected(response)
        return parseObjectResult(response) { root ->
            val snapshot = root.jsonObject("snapshot")
            requireNoAuthority(snapshot)
            val ref = parseDeviceRef(snapshot.jsonObject("deviceRef"))
            val state = W14DeviceSessionTrustState.valueOf(snapshot.jsonString("state"))
            W14DeviceSessionTrustView(
                deviceSessionId = snapshot.jsonString("deviceSessionId"),
                connectionId = snapshot.jsonString("connectionId"),
                tenantId = snapshot.jsonString("tenantId"),
                deviceRef = ref,
                state = state,
                lastEvaluatedAtMs = snapshot.jsonLong("lastEvaluatedAtMs"),
                gatewayAuthExpiresAtMs = snapshot.jsonLong("gatewayAuthExpiresAtMs"),
                executionPreconditionSatisfied = snapshot.jsonBoolean("executionPreconditionSatisfied"),
                requiresCurrentAuthorityValidation = snapshot.jsonBoolean("requiresCurrentAuthorityValidation"),
                authoritySemantics = snapshot.jsonString("authoritySemantics"),
                authorizesExecution = snapshot.jsonBoolean("authorizesExecution"),
                canGrantPermission = snapshot.jsonBoolean("canGrantPermission"),
            )
        }
    }

    private fun postAndParseGateway(
        path: String,
        body: String,
        expected: ConnectionContext,
    ): GatewayDevicePlaneResult<GatewaySessionNetworkView> {
        val response = post(path, body) ?: return transportRejected()
        if (response.statusCode != 200) return protocolRejected(response)
        return parseObjectResult(response) { root ->
            val value = root.jsonObject("value")
            requireNoAuthority(value)
            val result = GatewaySessionNetworkView(
                protocolVersion = value.jsonString("protocolVersion"),
                sessionId = value.jsonString("sessionId"),
                connectionId = value.jsonString("connectionId"),
                generation = value.jsonInt("generation"),
                tenantId = value.jsonString("tenantId"),
                actorKind = value.jsonString("actorKind"),
                actorIdentityId = value.jsonString("actorIdentityId"),
                correlationId = value.jsonString("correlationId"),
                authExpiresAtMs = value.jsonLong("authExpiresAtMs"),
                authorizesExecution = value.jsonBoolean("authorizesExecution"),
            )
            require(result.sessionId == expected.gatewaySessionId)
            require(result.tenantId == expected.tenantId)
            require(result.actorKind == expected.actorKind)
            require(result.actorIdentityId == expected.actorIdentityId)
            require(result.correlationId == expected.correlationId)
            result
        }
    }

    private fun parseRegistration(
        response: GatewayHttpResponse,
    ): GatewayDevicePlaneResult<W14DeviceRegistrationView> {
        if (response.statusCode != 200) return protocolRejected(response)
        return parseObjectResult(response) { root ->
            val record = root.jsonObject("record")
            requireNoAuthority(record)
            W14DeviceRegistrationView(
                ref = parseDeviceRef(record.jsonObject("ref")),
                state = W14DeviceLifecycleState.valueOf(record.jsonString("state")),
                authoritySemantics = record.jsonString("authoritySemantics"),
                authorizesExecution = record.jsonBoolean("authorizesExecution"),
                canGrantPermission = record.jsonBoolean("canGrantPermission"),
            )
        }
    }

    private fun postCommandDelivery(
        path: String,
        body: String,
    ): GatewayDevicePlaneResult<GatewayCommandDeliveryView> {
        val response = post(path, body) ?: return transportRejected()
        if (response.statusCode != 200) return protocolRejected(response)
        return parseObjectResult(response) { root ->
            requireNoAuthority(root)
            require(root.jsonBoolean("retryAuthorized") == false)
            val value = root.jsonObject("value")
            val delivery = value.jsonObject("delivery")
            requireNoAuthority(delivery)
            require(delivery.jsonBoolean("provesExecutionSuccess") == false)
            val envelopeValue = value.fields["envelope"]
            val envelope = envelopeValue as? JsonValue.ObjectValue
            if (envelope != null) {
                requireNoAuthority(envelope)
                require(envelope.jsonBoolean("provesExecutionSuccess") == false)
            }
            GatewayCommandDeliveryView(
                disposition = value.jsonString("disposition"),
                deliveryReference = delivery.jsonString("deliveryReference"),
                commandId = delivery.jsonString("commandId"),
                executionId = delivery.jsonString("executionId"),
                state = delivery.jsonString("state"),
                envelopePresent = envelope != null,
                deadlineMs = envelope?.jsonLong("deadlineMs"),
            )
        }
    }

    private fun parseReceipt(
        response: GatewayHttpResponse,
    ): GatewayDevicePlaneResult<GatewayReceiptIngressView> {
        if (response.statusCode != 200) return protocolRejected(response)
        return parseObjectResult(response) { root ->
            requireNoAuthority(root)
            require(root.jsonBoolean("retryAuthorized") == false)
            val value = root.jsonObject("value")
            requireNoAuthority(value)
            require(value.jsonBoolean("provesExecutionSuccess") == false)
            require(value.jsonBoolean("retryAuthorized") == false)
            GatewayReceiptIngressView(
                classification = value.jsonString("classification"),
                requiresW07Reconciliation = value.jsonBoolean("requiresW07Reconciliation"),
            )
        }
    }

    private fun parseVoiceCandidateResponse(
        response: GatewayHttpResponse,
    ): GovernedVoiceCandidateTransportResult =
        try {
            val root = StrictJson.parseObject(response.body)
            requireNoAuthority(root)
            require(root.jsonBoolean("provesExecutionSuccess") == false)
            require(root.jsonBoolean("retryAuthorized") == false)

            if (response.statusCode != 202) {
                GovernedVoiceCandidateTransportResult.Unavailable(
                    reason = "voice candidate rejected",
                )
            } else {
                require(root.fields.keys == VOICE_CANDIDATE_SUCCESS_RESPONSE_KEYS)
                require(root.jsonBoolean("ok"))
                require(root.jsonBoolean("acceptedForEvaluation"))
                GovernedVoiceCandidateTransportResult.Delivered(
                    acceptedForEvaluation = true,
                    authorizesExecution = false,
                    provesExecutionSuccess = false,
                    retryAuthorized = false,
                )
            }
        } catch (_: IllegalArgumentException) {
            GovernedVoiceCandidateTransportResult.Unavailable(
                reason = "voice candidate response malformed",
            )
        } catch (_: IllegalStateException) {
            GovernedVoiceCandidateTransportResult.Unavailable(
                reason = "voice candidate response malformed",
            )
        }

    private fun voiceTransportUnavailable(): GovernedVoiceCandidateTransportResult.Unavailable {
        val failure = transportRejected()
        val uncertain =
            failure.requiresReconciliation || failure.error == GatewayDevicePlaneClientError.TRANSPORT_UNCERTAIN
        return GovernedVoiceCandidateTransportResult.Unavailable(
            reason =
                if (uncertain) {
                    "voice candidate delivery uncertain"
                } else {
                    "voice candidate transport unavailable"
                },
            deliveryUncertain = uncertain,
            retryAuthorized = false,
        )
    }

    private fun <T> parseObjectResult(
        response: GatewayHttpResponse,
        onSuccess: (JsonValue.ObjectValue) -> T,
    ): GatewayDevicePlaneResult<T> {
        return try {
            val root = StrictJson.parseObject(response.body)
            requireNoAuthority(root)
            if (!root.jsonBoolean("ok")) {
                rejected(
                    GatewayDevicePlaneClientError.PROTOCOL_REJECTED,
                    upstreamCode = extractUpstreamCode(root),
                )
            } else {
                GatewayDevicePlaneResult.Success(onSuccess(root))
            }
        } catch (_: IllegalArgumentException) {
            rejected(GatewayDevicePlaneClientError.PROTOCOL_MALFORMED)
        } catch (_: IllegalStateException) {
            rejected(GatewayDevicePlaneClientError.PROTOCOL_MALFORMED)
        }
    }

    private fun protocolRejected(response: GatewayHttpResponse): GatewayDevicePlaneResult.Rejected =
        try {
            val root = StrictJson.parseObject(response.body)
            rejected(
                GatewayDevicePlaneClientError.PROTOCOL_REJECTED,
                upstreamCode = extractUpstreamCode(root),
            )
        } catch (_: Exception) {
            rejected(GatewayDevicePlaneClientError.PROTOCOL_REJECTED)
        }

    private fun extractUpstreamCode(root: JsonValue.ObjectValue): String? {
        val direct = root.fields["error"]
        if (direct is JsonValue.StringValue) return direct.value.takeIf(::isSafeUpstreamCode)
        if (direct is JsonValue.ObjectValue) {
            return direct.jsonOptionalString("code")?.takeIf(::isSafeUpstreamCode)
        }
        val devicePlane = root.fields["devicePlaneError"] as? JsonValue.ObjectValue
        val devicePlaneCode = devicePlane?.jsonOptionalString("code")?.takeIf(::isSafeUpstreamCode)
        if (devicePlaneCode != null) return devicePlaneCode
        val transport = root.fields["transportError"] as? JsonValue.ObjectValue
        return transport?.jsonOptionalString("code")?.takeIf(::isSafeUpstreamCode)
    }

    private fun requireNoAuthority(value: JsonValue.ObjectValue) {
        val authorizes = value.fields["authorizesExecution"]
        if (authorizes != null) require((authorizes as? JsonValue.BooleanValue)?.value == false)
        val canGrant = value.fields["canGrantPermission"]
        if (canGrant != null) require((canGrant as? JsonValue.BooleanValue)?.value == false)
        val retry = value.fields["retryAuthorized"]
        if (retry != null) require((retry as? JsonValue.BooleanValue)?.value == false)
    }

    private fun parseDeviceRef(value: JsonValue.ObjectValue): W14DeviceRefView =
        W14DeviceRefView(
            kind = value.jsonString("kind"),
            deviceId = value.jsonString("deviceId"),
            tenantId = value.jsonString("tenantId"),
            registrationVersion = value.jsonInt("registrationVersion"),
        )

    private fun post(path: String, body: String): GatewayHttpResponse? =
        try {
            channel?.post(path, body)
        } catch (error: GatewayTransportException) {
            lastTransportFailure = error
            null
        }

    private var lastTransportFailure: GatewayTransportException? = null

    private fun transportRejected(): GatewayDevicePlaneResult.Rejected {
        val failure = lastTransportFailure
        lastTransportFailure = null
        return when (failure?.failure) {
            GatewayTransportFailure.CONFIGURATION_REJECTED,
            GatewayTransportFailure.REQUEST_LIMIT_REACHED,
            -> rejected(GatewayDevicePlaneClientError.CONFIGURATION_REJECTED)
            GatewayTransportFailure.CONNECTION_UNAVAILABLE ->
                rejected(GatewayDevicePlaneClientError.CONNECTION_UNAVAILABLE)
            GatewayTransportFailure.TRANSPORT_UNCERTAIN,
            GatewayTransportFailure.PROTOCOL_MALFORMED,
            GatewayTransportFailure.RESPONSE_TOO_LARGE,
            -> rejected(
                if (failure.requestMayHaveReachedPeer) {
                    GatewayDevicePlaneClientError.TRANSPORT_UNCERTAIN
                } else {
                    GatewayDevicePlaneClientError.PROTOCOL_MALFORMED
                },
                requiresReconciliation = failure.requestMayHaveReachedPeer,
            )
            null -> rejected(GatewayDevicePlaneClientError.NOT_CONNECTED)
        }
    }

    private fun tryOpenChannel(): GatewayHttpChannel? =
        try {
            channelFactory.open()
        } catch (error: GatewayTransportException) {
            lastTransportFailure = error
            null
        }

    private fun snapshot(): GatewayDevicePlaneSnapshot =
        GatewayDevicePlaneSnapshot(
            gateway = checkNotNull(gateway),
            registration = checkNotNull(registration),
            deviceSession = checkNotNull(deviceSession),
        )

    private fun registrationMessage(gateway: GatewaySessionNetworkView, deviceId: String): String =
        listOf(
            "AURORA_DEVICE_REGISTRATION_V1",
            gateway.sessionId,
            gateway.connectionId,
            gateway.generation.toString(),
            deviceId,
            gateway.tenantId,
            gateway.actorIdentityId,
            gateway.correlationId,
        ).joinToString("\n")

    private fun attestationMessage(
        gateway: GatewaySessionNetworkView,
        registration: W14DeviceRegistrationView,
        deviceSessionId: String,
        previousConnectionId: String?,
    ): String =
        listOf(
            "AURORA_DEVICE_ATTESTATION_V1",
            gateway.sessionId,
            gateway.connectionId,
            gateway.generation.toString(),
            registration.ref.deviceId,
            registration.ref.registrationVersion.toString(),
            deviceSessionId,
            previousConnectionId ?: "-",
        ).joinToString("\n")

    private fun receiptIntegrityDigest(
        evidence: GatewayReceiptEvidence,
        connectionId: String,
        generation: Int,
    ): String {
        val canonical = StrictJson.encodeArray(
            listOf(
                "AURORA_DEVICE_RECEIPT_INTEGRITY_V1",
                evidence.receiptId,
                evidence.evidenceId,
                evidence.commandId,
                evidence.executionId,
                connectionId,
                generation,
                evidence.deliveryReference,
                evidence.reportedState.name,
                evidence.sourceReference,
                evidence.capturedAtMs,
            ),
        )
        val digest = MessageDigest.getInstance("SHA-256").digest(
            canonical.toByteArray(StandardCharsets.UTF_8),
        )
        return "sha256:${digest.toHex()}"
    }

    private fun withCredential(
        provider: GatewayCredentialProvider,
        block: (String) -> String,
    ): String? =
        try {
            val credential = provider.currentCredential()
            require(credential.isNotEmpty() && credential.length <= MAX_CREDENTIAL_LENGTH)
            block(credential)
        } catch (_: Exception) {
            null
        }

    private data class ConnectionContext(
        val gatewaySessionId: String,
        val tenantId: String,
        val actorKind: String,
        val actorIdentityId: String,
        val correlationId: String,
        val deviceId: String,
        val deviceSessionId: String,
    ) {
        companion object {
            fun from(request: GatewayDevicePlaneConnectRequest): ConnectionContext =
                ConnectionContext(
                    gatewaySessionId = request.gatewaySessionId,
                    tenantId = request.tenantId,
                    actorKind = request.actorKind,
                    actorIdentityId = request.actorIdentityId,
                    correlationId = request.correlationId,
                    deviceId = request.deviceId,
                    deviceSessionId = request.deviceSessionId,
                )
        }
    }

    companion object {
        fun forLocalEnvironment(
            config: RuntimeEnvironmentConfig,
            sessionClient: SecureDeviceSessionClient,
            nowMs: () -> Long = { System.currentTimeMillis() },
        ): GatewayDevicePlaneClient {
            val keyStore = AndroidKeystoreSigningKeyStore()
            return GatewayDevicePlaneClient(
                channelFactory = PersistentGatewayHttpChannel.factory(config),
                proofFactory = Es256DeviceProofEnvelopeFactory(
                    W15BDeviceProofKeySource(sessionClient, keyStore),
                ),
                sessionAcceptance = W15BDeviceSessionAcceptance(sessionClient),
                nowMs = nowMs,
            )
        }

        /** Physical DP5 path through `adb reverse tcp:<port> tcp:<port>`. */
        fun forPhysicalAdbReverse(
            config: RuntimeEnvironmentConfig,
            sessionClient: SecureDeviceSessionClient,
            port: Int = 8080,
            nowMs: () -> Long = { System.currentTimeMillis() },
        ): GatewayDevicePlaneClient {
            require(config.environment == AuroraEnvironment.LOCAL && config.allowCleartextTraffic) {
                "physical adb-reverse transport is restricted to explicit LOCAL cleartext acceptance"
            }
            val keyStore = AndroidKeystoreSigningKeyStore()
            return GatewayDevicePlaneClient(
                channelFactory = PersistentGatewayHttpChannel.physicalAdbReverseFactory(port),
                proofFactory = Es256DeviceProofEnvelopeFactory(
                    W15BDeviceProofKeySource(sessionClient, keyStore),
                ),
                sessionAcceptance = W15BDeviceSessionAcceptance(sessionClient),
                nowMs = nowMs,
            )
        }
    }
}

private fun rejected(
    error: GatewayDevicePlaneClientError,
    upstreamCode: String? = null,
    requiresReconciliation: Boolean = false,
): GatewayDevicePlaneResult.Rejected =
    GatewayDevicePlaneResult.Rejected(
        error = error,
        upstreamCode = upstreamCode,
        requiresReconciliation = requiresReconciliation,
    )

private fun isSafeUpstreamCode(value: String): Boolean =
    value.length in 1..128 && SAFE_TOKEN.matches(value)

private fun requireSafeToken(value: String, name: String, maxLength: Int = 512) {
    require(value.length in 1..maxLength && SAFE_TOKEN.matches(value)) { "$name is invalid" }
}

private fun ByteArray.toHex(): String = joinToString(separator = "") { byte -> "%02x".format(byte) }

private const val GATEWAY_PROTOCOL_VERSION = "1.0"
private const val MAX_CREDENTIAL_LENGTH = 16 * 1024
private const val VOICE_CANDIDATE_DEVICE_ROUTE = "/v1/device/voice/candidates/evaluate"
private val VOICE_CANDIDATE_SUCCESS_RESPONSE_KEYS =
    setOf(
        "ok",
        "acceptedForEvaluation",
        "authorizesExecution",
        "provesExecutionSuccess",
        "retryAuthorized",
    )
private val SAFE_TOKEN = Regex("[A-Za-z0-9._:/+-]+")
private val DEVICE_ID = Regex("dvc_[0-9A-HJKMNP-TV-Z]{26}")
