package ai.aurora.device.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraActionRefreshPolicyTest {
    private fun key(
        step: AuroraOnboardingStep = AuroraOnboardingStep.READY,
        primaryLabel: String = "Falar com Aurora",
        assistantSelected: Boolean = true,
        microphoneGranted: Boolean = true,
        privacyEnabled: Boolean = false,
        developerModeEnabled: Boolean = false,
        showLocalRuntime: Boolean = false,
        showDeveloperToggle: Boolean = true,
    ) =
        AuroraActionSetKey(
            step = step,
            primaryLabel = primaryLabel,
            assistantSelected = assistantSelected,
            microphoneGranted = microphoneGranted,
            privacyEnabled = privacyEnabled,
            developerModeEnabled = developerModeEnabled,
            showLocalRuntime = showLocalRuntime,
            showDeveloperToggle = showDeveloperToggle,
        )

    @Test
    fun firstRenderBuildsActions() {
        assertTrue(AuroraActionRefreshPolicy.shouldRebuild(null, key()))
    }

    @Test
    fun identicalRuntimeRefreshKeepsExistingActionViews() {
        val current = key(step = AuroraOnboardingStep.WAKE_RUNTIME, primaryLabel = "Verificar wake word")
        assertFalse(AuroraActionRefreshPolicy.shouldRebuild(current, current.copy()))
    }

    @Test
    fun semanticActionChangesRequireRebuild() {
        val current = key()
        assertTrue(
            AuroraActionRefreshPolicy.shouldRebuild(
                current,
                current.copy(step = AuroraOnboardingStep.MICROPHONE, microphoneGranted = false),
            ),
        )
        assertTrue(
            AuroraActionRefreshPolicy.shouldRebuild(
                current,
                current.copy(developerModeEnabled = true, showLocalRuntime = true),
            ),
        )
        assertTrue(
            AuroraActionRefreshPolicy.shouldRebuild(
                current,
                current.copy(primaryLabel = "Continuar configuração"),
            ),
        )
    }
}
