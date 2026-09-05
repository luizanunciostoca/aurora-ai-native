package ai.aurora.ui

import ai.aurora.device.session.LocalDeviceKeyMetadata
import ai.aurora.device.session.LocalDeviceRegistrationMetadata
import ai.aurora.device.session.LocalDeviceSessionMetadata
import ai.aurora.device.session.LocalDeviceSessionState
import ai.aurora.device.session.W14DeviceLifecycleState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceTrustDiagnosticsTest {
    @Test
    fun `sanitized projection excludes canonical identifiers and authority`() {
        val state = LocalDeviceSessionState(
            key = LocalDeviceKeyMetadata(
                alias = "secret-keystore-alias",
                generation = 3,
                boundRegistrationVersion = 7,
            ),
            registration = LocalDeviceRegistrationMetadata(
                deviceId = "dvc_01SECRETDEVICE",
                tenantId = "tenant-secret",
                registrationVersion = 7,
                state = W14DeviceLifecycleState.ACTIVE,
            ),
            session = LocalDeviceSessionMetadata(
                deviceSessionId = "session-secret",
                connectionId = "connection-secret",
                gatewayAuthExpiresAtMs = 130_000,
                lastEvaluatedAtMs = 100_000,
            ),
        )

        val result = DeviceTrustDiagnostics.sanitize(state, nowMs = 100_000)
        val rendered = result.toString()

        assertEquals("PRESENT", result.keyState)
        assertEquals(3L, result.keyGeneration)
        assertEquals(7, result.boundRegistrationVersion)
        assertEquals("ACTIVE", result.registrationState)
        assertEquals(7, result.registrationVersion)
        assertEquals("PRESENT_METADATA", result.sessionState)
        assertEquals(30L, result.sessionRemainingSeconds)
        assertFalse(result.authorizesExecution)
        assertFalse(rendered.contains("secret-keystore-alias"))
        assertFalse(rendered.contains("dvc_01SECRETDEVICE"))
        assertFalse(rendered.contains("tenant-secret"))
        assertFalse(rendered.contains("session-secret"))
        assertFalse(rendered.contains("connection-secret"))
    }

    @Test
    fun `missing metadata remains explicit and non-authoritative`() {
        val result = DeviceTrustDiagnostics.sanitize(LocalDeviceSessionState(), nowMs = 10)

        assertEquals("ABSENT", result.keyState)
        assertNull(result.keyGeneration)
        assertNull(result.boundRegistrationVersion)
        assertEquals("NONE", result.registrationState)
        assertNull(result.registrationVersion)
        assertEquals("NONE", result.sessionState)
        assertNull(result.sessionRemainingSeconds)
        assertFalse(result.authorizesExecution)
    }

    @Test
    fun `expired session is presentation state only`() {
        val state = LocalDeviceSessionState(
            key = LocalDeviceKeyMetadata("alias", 1, 1),
            registration = LocalDeviceRegistrationMetadata(
                deviceId = "dvc_test",
                tenantId = "tenant-a",
                registrationVersion = 1,
                state = W14DeviceLifecycleState.ACTIVE,
            ),
            session = LocalDeviceSessionMetadata(
                deviceSessionId = "session-a",
                connectionId = "connection-a",
                gatewayAuthExpiresAtMs = 100,
                lastEvaluatedAtMs = 50,
            ),
        )

        val result = DeviceTrustDiagnostics.sanitize(state, nowMs = 100)

        assertEquals("EXPIRED_METADATA", result.sessionState)
        assertEquals(0L, result.sessionRemainingSeconds)
        assertTrue(result.registrationState == "ACTIVE")
        assertFalse(result.authorizesExecution)
    }
}
