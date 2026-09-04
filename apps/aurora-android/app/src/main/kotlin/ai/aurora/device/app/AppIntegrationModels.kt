package ai.aurora.device.app

import java.net.URI

/**
 * Non-executable installed-app integration vocabulary.
 *
 * Route precedence is deterministic and intentionally mirrors W15-D governance. A route descriptor
 * describes how a later W15-F executor may integrate with an already-validated package; it never
 * grants execution authority and never launches an Android component.
 */
enum class AppRouteKind(val precedence: Int) {
    OFFICIAL_API(0),
    INTENT(1),
    APP_LINK(2),
    DEEP_LINK(3),
    GOVERNED_ADAPTER(4),
    ACCESSIBILITY_FALLBACK(5),
}

sealed interface AppRouteBinding {
    val routeId: String
    val kind: AppRouteKind
    val supportsReadback: Boolean
}

data class OfficialApiRouteBinding(
    override val routeId: String,
    val adapterId: String,
    override val supportsReadback: Boolean = false,
) : AppRouteBinding {
    override val kind: AppRouteKind = AppRouteKind.OFFICIAL_API

    init {
        requireRouteId(routeId)
        require(adapterId.isNotBlank()) { "adapterId must not be blank" }
    }
}

data class IntentRouteBinding(
    override val routeId: String,
    val action: String,
    override val supportsReadback: Boolean = false,
) : AppRouteBinding {
    override val kind: AppRouteKind = AppRouteKind.INTENT

    init {
        requireRouteId(routeId)
        require(action.isNotBlank()) { "intent action must not be blank" }
    }
}

sealed interface LinkRouteBinding : AppRouteBinding {
    val scheme: String
    val host: String
    val pathPrefix: String
}

data class AppLinkRouteBinding(
    override val routeId: String,
    override val scheme: String,
    override val host: String,
    override val pathPrefix: String = "/",
    override val supportsReadback: Boolean = false,
) : LinkRouteBinding {
    override val kind: AppRouteKind = AppRouteKind.APP_LINK

    init {
        validateLinkBinding(routeId, scheme, host, pathPrefix)
    }
}

data class DeepLinkRouteBinding(
    override val routeId: String,
    override val scheme: String,
    override val host: String,
    override val pathPrefix: String = "/",
    override val supportsReadback: Boolean = false,
) : LinkRouteBinding {
    override val kind: AppRouteKind = AppRouteKind.DEEP_LINK

    init {
        validateLinkBinding(routeId, scheme, host, pathPrefix)
    }
}

data class GovernedAdapterRouteBinding(
    override val routeId: String,
    val adapterId: String,
    override val supportsReadback: Boolean = false,
) : AppRouteBinding {
    override val kind: AppRouteKind = AppRouteKind.GOVERNED_ADAPTER

    init {
        requireRouteId(routeId)
        require(adapterId.isNotBlank()) { "adapterId must not be blank" }
    }
}

data class AccessibilityFallbackRouteBinding(
    override val routeId: String,
    val adapterId: String,
    override val supportsReadback: Boolean = false,
) : AppRouteBinding {
    override val kind: AppRouteKind = AppRouteKind.ACCESSIBILITY_FALLBACK

    init {
        requireRouteId(routeId)
        require(adapterId.isNotBlank()) { "adapterId must not be blank" }
    }
}

data class InstalledAppBinding(
    val appId: String,
    val packageName: String,
    val trustedSignerSha256: Set<String>,
    val routes: List<AppRouteBinding>,
    val maxSnapshotAgeMs: Long = DEFAULT_MAX_SNAPSHOT_AGE_MS,
) {
    init {
        require(appId.isNotBlank()) { "appId must not be blank" }
        require(PACKAGE_NAME.matches(packageName)) { "packageName must be a canonical Android package" }
        require(trustedSignerSha256.isNotEmpty()) { "at least one trusted signer is required" }
        require(trustedSignerSha256.all(SHA256::matches)) {
            "trusted signer digests must be lowercase SHA-256 hex"
        }
        require(routes.isNotEmpty()) { "at least one app route is required" }
        require(routes.map { it.routeId }.distinct().size == routes.size) {
            "routeId values must be unique within an app binding"
        }
        require(maxSnapshotAgeMs > 0) { "maxSnapshotAgeMs must be positive" }
    }

    companion object {
        const val DEFAULT_MAX_SNAPSHOT_AGE_MS: Long = 30_000
        private val PACKAGE_NAME = Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$")
        private val SHA256 = Regex("^[0-9a-f]{64}$")
    }
}

enum class AppInstallState {
    INSTALLED,
    MISSING,
    PROBE_UNAVAILABLE,
}

data class AppRouteRuntimeObservation(
    val routeId: String,
    val available: Boolean,
    val resolvedPackageName: String? = null,
)

data class InstalledAppRuntimeSnapshot(
    val observedAtMs: Long,
    val installState: AppInstallState,
    val packageName: String? = null,
    val currentSignerSha256: Set<String> = emptySet(),
    val routes: Map<String, AppRouteRuntimeObservation> = emptyMap(),
)

fun interface InstalledAppRuntimeProbe {
    /** Read-only package/handler inspection. Implementations must never launch an app component. */
    fun snapshot(binding: InstalledAppBinding): InstalledAppRuntimeSnapshot
}

enum class AppIntegrationAvailability {
    AVAILABLE,
    UNKNOWN_APP,
    APP_MISSING,
    PROBE_UNAVAILABLE,
    PACKAGE_MISMATCH,
    SIGNER_MISMATCH,
    HANDLER_PACKAGE_MISMATCH,
    ROUTE_UNAVAILABLE,
    HIGH_RISK_GOVERNANCE_REQUIRED,
    STALE_RUNTIME_STATE,
}

data class AppIntegrationObservation(
    val appId: String,
    val availability: AppIntegrationAvailability,
    val observedAtMs: Long,
    val expiresAtMs: Long,
    val selectedRouteId: String? = null,
) {
    val isAvailable: Boolean
        get() = availability == AppIntegrationAvailability.AVAILABLE
}

/** Readback metadata only. W07/W15-F remain owners of actual outcome Evidence/Receipt semantics. */
data class AppReadbackCapability(
    val routeId: String,
    val supported: Boolean,
)

/**
 * Validated, non-executable route descriptor for later W15-F consumption.
 *
 * `governedAccessibilityFallbackEligible` is intentionally not stored here. Eligibility is a
 * one-shot caller input to resolution and is never promoted into durable Aurora authority.
 */
data class AppIntegrationDescriptor(
    val appId: String,
    val packageName: String,
    val route: AppRouteBinding,
    val readback: AppReadbackCapability,
)

sealed interface AppIntegrationResolution {
    data class Ready(
        val descriptor: AppIntegrationDescriptor,
        val observation: AppIntegrationObservation,
    ) : AppIntegrationResolution

    data class Rejected(
        val observation: AppIntegrationObservation,
    ) : AppIntegrationResolution
}

/** Fail-closed validator for candidate App Link / deep-link URIs. */
object AppLinkValidator {
    fun isAllowed(route: LinkRouteBinding, rawUri: String): Boolean {
        val uri = runCatching { URI(rawUri) }.getOrNull() ?: return false
        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host?.lowercase() ?: return false
        if (!uri.isAbsolute || uri.isOpaque) return false
        if (uri.rawUserInfo != null || uri.port != -1) return false
        if (scheme != route.scheme.lowercase() || host != route.host.lowercase()) return false

        val path = uri.path ?: "/"
        if (path.split('/').any { it == "." || it == ".." }) return false
        val prefix = normalizedPathPrefix(route.pathPrefix)
        return path == prefix || (prefix != "/" && path.startsWith("$prefix/")) || prefix == "/"
    }
}

internal fun linkProbeUri(route: LinkRouteBinding): String =
    "${route.scheme.lowercase()}://${route.host.lowercase()}${normalizedPathPrefix(route.pathPrefix)}"

private fun requireRouteId(routeId: String) {
    require(routeId.isNotBlank()) { "routeId must not be blank" }
}

private fun validateLinkBinding(
    routeId: String,
    scheme: String,
    host: String,
    pathPrefix: String,
) {
    requireRouteId(routeId)
    require(SCHEME.matches(scheme)) { "link scheme must be canonical lowercase URI scheme" }
    require(HOST.matches(host)) { "link host must be canonical lowercase DNS host" }
    require(pathPrefix.startsWith('/')) { "pathPrefix must start with /" }
    require(!pathPrefix.contains('?') && !pathPrefix.contains('#')) {
        "pathPrefix must not contain query or fragment"
    }
    require(pathPrefix.split('/').none { it == "." || it == ".." }) {
        "pathPrefix must not contain traversal segments"
    }
}

private fun normalizedPathPrefix(pathPrefix: String): String =
    if (pathPrefix.length > 1) pathPrefix.trimEnd('/') else pathPrefix

private val SCHEME = Regex("^[a-z][a-z0-9+.-]*$")
private val HOST = Regex("^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")
