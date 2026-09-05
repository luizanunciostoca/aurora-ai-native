package ai.aurora.device.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GovernedW07VoiceAuthorityIngressTest {
    private val candidate =
        VoiceDispatchCandidate(
            commandId = "open-camera",
            capabilityId = "camera.open",
            normalizedTranscript = "open camera",
        )

    @Test
    fun `submits only bounded non authoritative candidate fields`() {
        var observed: GovernedVoiceCandidateSubmission? = null
        val ingress =
            GovernedW07VoiceAuthorityIngress { request ->
                observed = request
                GovernedVoiceCandidateTransportResult.Delivered(acceptedForEvaluation = true)
            }

        val result = ingress.submit(candidate)

        assertEquals(W07VoiceAuthorityIngressResult.AcceptedForEvaluation, result)
        assertEquals("open-camera", observed?.commandId)
        assertEquals("camera.open", observed?.capabilityId)
        assertEquals("open camera", observed?.normalizedTranscript)
        assertTrue(observed?.requiresW07Authorization == true)
        assertFalse(observed?.authorizesExecution ?: true)
    }

    @Test
    fun `sanitized accepted acknowledgement means evaluation only`() {
        val ingress =
            GovernedW07VoiceAuthorityIngress {
                GovernedVoiceCandidateTransportResult.Delivered(
                    acceptedForEvaluation = true,
                    authorizesExecution = false,
                    provesExecutionSuccess = false,
                    retryAuthorized = false,
                )
            }

        assertEquals(W07VoiceAuthorityIngressResult.AcceptedForEvaluation, ingress.submit(candidate))
    }

    @Test
    fun `authority outcome or retry bearing response fails closed`() {
        val responses =
            listOf(
                GovernedVoiceCandidateTransportResult.Delivered(
                    acceptedForEvaluation = true,
                    authorizesExecution = true,
                ),
                GovernedVoiceCandidateTransportResult.Delivered(
                    acceptedForEvaluation = true,
                    provesExecutionSuccess = true,
                ),
                GovernedVoiceCandidateTransportResult.Delivered(
                    acceptedForEvaluation = true,
                    retryAuthorized = true,
                ),
            )

        for (response in responses) {
            val result = GovernedW07VoiceAuthorityIngress { response }.submit(candidate)
            assertTrue(result is W07VoiceAuthorityIngressResult.Unavailable)
        }
    }

    @Test
    fun `upstream rejection cannot be promoted to authority submitted`() {
        val result =
            GovernedW07VoiceAuthorityIngress {
                GovernedVoiceCandidateTransportResult.Delivered(acceptedForEvaluation = false)
            }.submit(candidate)

        assertTrue(result is W07VoiceAuthorityIngressResult.Unavailable)
    }

    @Test
    fun `transport exception fails closed`() {
        val result =
            GovernedW07VoiceAuthorityIngress {
                error("network unavailable")
            }.submit(candidate)

        assertTrue(result is W07VoiceAuthorityIngressResult.Unavailable)
    }

    @Test
    fun `uncertain delivery fails closed and never authorizes retry`() {
        val result =
            GovernedW07VoiceAuthorityIngress {
                GovernedVoiceCandidateTransportResult.Unavailable(
                    reason = "response lost",
                    deliveryUncertain = true,
                    retryAuthorized = false,
                )
            }.submit(candidate)

        assertTrue(result is W07VoiceAuthorityIngressResult.Unavailable)
        result as W07VoiceAuthorityIngressResult.Unavailable
        assertTrue(result.reason.contains("reconciliation required"))
    }

    @Test
    fun `invalid authority bearing candidate never reaches transport`() {
        var transportCalls = 0
        val ingress =
            GovernedW07VoiceAuthorityIngress {
                transportCalls += 1
                GovernedVoiceCandidateTransportResult.Delivered(acceptedForEvaluation = true)
            }
        val invalid = candidate.copy(authorizesExecution = true)

        val result = ingress.submit(invalid)

        assertTrue(result is W07VoiceAuthorityIngressResult.Unavailable)
        assertEquals(0, transportCalls)
    }

    @Test
    fun `oversized or blank candidate fields never reach transport`() {
        var transportCalls = 0
        val ingress =
            GovernedW07VoiceAuthorityIngress {
                transportCalls += 1
                GovernedVoiceCandidateTransportResult.Delivered(acceptedForEvaluation = true)
            }
        val invalidCandidates =
            listOf(
                candidate.copy(commandId = " "),
                candidate.copy(capabilityId = "x".repeat(257)),
                candidate.copy(normalizedTranscript = "x".repeat(513)),
                candidate.copy(requiresW07Authorization = false),
            )

        for (invalid in invalidCandidates) {
            assertTrue(ingress.submit(invalid) is W07VoiceAuthorityIngressResult.Unavailable)
        }
        assertEquals(0, transportCalls)
    }
}
