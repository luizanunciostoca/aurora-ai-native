package ai.aurora.device.wake

import kotlin.math.PI
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraWakeFeatureExtractorTest {
    private fun tone(frequencyHz: Double, samples: Int = 12_800): ShortArray =
        ShortArray(samples) { index ->
            (sin(2.0 * PI * frequencyHz * index / 16_000.0) * 12_000.0).toInt().toShort()
        }

    @Test
    fun `extractor is fixed size normalized and deterministic`() {
        val first = AuroraWakeFeatureExtractor.extract(tone(220.0))
        val second = AuroraWakeFeatureExtractor.extract(tone(220.0))
        assertEquals(WakeFeatureVector.DIMENSIONS, first.values.size)
        assertEquals(first, second)
        val magnitude = kotlin.math.sqrt(first.values.sumOf { it * it })
        assertTrue(kotlin.math.abs(magnitude - 1.0) < 1e-9)
    }

    @Test
    fun `different temporal acoustic shape produces different feature vector`() {
        val low = AuroraWakeFeatureExtractor.extract(tone(160.0))
        val high = AuroraWakeFeatureExtractor.extract(tone(1_400.0))
        assertNotEquals(low, high)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `silent candidate is rejected`() {
        AuroraWakeFeatureExtractor.extract(ShortArray(3_200))
    }
}
