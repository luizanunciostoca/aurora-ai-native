package ai.aurora.device.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppIntegrationResolverTest {
    @Test
    fun `official api wins deterministic precedence and exposes readback metadata only`() {
        val official = OfficialApiRouteBinding("official", "sdk.test", supportsReadback = true)
        val deepLink = DeepLinkRouteBinding("deep", "aurora-test", "example.test", "/open")
        val resolver =
            fixture(
                routes = listOf(deepLink, official),
                routeObservations =
                    mapOf(
                        "deep" to availableRoute("deep"),
                        "official" to availableRoute("official"),
                    ),
            )

        val result = resolver.resolve(APP_ID)

        assertTrue(result is AppIntegrationResolution.Ready)
        result as AppIntegrationResolution.Ready
        assertEquals("official", result.descriptor.route.routeId)
        assertTrue(result.descriptor.readback.supported)
        assertEquals(AppIntegrationAvailability.AVAILABLE, result.observation.availability)
    }

    @Test
    fun `missing app fails closed before route selection`() {
        val resolver =
            fixture(
                installState = AppInstallState.MISSING,
                packageName = null,
                signerSha256 = emptySet(),
                routeObservations = emptyMap(),
            )

        assertEquals(
            AppIntegrationAvailability.APP_MISSING,
            rejected(resolver.resolve(APP_ID)).observation.availability,
        )
    }

    @Test
    fun `wrong package and signer mismatch are explicit trust failures`() {
        val wrongPackage = fixture(packageName = "com.example.impostor")
        val wrongSigner = fixture(signerSha256 = setOf(UNTRUSTED_SIGNER))

        assertEquals(
            AppIntegrationAvailability.PACKAGE_MISMATCH,
            rejected(wrongPackage.resolve(APP_ID)).observation.availability,
        )
        assertEquals(
            AppIntegrationAvailability.SIGNER_MISMATCH,
            rejected(wrongSigner.resolve(APP_ID)).observation.availability,
        )
    }

    @Test
    fun `all current package signers must be trusted`() {
        val resolver = fixture(signerSha256 = setOf(TRUSTED_SIGNER, UNTRUSTED_SIGNER))

        assertEquals(
            AppIntegrationAvailability.SIGNER_MISMATCH,
            rejected(resolver.resolve(APP_ID)).observation.availability,
        )
    }

    @Test
    fun `handler resolving to another package is treated as impersonation`() {
        val resolver =
            fixture(
                routeObservations =
                    mapOf(
                        "intent" to
                            AppRouteRuntimeObservation(
                                routeId = "intent",
                                available = true,
                                resolvedPackageName = "com.example.impostor",
                            ),
                    ),
            )

        assertEquals(
            AppIntegrationAvailability.HANDLER_PACKAGE_MISMATCH,
            rejected(resolver.resolve(APP_ID)).observation.availability,
        )
    }

    @Test
    fun `deep link validation fails closed for host scheme userinfo and traversal drift`() {
        val route = DeepLinkRouteBinding("deep", "aurora-test", "example.test", "/trusted")
        val resolver = fixture(routes = listOf(route), routeObservations = mapOf("deep" to availableRoute("deep")))

        assertTrue(resolver.validateLink(APP_ID, "deep", "aurora-test://example.test/trusted/item?id=1"))
        assertFalse(resolver.validateLink(APP_ID, "deep", "https://example.test/trusted/item"))
        assertFalse(resolver.validateLink(APP_ID, "deep", "aurora-test://evil.test/trusted/item"))
        assertFalse(resolver.validateLink(APP_ID, "deep", "aurora-test://user@example.test/trusted/item"))
        assertFalse(resolver.validateLink(APP_ID, "deep", "aurora-test://example.test/trusted/../admin"))
        assertFalse(resolver.validateLink(APP_ID, "missing", "aurora-test://example.test/trusted"))
    }

    @Test
    fun `accessibility fallback is never silently selected`() {
        val route = AccessibilityFallbackRouteBinding("accessibility", "fallback.adapter")
        val resolver =
            fixture(
                routes = listOf(route),
                routeObservations = mapOf("accessibility" to availableRoute("accessibility")),
            )

        assertEquals(
            AppIntegrationAvailability.HIGH_RISK_GOVERNANCE_REQUIRED,
            rejected(resolver.resolve(APP_ID)).observation.availability,
        )

        val explicitlyEligible = resolver.resolve(APP_ID, governedAccessibilityFallbackEligible = true)
        assertTrue(explicitlyEligible is AppIntegrationResolution.Ready)
        explicitlyEligible as AppIntegrationResolution.Ready
        assertEquals(AppRouteKind.ACCESSIBILITY_FALLBACK, explicitlyEligible.descriptor.route.kind)
    }

    @Test
    fun `safe route wins even when accessibility fallback is also available`() {
        val intent = IntentRouteBinding("intent", "com.example.OPEN")
        val fallback = AccessibilityFallbackRouteBinding("accessibility", "fallback.adapter")
        val resolver =
            fixture(
                routes = listOf(fallback, intent),
                routeObservations =
                    mapOf(
                        "accessibility" to availableRoute("accessibility"),
                        "intent" to availableRoute("intent"),
                    ),
            )

        val result = resolver.resolve(APP_ID, governedAccessibilityFallbackEligible = true)

        assertTrue(result is AppIntegrationResolution.Ready)
        result as AppIntegrationResolution.Ready
        assertEquals("intent", result.descriptor.route.routeId)
    }

    @Test
    fun `stale and future runtime observations fail closed`() {
        val exactExpiry = fixture(observedAtMs = NOW_MS - MAX_AGE_MS)
        val future = fixture(observedAtMs = NOW_MS + 1)

        assertEquals(
            AppIntegrationAvailability.STALE_RUNTIME_STATE,
            rejected(exactExpiry.resolve(APP_ID)).observation.availability,
        )
        assertEquals(
            AppIntegrationAvailability.STALE_RUNTIME_STATE,
            rejected(future.resolve(APP_ID)).observation.availability,
        )
    }

    @Test
    fun `probe unavailable and unavailable routes remain non executable failures`() {
        val probeUnavailable = fixture(installState = AppInstallState.PROBE_UNAVAILABLE)
        val noRoute = fixture(routeObservations = emptyMap())

        assertEquals(
            AppIntegrationAvailability.PROBE_UNAVAILABLE,
            rejected(probeUnavailable.resolve(APP_ID)).observation.availability,
        )
        assertEquals(
            AppIntegrationAvailability.ROUTE_UNAVAILABLE,
            rejected(noRoute.resolve(APP_ID)).observation.availability,
        )
    }

    @Test
    fun `unknown and duplicate app registrations fail deterministically`() {
        val resolver = fixture()
        assertEquals(
            AppIntegrationAvailability.UNKNOWN_APP,
            rejected(resolver.resolve("unknown.app")).observation.availability,
        )

        val duplicateFailure =
            runCatching {
                AppIntegrationResolver(
                    bindings = listOf(binding(), binding()),
                    runtimeProbe = InstalledAppRuntimeProbe { availableSnapshot() },
                    nowMs = { NOW_MS },
                )
            }.exceptionOrNull()
        assertTrue(duplicateFailure is IllegalArgumentException)
    }

    private fun fixture(
        routes: List<AppRouteBinding> = listOf(IntentRouteBinding("intent", "com.example.OPEN")),
        observedAtMs: Long = NOW_MS - 1,
        installState: AppInstallState = AppInstallState.INSTALLED,
        packageName: String? = PACKAGE_NAME,
        signerSha256: Set<String> = setOf(TRUSTED_SIGNER),
        routeObservations: Map<String, AppRouteRuntimeObservation> = mapOf("intent" to availableRoute("intent")),
    ): AppIntegrationResolver {
        val appBinding = binding(routes)
        return AppIntegrationResolver(
            bindings = listOf(appBinding),
            runtimeProbe =
                InstalledAppRuntimeProbe {
                    InstalledAppRuntimeSnapshot(
                        observedAtMs = observedAtMs,
                        installState = installState,
                        packageName = packageName,
                        currentSignerSha256 = signerSha256,
                        routes = routeObservations,
                    )
                },
            nowMs = { NOW_MS },
        )
    }

    private fun binding(
        routes: List<AppRouteBinding> = listOf(IntentRouteBinding("intent", "com.example.OPEN")),
    ): InstalledAppBinding =
        InstalledAppBinding(
            appId = APP_ID,
            packageName = PACKAGE_NAME,
            trustedSignerSha256 = setOf(TRUSTED_SIGNER),
            routes = routes,
            maxSnapshotAgeMs = MAX_AGE_MS,
        )

    private fun availableSnapshot(): InstalledAppRuntimeSnapshot =
        InstalledAppRuntimeSnapshot(
            observedAtMs = NOW_MS - 1,
            installState = AppInstallState.INSTALLED,
            packageName = PACKAGE_NAME,
            currentSignerSha256 = setOf(TRUSTED_SIGNER),
            routes = mapOf("intent" to availableRoute("intent")),
        )

    private fun availableRoute(routeId: String): AppRouteRuntimeObservation =
        AppRouteRuntimeObservation(
            routeId = routeId,
            available = true,
            resolvedPackageName = PACKAGE_NAME,
        )

    private fun rejected(result: AppIntegrationResolution): AppIntegrationResolution.Rejected {
        assertTrue(result is AppIntegrationResolution.Rejected)
        return result as AppIntegrationResolution.Rejected
    }

    companion object {
        private const val APP_ID = "aurora.test.installed-app.v1"
        private const val PACKAGE_NAME = "com.example.target"
        private const val NOW_MS = 1_000_000L
        private const val MAX_AGE_MS = 30_000L
        private val TRUSTED_SIGNER = "a".repeat(64)
        private val UNTRUSTED_SIGNER = "b".repeat(64)
    }
}
