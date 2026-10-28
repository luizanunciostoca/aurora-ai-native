package ai.aurora.device.voice

/**
 * Transport recovery is eligible only when a previously valid process-local projection is missing
 * or has expired. Structural/tenant/protocol/catalog defects must remain fail-closed.
 */
internal fun shouldRecoverGovernedVoiceCatalog(catalog: GovernedVoiceCatalogResult): Boolean =
    catalog is GovernedVoiceCatalogResult.Rejected &&
        catalog.reason in
            setOf(
                GovernedVoiceCatalogRejection.PROJECTION_UNAVAILABLE,
                GovernedVoiceCatalogRejection.REGISTRY_NOT_CURRENT,
                GovernedVoiceCatalogRejection.VOCABULARY_NOT_CURRENT,
            )
