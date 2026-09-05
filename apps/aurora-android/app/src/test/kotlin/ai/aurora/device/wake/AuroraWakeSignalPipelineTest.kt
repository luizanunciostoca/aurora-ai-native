package ai.aurora.device.wake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraWakeSignalPipelineTest {
    @Test
    fun `feature extractor is bounded and rejects silence`() {
        val voiced = ShortArray(1_600) { index -> if (index % 2 == 0) 4_000 else -4_000 }
        val features = AuroraWakeFeatureExtractor.extract(voiced)
        assertEquals(WakeFeatureVector.DIMENSIONS, features.values.size)
        assertTrue(features.values.all { it.isFinite() })

        val silentRejected =
            runCatching { AuroraWakeFeatureExtractor.extract(ShortArray(1_600)) }.isFailure
        assertTrue(silentRejected)
        assertTrue(
            runCatching { AuroraWakeFeatureExtractor.extract(ShortArray(48_001) { 3_000 }) }.isFailure,
        )
    }

    @Test
    fun `vad clears raw pcm after emitting a bounded candidate`() {
        val segmenter =
            AuroraWakeVadSegmenter(
                activationRms = 0.005,
                minSpeechMs = 100,
                maxSpeechMs = 400,
                trailingSilenceMs = 60,
                preRollMs = 40,
            )
        val voiced = ShortArray(320) { 8_000 }
        val silent = ShortArray(320)

        var candidate: ShortArray? = null
        repeat(6) { if (candidate == null) candidate = segmenter.accept(voiced) }
        repeat(6) { if (candidate == null) candidate = segmenter.accept(silent) }

        assertTrue(candidate != null)
        assertTrue(candidate!!.size <= 6_400)
        assertEquals(0, segmenter.bufferedSampleCount())
    }

    @Test
    fun `vad does not emit subminimum noise and reset removes buffered samples`() {
        val segmenter = AuroraWakeVadSegmenter()
        val quiet = ShortArray(320) { 50 }
        repeat(5) { assertNull(segmenter.accept(quiet)) }
        assertTrue(segmenter.bufferedSampleCount() > 0)
        segmenter.clear()
        assertEquals(0, segmenter.bufferedSampleCount())
    }

    @Test
    fun `template model confidence is local acoustic similarity only`() {
        val base = WakeFeatureVector(List(24) { index -> if (index == 0) 1.0 else 0.0 })
        val orthogonal = WakeFeatureVector(List(24) { index -> if (index == 1) 1.0 else 0.0 })
        val model = AuroraWakeTemplateModel("wake-v1", templates = listOf(base, base, base))
        assertEquals(1.0, model.confidence(base), 1e-9)
        assertEquals(0.0, model.confidence(orthogonal), 1e-9)
    }
}
