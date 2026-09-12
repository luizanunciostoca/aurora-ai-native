package ai.aurora.device.ui

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

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
        orb.contentDescription = "Aurora: ${titleOverride ?: presentation.title}"
        eyebrowView.text = presentation.eyebrow
        titleView.text = titleOverride ?: presentation.title
        detailView.text = detailOverride ?: presentation.detail
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
        transcriptView.text = if (cleanTranscript.isBlank()) "" else "Você  ·  $cleanTranscript"
        responseView.text = if (cleanResponse.isBlank()) "" else "Aurora  ·  $cleanResponse"
    }

    fun setStatusLine(text: String) {
        statusLineView.text = text
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
    ): Button = addAction(label = label, primary = true, action = action)

    fun addSecondaryAction(
        label: String,
        action: () -> Unit,
    ): Button = addAction(label = label, primary = false, action = action)

    fun clearActions() {
        actions.removeAllViews()
    }

    private fun addAction(
        label: String,
        primary: Boolean,
        action: () -> Unit,
    ): Button {
        val button =
            Button(activity).apply {
                text = label
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
                background =
                    roundedBackground(
                        fill = if (primary) Color.rgb(178, 240, 255) else Color.argb(70, 95, 112, 170),
                        stroke = if (primary) Color.TRANSPARENT else Color.argb(150, 138, 155, 215),
                        radiusDp = 18,
                    )
                setOnClickListener { action() }
                layoutParams =
                    LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ).apply {
                        topMargin = AuroraActivityUi.dp(activity, 10)
                    }
            }
        actions.addView(button)
        return button
    }

    private fun roundedBackground(
        fill: Int,
        stroke: Int,
        radiusDp: Int,
    ): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(fill)
            cornerRadius = AuroraActivityUi.dp(activity, radiusDp).toFloat()
            if (stroke != Color.TRANSPARENT) {
                setStroke(AuroraActivityUi.dp(activity, 1), stroke)
            }
        }

    companion object {
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
                    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
                    contentDescription = "Estado visual da Aurora"
                }
            content.addView(
                orb,
                LinearLayout.LayoutParams(
                    AuroraActivityUi.dp(activity, 270),
                    AuroraActivityUi.dp(activity, 270),
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
                }
            val response =
                TextView(activity).apply {
                    textSize = 17f
                    setTextColor(Color.WHITE)
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setLineSpacing(0f, 1.12f)
                    setPadding(0, AuroraActivityUi.dp(activity, 10), 0, 0)
                    accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
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
                    setTextColor(Color.rgb(111, 129, 176))
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
                actions = actions,
                diagnosticsView = diagnostics,
            ).also { it.render(AuroraAssistantStage.READY) }
        }
    }
}
