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
    fun `voice projection parses non-authoritative installed app binding`() {
        val channel =
            FakeChannel(
                gatewayResponse("conn-1", generation = 1),
                registrationResponse("REGISTERED", version = 1),
                registrationResponse("ACTIVE", version = 2),
                sessionResponse("conn-1", generation = 1, version = 2),
            )
        val client =
            GatewayDevicePlaneClient(
                channelFactory = GatewayHttpChannelFactory { channel },
                proofFactory = RecordingProofFactory(),
                sessionAcceptance = RecordingAcceptance(),
                nowMs = { 500 },
            )
        assertTrue(client.connect(connectRequest()) is GatewayDevicePlaneResult.Success)
        channel.enqueue(GatewayHttpResponse(200, voiceProjectionWithAppBinding()))

        val result = client.fetchVoiceProjection() as GatewayDevicePlaneResult.Success
        val app = result.value.installedAppBindings.single()
        assertEquals("aurora.local", app.appId)
        assertEquals("ai.aurora.device.local", app.packageName)
        assertEquals(setOf("a".repeat(64)), app.trustedSignerSha256)
        assertEquals("aurora-main", app.routes.single().routeId)
        assertFalse(result.value.authorizesExecution)
        assertFalse(result.value.retryAuthorized)
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

        val result = client.reconnect(reconnectRequest()) as GatewayDevicePlaneResult.Success
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
    fun `reconnect binding mismatch is rejected before current socket is closed`() {
        val initial = FakeChannel(
            gatewayResponse("conn-1", generation = 1),
            registrationResponse("REGISTERED", version = 1),
            registrationResponse("ACTIVE", version = 2),
            sessionResponse("conn-1", generation = 1, version = 2),
        )
        val unused = FakeChannel()
        val channels = ArrayDeque(listOf(initial, unused))
        var opens = 0
        val client = GatewayDevicePlaneClient(
            channelFactory = GatewayHttpChannelFactory {
                opens += 1
                channels.removeFirst()
            },
            proofFactory = RecordingProofFactory(),
            sessionAcceptance = RecordingAcceptance(),
            nowMs = { 600 },
        )
        assertTrue(client.connect(connectRequest()) is GatewayDevicePlaneResult.Success)

        val result = client.reconnect(
            reconnectRequest(gatewaySessionId = "gws_01J00000000000000000000001"),
        ) as GatewayDevicePlaneResult.Rejected
        assertEquals(GatewayDevicePlaneClientError.CONFIGURATION_REJECTED, result.error)
        assertFalse(result.retryAuthorized)
        assertEquals(1, opens)
        assertFalse(initial.closed)
        val snapshot = client.currentSnapshot() as GatewayDevicePlaneResult.Success
        assertEquals("conn-1", snapshot.value.gateway.connectionId)
        assertEquals(1, snapshot.value.gateway.generation)
    }

    @Test
    fun `current W14 session can be revoked without creating execution authority`() {
        val channel = FakeChannel(
            gatewayResponse("conn-1", generation = 1),
            registrationResponse("REGISTERED", version = 1),
            registrationResponse("ACTIVE", version = 2),
            sessionResponse("conn-1", generation = 1, version = 2),
        )
        val acceptance = RecordingAcceptance()
        val client = GatewayDevicePlaneClient(
            channelFactory = GatewayHttpChannelFactory { channel },
            proofFactory = RecordingProofFactory(),
            sessionAcceptance = acceptance,
            nowMs = { 600 },
        )
        assertTrue(client.connect(connectRequest()) is GatewayDevicePlaneResult.Success)
        channel.enqueue(GatewayHttpResponse(200, sessionResponse("conn-1", 1, 2, state = "REVOKED")))

        val result = client.revokeCurrentSession("dp5:session-revoke") as GatewayDevicePlaneResult.Success
        assertEquals("REVOKED", result.value.state.name)
        assertEquals(1, acceptance.revocationCount)
        assertEquals("/v1/device/sessions/revoke", channel.requests.last().first)
        assertTrue(channel.requests.last().second.contains("dp5:session-revoke"))
        assertFalse(channel.requests.last().second.contains("authorizesExecution"))
    }

    @Test
    fun `rotated W14 session becomes the reconnect binding for the next socket`() {
        val nextSessionId = "dvs_01J00000000000000000000001"
        val initial = FakeChannel(
            gatewayResponse("conn-1", generation = 1),
            registrationResponse("REGISTERED", version = 1),
            registrationResponse("ACTIVE", version = 2),
            sessionResponse("conn-1", generation = 1, version = 2),
        )
        val resumed = FakeChannel(
            gatewayResponse("conn-2", generation = 2),
            registrationResponse("ACTIVE", version = 2),
            sessionResponse("conn-2", generation = 2, version = 2, deviceSessionId = nextSessionId),
        )
        val channels = ArrayDeque(listOf(initial, resumed))
        val acceptance = RecordingAcceptance()
        val client = GatewayDevicePlaneClient(
            channelFactory = GatewayHttpChannelFactory { channels.removeFirst() },
            proofFactory = RecordingProofFactory(),
            sessionAcceptance = acceptance,
            nowMs = { 600 },
        )
        assertTrue(client.connect(connectRequest()) is GatewayDevicePlaneResult.Success)
        initial.enqueue(GatewayHttpResponse(200, sessionResponse("conn-1", 1, 2, state = "REVOKED")))
        initial.enqueue(GatewayHttpResponse(200, sessionResponse("conn-1", 1, 2, deviceSessionId = nextSessionId)))

        val rotated = client.rotateCurrentSession(nextSessionId, "dp5:session-rotate") as GatewayDevicePlaneResult.Success
        assertEquals(nextSessionId, rotated.value.deviceSession.deviceSessionId)
        assertEquals(1, acceptance.revocationCount)
        assertEquals(2, acceptance.sessionCount)
        assertEquals("/v1/device/sessions/revoke", initial.requests[4].first)
        assertEquals("/v1/device/sessions/open", initial.requests[5].first)

        val reconnected = client.reconnect(reconnectRequest(deviceSessionId = nextSessionId)) as GatewayDevicePlaneResult.Success
        assertEquals("conn-2", reconnected.value.gateway.connectionId)
        assertEquals(nextSessionId, reconnected.value.deviceSession.deviceSessionId)
        assertTrue(resumed.requests[2].second.contains(nextSessionId))
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

    private fun reconnectRequest(
        gatewaySessionId: String = "gws_01J00000000000000000000000",
        deviceSessionId: String = "dvs_01J00000000000000000000000",
    ) =
        GatewayDevicePlaneReconnectRequest(
            gatewaySessionId = gatewaySessionId,
            tenantId = "ten_01J00000000000000000000000",
            actorKind = "USER",
            actorIdentityId = "idn_01J00000000000000000000000",
            correlationId = "cor_01J00000000000000000000000",
            deviceId = "dvc_01J00000000000000000000000",
            deviceSessionId = deviceSessionId,
            credentialProvider = GatewayCredentialProvider { "credential-2" },
            expectedRegistrationVersion = 2,
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
        var revocationCount = 0

        override fun acceptRegistration(registration: W14DeviceRegistrationView): Boolean {
            registrationCount += 1
            return true
        }

        override fun acceptSession(session: W14DeviceSessionTrustView, nowMs: Long): Boolean {
            sessionCount += 1
            return true
        }

        override fun revokeSession(deviceSessionId: String): Boolean {
            revocationCount += 1
            return true
        }
    }

    private fun gatewayResponse(connectionId: String, generation: Int): String =
        """{"ok":true,"value":{"protocolVersion":"1.0","sessionId":"gws_01J00000000000000000000000","connectionId":"$connectionId","generation":$generation,"state":"OPEN","tenantId":"ten_01J00000000000000000000000","actorKind":"USER","actorIdentityId":"idn_01J00000000000000000000000","correlationId":"cor_01J00000000000000000000000","authIssuedAtMs":100,"authExpiresAtMs":10000,"openedAtMs":100,"outstandingRequests":0,"authorizesExecution":false}}"""

    private fun registrationResponse(state: String, version: Int): String =
        """{"ok":true,"disposition":"REGISTERED","record":{"kind":"DeviceRegistrationRecord","schemaVersion":"1.0.0","ref":{"kind":"AURORA_DEVICE","deviceId":"dvc_01J00000000000000000000000","tenantId":"ten_01J00000000000000000000000","registrationVersion":$version},"state":"$state","registeredAt":"2026-09-05T00:00:00Z","updatedAt":"2026-09-05T00:00:00Z","provenance":{"source":"W14_DEVICE_REGISTRATION","reference":"device-key:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","observedAt":"2026-09-05T00:00:00Z"},"authoritySemantics":"DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY","authorizesExecution":false,"canGrantPermission":false},"authorizesExecution":false}"""

    private fun sessionResponse(
        connectionId: String,
        generation: Int,
        version: Int,
        deviceSessionId: String = "dvs_01J00000000000000000000000",
        state: String = "ACTIVE",
    ): String =
        """{"ok":true,"snapshot":{"kind":"DeviceSessionTrustSnapshot","schemaVersion":"1.0.0","deviceSessionId":"$deviceSessionId","gatewaySessionId":"gws_01J00000000000000000000000","connectionId":"$connectionId","gatewayGeneration":$generation,"tenantId":"ten_01J00000000000000000000000","actorIdentityId":"idn_01J00000000000000000000000","correlationId":"cor_01J00000000000000000000000","deviceRef":{"kind":"AURORA_DEVICE","deviceId":"dvc_01J00000000000000000000000","tenantId":"ten_01J00000000000000000000000","registrationVersion":$version},"attestation":{"kind":"DEVICE_ATTESTATION_REFERENCE","reference":"att:1","provider":"aurora-device-key-proof","version":"1","state":"VERIFIED","observedAtMs":500,"expiresAtMs":9000},"state":"$state","openedAtMs":500,"lastEvaluatedAtMs":500,"gatewayAuthExpiresAtMs":10000,"executionPreconditionSatisfied":${state == "ACTIVE"},"requiresCurrentAuthorityValidation":true,"authoritySemantics":"DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY","authorizesExecution":false,"canGrantPermission":false},"authorizesExecution":false,"canGrantPermission":false}"""

    private fun receiptResponse(classification: String, requiresReconciliation: Boolean): String =
        """{"ok":true,"value":{"classification":"$classification","durableReference":"durable:1","receiptReference":"receipt:1","requiresW07Reconciliation":$requiresReconciliation,"authoritySemantics":"EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY","authorizesExecution":false,"canGrantPermission":false,"provesExecutionSuccess":false,"retryAuthorized":false},"authorizesExecution":false,"retryAuthorized":false}"""

    private fun voiceProjectionWithAppBinding(): String =
        """{"ok":true,"value":{"kind":"GOVERNED_VOICE_PROJECTION","activeTenantId":"ten_01J00000000000000000000000","registry":{"registryKind":"AURORA_CANONICAL_CAPABILITY_REGISTRY","registryVersion":"1.0.0","observedAtMs":100,"expiresAtMs":1000,"provenance":{"sourceRef":"w04:dp5","contentSha256":"${"b".repeat(64)}"},"entries":[{"capabilityId":"app.open","tenantId":"ten_01J00000000000000000000000","supportedTargetKinds":["DEVICE"],"currentAvailability":"CURRENT_AVAILABLE","riskClass":"LOW","observedAtMs":100,"expiresAtMs":1000}]},"vocabulary":{"vocabularyVersion":"1.0.0","observedAtMs":100,"expiresAtMs":1000,"provenance":{"sourceRef":"w15g:dp5","contentSha256":"${"c".repeat(64)}"},"bindings":[{"commandId":"cmd_app_1","phrases":["abrir aurora"],"capabilityId":"app.open"}]},"nativeBindings":[{"capabilityId":"app.open","minApiLevel":26,"requiredFeatures":[],"requiredPermissions":[],"maxSnapshotAgeMs":30000}],"appBindings":[{"appId":"aurora.local","packageName":"ai.aurora.device.local","trustedSignerSha256":["${"a".repeat(64)}"],"routes":[{"routeId":"aurora-main","kind":"INTENT","action":"android.intent.action.MAIN","supportsReadback":true}],"maxSnapshotAgeMs":30000}],"authorizesExecution":false,"provesExecutionSuccess":false,"retryAuthorized":false},"authorizesExecution":false,"provesExecutionSuccess":false,"retryAuthorized":false}"""

    private fun voiceAcceptedResponse(): String =
        """{"ok":true,"acceptedForEvaluation":true,"authorizesExecution":false,"provesExecutionSuccess":false,"retryAuthorized":false}"""
}
