package ai.aurora.device.capability

import android.content.Context
import ai.aurora.device.BuildConfig

private const val DP5_PREFS = "aurora_dp5_physical_acceptance"
private const val STALE_CAPABILITY_KEY = "stale_capability_id"

object LocalPhysicalAcceptanceOverrides {
    fun staleCapabilityId(context: Context): String? =
        if (BuildConfig.AURORA_PHYSICAL_ACCEPTANCE_CONTROLS) {
            context.getSharedPreferences(DP5_PREFS, Context.MODE_PRIVATE)
                .getString(STALE_CAPABILITY_KEY, null)
        } else null

    fun setStaleCapability(context: Context, capabilityId: String?) {
        require(BuildConfig.AURORA_PHYSICAL_ACCEPTANCE_CONTROLS)
        val editor = context.getSharedPreferences(DP5_PREFS, Context.MODE_PRIVATE).edit()
        if (capabilityId == null) editor.remove(STALE_CAPABILITY_KEY) else editor.putString(STALE_CAPABILITY_KEY, capabilityId)
        check(editor.commit())
    }
}

class PhysicalAcceptanceNativeRuntimeProbe(
    context: Context,
    private val clockMs: () -> Long = { System.currentTimeMillis() },
) : NativeRuntimeProbe {
    private val delegate = AndroidRuntimeCapabilityProbe(context, clockMs)
    private val appContext = context.applicationContext

    override fun snapshot(binding: NativeCapabilityBinding): NativeRuntimeSnapshot {
        val current = delegate.snapshot(binding)
        if (LocalPhysicalAcceptanceOverrides.staleCapabilityId(appContext) != binding.capabilityId) {
            return current
        }
        val now = clockMs()
        val staleObservedAt = (now - binding.maxSnapshotAgeMs).coerceAtLeast(0L)
        return current.copy(observedAtMs = staleObservedAt)
    }
}
