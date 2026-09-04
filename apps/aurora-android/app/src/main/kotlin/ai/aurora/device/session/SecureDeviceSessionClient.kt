package ai.aurora.device.session

import ai.aurora.device.security.DeviceSigningKeyStore
import ai.aurora.device.security.PublicDeviceKeyMaterial

private const val DEFAULT_DEVICE_SIGNING_ALIAS = "aurora.w15b.device-signing"

enum class DeviceSessionClientError {
    REGISTRATION_KEY_REQUIRED,
    REGISTRATION_REQUIRED,
    STALE_REGISTRATION,
    DEVICE_MISMATCH,
    TENANT_MISMATCH,
    DEVICE_NOT_ACTIVE,
    DEVICE_REVOKED,
    DEVICE_COMPROMISED,
    DEVICE_RETIRED,
    SESSION_BINDING_MISMATCH,
    SESSION_REVOKED,
    SESSION_EXPIRED,
    SESSION_PRECONDITION_UNSATISFIED,
    KEY_MISSING_REQUIRES_REGISTRATION,
    KEY_ROTATION_REQUIRES_REREGISTRATION,
}

sealed interface DeviceSessionClientResult<out T> {
    data class Success<T>(val value: T) : DeviceSessionClientResult<T>

    data class Rejected(val error: DeviceSessionClientError) : DeviceSessionClientResult<Nothing>
}

enum class DeviceSessionAvailability {
    NONE,
    ACTIVE,
    EXPIRED,
    REVOKED,
    BLOCKED,
}

class SecureDeviceSessionClient(
    private val metadataStore: DeviceSessionMetadataStore,
    private val keyStore: DeviceSigningKeyStore,
    private val keyAlias: String = DEFAULT_DEVICE_SIGNING_ALIAS,
) {
    @Synchronized
    fun prepareRegistrationKey(): PublicDeviceKeyMaterial {
        val current = metadataStore.load()
        val currentKey = current.key
        if (currentKey == null) {
            if (keyStore.contains(keyAlias)) {
                // Metadata absence with a residual key is reinstall/data-clear ambiguity.
                keyStore.delete(keyAlias)
            }
            val material = keyStore.ensureKey(keyAlias)
            metadataStore.save(
                LocalDeviceSessionState(
                    key = LocalDeviceKeyMetadata(
                        alias = keyAlias,
                        generation = 1,
                        boundRegistrationVersion = null,
                    ),
                ),
            )
            return material
        }

        if (!keyStore.contains(currentKey.alias)) {
            metadataStore.clear()
            val material = keyStore.ensureKey(keyAlias)
            metadataStore.save(
                LocalDeviceSessionState(
                    key = LocalDeviceKeyMetadata(
                        alias = keyAlias,
                        generation = currentKey.generation + 1,
                        boundRegistrationVersion = null,
                    ),
                ),
            )
            return material
        }

        return keyStore.ensureKey(currentKey.alias)
    }

    @Synchronized
    fun acceptRegistration(
        registration: W14DeviceRegistrationView,
    ): DeviceSessionClientResult<LocalDeviceSessionState> {
        val current = metadataStore.load()
        val key = current.key
            ?: return DeviceSessionClientResult.Rejected(
                DeviceSessionClientError.REGISTRATION_KEY_REQUIRED,
            )
        if (!keyStore.contains(key.alias)) {
            metadataStore.clear()
            return DeviceSessionClientResult.Rejected(
                DeviceSessionClientError.KEY_MISSING_REQUIRES_REGISTRATION,
            )
        }

        val previous = current.registration
        if (previous != null) {
            if (previous.tenantId != registration.ref.tenantId) {
                return DeviceSessionClientResult.Rejected(DeviceSessionClientError.TENANT_MISMATCH)
            }
            if (previous.deviceId != registration.ref.deviceId) {
                return DeviceSessionClientResult.Rejected(DeviceSessionClientError.DEVICE_MISMATCH)
            }
            if (registration.ref.registrationVersion < previous.registrationVersion) {
                return DeviceSessionClientResult.Rejected(DeviceSessionClientError.STALE_REGISTRATION)
            }
            if (
                key.boundRegistrationVersion == null &&
                registration.ref.registrationVersion <= previous.registrationVersion
            ) {
                return DeviceSessionClientResult.Rejected(
                    DeviceSessionClientError.KEY_ROTATION_REQUIRES_REREGISTRATION,
                )
            }
        }

        val registrationMetadata =
            LocalDeviceRegistrationMetadata(
                deviceId = registration.ref.deviceId,
                tenantId = registration.ref.tenantId,
                registrationVersion = registration.ref.registrationVersion,
                state = registration.state,
            )

        val next =
            when (registration.state) {
                W14DeviceLifecycleState.COMPROMISED,
                W14DeviceLifecycleState.RETIRED,
                -> {
                    keyStore.delete(key.alias)
                    LocalDeviceSessionState(
                        key = null,
                        registration = registrationMetadata,
                        session = null,
                    )
                }
                W14DeviceLifecycleState.REVOKED ->
                    LocalDeviceSessionState(
                        key = key.copy(boundRegistrationVersion = registration.ref.registrationVersion),
                        registration = registrationMetadata,
                        session = null,
                    )
                W14DeviceLifecycleState.REGISTERED,
                W14DeviceLifecycleState.ACTIVE,
                ->
                    LocalDeviceSessionState(
                        key = key.copy(boundRegistrationVersion = registration.ref.registrationVersion),
                        registration = registrationMetadata,
                        session = null,
                    )
            }
        metadataStore.save(next)
        return DeviceSessionClientResult.Success(next)
    }

    @Synchronized
    fun rotateRegistrationKey(): DeviceSessionClientResult<PublicDeviceKeyMaterial> {
        val current = metadataStore.load()
        val key = current.key
            ?: return DeviceSessionClientResult.Rejected(
                DeviceSessionClientError.REGISTRATION_KEY_REQUIRED,
            )
        val registration = current.registration
            ?: return DeviceSessionClientResult.Rejected(
                DeviceSessionClientError.REGISTRATION_REQUIRED,
            )
        when (registration.state) {
            W14DeviceLifecycleState.COMPROMISED ->
                return DeviceSessionClientResult.Rejected(DeviceSessionClientError.DEVICE_COMPROMISED)
            W14DeviceLifecycleState.RETIRED ->
                return DeviceSessionClientResult.Rejected(DeviceSessionClientError.DEVICE_RETIRED)
            else -> Unit
        }

        val material = keyStore.rotateKey(key.alias)
        metadataStore.save(
            current.copy(
                key = key.copy(
                    generation = key.generation + 1,
                    boundRegistrationVersion = null,
                ),
                session = null,
            ),
        )
        return DeviceSessionClientResult.Success(material)
    }

    @Synchronized
    fun acceptSession(
        session: W14DeviceSessionTrustView,
        nowMs: Long,
    ): DeviceSessionClientResult<LocalDeviceSessionState> {
        val current = metadataStore.load()
        val registration = current.registration
            ?: return DeviceSessionClientResult.Rejected(
                DeviceSessionClientError.REGISTRATION_REQUIRED,
            )
        val key = current.key
            ?: return DeviceSessionClientResult.Rejected(
                DeviceSessionClientError.KEY_MISSING_REQUIRES_REGISTRATION,
            )
        if (!keyStore.contains(key.alias)) {
            metadataStore.save(current.copy(key = null, session = null))
            return DeviceSessionClientResult.Rejected(
                DeviceSessionClientError.KEY_MISSING_REQUIRES_REGISTRATION,
            )
        }
        if (key.boundRegistrationVersion != registration.registrationVersion) {
            return DeviceSessionClientResult.Rejected(
                DeviceSessionClientError.KEY_ROTATION_REQUIRES_REREGISTRATION,
            )
        }

        when (registration.state) {
            W14DeviceLifecycleState.ACTIVE -> Unit
            W14DeviceLifecycleState.REVOKED ->
                return DeviceSessionClientResult.Rejected(DeviceSessionClientError.DEVICE_REVOKED)
            W14DeviceLifecycleState.COMPROMISED ->
                return DeviceSessionClientResult.Rejected(DeviceSessionClientError.DEVICE_COMPROMISED)
            W14DeviceLifecycleState.RETIRED ->
                return DeviceSessionClientResult.Rejected(DeviceSessionClientError.DEVICE_RETIRED)
            W14DeviceLifecycleState.REGISTERED ->
                return DeviceSessionClientResult.Rejected(DeviceSessionClientError.DEVICE_NOT_ACTIVE)
        }

        if (session.tenantId != registration.tenantId) {
            return DeviceSessionClientResult.Rejected(DeviceSessionClientError.TENANT_MISMATCH)
        }
        if (session.deviceRef.deviceId != registration.deviceId) {
            return DeviceSessionClientResult.Rejected(DeviceSessionClientError.DEVICE_MISMATCH)
        }
        if (session.deviceRef.registrationVersion != registration.registrationVersion) {
            return DeviceSessionClientResult.Rejected(DeviceSessionClientError.SESSION_BINDING_MISMATCH)
        }
        if (session.state == W14DeviceSessionTrustState.REVOKED) {
            metadataStore.save(current.copy(session = null))
            return DeviceSessionClientResult.Rejected(DeviceSessionClientError.SESSION_REVOKED)
        }
        if (!session.executionPreconditionSatisfied || session.lastEvaluatedAtMs > nowMs) {
            return DeviceSessionClientResult.Rejected(
                DeviceSessionClientError.SESSION_PRECONDITION_UNSATISFIED,
            )
        }
        if (nowMs >= session.gatewayAuthExpiresAtMs) {
            metadataStore.save(current.copy(session = null))
            return DeviceSessionClientResult.Rejected(DeviceSessionClientError.SESSION_EXPIRED)
        }

        val next =
            current.copy(
                session = LocalDeviceSessionMetadata(
                    deviceSessionId = session.deviceSessionId,
                    connectionId = session.connectionId,
                    gatewayAuthExpiresAtMs = session.gatewayAuthExpiresAtMs,
                    lastEvaluatedAtMs = session.lastEvaluatedAtMs,
                ),
            )
        metadataStore.save(next)
        return DeviceSessionClientResult.Success(next)
    }

    @Synchronized
    fun sessionAvailability(nowMs: Long): DeviceSessionAvailability {
        val current = metadataStore.load()
        val registration = current.registration ?: return DeviceSessionAvailability.NONE
        if (
            registration.state == W14DeviceLifecycleState.COMPROMISED ||
            registration.state == W14DeviceLifecycleState.RETIRED
        ) {
            return DeviceSessionAvailability.BLOCKED
        }
        if (registration.state == W14DeviceLifecycleState.REVOKED) {
            metadataStore.save(current.copy(session = null))
            return DeviceSessionAvailability.REVOKED
        }
        if (registration.state != W14DeviceLifecycleState.ACTIVE) {
            metadataStore.save(current.copy(session = null))
            return DeviceSessionAvailability.NONE
        }
        val session = current.session ?: return DeviceSessionAvailability.NONE
        if (nowMs >= session.gatewayAuthExpiresAtMs) {
            metadataStore.save(current.copy(session = null))
            return DeviceSessionAvailability.EXPIRED
        }
        val key = current.key ?: return DeviceSessionAvailability.BLOCKED
        if (!keyStore.contains(key.alias) || key.boundRegistrationVersion != registration.registrationVersion) {
            metadataStore.save(current.copy(session = null))
            return DeviceSessionAvailability.BLOCKED
        }
        return DeviceSessionAvailability.ACTIVE
    }

    @Synchronized
    fun signSessionChallenge(
        payload: ByteArray,
        nowMs: Long,
    ): DeviceSessionClientResult<ByteArray> {
        if (sessionAvailability(nowMs) != DeviceSessionAvailability.ACTIVE) {
            return DeviceSessionClientResult.Rejected(DeviceSessionClientError.SESSION_EXPIRED)
        }
        val key = metadataStore.load().key
            ?: return DeviceSessionClientResult.Rejected(
                DeviceSessionClientError.KEY_MISSING_REQUIRES_REGISTRATION,
            )
        return DeviceSessionClientResult.Success(keyStore.sign(key.alias, payload))
    }

    @Synchronized
    fun revokeSession(deviceSessionId: String): Boolean {
        val current = metadataStore.load()
        val session = current.session ?: return false
        if (session.deviceSessionId != deviceSessionId) return false
        metadataStore.save(current.copy(session = null))
        return true
    }

    @Synchronized
    fun resetForReinstallOrDataClear() {
        val key = metadataStore.load().key
        if (key != null) keyStore.delete(key.alias)
        if (key == null && keyStore.contains(keyAlias)) keyStore.delete(keyAlias)
        metadataStore.clear()
    }
}
