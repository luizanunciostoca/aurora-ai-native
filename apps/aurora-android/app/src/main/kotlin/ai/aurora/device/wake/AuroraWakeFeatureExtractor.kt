package ai.aurora.device.wake

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Small deterministic feature extractor for local enrollment matching.
 * It never persists PCM and emits a fixed 24-dimensional vector (12 energy + 12 zero-crossing bins).
 */
object AuroraWakeFeatureExtractor {
    private const val BINS = 12

    fun extract(samples: ShortArray): WakeFeatureVector {
        require(samples.size >= 1_600) { "wake sample must contain at least 100 ms at 16 kHz" }
        require(samples.size <= 48_000) { "wake sample must be bounded to at most 3 seconds" }

        val rms = sqrt(samples.sumOf { sample ->
            val normalized = sample.toDouble() / Short.MAX_VALUE.toDouble()
            normalized * normalized
        } / samples.size.toDouble())
        require(rms >= 0.002) { "wake sample is effectively silent" }

        val features = ArrayList<Double>(WakeFeatureVector.DIMENSIONS)
        for (bin in 0 until BINS) {
            val start = bin * samples.size / BINS
            val end = max(start + 1, (bin + 1) * samples.size / BINS).coerceAtMost(samples.size)
            var absoluteSum = 0.0
            var crossings = 0
            var previous = samples[start]
            for (index in start until end) {
                val current = samples[index]
                absoluteSum += abs(current.toDouble() / Short.MAX_VALUE.toDouble())
                if (index > start && (current >= 0) != (previous >= 0)) crossings++
                previous = current
            }
            val count = (end - start).coerceAtLeast(1)
            features += (absoluteSum / count.toDouble()) / rms.coerceAtLeast(1e-9)
            features += crossings.toDouble() / count.toDouble()
        }
        return WakeFeatureVector(features).normalized()
    }
}
