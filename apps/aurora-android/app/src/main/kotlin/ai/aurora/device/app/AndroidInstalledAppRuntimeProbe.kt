package ai.aurora.device.app

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.net.Uri
import android.os.Build
import java.security.MessageDigest

/**
 * Read-only Android package/handler probe for W15-D.
 *
 * Every Intent is package-pinned before resolution and no component is ever launched. The probe
 * does not request permissions, use Accessibility, mutate app state, or infer Aurora authority from
 * Android package state.
 */
class AndroidInstalledAppRuntimeProbe(
    context: Context,
    private val availableAdapterIds: () -> Set<String> = { emptySet() },
    private val clockMs: () -> Long = { System.currentTimeMillis() },
) : InstalledAppRuntimeProbe {
    private val packageManager: PackageManager = context.packageManager

    override fun snapshot(binding: InstalledAppBinding): InstalledAppRuntimeSnapshot {
        val observedAtMs = clockMs()
        val packageInfo =
            try {
                getPackageInfo(binding.packageName)
            } catch (_: PackageManager.NameNotFoundException) {
                return InstalledAppRuntimeSnapshot(
                    observedAtMs = observedAtMs,
                    installState = AppInstallState.MISSING,
                )
            } catch (_: SecurityException) {
                return InstalledAppRuntimeSnapshot(
                    observedAtMs = observedAtMs,
                    installState = AppInstallState.PROBE_UNAVAILABLE,
                )
            }

        val signers =
            try {
                currentSigners(packageInfo).mapTo(mutableSetOf(), ::sha256)
            } catch (_: SecurityException) {
                return InstalledAppRuntimeSnapshot(
                    observedAtMs = observedAtMs,
                    installState = AppInstallState.PROBE_UNAVAILABLE,
                    packageName = packageInfo.packageName,
                )
            }

        val adapters = availableAdapterIds()
        val routes =
            binding.routes.associate { route ->
                route.routeId to probeRoute(binding.packageName, route, adapters)
            }

        return InstalledAppRuntimeSnapshot(
            observedAtMs = observedAtMs,
            installState = AppInstallState.INSTALLED,
            packageName = packageInfo.packageName,
            currentSignerSha256 = signers,
            routes = routes,
        )
    }

    private fun probeRoute(
        packageName: String,
        route: AppRouteBinding,
        adapters: Set<String>,
    ): AppRouteRuntimeObservation =
        when (route) {
            is OfficialApiRouteBinding -> adapterObservation(packageName, route, route.adapterId, adapters)
            is GovernedAdapterRouteBinding ->
                adapterObservation(packageName, route, route.adapterId, adapters)
            is AccessibilityFallbackRouteBinding ->
                adapterObservation(packageName, route, route.adapterId, adapters)
            is IntentRouteBinding ->
                activityObservation(
                    packageName = packageName,
                    routeId = route.routeId,
                    intent = Intent(route.action).setPackage(packageName),
                )
            is AppLinkRouteBinding -> linkObservation(packageName, route)
            is DeepLinkRouteBinding -> linkObservation(packageName, route)
        }

    private fun adapterObservation(
        packageName: String,
        route: AppRouteBinding,
        adapterId: String,
        adapters: Set<String>,
    ): AppRouteRuntimeObservation {
        val available = adapterId in adapters
        return AppRouteRuntimeObservation(
            routeId = route.routeId,
            available = available,
            resolvedPackageName = if (available) packageName else null,
        )
    }

    private fun linkObservation(
        packageName: String,
        route: LinkRouteBinding,
    ): AppRouteRuntimeObservation =
        activityObservation(
            packageName = packageName,
            routeId = route.routeId,
            intent =
                Intent(Intent.ACTION_VIEW, Uri.parse(linkProbeUri(route)))
                    .addCategory(Intent.CATEGORY_BROWSABLE)
                    .setPackage(packageName),
        )

    private fun activityObservation(
        packageName: String,
        routeId: String,
        intent: Intent,
    ): AppRouteRuntimeObservation {
        val resolvedPackage =
            try {
                packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
                    ?.activityInfo
                    ?.packageName
            } catch (_: SecurityException) {
                null
            }
        return AppRouteRuntimeObservation(
            routeId = routeId,
            available = resolvedPackage != null,
            resolvedPackageName = resolvedPackage,
        )
    }

    @Suppress("DEPRECATION")
    private fun getPackageInfo(packageName: String): PackageInfo {
        val flags =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageManager.GET_SIGNING_CERTIFICATES
            } else {
                PackageManager.GET_SIGNATURES
            }
        return packageManager.getPackageInfo(packageName, flags)
    }

    @Suppress("DEPRECATION")
    private fun currentSigners(packageInfo: PackageInfo): Array<Signature> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.signingInfo?.apkContentsSigners ?: emptyArray()
        } else {
            packageInfo.signatures ?: emptyArray()
        }

    private fun sha256(signature: Signature): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(signature.toByteArray())
            .joinToString(separator = "") { byte -> "%02x".format(byte.toInt() and 0xff) }
}
