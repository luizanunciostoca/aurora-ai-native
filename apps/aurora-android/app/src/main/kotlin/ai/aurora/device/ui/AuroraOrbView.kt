package ai.aurora.device.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import kotlin.math.min

class AuroraOrbView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private var pulse = 0f
    private var stage: AuroraAssistantStage = AuroraAssistantStage.READY

    private val animator =
        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 2_200L
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                pulse = it.animatedValue as Float
                invalidate()
            }
        }

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        contentDescription = null
        setLayerType(LAYER_TYPE_SOFTWARE, null)
    }

    fun setStage(value: AuroraAssistantStage) {
        if (stage == value) return
        stage = value
        invalidate()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (!animator.isStarted) animator.start()
    }

    override fun onDetachedFromWindow() {
        animator.cancel()
        super.onDetachedFromWindow()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val preferred = AuroraActivityUi.dp(context, 250)
        val width = resolveSize(preferred, widthMeasureSpec)
        val height = resolveSize(preferred, heightMeasureSpec)
        setMeasuredDimension(width, height)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val cx = width / 2f
        val cy = height / 2f
        val base = min(width, height) * 0.24f
        val expansion = base * (0.08f + pulse * 0.08f)
        val outer = base + expansion
        val palette = paletteFor(stage)

        fillPaint.shader =
            RadialGradient(
                cx,
                cy,
                outer,
                intArrayOf(palette.core, palette.mid, palette.edge),
                floatArrayOf(0f, 0.52f, 1f),
                Shader.TileMode.CLAMP,
            )
        fillPaint.setShadowLayer(base * 0.34f, 0f, 0f, palette.glow)
        canvas.drawCircle(cx, cy, outer, fillPaint)
        fillPaint.clearShadowLayer()
        fillPaint.shader = null

        ringPaint.color = palette.ring
        ringPaint.strokeWidth = AuroraActivityUi.dp(context, 1).toFloat().coerceAtLeast(1f)
        ringPaint.alpha = (90 + pulse * 80).toInt().coerceIn(0, 255)
        canvas.drawCircle(cx, cy, outer + base * 0.20f, ringPaint)
        ringPaint.alpha = (35 + pulse * 45).toInt().coerceIn(0, 255)
        canvas.drawCircle(cx, cy, outer + base * 0.38f, ringPaint)
    }

    private data class OrbPalette(
        val core: Int,
        val mid: Int,
        val edge: Int,
        val glow: Int,
        val ring: Int,
    )

    private fun paletteFor(stage: AuroraAssistantStage): OrbPalette =
        when (stage) {
            AuroraAssistantStage.LISTENING -> palette(0xFFFAFBFF.toInt(), 0xFF65E4FF.toInt(), 0xFF5A4CFF.toInt())
            AuroraAssistantStage.UNDERSTANDING -> palette(0xFFFFFFFF.toInt(), 0xFFB685FF.toInt(), 0xFF5148FF.toInt())
            AuroraAssistantStage.ACTING -> palette(0xFFFFFFFF.toInt(), 0xFF82F7D5.toInt(), 0xFF177A77.toInt())
            AuroraAssistantStage.SPEAKING -> palette(0xFFFFFFFF.toInt(), 0xFFFFA9E8.toInt(), 0xFF684DFF.toInt())
            AuroraAssistantStage.COMPLETED -> palette(0xFFFFFFFF.toInt(), 0xFF8FF3C7.toInt(), 0xFF2A7A65.toInt())
            AuroraAssistantStage.BLOCKED -> palette(0xFFFFF7F1.toInt(), 0xFFFFB179.toInt(), 0xFF8B3D4C.toInt())
            AuroraAssistantStage.DEGRADED -> palette(0xFFFFFFFF.toInt(), 0xFF9EB9D8.toInt(), 0xFF3D4A75.toInt())
            AuroraAssistantStage.READY -> palette(0xFFFFFFFF.toInt(), 0xFF8BE9FF.toInt(), 0xFF6657FF.toInt())
        }

    private fun palette(core: Int, mid: Int, edge: Int): OrbPalette =
        OrbPalette(
            core = core,
            mid = mid,
            edge = edge,
            glow = mid,
            ring = Color.argb(220, Color.red(mid), Color.green(mid), Color.blue(mid)),
        )
}
