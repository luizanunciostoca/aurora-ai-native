package ai.aurora.device.network

import ai.aurora.device.session.W14DeviceRegistrationView
import ai.aurora.device.session.W14DeviceSessionTrustView
import ai.aurora.device.voice.GovernedVoiceCandidateSubmission
import ai.aurora.device.voice.GovernedVoiceCandidateTransportResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayDevicePlaneClientTest {
    @Test
    fun `connect uses one channel and device routes never carry authority fields`() {
        val channel = FakeChannel(
            gatewayResponse("conn-1", generation = 1),
            registrationResponse("REGISTERED", version = 1),
            registrationResponse("ACTIVE", version = 2),
            sessionResponse("conn-1", generation = 1, version = 2),
        )
        val proofs = RecordingProofFactory()
        val acceptance = RecordingAcceptance()
        val client = GatewayDevicePlaneClient(
            channelFactory = GatewayHttpChannelFactory { channel },
            proofFactory = proofs,
            sessionAcceptance = acceptance,
            nowMs = { 500 },
        )

        val result = client.connect(connectRequest()) as GatewayDevicePlaneResult.Success
        assertEquals("conn-1", result.value.gateway.connectionId)
        assertEquals(2, result.value.registration.ref.registrationVersion)
        assertEquals(1, acceptance.registrationCount)
        assertEquals(1, acceptance.sessionCount)
        assertEquals(4, channel.requests.size)

        val register = channel.requests[1]
        assertEquals("/v1/device/registrations/register", register.first)
        assertFalse(register.second.contains("tenantId"))
        assertFalse(register.second.contains("actorIdentityId"))
        assertFalse(register.second.contains("correlationId"))
        assertFalse(register.second.contains("integrityDigest"))

        val openSession = channel.requests[3]
        assertEquals("/v1/device/sessions/open", openSession.first)
        assertFalse(openSession.second.contains("state"))
        assertFalse(openSession.second.contains("attestation"))
        assertTrue(proofs.messages[0].startsWith("AURORA_DEVICE_REGISTRATION_V1\n"))
        assertTrue(proofs.messages[1].startsWith("AURORA_DEVICE_ATTESTATION_V1\n"))
    }

    @Test
    fun `receipt signs server-compatible integrity evidence without sending digest or authority`() {
        val channel = FakeChannel(
            gatewayResponse("conn-1", generation = 1),
            registrationResponse("REGISTERED", version = 1),
            registrationResponse("ACTIVE", version = 2),
            sessionResponse("conn-1", generation = 1, version = 2),
            receiptResponse("CURRENT_SESSION", requiresReconciliation = false),
        )
        val proofs = RecordingProofFactory()
        val client = GatewayDevicePlaneClient(
            channelFactory = GatewayHttpChannelFactory { channel },
            proofFactory = proofs,
            sessionAcceptance = RecordingAcceptance(),
            nowMs = { 500 },
        )
        assertTrue(client.connect(connectRequest()) is GatewayDevicePlaneResult.Success)

        val result = client.submitReceipt(
            GatewayReceiptEvidence(
                receiptId = "rcp_01J00000000000000000000000",
                evidenceId = "evd_01J00000000000000000000000",
                commandId = "cmd_01J00000000000000000000000",
                executionId = "exe_01J00000000000000000000000",
                deliveryReference = "delivery:1",
                reportedState = DeviceReceiptReportedState.COMPLETED,
                sourceReference = "android:native",
                capturedAtMs = 450,
            ),
        ) as GatewayDevicePlaneResult.Success
        assertEquals("CURRENT_SESSION", result.value.classification)
        assertFalse(result.value.retryAuthorized)

        val receiptRequest = channel.requests.last()
        assertEquals("/v1/device/receipts/ingest", receiptRequest.first)
        assertFalse(receiptRequest.second.contains("integrityDigest"))
        assertFalse(receiptRequest.second.contains("tenantId"))
        assertFalse(receiptRequest.second.contains("actorIdentityId"))
        assertFalse(receiptRequest.second.contains("correlationId"))
        assertTrue(receiptRequest.second.contains("\"proofReference\""))
        val receiptProofMessage = proofs.messages.last()
        assertTrue(receiptProofMessage.startsWith("AURORA_DEVICE_RECEIPT_V1\n"))
        assertTrue(receiptProofMessage.lines().last().matches(Regex("sha256:[a-f0-9]{64}")))
    }

    @Test
    fun `voice candidate reuses authenticated device channel without client authority context`() {
        val channel = FakeChannel(
            gatewayResponse("conn-1", generation = 1),
            registrationResponse("REGISTERED", version = 1),
            registrationResponse("ACTIVE", version = 2),
            sessionResponse("conn-1", generation = 1, version = 2),
        )
        val client = GatewayDevicePlaneClient(
            channelFactory = GatewayHttpChannelFactory { channel },
            proofFactory = RecordingProofFactory(),
            sessionAcceptance = RecordingAcceptance(),
            nowMs = { 500 },
        )
        assertTrue(client.connect(connectRequest()) is GatewayDevicePlaneResult.Success)
        channel.enqueue(GatewayHttpResponse(202, voiceAcceptedResponse()))

        val result = client.submit(voiceCandidate()) as GovernedVoiceCandidateTransportResult.Delivered
        assertTrue(result.acceptedForEvaluation)
        assertFalse(result.authorizesExecution)
        assertFalse(result.provesExecutionSuccess)
        assertFalse(result.retryAuthorized)

        assertEquals(5, channel.requests.size)
        val request = channel.requests.last()
        assertEquals("/v1/device/voice/candidates/evaluate", request.first)
        assertTrue(request.second.contains("\"commandId\":\"cmd_voice_1\""))
        assertTrue(request.second.contains("\"requiresW07Authorization\":true"))
        assertTrue(request.second.contains("\"authorizesExecution\":false"))
        assertFalse(request.second.contains("tenantId"))
        assertFalse(request.second.contains("actorIdentityId"))
        assertFalse(request.second.contains("correlationId"))
        assertFalse(request.second.contains("deviceSessionId"))
        assertFalse(request.second.contains("registrationVersion"))
        assertFalse(request.second.contains("policy"))
        assertFalse(request.second.contains("retryAuthorized"))
    }

    @Test
    fun `voice candidate rejects authority-bearing acknowledgement`() {
        val channel = FakeChannel(
            gatewayResponse("conn-1", generation = 1),
            registrationResponse("REGISTERED", version = 1),
            registrationResponse("ACTIVE", version = 2),
            sessionResponse("conn-1", generation = 1, version = 2),
        )
        val client = GatewayDevicePlaneClient(
            channelFactory = GatewayHttpChannelFactory { channel },
            proofFactory = RecordingProofFactory(),
            sessionAcceptance = RecordingAcceptance(),
            nowMs = { 500 },
        )
        assertTrue(client.connect(connectRequest()) is GatewayDevicePlaneResult.Success)
        channel.enqueue(
            GatewayHttpResponse(
                202,
                """{"ok":true,"acceptedForEvaluation":true,"authorizesExecution":false,"provesExecutionSuccess":false,"retryAuthorized":false,"authorityToken":"forbidden"}""",
            ),
        )

        val result = client.submit(voiceCandidate()) as GovernedVoiceCandidateTransportResult.Unavailable
        assertFalse(result.deliveryUncertain)
        assertFalse(result.retryAuthorized)
    }

    @Test
    fun `voice candidate post-write loss is uncertain and never authorizes retry`() {
        val channel = FakeChannel(
            gatewayResponse("conn-1", generation = 1),
            registrationResponse("REGISTERED", version = 1),
            registrationResponse("ACTIVE", version = 2),
            sessionResponse("conn-1", generation = 1, version = 2),
        )
        val client = GatewayDevicePlaneClient(
            channelFactory = GatewayHttpChannelFactory { channel },
            proofFactory = RecordingProofFactory(),
            sessionAcceptance = RecordingAcceptance(),
            nowMs = { 500 },
        )
        assertTrue(client.connect(connectRequest()) is GatewayDevicePlaneResult.Success)
        channel.failureAtRequest = channel.requests.size

        val result = client.submit(voiceCandidate()) as GovernedVoiceCandidateTransportResult.Unavailable
        assertTrue(result.deliveryUncertain)
        assertFalse(result.retryAuthorized)
        assertEquals(4, channel.requests.size)
    }

    @Test
    fun `reconnect opens a fresh channel and resumes using previous connection evidence`() {
        val initial = FakeChannel(
            gatewayResponse("conn-1", generation = 1),
            registrationResponse("REGISTERED", version = 1),
            registrationResponse("ACTIVE", version = 2),
            sessionResponse("conn-1", generation = 1, version = 2),
        )
        val resumed = FakeChannel(
            gatewayResponse("conn-2", generation = 2),
            registrationResponse("ACTIVE", version = 2),
            sessionResponse("conn-2", generation = 2, version = 2),
        )
        val channels = ArrayDeque(listOf(initial, resumed))
        var opens = 0
        val proofs = RecordingProofFactory()
        val client = GatewayDevicePlaneClient(
            channelFactory = GatewayHttpChannelFactory {
                opens += 1
                channels.removeFirst()
            },
            proofFactory = proofs,
            sessionAcceptance = RecordingAcceptance(),
            nowMs = { 600 },
        )
        assertTrue(client.connect(connectRequest()) is GatewayDevicePlaneResult.Success)

        val result = client.reconnect(GatewayCredentialProvider { "credential-2" })
            as GatewayDevicePlaneResult.Success
        assertEquals(2, opens)
        assertTrue(initial.closed)
        assertEquals("conn-2", result.value.gateway.connectionId)
        assertEquals(2, result.value.gateway.generation)
        assertTrue(resumed.requests[0].second.contains("\"previousConnectionId\":\"conn-1\""))
        assertEquals("/v1/device/registrations/register", resumed.requests[1].first)
        assertTrue(resumed.requests[1].second.contains("\"deviceId\":\"dvc_01J00000000000000000000000\""))
        assertFalse(resumed.requests[1].second.contains("tenantId"))
        assertEquals("/v1/device/sessions/resume", resumed.requests[2].first)
        assertTrue(resumed.requests[2].second.contains("\"previousConnectionId\":\"conn-1\""))
        assertTrue(proofs.messages[proofs.messages.lastIndex - 1].startsWith("AURORA_DEVICE_REGISTRATION_V1\n"))
        assertTrue(proofs.messages.last().endsWith("\nconn-1"))
    }

    @Test
    fun `post-write transport loss is uncertain and never auto retries`() {
        val channel = FakeChannel(gatewayResponse("conn-1", generation = 1))
        channel.failureAtRequest = 1
        val client = GatewayDevicePlaneClient(
            channelFactory = GatewayHttpChannelFactory { channel },
            proofFactory = RecordingProofFactory(),
            sessionAcceptance = RecordingAcceptance(),
            nowMs = { 500 },
        )

        val result = client.connect(connectRequest()) as GatewayDevicePlaneResult.Rejected
        assertEquals(GatewayDevicePlaneClientError.TRANSPORT_UNCERTAIN, result.error)
        assertTrue(result.requiresReconciliation)
        assertFalse(result.retryAuthorized)
        assertEquals(1, channel.requests.size)
    }

    private fun connectRequest() =
        GatewayDevicePlaneConnectRequest(
            gatewaySessionId = "gws_01J00000000000000000000000",
            tenantId = "ten_01J00000000000000000000000",
            actorKind = "USER",
            actorIdentityId = "idn_01J00000000000000000000000",
            correlationId = "cor_01J00000000000000000000000",
            deviceId = "dvc_01J00000000000000000000000",
            deviceSessionId = "dvs_01J00000000000000000000000",
            credentialProvider = GatewayCredentialProvider { "credential-1" },
        )

    private fun voiceCandidate() =
        GovernedVoiceCandidateSubmission(
            commandId = "cmd_voice_1",
            capabilityId = "workspace.open",
            normalizedTranscript = "open dashboard",
        )

    private class FakeChannel(vararg responses: String) : GatewayHttpChannel {
        private val responses = ArrayDeque(responses.map { GatewayHttpResponse(200, it) })
        val requests = mutableListOf<Pair<String, String>>()
        var failureAtRequest: Int? = null
        var closed = false

        fun enqueue(response: GatewayHttpResponse) {
            responses.addLast(response)
        }

        override fun post(path: String, body: String): GatewayHttpResponse {
            if (failureAtRequest == requests.size) {
                throw GatewayTransportException(
                    GatewayTransportFailure.TRANSPORT_UNCERTAIN,
                    requestMayHaveReachedPeer = true,
                )
            }
            requests += path to body
            return responses.removeFirst()
        }

        override fun close() {
            closed = true
        }
    }

    private class RecordingProofFactory : DeviceProofFactory {
        val messages = mutableListOf<String>()

        override fun sign(message: String): String {
            messages += message
            return "proof-envelope"
        }
    }

    private class RecordingAcceptance : DeviceSessionAcceptance {
        var registrationCount = 0
        var sessionCount = 0

        override fun acceptRegistration(registration: W14DeviceRegistrationView): Boolean {
            registrationCount += 1
            return true
        }

        override fun acceptSession(session: W14DeviceSessionTrustView, nowMs: Long): Boolean {
            sessionCount += 1
            return true
        }
    }

    private fun gatewayResponse(connectionId: String, generation: Int): String =
        """{"ok":true,"value":{"protocolVersion":"1.0","sessionId":"gws_01J00000000000000000000000","connectionId":"$connectionId","generation":$generation,"state":"OPEN","tenantId":"ten_01J00000000000000000000000","actorKind":"USER","actorIdentityId":"idn_01J00000000000000000000000","correlationId":"cor_01J00000000000000000000000","authIssuedAtMs":100,"authExpiresAtMs":10000,"openedAtMs":100,"outstandingRequests":0,"authorizesExecution":false}}"""

    private fun registrationResponse(state: String, version: Int): String =
        """{"ok":true,"disposition":"REGISTERED","record":{"kind":"DeviceRegistrationRecord","schemaVersion":"1.0.0","ref":{"kind":"AURORA_DEVICE","deviceId":"dvc_01J00000000000000000000000","tenantId":"ten_01J00000000000000000000000","registrationVersion":$version},"state":"$state","registeredAt":"2026-09-05T00:00:00Z","updatedAt":"2026-09-05T00:00:00Z","provenance":{"source":"W14_DEVICE_REGISTRATION","reference":"device-key:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","observedAt":"2026-09-05T00:00:00Z"},"authoritySemantics":"DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY","authorizesExecution":false,"canGrantPermission":false},"authorizesExecution":false}"""

    private fun sessionResponse(connectionId: String, generation: Int, version: Int): String =
        """{"ok":true,"snapshot":{"kind":"DeviceSessionTrustSnapshot","schemaVersion":"1.0.0","deviceSessionId":"dvs_01J00000000000000000000000","gatewaySessionId":"gws_01J00000000000000000000000","connectionId":"$connectionId","gatewayGeneration":$generation,"tenantId":"ten_01J00000000000000000000000","actorIdentityId":"idn_01J00000000000000000000000","correlationId":"cor_01J00000000000000000000000","deviceRef":{"kind":"AURORA_DEVICE","deviceId":"dvc_01J00000000000000000000000","tenantId":"ten_01J00000000000000000000000","registrationVersion":$version},"attestation":{"kind":"DEVICE_ATTESTATION_REFERENCE","reference":"att:1","provider":"aurora-device-key-proof","version":"1","state":"VERIFIED","observedAtMs":500,"expiresAtMs":9000},"state":"ACTIVE","openedAtMs":500,"lastEvaluatedAtMs":500,"gatewayAuthExpiresAtMs":10000,"executionPreconditionSatisfied":true,"requiresCurrentAuthorityValidation":true,"authoritySemantics":"DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY","authorizesExecution":false,"canGrantPermission":false},"authorizesExecution":false,"canGrantPermission":false}"""

    private fun receiptResponse(classification: String, requiresReconciliation: Boolean): String =
        """{"ok":true,"value":{"classification":"$classification","durableReference":"durable:1","receiptReference":"receipt:1","requiresW07Reconciliation":$requiresReconciliation,"authoritySemantics":"EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY","authorizesExecution":false,"canGrantPermission":false,"provesExecutionSuccess":false,"retryAuthorized":false},"authorizesExecution":false,"retryAuthorized":false}"""

    private fun voiceAcceptedResponse(): String =
        """{"ok":true,"acceptedForEvaluation":true,"authorizesExecution":false,"provesExecutionSuccess":false,"retryAuthorized":false}"""
}
