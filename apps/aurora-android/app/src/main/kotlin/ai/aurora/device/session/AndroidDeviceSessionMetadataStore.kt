package ai.aurora.device.session

import android.content.Context

class AndroidDeviceSessionMetadataStore(context: Context) : DeviceSessionMetadataStore {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    override fun load(): LocalDeviceSessionState {
        val key = loadKeyMetadata()
        val registration = loadRegistrationMetadata()
        val session = loadSessionMetadata(key, registration)
        return LocalDeviceSessionState(
            key = key,
            registration = registration,
            session = session,
        )
    }

    override fun save(state: LocalDeviceSessionState) {
        val editor = preferences.edit().clear()
        state.key?.let { key ->
            editor
                .putString(KEY_ALIAS, key.alias)
                .putLong(KEY_GENERATION, key.generation)
            key.boundRegistrationVersion?.let { version ->
                editor.putInt(KEY_BOUND_REGISTRATION_VERSION, version)
            }
        }
        state.registration?.let { registration ->
            editor
                .putString(KEY_DEVICE_ID, registration.deviceId)
                .putString(KEY_TENANT_ID, registration.tenantId)
                .putInt(KEY_REGISTRATION_VERSION, registration.registrationVersion)
                .putString(KEY_DEVICE_STATE, registration.state.name)
        }
        state.session?.let { session ->
            editor
                .putString(KEY_DEVICE_SESSION_ID, session.deviceSessionId)
                .putString(KEY_CONNECTION_ID, session.connectionId)
                .putLong(KEY_GATEWAY_AUTH_EXPIRES_AT_MS, session.gatewayAuthExpiresAtMs)
                .putLong(KEY_LAST_EVALUATED_AT_MS, session.lastEvaluatedAtMs)
        }
        check(editor.commit()) { "failed to persist device session metadata" }
    }

    override fun clear() {
        check(preferences.edit().clear().commit()) { "failed to clear device session metadata" }
    }

    private fun loadKeyMetadata(): LocalDeviceKeyMetadata? {
        val alias = preferences.getString(KEY_ALIAS, null) ?: return null
        val generation = preferences.getLong(KEY_GENERATION, 0)
        val boundVersion = if (preferences.contains(KEY_BOUND_REGISTRATION_VERSION)) {
            preferences.getInt(KEY_BOUND_REGISTRATION_VERSION, 0)
        } else {
            null
        }
        return runCatching {
            LocalDeviceKeyMetadata(
                alias = alias,
                generation = generation,
                boundRegistrationVersion = boundVersion,
            )
        }.getOrNull()
    }

    private fun loadRegistrationMetadata(): LocalDeviceRegistrationMetadata? {
        val deviceId = preferences.getString(KEY_DEVICE_ID, null) ?: return null
        val tenantId = preferences.getString(KEY_TENANT_ID, null) ?: return null
        val version = preferences.getInt(KEY_REGISTRATION_VERSION, 0)
        val state = preferences.getString(KEY_DEVICE_STATE, null) ?: return null
        return runCatching {
            LocalDeviceRegistrationMetadata(
                deviceId = deviceId,
                tenantId = tenantId,
                registrationVersion = version,
                state = W14DeviceLifecycleState.valueOf(state),
            )
        }.getOrNull()
    }

    private fun loadSessionMetadata(
        key: LocalDeviceKeyMetadata?,
        registration: LocalDeviceRegistrationMetadata?,
    ): LocalDeviceSessionMetadata? {
        if (key == null || registration == null) return null
        val deviceSessionId = preferences.getString(KEY_DEVICE_SESSION_ID, null) ?: return null
        val connectionId = preferences.getString(KEY_CONNECTION_ID, null) ?: return null
        val expiresAtMs = preferences.getLong(KEY_GATEWAY_AUTH_EXPIRES_AT_MS, 0)
        val evaluatedAtMs = preferences.getLong(KEY_LAST_EVALUATED_AT_MS, -1)
        return runCatching {
            LocalDeviceSessionMetadata(
                deviceSessionId = deviceSessionId,
                connectionId = connectionId,
                gatewayAuthExpiresAtMs = expiresAtMs,
                lastEvaluatedAtMs = evaluatedAtMs,
            )
        }.getOrNull()
    }

    private companion object {
        const val PREFERENCES_NAME = "aurora_device_session_metadata"
        const val KEY_ALIAS = "key_alias"
        const val KEY_GENERATION = "key_generation"
        const val KEY_BOUND_REGISTRATION_VERSION = "key_bound_registration_version"
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_TENANT_ID = "tenant_id"
        const val KEY_REGISTRATION_VERSION = "registration_version"
        const val KEY_DEVICE_STATE = "device_state"
        const val KEY_DEVICE_SESSION_ID = "device_session_id"
        const val KEY_CONNECTION_ID = "connection_id"
        const val KEY_GATEWAY_AUTH_EXPIRES_AT_MS = "gateway_auth_expires_at_ms"
        const val KEY_LAST_EVALUATED_AT_MS = "last_evaluated_at_ms"
    }
}
