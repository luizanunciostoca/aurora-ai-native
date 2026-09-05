package ai.aurora.device.voice

import ai.aurora.device.lifecycle.AppVisibility
import ai.aurora.device.permission.RuntimePermissionObservation
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.permission.RuntimePermissionState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class WakeVoiceFastPathRouterTest {
    private val nowMs = 1_000L

    @Test
    fun `empty catalog fails closed to conversation without calling W07 ingress`() {
        var ingressCalls = 0
        val router =
            WakeVoiceFastPathRouter(
                commandCatalog = { emptyList() },
                contextProvider = { context() },
                authorityIngress = W07VoiceAuthorityIngress {
                    ingressCalls += 1
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation
                },
                nowMs = { nowMs },
            )

        val route = router.route("open camera", 0.99)

        val fallback = assertIs<WakeVoiceRoute.ConversationFallback>(route)
        assertEquals(WakeVoiceFallbackReason.COMMAND_CATALOG_UNAVAILABLE, fallback.reason)
        assertEquals(0, ingressCalls)
    }

    @Test
    fun `missing recognizer confidence cannot borrow wake confidence`() {
        val router = router(ingress = W07VoiceAuthorityIngressResult.AcceptedForEvaluation)

        val fallback = assertIs<WakeVoiceRoute.ConversationFallback>(router.route("open camera", null))

        assertEquals(WakeVoiceFallbackReason.TRANSCRIPT_CONFIDENCE_UNAVAILABLE, fallback.reason)
    }

    @Test
    fun `eligible exact low risk phrase reaches W07 ingress but remains non executable`() {
        var submitted: VoiceDispatchCandidate? = null
        val router =
            WakeVoiceFastPathRouter(
                commandCatalog = { commands() },
                contextProvider = { context() },
                authorityIngress = W07VoiceAuthorityIngress { candidate ->
                    submitted = candidate
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation
                },
                nowMs = { nowMs },
            )

        val route = assertIs<WakeVoiceRoute.AuthoritySubmitted>(router.route("open camera", 0.99))

        assertEquals("open-camera", route.dispatch.commandId)
        assertEquals("camera.open", route.dispatch.capabilityId)
        assertTrue(route.dispatch.requiresW07Authorization)
        assertFalse(route.dispatch.authorizesExecution)
        assertEquals(route.dispatch, submitted)
    }

    @Test
    fun `unavailable W07 ingress returns candidate to normal conversation path`() {
        val router = router(ingress = W07VoiceAuthorityIngressResult.Unavailable("not composed"))

        val fallback = assertIs<WakeVoiceRoute.ConversationFallback>(router.route("open camera", 0.99))

        assertEquals(WakeVoiceFallbackReason.AUTHORITY_INGRESS_UNAVAILABLE, fallback.reason)
        assertEquals("open-camera", fallback.dispatch?.commandId)
        assertTrue(fallback.dispatch?.requiresW07Authorization == true)
        assertFalse(fallback.dispatch?.authorizesExecution ?: true)
    }

    @Test
    fun `privacy and degraded runtime stay out of W07 ingress`() {
        var ingressCalls = 0
        val router =
            WakeVoiceFastPathRouter(
                commandCatalog = { commands() },
                contextProvider = { context(privacyMode = true) },
                authorityIngress = W07VoiceAuthorityIngress {
                    ingressCalls += 1
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation
                },
                nowMs = { nowMs },
            )

        val fallback = assertIs<WakeVoiceRoute.ConversationFallback>(router.route("open camera", 0.99))

        assertEquals(WakeVoiceFallbackReason.FAST_PATH_BLOCKED, fallback.reason)
        assertEquals(0, ingressCalls)
    }

    private fun router(ingress: W07VoiceAuthorityIngressResult): WakeVoiceFastPathRouter =
        WakeVoiceFastPathRouter(
            commandCatalog = { commands() },
            contextProvider = { context() },
            authorityIngress = W07VoiceAuthorityIngress { ingress },
            nowMs = { nowMs },
        )

    private fun commands(): List<VoiceCommandDefinition> =
        listOf(
            VoiceCommandDefinition(
                commandId = "open-camera",
                phrases = setOf("open camera"),
                capabilityId = "camera.open",
                risk = VoiceCommandRisk.LOW,
            ),
        )

    private fun context(privacyMode: Boolean = false): VoiceFastPathContext =
        VoiceFastPathContext(
            appVisibility = AppVisibility.FOREGROUND,
            microphonePermission =
                RuntimePermissionObservation(
                    requirement = RuntimePermissionRequirement("android.permission.RECORD_AUDIO"),
                    state = RuntimePermissionState.GRANTED,
                    observedAtMs = nowMs,
                    expiresAtMs = nowMs + 30_000,
                    shouldShowRationale = false,
                ),
            availableCapabilityIds = setOf("camera.open"),
            privacyModeEnabled = privacyMode,
        )
}
