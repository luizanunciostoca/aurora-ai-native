package ai.aurora.device.wake

import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraWakeTemplateModelTest {
    private fun vector(shift: Int = 0): WakeFeatureVector {
        val values = MutableList(WakeFeatureVector.DIMENSIONS) { 0.0 }
        for (index in values.indices) {
            values[index] = if ((index + shift) % 5 == 0) 1.0 else 0.15
        }
        return WakeFeatureVector(values)
    }

    @Test
    fun `matching enrolled aurora template scores high`() {
        val model = AuroraWakeTemplateModel(
            modelVersion = "prototype-template-v1",
            templates = listOf(vector(0), vector(0), vector(1)),
        )
        assertTrue(model.confidence(vector(0)) > 0.95)
    }

    @Test
    fun `different feature shape scores below exact enrollment`() {
        val model = AuroraWakeTemplateModel(
            modelVersion = "prototype-template-v1",
            templates = listOf(vector(0), vector(0), vector(0)),
        )
        val exact = model.confidence(vector(0))
        val different = model.confidence(vector(2))
        assertTrue(exact > different)
    }
}
