package ai.aurora.device.capability

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/**
 * Read-only Android runtime probe used by W15-C discovery.
 *
 * It never requests permissions, launches UI, resolves Aurora policy, or grants execution authority.
 * Permission prompting and consent state transitions belong to W15-E.
 */
class AndroidRuntimeCapabilityProbe(
    private val context: Context,
    private val clockMs: () -> Long = { System.currentTimeMillis() },
    private val apiLevel: () -> Int = { Build.VERSION.SDK_INT },
) : NativeRuntimeProbe {
    override fun snapshot(binding: NativeCapabilityBinding): NativeRuntimeSnapshot =
        NativeRuntimeSnapshot(
            observedAtMs = clockMs(),
            apiLevel = apiLevel(),
            availableFeatures =
                binding.requiredFeatures.filterTo(mutableSetOf()) {
                    context.packageManager.hasSystemFeature(it)
                },
            grantedPermissions =
                binding.requiredPermissions.filterTo(mutableSetOf()) {
                    context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
                },
        )
}
