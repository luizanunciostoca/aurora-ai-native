package ai.aurora.device.session

import org.junit.Assert.assertThrows
import org.junit.Test

class W14DeviceSessionContractsTest {
    @Test
    fun `device ref accepts only canonical W14 namespace`() {
        assertThrows(IllegalArgumentException::class.java) {
            W14DeviceRefView(
                kind = "TabletId",
                deviceId = "device-1",
                tenantId = "tenant-1",
                registrationVersion = 1,
            )
        }
    }

    @Test
    fun `registration and session views cannot claim action authority`() {
        val ref = deviceRef()
        assertThrows(IllegalArgumentException::class.java) {
            W14DeviceRegistrationView(
                ref = ref,
                state = W14DeviceLifecycleState.ACTIVE,
                authorizesExecution = true,
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            W14DeviceSessionTrustView(
                deviceSessionId = "session-1",
                connectionId = "connection-1",
                tenantId = ref.tenantId,
                deviceRef = ref,
                state = W14DeviceSessionTrustState.ACTIVE,
                lastEvaluatedAtMs = 100,
                gatewayAuthExpiresAtMs = 1_000,
                executionPreconditionSatisfied = true,
                canGrantPermission = true,
            )
        }
    }

    private fun deviceRef(): W14DeviceRefView =
        W14DeviceRefView(
            kind = W14_DEVICE_KIND,
            deviceId = "device-1",
            tenantId = "tenant-1",
            registrationVersion = 1,
        )
}
