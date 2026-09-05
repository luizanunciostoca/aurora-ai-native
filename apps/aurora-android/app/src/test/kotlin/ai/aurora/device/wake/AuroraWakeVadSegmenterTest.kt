package ai.aurora.device.wake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraWakeVadSegmenterTest {
    private val silence = ShortArray(320)
    private val voice = ShortArray(320) { index -> if (index % 2 == 0) 6_500 else -6_500 }

    @Test
    fun `bounded pre roll plus speech emits one local candidate`() {
        val segmenter = AuroraWakeVadSegmenter()
        repeat(20) { assertNull(segmenter.accept(silence)) }
        assertTrue(segmenter.bufferedSampleCount() <= 6 * 320)
        repeat(20) { assertNull(segmenter.accept(voice)) }

        var result: ShortArray? = null
        repeat(9) {
            if (result == null) result = segmenter.accept(silence)
        }
        assertNotNull(result)
        assertTrue(result!!.size <= 28_800)
        assertEquals(0, segmenter.bufferedSampleCount())
    }

    @Test
    fun `short noise burst is discarded`() {
        val segmenter = AuroraWakeVadSegmenter()
        repeat(4) { assertNull(segmenter.accept(voice)) }
        repeat(9) { assertNull(segmenter.accept(silence)) }
        assertEquals(0, segmenter.bufferedSampleCount())
    }

    @Test
    fun `privacy clear purges all in memory pcm`() {
        val segmenter = AuroraWakeVadSegmenter()
        repeat(10) { segmenter.accept(voice) }
        assertTrue(segmenter.bufferedSampleCount() > 0)
        segmenter.clear()
        assertEquals(0, segmenter.bufferedSampleCount())
    }
}
