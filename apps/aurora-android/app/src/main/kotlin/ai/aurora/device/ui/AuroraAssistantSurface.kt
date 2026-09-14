package ai.aurora.device.ui

import android.app.Activity
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
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

internal data class AuroraActionFocusSnapshot(
    val stableId: String,
    val keyboardFocused: Boolean,
    val accessibilityFocused: Boolean,
)

class AuroraAssistantSurface private constructor(
    private val activity: Activity,
    val root: View,
    private val orb: AuroraOrbView,
    private val eyebrowView: TextView,
    private val titleView: TextView,
    private val detailView: TextView,
    private val statusLineView: TextView,
    private val transcriptCard: LinearLayout,
    private val transcriptView: TextView,
    private val responseView: TextView,
    private val primaryActions: LinearLayout,
    private val actions: LinearLayout,
    private val diagnosticsView: TextView,
) {
    fun render(
        stage: AuroraAssistantStage,
        titleOverride: String? = null,
        detailOverride: String? = null,
    ) {
        val presentation = AuroraAssistantExperience.presentation(stage)
        orb.setStage(stage)
        // The orb is decorative. Announce the textual state once, not again through the orb.
        eyebrowView.setTextIfChanged(presentation.eyebrow)
        titleView.setTextIfChanged(titleOverride ?: presentation.title)
        detailView.setTextIfChanged(detailOverride ?: presentation.detail)
    }

    fun showConversation(
        transcript: String?,
        response: String?,
    ) {
        val cleanTranscript = transcript?.trim().orEmpty()
        val cleanResponse = response?.trim().orEmpty()
        val visible = cleanTranscript.isNotBlank() || cleanResponse.isNotBlank()
        transcriptCard.visibility = if (visible) View.VISIBLE else View.GONE
        transcriptView.visibility = if (cleanTranscript.isNotBlank()) View.VISIBLE else View.GONE
        responseView.visibility = if (cleanResponse.isNotBlank()) View.VISIBLE else View.GONE
        transcriptView.setTextIfChanged(if (cleanTranscript.isBlank()) "" else "Você  ·  $cleanTranscript")
        responseView.setTextIfChanged(if (cleanResponse.isBlank()) "" else "Aurora  ·  $cleanResponse")
    }

    fun setStatusLine(text: String) {
        statusLineView.setTextIfChanged(text)
        statusLineView.visibility = if (text.isBlank()) View.GONE else View.VISIBLE
    }

    fun setDiagnostics(text: String) {
        diagnosticsView.text = text
    }

    fun setDiagnosticsVisible(visible: Boolean) {
        diagnosticsView.visibility = if (visible) View.VISIBLE else View.GONE
    }

    fun addPrimaryAction(
        label: String,
        action: () -> Unit,
    ): Button = addPrimaryAction(label, PRIMARY_ACTION_STABLE_ID, action)

    fun addPrimaryAction(
        label: String,
        stableId: String,
        action: () -> Unit,
    ): Button = addAction(label = label, stableId = stableId, primary = true, action = action)

    fun addSecondaryAction(
        label: String,
        action: () -> Unit,
    ): Button = addSecondaryAction(label, "secondary:$label", action)

    fun addSecondaryAction(
        label: String,
        stableId: String,
        action: () -> Unit,
    ): Button = addAction(label = label, stableId = stableId, primary = false, action = action)

    internal fun captureActionFocus(): AuroraActionFocusSnapshot? {
        for (container in arrayOf(primaryActions, actions)) {
            for (index in 0 until container.childCount) {
                val button = container.getChildAt(index) as? Button ?: continue
                val keyboardFocused = button.hasFocus()
                val accessibilityFocused =
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && button.isAccessibilityFocused
                if (keyboardFocused || accessibilityFocused) {
                    val stableId = button.tag as? String ?: continue
                    return AuroraActionFocusSnapshot(
                        stableId = stableId,
                        keyboardFocused = keyboardFocused,
                        accessibilityFocused = accessibilityFocused,
                    )
                }
            }
        }
        return null
    }

    internal fun restoreActionFocus(snapshot: AuroraActionFocusSnapshot?) {
        if (snapshot == null) return
        val exact = findAction(snapshot.stableId)
        val target =
            exact
                ?: if (snapshot.stableId == PRIMARY_ACTION_STABLE_ID) {
                    primaryActions.getChildAt(0) as? Button
                } else {
                    null
                }
                ?: return

        if (snapshot.keyboardFocused) target.requestFocus()
        if (snapshot.accessibilityFocused && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            target.post {
                if (target.isAttachedToWindow && target.visibility == View.VISIBLE) {
                    target.performAccessibilityAction(
                        AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS,
                        null,
                    )
                }
            }
        }
    }

    fun clearActions() {
        primaryActions.removeAllViews()
        actions.removeAllViews()
    }

    private fun findAction(stableId: String): Button? {
        for (container in arrayOf(primaryActions, actions)) {
            for (index in 0 until container.childCount) {
                val button = container.getChildAt(index) as? Button ?: continue
                if (button.tag == stableId) return button
            }
        }
        return null
    }

    private fun addAction(
        label: String,
        stableId: String,
        primary: Boolean,
        action: () -> Unit,
    ): Button {
        val button =
            Button(activity).apply {
                text = label
                tag = stableId
                contentDescription = label
                isAllCaps = false
                textSize = 16f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                minHeight = AuroraActivityUi.dp(activity, 54)
                setPadding(
                    AuroraActivityUi.dp(activity, 20),
                    AuroraActivityUi.dp(activity, 12),
                    AuroraActivityUi.dp(activity, 20),
                    AuroraActivityUi.dp(activity, 12),
                )
                setTextColor(if (primary) Color.rgb(7, 12, 29) else Color.rgb(226, 232, 255))
                val fill = if (primary) Color.rgb(178, 240, 255) else Color.rgb(30, 38, 62)
                val states =
                    StateListDrawable().apply {
                        addState(
                            intArrayOf(android.R.attr.state_focused),
                            roundedBackground(fill, Color.WHITE, 18, strokeWidthDp = 3),
                        )
                        addState(
                            intArrayOf(),
                            roundedBackground(
                                fill,
                                if (primary) Color.TRANSPARENT else Color.rgb(105, 124, 179),
                                18,
                            ),
                        )
                    }
                background = RippleDrawable(ColorStateList.valueOf(Color.argb(65, 255, 255, 255)), states, null)
                setOnClickListener { action() }
                layoutParams =
                    LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ).apply {
                        topMargin = AuroraActivityUi.dp(activity, 10)
                    }
            }
        (if (primary) primaryActions else actions).addView(button)
        return button
    }

    private fun roundedBackground(
        fill: Int,
        stroke: Int,
        radiusDp: Int,
        strokeWidthDp: Int = 1,
    ): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(fill)
            cornerRadius = AuroraActivityUi.dp(activity, radiusDp).toFloat()
            if (stroke != Color.TRANSPARENT) {
                setStroke(AuroraActivityUi.dp(activity, strokeWidthDp), stroke)
            }
        }

    companion object {
        private const val PRIMARY_ACTION_STABLE_ID = "primary"

        fun create(activity: Activity): AuroraAssistantSurface {
            activity.window.statusBarColor = Color.rgb(5, 9, 21)
            activity.window.navigationBarColor = Color.rgb(5, 9, 21)

            val screen = AuroraActivityUi.createScrollableScreen(activity, maxContentWidthDp = 760)
            screen.root.setBackgroundColor(Color.rgb(5, 9, 21))
            val content = screen.content
            content.gravity = Gravity.CENTER_HORIZONTAL
            content.setPadding(
                0,
                AuroraActivityUi.dp(activity, 16),
                0,
                AuroraActivityUi.dp(activity, 24),
            )

            val eyebrow =
                TextView(activity).apply {
                    textSize = 12f
                    letterSpacing = 0.16f
                    setTextColor(Color.rgb(142, 168, 230))
                    gravity = Gravity.CENTER
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                }
            content.addView(
                eyebrow,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply {
                    bottomMargin = AuroraActivityUi.dp(activity, 6)
                },
            )

            val orb =
                AuroraOrbView(activity).apply {
                    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                }
            val configuration = activity.resources.configuration
            val orbSize =
                AuroraActivityUi.dp(
                    activity,
                    AuroraOrbPresentationPolicy.preferredSizeDp(
                        configuration.screenWidthDp,
                        configuration.screenHeightDp,
                        configuration.fontScale,
                    ),
                )
            content.addView(
                orb,
                LinearLayout.LayoutParams(
                    orbSize,
                    orbSize,
                ).apply {
                    gravity = Gravity.CENTER_HORIZONTAL
                    topMargin = AuroraActivityUi.dp(activity, 2)
                    bottomMargin = AuroraActivityUi.dp(activity, 4)
                },
            )

            val title =
                TextView(activity).apply {
                    textSize = 34f
                    setTextColor(Color.WHITE)
                    gravity = Gravity.CENTER
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isAccessibilityHeading = true
                }
            content.addView(
                title,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ),
            )

            val detail =
                TextView(activity).apply {
                    textSize = 17f
                    setTextColor(Color.rgb(179, 192, 226))
                    gravity = Gravity.CENTER
                    setLineSpacing(0f, 1.16f)
                    accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
                }
            content.addView(
                detail,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply {
                    topMargin = AuroraActivityUi.dp(activity, 8)
                    bottomMargin = AuroraActivityUi.dp(activity, 10)
                },
            )

            val statusLine =
                TextView(activity).apply {
                    textSize = 13f
                    setTextColor(Color.rgb(151, 176, 231))
                    gravity = Gravity.CENTER
                    setLineSpacing(0f, 1.12f)
                }
            content.addView(
                statusLine,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply {
                    bottomMargin = AuroraActivityUi.dp(activity, 16)
                },
            )

            // Keep the current action before potentially long transcripts and secondary settings.
            val primaryActions = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
            content.addView(
                primaryActions,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { bottomMargin = AuroraActivityUi.dp(activity, 16) },
            )

            val conversationCard =
                LinearLayout(activity).apply {
                    orientation = LinearLayout.VERTICAL
                    visibility = View.GONE
                    setPadding(
                        AuroraActivityUi.dp(activity, 18),
                        AuroraActivityUi.dp(activity, 14),
                        AuroraActivityUi.dp(activity, 18),
                        AuroraActivityUi.dp(activity, 14),
                    )
                    background =
                        GradientDrawable().apply {
                            shape = GradientDrawable.RECTANGLE
                            setColor(Color.argb(115, 30, 40, 74))
                            setStroke(
                                AuroraActivityUi.dp(activity, 1),
                                Color.argb(120, 111, 135, 210),
                            )
                            cornerRadius = AuroraActivityUi.dp(activity, 20).toFloat()
                        }
                }
            val transcript =
                TextView(activity).apply {
                    textSize = 16f
                    setTextColor(Color.rgb(205, 216, 247))
                    setLineSpacing(0f, 1.12f)
                    accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
                    setTextIsSelectable(true)
                }
            val response =
                TextView(activity).apply {
                    textSize = 17f
                    setTextColor(Color.WHITE)
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setLineSpacing(0f, 1.12f)
                    setPadding(0, AuroraActivityUi.dp(activity, 10), 0, 0)
                    accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
                    setTextIsSelectable(true)
                }
            conversationCard.addView(transcript)
            conversationCard.addView(response)
            content.addView(
                conversationCard,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply {
                    bottomMargin = AuroraActivityUi.dp(activity, 10)
                },
            )

            val actions =
                LinearLayout(activity).apply {
                    orientation = LinearLayout.VERTICAL
                }
            content.addView(
                actions,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply {
                    topMargin = AuroraActivityUi.dp(activity, 2)
                },
            )

            val diagnostics =
                TextView(activity).apply {
                    textSize = 12f
                    setTextColor(Color.rgb(151, 176, 231))
                    gravity = Gravity.CENTER
                    setLineSpacing(0f, 1.12f)
                    visibility = View.GONE
                }
            content.addView(
                diagnostics,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply {
                    topMargin = AuroraActivityUi.dp(activity, 20)
                },
            )

            return AuroraAssistantSurface(
                activity = activity,
                root = screen.root,
                orb = orb,
                eyebrowView = eyebrow,
                titleView = title,
                detailView = detail,
                statusLineView = statusLine,
                transcriptCard = conversationCard,
                transcriptView = transcript,
                responseView = response,
                primaryActions = primaryActions,
                actions = actions,
                diagnosticsView = diagnostics,
            ).also { it.render(AuroraAssistantStage.READY) }
        }
    }
}

private fun TextView.setTextIfChanged(value: String) {
    if (text.toString() != value) text = value
}
