package ai.aurora.device.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class RuntimeEnvironmentConfigTest {
    @Test
    fun `local emulator origin permits explicit cleartext`() {
        val config =
            RuntimeEnvironmentConfig(
                AuroraEnvironment.LOCAL,
                "http://10.0.2.2:8080",
                allowCleartextTraffic = true,
            )

        assertEquals(AuroraEnvironment.LOCAL, config.environment)
    }

    @Test
    fun `staging and production require tls`() {
        RuntimeEnvironmentConfig(AuroraEnvironment.STAGING, "https://staging.invalid", false)
        RuntimeEnvironmentConfig(AuroraEnvironment.PRODUCTION, "https://production.invalid", false)

        assertThrows(IllegalArgumentException::class.java) {
            RuntimeEnvironmentConfig(AuroraEnvironment.PRODUCTION, "http://production.invalid", true)
        }
    }

    @Test
    fun `gateway origin rejects embedded credentials and non-local cleartext hosts`() {
        assertThrows(IllegalArgumentException::class.java) {
            RuntimeEnvironmentConfig(
                AuroraEnvironment.STAGING,
                "https://user:secret@staging.invalid",
                false,
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            RuntimeEnvironmentConfig(AuroraEnvironment.LOCAL, "http://example.com", true)
        }
    }

    @Test
    fun `gateway origin rejects opaque and hostless https uris`() {
        assertThrows(IllegalArgumentException::class.java) {
            RuntimeEnvironmentConfig(AuroraEnvironment.STAGING, "https:staging.invalid", false)
        }
        assertThrows(IllegalArgumentException::class.java) {
            RuntimeEnvironmentConfig(AuroraEnvironment.STAGING, "https:/", false)
        }
    }
}
