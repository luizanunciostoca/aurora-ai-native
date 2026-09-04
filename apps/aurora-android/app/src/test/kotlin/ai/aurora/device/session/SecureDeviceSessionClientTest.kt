package ai.aurora.device.session

import ai.aurora.device.security.DeviceSigningKeyStore
import ai.aurora.device.security.PublicDeviceKeyMaterial
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SecureDeviceSessionClientTest {
    @Test
    fun `active W14 registration and trust session can use non-exportable signing handle`() {
        val store = MemoryMetadataStore()
        val keys = FakeSigningKeyStore()
        val client = SecureDeviceSessionClient(store, keys)

        val material = client.prepareRegistrationKey()
        assertFalse(material.authorizesExecution)
        assertTrue(client.acceptRegistration(registration()).isSuccess())
        assertTrue(client.acceptSession(session(), nowMs = 200).isSuccess())
        assertEquals(DeviceSessionAvailability.ACTIVE, client.sessionAvailability(300))

        val payload = "challenge".encodeToByteArray()
        val signed = client.signSessionChallenge(payload, nowMs = 300) as DeviceSessionClientResult.Success
        assertArrayEquals(payload.reversedArray(), signed.value)
        assertEquals(1, keys.signCount)
    }

    @Test
    fun `wrong tenant stale version and mismatched session binding fail closed`() {
        val store = MemoryMetadataStore()
        val keys = FakeSigningKeyStore()
        val client = SecureDeviceSessionClient(store, keys)
        client.prepareRegistrationKey()
        assertTrue(client.acceptRegistration(registration(version = 2)).isSuccess())

        assertRejected(
            DeviceSessionClientError.TENANT_MISMATCH,
            client.acceptRegistration(registration(tenantId = "tenant-2", version = 3)),
        )
        assertRejected(
            DeviceSessionClientError.STALE_REGISTRATION,
            client.acceptRegistration(registration(version = 1)),
        )
        assertRejected(
            DeviceSessionClientError.SESSION_BINDING_MISMATCH,
            client.acceptSession(session(version = 3), nowMs = 200),
        )
    }

    @Test
    fun `expired and revoked sessions are removed locally`() {
        val store = MemoryMetadataStore()
        val client = SecureDeviceSessionClient(store, FakeSigningKeyStore())
        client.prepareRegistrationKey()
        client.acceptRegistration(registration())

        assertRejected(
            DeviceSessionClientError.SESSION_EXPIRED,
            client.acceptSession(session(expiresAtMs = 250), nowMs = 250),
        )
        assertNull(store.state.session)

        client.acceptSession(session(deviceSessionId = "session-2", expiresAtMs = 1_000), nowMs = 300)
        val revokedSnapshot = session(
            deviceSessionId = "session-2",
            expiresAtMs = 1_000,
            trustState = W14DeviceSessionTrustState.REVOKED,
        )
        assertRejected(
            DeviceSessionClientError.SESSION_REVOKED,
            client.acceptSession(revokedSnapshot, nowMs = 350),
        )
        assertNull(store.state.session)

        client.acceptSession(session(deviceSessionId = "session-3", expiresAtMs = 1_000), nowMs = 400)
        assertTrue(client.revokeSession("session-3"))
        assertNull(store.state.session)
        assertFalse(client.revokeSession("session-3"))
    }

    @Test
    fun `key rotation invalidates session until fresher W14 registration arrives`() {
        val store = MemoryMetadataStore()
        val keys = FakeSigningKeyStore()
        val client = SecureDeviceSessionClient(store, keys)
        client.prepareRegistrationKey()
        client.acceptRegistration(registration(version = 4))
        client.acceptSession(session(version = 4), nowMs = 200)

        assertTrue(client.rotateRegistrationKey().isSuccess())
        assertNull(store.state.session)
        assertNull(store.state.key?.boundRegistrationVersion)
        assertRejected(
            DeviceSessionClientError.KEY_ROTATION_REQUIRES_REREGISTRATION,
            client.acceptRegistration(registration(version = 4)),
        )
        assertRejected(
            DeviceSessionClientError.KEY_ROTATION_REQUIRES_REREGISTRATION,
            client.acceptSession(session(version = 4), nowMs = 300),
        )

        assertTrue(client.acceptRegistration(registration(version = 5)).isSuccess())
        assertTrue(client.acceptSession(session(version = 5), nowMs = 300).isSuccess())
    }

    @Test
    fun `compromised device deletes key and prevents session reuse`() {
        val store = MemoryMetadataStore()
        val keys = FakeSigningKeyStore()
        val client = SecureDeviceSessionClient(store, keys)
        client.prepareRegistrationKey()
        client.acceptRegistration(registration(version = 1))
        client.acceptSession(session(version = 1), nowMs = 200)

        assertTrue(
            client.acceptRegistration(
                registration(version = 2, state = W14DeviceLifecycleState.COMPROMISED),
            ).isSuccess(),
        )
        assertFalse(keys.present)
        assertNull(store.state.key)
        assertNull(store.state.session)
        assertEquals(DeviceSessionAvailability.BLOCKED, client.sessionAvailability(300))
    }

    @Test
    fun `missing keystore key and reinstall reset require fresh registration`() {
        val store = MemoryMetadataStore()
        val keys = FakeSigningKeyStore()
        val client = SecureDeviceSessionClient(store, keys)
        client.prepareRegistrationKey()
        client.acceptRegistration(registration())
        client.acceptSession(session(), nowMs = 200)

        keys.present = false
        assertEquals(DeviceSessionAvailability.BLOCKED, client.sessionAvailability(300))
        assertNull(store.state.session)

        client.resetForReinstallOrDataClear()
        assertEquals(LocalDeviceSessionState(), store.state)
        val material = client.prepareRegistrationKey()
        assertFalse(material.authorizesExecution)
        assertNull(store.state.registration)
    }

    @Test
    fun `future trust observation and unsatisfied precondition are rejected`() {
        val store = MemoryMetadataStore()
        val client = SecureDeviceSessionClient(store, FakeSigningKeyStore())
        client.prepareRegistrationKey()
        client.acceptRegistration(registration())

        assertRejected(
            DeviceSessionClientError.SESSION_PRECONDITION_UNSATISFIED,
            client.acceptSession(session(lastEvaluatedAtMs = 500), nowMs = 400),
        )
        assertRejected(
            DeviceSessionClientError.SESSION_PRECONDITION_UNSATISFIED,
            client.acceptSession(session(preconditionSatisfied = false), nowMs = 400),
        )
    }

    private fun registration(
        deviceId: String = "device-1",
        tenantId: String = "tenant-1",
        version: Int = 1,
        state: W14DeviceLifecycleState = W14DeviceLifecycleState.ACTIVE,
    ): W14DeviceRegistrationView =
        W14DeviceRegistrationView(
            ref = W14DeviceRefView(
                kind = W14_DEVICE_KIND,
                deviceId = deviceId,
                tenantId = tenantId,
                registrationVersion = version,
            ),
            state = state,
        )

    private fun session(
        deviceSessionId: String = "session-1",
        tenantId: String = "tenant-1",
        version: Int = 1,
        expiresAtMs: Long = 1_000,
        lastEvaluatedAtMs: Long = 100,
        preconditionSatisfied: Boolean = true,
        trustState: W14DeviceSessionTrustState = W14DeviceSessionTrustState.ACTIVE,
    ): W14DeviceSessionTrustView =
        W14DeviceSessionTrustView(
            deviceSessionId = deviceSessionId,
            connectionId = "connection-1",
            tenantId = tenantId,
            deviceRef = W14DeviceRefView(
                kind = W14_DEVICE_KIND,
                deviceId = "device-1",
                tenantId = tenantId,
                registrationVersion = version,
            ),
            state = trustState,
            lastEvaluatedAtMs = lastEvaluatedAtMs,
            gatewayAuthExpiresAtMs = expiresAtMs,
            executionPreconditionSatisfied = preconditionSatisfied,
        )

    private fun assertRejected(
        expected: DeviceSessionClientError,
        actual: DeviceSessionClientResult<*>,
    ) {
        actual as DeviceSessionClientResult.Rejected
        assertEquals(expected, actual.error)
    }

    private fun DeviceSessionClientResult<*>.isSuccess(): Boolean =
        this is DeviceSessionClientResult.Success

    private class MemoryMetadataStore : DeviceSessionMetadataStore {
        var state = LocalDeviceSessionState()

        override fun load(): LocalDeviceSessionState = state

        override fun save(state: LocalDeviceSessionState) {
            this.state = state
        }

        override fun clear() {
            state = LocalDeviceSessionState()
        }
    }

    private class FakeSigningKeyStore : DeviceSigningKeyStore {
        var present = false
        var revision = 0
        var signCount = 0

        override fun ensureKey(alias: String): PublicDeviceKeyMaterial {
            if (!present) {
                present = true
                revision += 1
            }
            return material(alias)
        }

        override fun rotateKey(alias: String): PublicDeviceKeyMaterial {
            present = true
            revision += 1
            return material(alias)
        }

        override fun sign(alias: String, payload: ByteArray): ByteArray {
            check(present)
            signCount += 1
            return payload.reversedArray()
        }

        override fun contains(alias: String): Boolean = present

        override fun delete(alias: String) {
            present = false
        }

        private fun material(alias: String): PublicDeviceKeyMaterial =
            PublicDeviceKeyMaterial(
                alias = alias,
                algorithm = "EC",
                publicKeySpkiBase64Url = "public-$revision",
                fingerprintSha256 = "fingerprint-$revision",
            )
    }
}
