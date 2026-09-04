package ai.aurora.device.deployment

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DedicatedDeviceProfilePolicyTest {
    @Test
    fun noCanonicalRequirementKeepsStandardAppOnly() {
        val result = DedicatedDeviceProfilePolicy.assess(null)

        assertEquals(DedicatedDeviceProfileDisposition.STANDARD_APP_ONLY, result.disposition)
        assertEquals(
            DedicatedDeviceProfileReason.NO_CANONICAL_PRIVILEGED_REQUIREMENT,
            result.reason,
        )
        assertSafeNonAuthorityBoundary(result)
    }

    @Test
    fun ordinaryDeploymentDoesNotEscalateToPrivilegedProfile() {
        val result =
            DedicatedDeviceProfilePolicy.assess(
                DedicatedDeviceDeploymentEvidence(
                    deploymentProfileReference = "deployment:standard-tablet",
                    requirementReference = "requirement:standard-app",
                    recoveryRunbookReference = "runbook:app-reinstall",
                    provisioningOwnerReference = "owner:device-ops",
                    requiresDeviceOwnerControls = false,
                    requiresLauncherReplacement = false,
                ),
            )

        assertEquals(DedicatedDeviceProfileDisposition.STANDARD_APP_ONLY, result.disposition)
        assertEquals(DedicatedDeviceProfileReason.PRIVILEGED_CONTROL_NOT_REQUIRED, result.reason)
        assertSafeNonAuthorityBoundary(result)
    }

    @Test
    fun incompletePrivilegedRequestFailsClosed() {
        val result =
            DedicatedDeviceProfilePolicy.assess(
                DedicatedDeviceDeploymentEvidence(
                    deploymentProfileReference = "deployment:kiosk",
                    requirementReference = "requirement:kiosk-mode",
                    recoveryRunbookReference = " ",
                    provisioningOwnerReference = "owner:device-ops",
                    requiresDeviceOwnerControls = true,
                    requiresLauncherReplacement = false,
                ),
            )

        assertEquals(DedicatedDeviceProfileDisposition.STANDARD_APP_ONLY, result.disposition)
        assertEquals(
            DedicatedDeviceProfileReason.INCOMPLETE_DEPLOYMENT_JUSTIFICATION,
            result.reason,
        )
        assertSafeNonAuthorityBoundary(result)
    }

    @Test
    fun completePrivilegedEvidenceRequiresSeparateImplementationReview() {
        val result =
            DedicatedDeviceProfilePolicy.assess(
                DedicatedDeviceDeploymentEvidence(
                    deploymentProfileReference = "deployment:kiosk",
                    requirementReference = "requirement:kiosk-mode",
                    recoveryRunbookReference = "runbook:unprovision-kiosk",
                    provisioningOwnerReference = "owner:device-ops",
                    requiresDeviceOwnerControls = true,
                    requiresLauncherReplacement = true,
                ),
            )

        assertEquals(
            DedicatedDeviceProfileDisposition.PRIVILEGED_IMPLEMENTATION_REVIEW_REQUIRED,
            result.disposition,
        )
        assertEquals(
            DedicatedDeviceProfileReason.EXPLICIT_PRIVILEGED_REQUIREMENT_REQUIRES_REVIEW,
            result.reason,
        )
        assertSafeNonAuthorityBoundary(result)
    }

    private fun assertSafeNonAuthorityBoundary(result: DedicatedDeviceProfileAssessment) {
        assertTrue(result.standardAppRemainsRequired)
        assertFalse(result.privilegedProfileImplemented)
        assertFalse(result.deviceOwnerEnabled)
        assertFalse(result.launcherReplacementEnabled)
        assertFalse(result.authorizesExecution)
        assertFalse(result.canBypassAuroraAuthority)
    }
}
