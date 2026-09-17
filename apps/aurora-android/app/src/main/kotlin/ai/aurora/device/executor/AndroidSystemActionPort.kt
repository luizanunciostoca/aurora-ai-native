package ai.aurora.device.executor

import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.provider.MediaStore
import android.provider.Settings

const val W15_OPEN_SETTINGS_ACTION = "OPEN_SETTINGS"
const val W15_OPEN_HOME_ACTION = "OPEN_HOME"
const val W15_OPEN_CAMERA_ACTION = "OPEN_CAMERA"
const val W15_OPEN_BROWSER_SEARCH_ACTION = "OPEN_BROWSER_SEARCH"

/**
 * Fixed Android navigation intents. A successful dispatch is intentionally classified Ambiguous:
 * startActivity() proves only that Android accepted the launch request, not that the requested UI
 * became visible or that an external application completed any downstream task.
 */
class AndroidSystemActionPort(context: Context) : DeviceActionPort {
    private val appContext = context.applicationContext

    override fun execute(command: DeviceActionCommand, context: DeviceActionContext): DeviceActionResult {
        if (context.capabilityId != CAPABILITY_ID) {
            return DeviceActionResult.VerifiedFailure("capability/action binding mismatch")
        }

        val intent =
            when (command.actionId) {
                W15_OPEN_SETTINGS_ACTION -> {
                    if (command.arguments.isNotEmpty()) return argumentsRejected()
                    Intent(Settings.ACTION_SETTINGS)
                }
                W15_OPEN_HOME_ACTION -> {
                    if (command.arguments.isNotEmpty()) return argumentsRejected()
                    Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                }
                W15_OPEN_CAMERA_ACTION -> {
                    if (command.arguments.isNotEmpty()) return argumentsRejected()
                    Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)
                }
                W15_OPEN_BROWSER_SEARCH_ACTION -> {
                    if (command.arguments.keys != setOf(ARG_QUERY)) {
                        return DeviceActionResult.VerifiedFailure("browser search requires exactly query")
                    }
                    val query = command.arguments[ARG_QUERY]?.trim().orEmpty()
                    if (query.isBlank() || query.length > MAX_QUERY_CHARS || query.any(Char::isISOControl)) {
                        return DeviceActionResult.VerifiedFailure("browser search query is invalid")
                    }
                    Intent(Intent.ACTION_WEB_SEARCH).putExtra(SearchManager.QUERY, query)
                }
                else -> return DeviceActionResult.VerifiedFailure("native action is not allowlisted")
            }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        return try {
            appContext.startActivity(intent)
            DeviceActionResult.Ambiguous("Android accepted UI launch; foreground visibility is not verified")
        } catch (_: ActivityNotFoundException) {
            DeviceActionResult.VerifiedFailure("no Android activity handles this allowlisted action")
        } catch (failure: SecurityException) {
            DeviceActionResult.VerifiedFailure(
                "Android rejected this allowlisted action: ${failure.javaClass.simpleName}",
            )
        }
    }

    private fun argumentsRejected() =
        DeviceActionResult.VerifiedFailure("system navigation action does not accept arguments")

    companion object {
        // W04 owns the vocabulary. These actions are app/UI-open realizations only.
        const val CAPABILITY_ID = "app.open"
        private const val ARG_QUERY = "query"
        private const val MAX_QUERY_CHARS = 200
    }
}
