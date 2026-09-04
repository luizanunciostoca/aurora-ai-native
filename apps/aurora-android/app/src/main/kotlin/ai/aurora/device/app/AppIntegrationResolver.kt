package ai.aurora.device.app

/**
 * Deterministic W15-D resolver for installed-app integration.
 *
 * A Ready result proves only that a trusted package and a declared local integration route were
 * observed recently. It is not a PolicyToken, OwnerDecision, approval, W07 target, retry permit,
 * Receipt, Evidence record, or permission to execute a side effect.
 */
class AppIntegrationResolver(
    bindings: Collection<InstalledAppBinding>,
    private val runtimeProbe: InstalledAppRuntimeProbe,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private val bindingsById: Map<String, InstalledAppBinding>

    init {
        val duplicates =
            bindings
                .groupingBy { it.appId }
                .eachCount()
                .filterValues { it > 1 }
                .keys
        require(duplicates.isEmpty()) {
            "duplicate installed app bindings: ${duplicates.sorted().joinToString()}"
        }
        bindingsById = bindings.associateBy { it.appId }
    }

    fun discover(appId: String): AppIntegrationObservation =
        evaluate(appId = appId, governedAccessibilityFallbackEligible = false).observation

    /**
     * Resolves the best currently available route by canonical precedence.
     *
     * Accessibility fallback can only become selectable when an external owning layer has already
     * classified the request as eligible for that high-risk governed fallback. This boolean does
     * not grant authority and is deliberately not persisted in the returned descriptor. W15-F must
     * revalidate current W02/W07/W14/W15-E requirements before any action.
     */
    fun resolve(
        appId: String,
        governedAccessibilityFallbackEligible: Boolean = false,
    ): AppIntegrationResolution {
        val evaluation = evaluate(appId, governedAccessibilityFallbackEligible)
        val binding = evaluation.binding
        val route = evaluation.route
        return if (evaluation.observation.isAvailable && binding != null && route != null) {
            AppIntegrationResolution.Ready(
                descriptor =
                    AppIntegrationDescriptor(
                        appId = binding.appId,
                        packageName = binding.packageName,
                        route = route,
                        readback =
                            AppReadbackCapability(
                                routeId = route.routeId,
                                supported = route.supportsReadback,
                            ),
                    ),
                observation = evaluation.observation,
            )
        } else {
            AppIntegrationResolution.Rejected(evaluation.observation)
        }
    }

    fun validateLink(
        appId: String,
        routeId: String,
        rawUri: String,
    ): Boolean {
        val binding = bindingsById[appId] ?: return false
        val route = binding.routes.firstOrNull { it.routeId == routeId } as? LinkRouteBinding
            ?: return false
        return AppLinkValidator.isAllowed(route, rawUri)
    }

    private fun evaluate(
        appId: String,
        governedAccessibilityFallbackEligible: Boolean,
    ): Evaluation {
        val currentMs = nowMs()
        val binding = bindingsById[appId]
            ?: return Evaluation(
                observation =
                    AppIntegrationObservation(
                        appId = appId,
                        availability = AppIntegrationAvailability.UNKNOWN_APP,
                        observedAtMs = currentMs,
                        expiresAtMs = currentMs,
                    ),
            )

        val snapshot = runtimeProbe.snapshot(binding)
        val expiresAtMs = saturatingAdd(snapshot.observedAtMs, binding.maxSnapshotAgeMs)
        if (
            snapshot.observedAtMs < 0 ||
            currentMs < 0 ||
            snapshot.observedAtMs > currentMs ||
            currentMs >= expiresAtMs
        ) {
            return rejected(
                binding,
                snapshot,
                expiresAtMs,
                AppIntegrationAvailability.STALE_RUNTIME_STATE,
            )
        }

        when (snapshot.installState) {
            AppInstallState.MISSING ->
                return rejected(
                    binding,
                    snapshot,
                    expiresAtMs,
                    AppIntegrationAvailability.APP_MISSING,
                )
            AppInstallState.PROBE_UNAVAILABLE ->
                return rejected(
                    binding,
                    snapshot,
                    expiresAtMs,
                    AppIntegrationAvailability.PROBE_UNAVAILABLE,
                )
            AppInstallState.INSTALLED -> Unit
        }

        if (snapshot.packageName != binding.packageName) {
            return rejected(
                binding,
                snapshot,
                expiresAtMs,
                AppIntegrationAvailability.PACKAGE_MISMATCH,
            )
        }

        if (
            snapshot.currentSignerSha256.isEmpty() ||
            snapshot.currentSignerSha256.any { it !in binding.trustedSignerSha256 }
        ) {
            return rejected(
                binding,
                snapshot,
                expiresAtMs,
                AppIntegrationAvailability.SIGNER_MISMATCH,
            )
        }

        val declaredRouteIds = binding.routes.mapTo(mutableSetOf()) { it.routeId }
        val suspiciousHandler =
            snapshot.routes.values.firstOrNull {
                it.routeId in declaredRouteIds &&
                    it.available &&
                    it.resolvedPackageName != null &&
                    it.resolvedPackageName != binding.packageName
            }
        if (suspiciousHandler != null) {
            return rejected(
                binding,
                snapshot,
                expiresAtMs,
                AppIntegrationAvailability.HANDLER_PACKAGE_MISMATCH,
            )
        }

        val availableRoutes =
            binding.routes
                .filter { route -> snapshot.routes[route.routeId]?.available == true }
                .sortedWith(compareBy<AppRouteBinding> { it.kind.precedence }.thenBy { it.routeId })
        if (availableRoutes.isEmpty()) {
            return rejected(
                binding,
                snapshot,
                expiresAtMs,
                AppIntegrationAvailability.ROUTE_UNAVAILABLE,
            )
        }

        val selected =
            availableRoutes.firstOrNull {
                it.kind != AppRouteKind.ACCESSIBILITY_FALLBACK ||
                    governedAccessibilityFallbackEligible
            }
        if (selected == null) {
            return rejected(
                binding,
                snapshot,
                expiresAtMs,
                AppIntegrationAvailability.HIGH_RISK_GOVERNANCE_REQUIRED,
            )
        }

        return Evaluation(
            binding = binding,
            route = selected,
            observation =
                AppIntegrationObservation(
                    appId = binding.appId,
                    availability = AppIntegrationAvailability.AVAILABLE,
                    observedAtMs = snapshot.observedAtMs,
                    expiresAtMs = expiresAtMs,
                    selectedRouteId = selected.routeId,
                ),
        )
    }

    private fun rejected(
        binding: InstalledAppBinding,
        snapshot: InstalledAppRuntimeSnapshot,
        expiresAtMs: Long,
        availability: AppIntegrationAvailability,
    ): Evaluation =
        Evaluation(
            binding = binding,
            observation =
                AppIntegrationObservation(
                    appId = binding.appId,
                    availability = availability,
                    observedAtMs = snapshot.observedAtMs,
                    expiresAtMs = expiresAtMs,
                ),
        )

    private fun saturatingAdd(left: Long, right: Long): Long =
        if (left > Long.MAX_VALUE - right) Long.MAX_VALUE else left + right

    private data class Evaluation(
        val binding: InstalledAppBinding? = null,
        val route: AppRouteBinding? = null,
        val observation: AppIntegrationObservation,
    )
}
