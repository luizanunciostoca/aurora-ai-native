package ai.aurora.device.executor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CompositeDeviceActionPortTest {
    @Test
    fun routesOnlyExactActionAndCapabilityBinding() {
        var calls = 0
        val delegate =
            DeviceActionPort { _, _ ->
                calls += 1
                DeviceActionResult.VerifiedSuccess("ok")
            }
        val port =
            CompositeDeviceActionPort(
                listOf(DeviceActionBinding("OPEN_SETTINGS", "device.settings.open", delegate)),
            )

        val result =
            port.execute(
                DeviceActionCommand("OPEN_SETTINGS"),
                context(capabilityId = "device.settings.open"),
            )

        assertTrue(result is DeviceActionResult.VerifiedSuccess)
        assertEquals(1, calls)
    }

    @Test
    fun unknownActionFailsClosedWithoutCallingDelegate() {
        var calls = 0
        val delegate = DeviceActionPort { _, _ -> calls += 1; DeviceActionResult.VerifiedSuccess() }
        val port =
            CompositeDeviceActionPort(
                listOf(DeviceActionBinding("OPEN_SETTINGS", "device.settings.open", delegate)),
            )

        val result = port.execute(DeviceActionCommand("OPEN_CAMERA"), context("device.camera.open"))

        assertTrue(result is DeviceActionResult.VerifiedFailure)
        assertEquals(0, calls)
    }

    @Test
    fun mismatchedCapabilityFailsClosedWithoutCallingDelegate() {
        var calls = 0
        val delegate = DeviceActionPort { _, _ -> calls += 1; DeviceActionResult.VerifiedSuccess() }
        val port =
            CompositeDeviceActionPort(
                listOf(DeviceActionBinding("OPEN_SETTINGS", "device.settings.open", delegate)),
            )

        val result = port.execute(DeviceActionCommand("OPEN_SETTINGS"), context("device.camera.open"))

        assertTrue(result is DeviceActionResult.VerifiedFailure)
        assertEquals(0, calls)
    }

    @Test(expected = IllegalArgumentException::class)
    fun duplicateActionIdsAreRejectedAtConstruction() {
        val delegate = DeviceActionPort { _, _ -> DeviceActionResult.VerifiedSuccess() }
        CompositeDeviceActionPort(
            listOf(
                DeviceActionBinding("OPEN_SETTINGS", "device.settings.open", delegate),
                DeviceActionBinding("OPEN_SETTINGS", "device.settings.open", delegate),
            ),
        )
    }

    private fun context(capabilityId: String) =
        DeviceActionContext(
            executionId = "exec-1",
            tenantId = "tenant-1",
            deviceId = "device-1",
            capabilityId = capabilityId,
            app = null,
            deadlineAtMs = 10_000L,
        )
}
