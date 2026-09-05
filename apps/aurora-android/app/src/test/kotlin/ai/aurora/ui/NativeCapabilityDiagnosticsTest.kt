package ai.aurora.ui

import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityObservation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class NativeCapabilityDiagnosticsTest {
    @Test
    fun `summary preserves availability classes without authority`() {
        val observations = listOf(
            observation("a", NativeCapabilityAvailability.AVAILABLE),
            observation("b", NativeCapabilityAvailability.PRECONDITION_REQUIRED),
            observation("c", NativeCapabilityAvailability.STALE_RUNTIME_STATE),
            observation("d", NativeCapabilityAvailability.UNSUPPORTED_API),
            observation("e", NativeCapabilityAvailability.UNSUPPORTED_FEATURE),
            observation("f", NativeCapabilityAvailability.UNKNOWN_CAPABILITY),
        )

        val result = NativeCapabilityDiagnostics.summarize(observations)

        assertEquals(6, result.total)
        assertEquals(1, result.available)
        assertEquals(1, result.preconditionRequired)
        assertEquals(1, result.stale)
        assertEquals(2, result.unsupported)
        assertEquals(1, result.unknown)
        assertFalse(result.authorizesExecution)
    }

    @Test
    fun `empty observation set is explicit zero state`() {
        val result = NativeCapabilityDiagnostics.summarize(emptyList())

        assertEquals(0, result.total)
        assertEquals(0, result.available)
        assertEquals(0, result.preconditionRequired)
        assertEquals(0, result.stale)
        assertEquals(0, result.unsupported)
        assertEquals(0, result.unknown)
        assertFalse(result.authorizesExecution)
    }

    private fun observation(
        id: String,
        availability: NativeCapabilityAvailability,
    ) = NativeCapabilityObservation(
        capabilityId = id,
        availability = availability,
        observedAtMs = 100,
        expiresAtMs = 200,
    )
}
