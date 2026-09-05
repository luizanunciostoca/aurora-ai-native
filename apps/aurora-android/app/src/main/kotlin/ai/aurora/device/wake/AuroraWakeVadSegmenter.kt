package ai.aurora.device.wake

import kotlin.math.sqrt

/**
 * Bounded in-memory VAD/ring buffer. Raw PCM exists only while evaluating one local candidate and
 * is discarded immediately after completion/reset; callers must never persist it by default.
 */
class AuroraWakeVadSegmenter(
    private val sampleRateHz: Int = 16_000,
    private val frameSamples: Int = 320,
    private val activationRms: Double = 0.018,
    private val minSpeechMs: Int = 300,
    private val maxSpeechMs: Int = 1_800,
    private val trailingSilenceMs: Int = 180,
    private val preRollMs: Int = 120,
) {
    private val activeSamples = ArrayList<Short>()
    private val preRollFrames = ArrayDeque<ShortArray>()
    private val preRollFrameLimit = ((preRollMs * sampleRateHz) / 1_000 / frameSamples).coerceAtLeast(1)
    private val trailingFrameLimit = ((trailingSilenceMs * sampleRateHz) / 1_000 / frameSamples).coerceAtLeast(1)
    private val minSpeechSamples = minSpeechMs * sampleRateHz / 1_000
    private val maxSpeechSamples = maxSpeechMs * sampleRateHz / 1_000
    private var speechStarted = false
    private var trailingFrames = 0
    private var voicedSamples = 0

    init {
        require(sampleRateHz == 16_000) { "wake capture is bound to 16 kHz" }
        require(frameSamples in 160..1_600)
        require(activationRms in 0.001..0.25)
        require(minSpeechMs in 100..1_000)
        require(maxSpeechMs in minSpeechMs..3_000)
        require(trailingSilenceMs in 60..600)
        require(preRollMs in 40..400)
    }

    fun accept(frame: ShortArray): ShortArray? {
        require(frame.size == frameSamples) { "unexpected wake frame size ${frame.size}" }
        val voiced = rms(frame) >= activationRms

        if (!speechStarted) {
            if (!voiced) {
                rememberPreRoll(frame)
                return null
            }
            speechStarted = true
            preRollFrames.forEach { buffered -> buffered.forEach(activeSamples::add) }
            preRollFrames.clear()
        }

        frame.forEach(activeSamples::add)
        if (voiced) {
            voicedSamples += frame.size
            trailingFrames = 0
        } else {
            trailingFrames++
        }

        val reachedMax = activeSamples.size >= maxSpeechSamples
        val endedBySilence = trailingFrames >= trailingFrameLimit
        if (!reachedMax && !endedBySilence) return null

        val result = if (voicedSamples >= minSpeechSamples) {
            activeSamples.take(maxSpeechSamples).toShortArray()
        } else {
            null
        }
        clear()
        return result
    }

    fun clear() {
        activeSamples.clear()
        preRollFrames.clear()
        speechStarted = false
        trailingFrames = 0
        voicedSamples = 0
    }

    fun bufferedSampleCount(): Int = activeSamples.size + preRollFrames.sumOf { it.size }

    private fun rememberPreRoll(frame: ShortArray) {
        preRollFrames.addLast(frame.copyOf())
        while (preRollFrames.size > preRollFrameLimit) preRollFrames.removeFirst()
    }

    private fun rms(frame: ShortArray): Double = sqrt(
        frame.sumOf { sample ->
            val normalized = sample.toDouble() / Short.MAX_VALUE.toDouble()
            normalized * normalized
        } / frame.size.toDouble(),
    )
}
