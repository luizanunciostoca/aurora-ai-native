package ai.aurora.device.ui

internal data class AuroraWindowLayout(
    val horizontalPaddingDp: Int,
    val verticalPaddingDp: Int,
    val constrainContentWidth: Boolean,
)

/**
 * Presentation-only policy for Android window geometry.
 *
 * The policy deliberately does not inspect Aurora runtime, authority, voice, execution or DP5
 * state. It only decides how much safe-space padding to reserve around scrollable native content.
 */
internal object AuroraWindowLayoutPolicy {
    fun resolve(
        widthDp: Int,
        heightDp: Int,
        fontScale: Float,
        maxContentWidthDp: Int,
    ): AuroraWindowLayout {
        require(widthDp > 0)
        require(heightDp > 0)
        require(fontScale > 0f)
        require(maxContentWidthDp in 320..1_200)

        val largeText = fontScale >= 1.5f
        val compactWidth = widthDp < 480
        val veryCompactWidth = widthDp < 360
        val shortWindow = heightDp < 600

        val horizontalPadding =
            when {
                veryCompactWidth -> 12
                compactWidth || largeText -> 16
                else -> 24
            }
        val verticalPadding = if (shortWindow || largeText) 12 else 20
        val constrainContentWidth = widthDp >= maxContentWidthDp + (horizontalPadding * 2)

        return AuroraWindowLayout(
            horizontalPaddingDp = horizontalPadding,
            verticalPaddingDp = verticalPadding,
            constrainContentWidth = constrainContentWidth,
        )
    }
}
