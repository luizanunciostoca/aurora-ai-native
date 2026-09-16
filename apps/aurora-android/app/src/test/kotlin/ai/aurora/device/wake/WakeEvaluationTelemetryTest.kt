package ai.aurora.device.wake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeEvaluationTelemetryTest {
    @Test
    fun `evaluation telemetry is bounded and never grants authority`() {
        val telemetry =
            WakeEvaluationTelemetry(
                id = "wake-physical-1",
                observedAtMs = 1_700_000_000_000L,
                latencyMs = 640L,
                confidence = 0.91,
                result = WakeEvaluationResult.CONFIRMED,
            )

        assertEquals(640L, telemetry.latencyMs)
        assertFalse(telemetry.authorizesExecution)
        assertFalse(telemetry.provesExecutionSuccess)
        assertFalse(telemetry.retryAuthorized)
        assertTrue(
            runCatching {
                telemetry.copy(authorizesExecution = true)
            }.isFailure,
        )
    }
}
