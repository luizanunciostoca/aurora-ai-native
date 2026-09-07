package ai.aurora.device.ui

import android.app.Activity
import android.content.Context
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
            gravity = Gravity.CENTER_HORIZONTAL
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
            isAllCaps = false
            textSize = 16f
            minHeight = dp(context, 48)
            setOnClickListener { action() }
            layoutParams =
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply {
                    topMargin = dp(context, 6)
                }
        }

    fun dp(
        context: Context,
        value: Int,
    ): Int = (value * context.resources.displayMetrics.density).roundToInt()

    private fun installSystemBarInsets(
        activity: Activity,
        view: View,
    ) {
        val horizontal = dp(activity, 24)
        val vertical = dp(activity, 20)
        view.setOnApplyWindowInsetsListener { target, insets ->
            val left: Int
            val top: Int
            val right: Int
            val bottom: Int
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
                run {
                    left = insets.systemWindowInsetLeft
                    top = insets.systemWindowInsetTop
                    right = insets.systemWindowInsetRight
                    bottom = insets.systemWindowInsetBottom
                }
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
