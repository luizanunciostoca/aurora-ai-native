package ai.aurora.device.voice

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GovernedVoiceTransportRecoveryPolicyTest {
    @Test
    fun `only missing or expired projections are eligible for transport recomposition`() {
        for (
            reason in
                listOf(
                    GovernedVoiceCatalogRejection.PROJECTION_UNAVAILABLE,
                    GovernedVoiceCatalogRejection.REGISTRY_NOT_CURRENT,
                    GovernedVoiceCatalogRejection.VOCABULARY_NOT_CURRENT,
                )
        ) {
            assertTrue(
                reason.name,
                shouldRecoverGovernedVoiceCatalog(GovernedVoiceCatalogResult.Rejected(reason)),
            )
        }
    }

    @Test
    fun `structural catalog defects never trigger transport recomposition`() {
        for (
            reason in
                listOf(
                    GovernedVoiceCatalogRejection.INVALID_REGISTRY_KIND,
                    GovernedVoiceCatalogRejection.DUPLICATE_CAPABILITY_ID,
                    GovernedVoiceCatalogRejection.DUPLICATE_NATIVE_OBSERVATION,
                    GovernedVoiceCatalogRejection.DUPLICATE_COMMAND_ID,
                    GovernedVoiceCatalogRejection.UNKNOWN_CAPABILITY_REFERENCE,
                )
        ) {
            assertFalse(
                reason.name,
                shouldRecoverGovernedVoiceCatalog(GovernedVoiceCatalogResult.Rejected(reason)),
            )
        }
    }
}
