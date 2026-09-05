package ai.aurora.device.wake

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent as activitySetContent
import androidx.compose.runtime.Composable

/** Keeps the setup Activity source small while using the same Activity Compose host as the main UI. */
internal fun ComponentActivity.setContent(content: @Composable () -> Unit) {
    activitySetContent(content = content)
}
