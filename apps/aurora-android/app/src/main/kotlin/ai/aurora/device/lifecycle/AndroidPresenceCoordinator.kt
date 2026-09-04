package ai.aurora.device.lifecycle

import android.app.Activity
import android.app.Application
import android.os.Bundle

class AndroidPresenceCoordinator(
    private val application: Application,
    private val engine: PresenceEngine,
) : Application.ActivityLifecycleCallbacks {
    private var startedActivities = 0
    private var registered = false

    fun start() {
        if (registered) return
        application.registerActivityLifecycleCallbacks(this)
        registered = true
    }

    override fun onActivityStarted(activity: Activity) {
        startedActivities += 1
        if (startedActivities == 1) {
            engine.apply(PresenceEvent.EnteredForeground)
        }
    }

    override fun onActivityStopped(activity: Activity) {
        if (startedActivities > 0) startedActivities -= 1
        if (startedActivities == 0 && !activity.isChangingConfigurations) {
            engine.apply(PresenceEvent.EnteredBackground)
        }
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit

    override fun onActivityResumed(activity: Activity) = Unit

    override fun onActivityPaused(activity: Activity) = Unit

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit

    override fun onActivityDestroyed(activity: Activity) = Unit
}
