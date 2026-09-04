package ai.aurora.device.deployment

enum class DedicatedDeviceProfileDisposition {
    STANDARD_APP_ONLY,
    PRIVILEGED_IMPLEMENTATION_REVIEW_REQUIRED,
}

enum class DedicatedDeviceProfileReason {
    NO_CANONICAL_PRIVILEGED_REQUIREMENT,
    PRIVILEGED_CONTROL_NOT_REQUIRED,
    INCOMPLETE_DEPLOYMENT_JUSTIFICATION,
    EXPLICIT_PRIVILEGED_REQUIREMENT_REQUIRES_REVIEW,
}

data class DedicatedDeviceDeploymentEvidence(
    val deploymentProfileReference: String?,
    val requirementReference: String?,
    val recoveryRunbookReference: String?,
    val provisioningOwnerReference: String?,
    val requiresDeviceOwnerControls: Boolean,
    val requiresLauncherReplacement: Boolean,
)

data class DedicatedDeviceProfileAssessment(
    val disposition: DedicatedDeviceProfileDisposition,
    val reason: DedicatedDeviceProfileReason,
    val standardAppRemainsRequired: Boolean,
    val privilegedProfileImplemented: Boolean,
    val deviceOwnerEnabled: Boolean,
    val launcherReplacementEnabled: Boolean,
    val authorizesExecution: Boolean,
    val canBypassAuroraAuthority: Boolean,
)

/**
 * W15-I deployment boundary.
 *
 * This policy does not provision Device Owner or replace the Android launcher. It only decides whether
 * canonical deployment evidence is sufficient to justify a separate privileged implementation review.
 * Standard-app operation remains mandatory in every disposition, and deployment privilege never grants
 * Aurora action authority.
 */
object DedicatedDeviceProfilePolicy {
    fun assess(evidence: DedicatedDeviceDeploymentEvidence?): DedicatedDeviceProfileAssessment {
        if (evidence == null) {
            return standardAppOnly(DedicatedDeviceProfileReason.NO_CANONICAL_PRIVILEGED_REQUIREMENT)
        }

        val privilegedControlRequested =
            evidence.requiresDeviceOwnerControls || evidence.requiresLauncherReplacement
        if (!privilegedControlRequested) {
            return standardAppOnly(DedicatedDeviceProfileReason.PRIVILEGED_CONTROL_NOT_REQUIRED)
        }

        if (!evidence.hasCompleteJustification()) {
            return standardAppOnly(DedicatedDeviceProfileReason.INCOMPLETE_DEPLOYMENT_JUSTIFICATION)
        }

        return DedicatedDeviceProfileAssessment(
            disposition = DedicatedDeviceProfileDisposition.PRIVILEGED_IMPLEMENTATION_REVIEW_REQUIRED,
            reason = DedicatedDeviceProfileReason.EXPLICIT_PRIVILEGED_REQUIREMENT_REQUIRES_REVIEW,
            standardAppRemainsRequired = true,
            privilegedProfileImplemented = false,
            deviceOwnerEnabled = false,
            launcherReplacementEnabled = false,
            authorizesExecution = false,
            canBypassAuroraAuthority = false,
        )
    }

    private fun DedicatedDeviceDeploymentEvidence.hasCompleteJustification(): Boolean =
        deploymentProfileReference.isNonBlank() &&
            requirementReference.isNonBlank() &&
            recoveryRunbookReference.isNonBlank() &&
            provisioningOwnerReference.isNonBlank()

    private fun String?.isNonBlank(): Boolean = !isNullOrBlank()

    private fun standardAppOnly(reason: DedicatedDeviceProfileReason) =
        DedicatedDeviceProfileAssessment(
            disposition = DedicatedDeviceProfileDisposition.STANDARD_APP_ONLY,
            reason = reason,
            standardAppRemainsRequired = true,
            privilegedProfileImplemented = false,
            deviceOwnerEnabled = false,
            launcherReplacementEnabled = false,
            authorizesExecution = false,
            canBypassAuroraAuthority = false,
        )
}
