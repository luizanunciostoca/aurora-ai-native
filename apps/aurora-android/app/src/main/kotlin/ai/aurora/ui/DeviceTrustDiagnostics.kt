package ai.aurora.ui

import ai.aurora.device.session.LocalDeviceSessionState

/**
 * Sanitized, non-authoritative presentation of local W15-B/W14 session metadata.
 *
 * Deliberately excludes DeviceId, tenantId, deviceSessionId, connectionId, key alias and any
 * credential/key material. It describes local metadata only and can never authorize execution.
 */
data class SanitizedDeviceTrustSnapshot(
    val keyState: String,
    val keyGeneration: Long?,
    val boundRegistrationVersion: Int?,
    val registrationState: String,
    val registrationVersion: Int?,
    val sessionState: String,
    val sessionRemainingSeconds: Long?,
    val authorizesExecution: Boolean = false,
) {
    init {
        require(keyGeneration == null || keyGeneration > 0)
        require(boundRegistrationVersion == null || boundRegistrationVersion > 0)
        require(registrationVersion == null || registrationVersion > 0)
        require(sessionRemainingSeconds == null || sessionRemainingSeconds >= 0)
        require(!authorizesExecution) { "device trust diagnostics must never authorize execution" }
    }
}

object DeviceTrustDiagnostics {
    fun sanitize(
        state: LocalDeviceSessionState,
        nowMs: Long,
    ): SanitizedDeviceTrustSnapshot {
        require(nowMs >= 0)
        val key = state.key
        val registration = state.registration
        val session = state.session
        val remaining = session?.let { (it.gatewayAuthExpiresAtMs - nowMs).coerceAtLeast(0) / 1_000 }
        val sessionState = when {
            session == null -> "NONE"
            nowMs >= session.gatewayAuthExpiresAtMs -> "EXPIRED_METADATA"
            else -> "PRESENT_METADATA"
        }
        return SanitizedDeviceTrustSnapshot(
            keyState = if (key == null) "ABSENT" else "PRESENT",
            keyGeneration = key?.generation,
            boundRegistrationVersion = key?.boundRegistrationVersion,
            registrationState = registration?.state?.name ?: "NONE",
            registrationVersion = registration?.registrationVersion,
            sessionState = sessionState,
            sessionRemainingSeconds = remaining,
        )
    }
}
