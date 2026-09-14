package ai.aurora.device.ui

import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.roundToInt

/**
 * Platform-only Android UI helpers for the current native acceptance surfaces.
 *
 * targetSdk 36 renders edge-to-edge on modern Android. These helpers intentionally hide the
 * platform ActionBar and consume only display/system-bar geometry for layout. They never inspect or
 * mutate Aurora policy, authority, session, outcome, or retry state.
 */
data class AuroraScrollableScreen(
    val root: ScrollView,
    val content: LinearLayout,
)

object AuroraActivityUi {
    private val surfaceBackground = Color.rgb(5, 9, 21)
    private val primaryText = Color.rgb(245, 248, 255)
    private val secondaryText = Color.rgb(190, 202, 234)
    private val actionText = Color.rgb(230, 236, 255)
    private val actionFill = Color.rgb(30, 38, 62)
    private val actionStroke = Color.rgb(105, 124, 179)
    private val actionDisabledFill = Color.rgb(22, 27, 43)
    private val actionDisabledText = Color.rgb(118, 128, 154)

    fun createScrollableScreen(
        activity: Activity,
        maxContentWidthDp: Int = 720,
    ): AuroraScrollableScreen {
        require(maxContentWidthDp in 320..1_200)
        activity.actionBar?.hide()

        val root =
            ScrollView(activity).apply {
                isFillViewport = true
                clipToPadding = false
                overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
                setBackgroundColor(surfaceBackground)
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
            }
        val container =
            FrameLayout(activity).apply {
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
            }
        val contentWidth =
            if (activity.resources.configuration.screenWidthDp >= maxContentWidthDp + 64) {
                dp(activity, maxContentWidthDp)
            } else {
                ViewGroup.LayoutParams.MATCH_PARENT
            }
        val content =
            LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
            }
        container.addView(
            content,
            FrameLayout.LayoutParams(
                contentWidth,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.CENTER_HORIZONTAL,
            ),
        )
        root.addView(
            container,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        installSystemBarInsets(activity, root)
        return AuroraScrollableScreen(root = root, content = content)
    }

    fun heading(
        context: Context,
        text: String,
    ): TextView =
        TextView(context).apply {
            this.text = text
            textSize = 28f
            setTextColor(primaryText)
            gravity = Gravity.CENTER_HORIZONTAL
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isAccessibilityHeading = true
            setPadding(0, 0, 0, dp(context, 12))
            layoutParams =
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                )
        }

    fun body(
        context: Context,
        text: String = "",
        centered: Boolean = false,
    ): TextView =
        TextView(context).apply {
            this.text = text
            textSize = 17f
            setTextColor(secondaryText)
            gravity = if (centered) Gravity.CENTER_HORIZONTAL else Gravity.START
            setLineSpacing(0f, 1.12f)
            setPadding(0, 0, 0, dp(context, 12))
            layoutParams =
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                )
        }

    fun actionButton(
        context: Context,
        label: String,
        action: () -> Unit,
    ): Button =
        Button(context).apply {
            text = label
            contentDescription = label
            isAllCaps = false
            textSize = 16f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            minHeight = dp(context, 54)
            setPadding(
                dp(context, 20),
                dp(context, 12),
                dp(context, 20),
                dp(context, 12),
            )
            setTextColor(
                ColorStateList(
                    arrayOf(
                        intArrayOf(-android.R.attr.state_enabled),
                        intArrayOf(),
                    ),
                    intArrayOf(actionDisabledText, actionText),
                ),
            )
            val states =
                StateListDrawable().apply {
                    addState(
                        intArrayOf(-android.R.attr.state_enabled),
                        roundedBackground(context, actionDisabledFill, Color.TRANSPARENT, 18),
                    )
                    addState(
                        intArrayOf(android.R.attr.state_focused),
                        roundedBackground(context, actionFill, Color.WHITE, 18, strokeWidthDp = 3),
                    )
                    addState(
                        intArrayOf(),
                        roundedBackground(context, actionFill, actionStroke, 18),
                    )
                }
            background =
                RippleDrawable(
                    ColorStateList.valueOf(Color.argb(65, 255, 255, 255)),
                    states,
                    null,
                )
            setOnClickListener { action() }
            layoutParams =
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply {
                    topMargin = dp(context, 8)
                }
        }

    fun dp(
        context: Context,
        value: Int,
    ): Int = (value * context.resources.displayMetrics.density).roundToInt()

    private fun roundedBackground(
        context: Context,
        fill: Int,
        stroke: Int,
        radiusDp: Int,
        strokeWidthDp: Int = 1,
    ): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(fill)
            cornerRadius = dp(context, radiusDp).toFloat()
            if (stroke != Color.TRANSPARENT) {
                setStroke(dp(context, strokeWidthDp), stroke)
            }
        }

    private fun installSystemBarInsets(
        activity: Activity,
        view: View,
    ) {
        val horizontal = dp(activity, 24)
        val vertical = dp(activity, 20)
        view.setOnApplyWindowInsetsListener { target, insets ->
            var left = 0
            var top = 0
            var right = 0
            var bottom = 0
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars =
                    insets.getInsets(
                        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
                    )
                left = bars.left
                top = bars.top
                right = bars.right
                bottom = bars.bottom
            } else {
                @Suppress("DEPRECATION")
                val legacyLeft = insets.systemWindowInsetLeft
                @Suppress("DEPRECATION")
                val legacyTop = insets.systemWindowInsetTop
                @Suppress("DEPRECATION")
                val legacyRight = insets.systemWindowInsetRight
                @Suppress("DEPRECATION")
                val legacyBottom = insets.systemWindowInsetBottom
                left = legacyLeft
                top = legacyTop
                right = legacyRight
                bottom = legacyBottom
            }
            target.setPadding(
                horizontal + left,
                vertical + top,
                horizontal + right,
                vertical + bottom,
            )
            insets
        }
        view.requestApplyInsets()
    }
}
