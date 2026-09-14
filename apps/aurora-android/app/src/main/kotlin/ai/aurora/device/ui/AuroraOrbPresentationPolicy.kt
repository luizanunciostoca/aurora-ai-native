package ai.aurora.device.ui

/** Local rendering choices only. The input stage and its text remain owned by the caller. */
object AuroraOrbPresentationPolicy {
    fun shouldAnimate(
        stage: AuroraAssistantStage,
        attached: Boolean,
        visible: Boolean,
        windowFocused: Boolean,
        systemAnimationsEnabled: Boolean,
        touchExplorationEnabled: Boolean,
        powerSaveEnabled: Boolean,
    ): Boolean =
        attached && visible && windowFocused && systemAnimationsEnabled &&
            !touchExplorationEnabled && !powerSaveEnabled &&
            stage in setOf(
                AuroraAssistantStage.LISTENING,
                AuroraAssistantStage.UNDERSTANDING,
                AuroraAssistantStage.ACTING,
                AuroraAssistantStage.SPEAKING,
            )

    fun preferredSizeDp(widthDp: Int, heightDp: Int, fontScale: Float): Int {
        val preferred =
            when {
                fontScale >= 1.3f -> 120
                heightDp < 600 -> 160
                else -> 240
            }
        // Leave room for the existing screen's horizontal padding, including in split screen.
        return minOf(preferred, (widthDp - 48).coerceAtLeast(1))
    }
}
