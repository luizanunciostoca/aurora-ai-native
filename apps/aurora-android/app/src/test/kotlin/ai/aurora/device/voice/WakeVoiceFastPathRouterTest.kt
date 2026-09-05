package ai.aurora.device.voice

import ai.aurora.device.lifecycle.AppVisibility
import ai.aurora.device.permission.RuntimePermissionObservation
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.permission.RuntimePermissionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeVoiceFastPathRouterTest {
    private val nowMs = 1_000L

    @Test
    fun `empty catalog fails closed to conversation without calling W07 ingress`() {
        var ingressCalls = 0
        val router =
            WakeVoiceFastPathRouter(
                inputProvider = { inputs(commands = emptyList()) },
                authorityIngress = W07VoiceAuthorityIngress {
                    ingressCalls += 1
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation
                },
                nowMs = { nowMs },
            )

        val fallback = router.route("open camera", 0.99) as WakeVoiceRoute.ConversationFallback

        assertEquals(WakeVoiceFallbackReason.COMMAND_CATALOG_UNAVAILABLE, fallback.reason)
        assertEquals(0, ingressCalls)
    }

    @Test
    fun `missing recognizer confidence cannot borrow wake confidence`() {
        val router = router(ingress = W07VoiceAuthorityIngressResult.AcceptedForEvaluation)

        val fallback = router.route("open camera", null) as WakeVoiceRoute.ConversationFallback

        assertEquals(WakeVoiceFallbackReason.TRANSCRIPT_CONFIDENCE_UNAVAILABLE, fallback.reason)
    }

    @Test
    fun `eligible exact low risk phrase reaches W07 ingress but remains non executable`() {
        var submitted: VoiceDispatchCandidate? = null
        val router =
            WakeVoiceFastPathRouter(
                inputProvider = { inputs() },
                authorityIngress = W07VoiceAuthorityIngress { candidate ->
                    submitted = candidate
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation
                },
                nowMs = { nowMs },
            )

        val route = router.route("open camera", 0.99) as WakeVoiceRoute.AuthoritySubmitted

        assertEquals("open-camera", route.dispatch.commandId)
        assertEquals("camera.open", route.dispatch.capabilityId)
        assertTrue(route.dispatch.requiresW07Authorization)
        assertFalse(route.dispatch.authorizesExecution)
        assertEquals(route.dispatch, submitted)
    }

    @Test
    fun `unavailable W07 ingress returns candidate to normal conversation path`() {
        val router = router(ingress = W07VoiceAuthorityIngressResult.Unavailable("not composed"))

        val fallback = router.route("open camera", 0.99) as WakeVoiceRoute.ConversationFallback

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
                inputProvider = { inputs(context = context(privacyMode = true)) },
                authorityIngress = W07VoiceAuthorityIngress {
                    ingressCalls += 1
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation
                },
                nowMs = { nowMs },
            )

        val fallback = router.route("open camera", 0.99) as WakeVoiceRoute.ConversationFallback

        assertEquals(WakeVoiceFallbackReason.FAST_PATH_BLOCKED, fallback.reason)
        assertEquals(0, ingressCalls)
    }

    @Test
    fun `one atomic input provider is read exactly once per evaluation`() {
        var snapshots = 0
        val router =
            WakeVoiceFastPathRouter(
                inputProvider = {
                    snapshots += 1
                    inputs()
                },
                authorityIngress = W07VoiceAuthorityIngress {
                    W07VoiceAuthorityIngressResult.Unavailable("test")
                },
                nowMs = { nowMs },
            )

        router.route("open camera", 0.99)

        assertEquals(1, snapshots)
    }

    private fun router(ingress: W07VoiceAuthorityIngressResult): WakeVoiceFastPathRouter =
        WakeVoiceFastPathRouter(
            inputProvider = { inputs() },
            authorityIngress = W07VoiceAuthorityIngress { ingress },
            nowMs = { nowMs },
        )

    private fun inputs(
        commands: List<VoiceCommandDefinition> = commands(),
        context: VoiceFastPathContext = context(),
    ): WakeVoiceFastPathInputs =
        WakeVoiceFastPathInputs(
            commands = commands,
            context = context,
            registryVersion = "w04-live.1",
            vocabularyVersion = "w15g-live.1",
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
