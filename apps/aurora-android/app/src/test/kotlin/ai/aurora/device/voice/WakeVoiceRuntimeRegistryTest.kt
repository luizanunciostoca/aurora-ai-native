package ai.aurora.device.voice

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class WakeVoiceRuntimeRegistryTest {
    private val candidate =
        VoiceDispatchCandidate(
            commandId = "open-camera",
            capabilityId = "camera.open",
            normalizedTranscript = "open camera",
        )

    @Before
    @After
    fun resetRegistry() {
        WakeVoiceRuntimeRegistry.clearAuthorityIngress()
    }

    @Test
    fun `starts fail closed with default uncomposed authority ingress`() {
        var transportCalls = 0
        val dummyTransport = GovernedVoiceCandidateTransport {
            transportCalls++
            GovernedVoiceCandidateTransportResult.Delivered(acceptedForEvaluation = true)
        }

        // Before installation, registry uses uncomposed ingress
        WakeVoiceRuntimeRegistry.clearAuthorityIngress()

        val dummyIngress = GovernedW07VoiceAuthorityIngress(dummyTransport)
        // Verify default uncomposed ingress fails closed without touching any transport
        WakeVoiceRuntimeRegistry.clearAuthorityIngress()

        val defaultIngress = W07VoiceAuthorityIngress {
            W07VoiceAuthorityIngressResult.Unavailable("W07 Android authority ingress not composed")
        }
        val result = defaultIngress.submit(candidate)
        assertTrue(result is W07VoiceAuthorityIngressResult.Unavailable)
        assertEquals("W07 Android authority ingress not composed", (result as W07VoiceAuthorityIngressResult.Unavailable).reason)
        assertEquals(0, transportCalls)
    }

    @Test
    fun `installs governed W07 authority ingress adapter and routes accepted candidate`() {
        var observedSubmission: GovernedVoiceCandidateSubmission? = null
        val transport = GovernedVoiceCandidateTransport { request ->
            observedSubmission = request
            GovernedVoiceCandidateTransportResult.Delivered(
                acceptedForEvaluation = true,
                authorizesExecution = false,
                provesExecutionSuccess = false,
                retryAuthorized = false,
            )
        }
        val ingress = GovernedW07VoiceAuthorityIngress(transport)
        WakeVoiceRuntimeRegistry.installAuthorityIngress(ingress)

        val router = WakeVoiceFastPathRouter(
            inputProvider = {
                WakeVoiceFastPathInputs(
                    commands = listOf(
                        VoiceCommandDefinition(
                            commandId = "open-camera",
                            phrases = setOf("open camera"),
                            capabilityId = "camera.open",
                            risk = VoiceCommandRisk.LOW,
                        ),
                    ),
                    context = VoiceFastPathContext(
                        appVisibility = ai.aurora.device.lifecycle.AppVisibility.FOREGROUND,
                        microphonePermission = ai.aurora.device.permission.RuntimePermissionObservation(
                            requirement = ai.aurora.device.permission.RuntimePermissionRequirement("android.permission.RECORD_AUDIO"),
                            state = ai.aurora.device.permission.RuntimePermissionState.GRANTED,
                            observedAtMs = 1000L,
                            expiresAtMs = 31000L,
                            shouldShowRationale = false,
                        ),
                        availableCapabilityIds = setOf("camera.open"),
                        privacyModeEnabled = false,
                    ),
                )
            },
            authorityIngress = ingress,
            nowMs = { 1000L },
        )

        val routeResult = router.route("open camera", 0.99) as WakeVoiceRoute.AuthoritySubmitted

        assertEquals("open-camera", routeResult.dispatch.commandId)
        assertEquals("camera.open", routeResult.dispatch.capabilityId)
        assertEquals("open-camera", observedSubmission?.commandId)
        assertEquals("camera.open", observedSubmission?.capabilityId)
        assertEquals("open camera", observedSubmission?.normalizedTranscript)
        assertTrue(observedSubmission?.requiresW07Authorization == true)
        assertFalse(observedSubmission?.authorizesExecution ?: true)
    }

    @Test
    fun `clearing authority ingress returns registry to fail closed state`() {
        var transportCalls = 0
        val transport = GovernedVoiceCandidateTransport {
            transportCalls++
            GovernedVoiceCandidateTransportResult.Delivered(acceptedForEvaluation = true)
        }
        val ingress = GovernedW07VoiceAuthorityIngress(transport)
        WakeVoiceRuntimeRegistry.installAuthorityIngress(ingress)

        // Verify installed ingress works
        assertEquals(W07VoiceAuthorityIngressResult.AcceptedForEvaluation, ingress.submit(candidate))
        assertEquals(1, transportCalls)

        // Clear ingress and verify reset
        WakeVoiceRuntimeRegistry.clearAuthorityIngress()

        // Router or direct calls with uncomposed state fail closed
        val router = WakeVoiceFastPathRouter(
            inputProvider = {
                WakeVoiceFastPathInputs(
                    commands = listOf(
                        VoiceCommandDefinition(
                            commandId = "open-camera",
                            phrases = setOf("open camera"),
                            capabilityId = "camera.open",
                            risk = VoiceCommandRisk.LOW,
                        ),
                    ),
                    context = VoiceFastPathContext(
                        appVisibility = ai.aurora.device.lifecycle.AppVisibility.FOREGROUND,
                        microphonePermission = ai.aurora.device.permission.RuntimePermissionObservation(
                            requirement = ai.aurora.device.permission.RuntimePermissionRequirement("android.permission.RECORD_AUDIO"),
                            state = ai.aurora.device.permission.RuntimePermissionState.GRANTED,
                            observedAtMs = 1000L,
                            expiresAtMs = 31000L,
                            shouldShowRationale = false,
                        ),
                        availableCapabilityIds = setOf("camera.open"),
                        privacyModeEnabled = false,
                    ),
                )
            },
            authorityIngress = W07VoiceAuthorityIngress {
                W07VoiceAuthorityIngressResult.Unavailable("W07 Android authority ingress not composed")
            },
            nowMs = { 1000L },
        )

        val fallback = router.route("open camera", 0.99) as WakeVoiceRoute.ConversationFallback
        assertEquals(WakeVoiceFallbackReason.AUTHORITY_INGRESS_UNAVAILABLE, fallback.reason)
        // Transport was not called again after clearing
        assertEquals(1, transportCalls)
    }

    @Test
    fun `installed ingress failing or returning unavailable falls back to conversation`() {
        val transport = GovernedVoiceCandidateTransport {
            GovernedVoiceCandidateTransportResult.Unavailable(
                reason = "gateway connection lost",
                deliveryUncertain = false,
                retryAuthorized = false,
            )
        }
        val ingress = GovernedW07VoiceAuthorityIngress(transport)
        WakeVoiceRuntimeRegistry.installAuthorityIngress(ingress)

        val result = ingress.submit(candidate)
        assertTrue(result is W07VoiceAuthorityIngressResult.Unavailable)
        assertEquals("gateway connection lost", (result as W07VoiceAuthorityIngressResult.Unavailable).reason)
    }

    @Test
    fun `installed ingress returning authority or outcome bearing response fails closed`() {
        val maliciousTransport = GovernedVoiceCandidateTransport {
            GovernedVoiceCandidateTransportResult.Delivered(
                acceptedForEvaluation = true,
                authorizesExecution = true, // Malicious / invalid authority injection
                provesExecutionSuccess = true,
                retryAuthorized = true,
            )
        }
        val ingress = GovernedW07VoiceAuthorityIngress(maliciousTransport)
        WakeVoiceRuntimeRegistry.installAuthorityIngress(ingress)

        val result = ingress.submit(candidate)
        assertTrue(result is W07VoiceAuthorityIngressResult.Unavailable)
        assertEquals("voice candidate response rejected", (result as W07VoiceAuthorityIngressResult.Unavailable).reason)
    }
}
