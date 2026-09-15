package ai.aurora.device.executor

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import ai.aurora.device.app.AppLinkValidator
import ai.aurora.device.app.LinkRouteBinding

const val W15_OPEN_VALIDATED_APP_ACTION = "OPEN_VALIDATED_APP"
const val W15_OPEN_VALIDATED_APP_LINK_ACTION = "OPEN_VALIDATED_APP_LINK"

/**
 * Executes only against an already-current W15-D AppIntegrationDescriptor.
 *
 * Package identity never comes from voice/model arguments. `appId` is only a selector that must
 * exactly match the current descriptor, whose package/signer/route were independently validated.
 */
class AndroidAppLaunchActionPort(context: Context) : DeviceActionPort {
    private val appContext = context.applicationContext
    private val packageManager = appContext.packageManager

    override fun execute(command: DeviceActionCommand, context: DeviceActionContext): DeviceActionResult {
        val expectedCapability =
            when (command.actionId) {
                W15_OPEN_VALIDATED_APP_ACTION -> OPEN_CAPABILITY_ID
                W15_OPEN_VALIDATED_APP_LINK_ACTION -> APP_LINK_CAPABILITY_ID
                else -> return DeviceActionResult.VerifiedFailure("native action is not allowlisted")
            }
        if (context.capabilityId != expectedCapability) {
            return DeviceActionResult.VerifiedFailure("capability/action binding mismatch")
        }
        val app = context.app
            ?: return DeviceActionResult.VerifiedFailure("current validated app descriptor is required")
        val requestedAppId = command.arguments[ARG_APP_ID]
        if (requestedAppId.isNullOrBlank() || requestedAppId != app.appId) {
            return DeviceActionResult.VerifiedFailure("authorized appId does not match current app descriptor")
        }

        return when (command.actionId) {
            W15_OPEN_VALIDATED_APP_ACTION -> launchApp(command, app.packageName)
            W15_OPEN_VALIDATED_APP_LINK_ACTION -> launchLink(command, app)
            else -> DeviceActionResult.VerifiedFailure("native action is not allowlisted")
        }
    }

    private fun launchApp(command: DeviceActionCommand, packageName: String): DeviceActionResult {
        if (command.arguments.keys != setOf(ARG_APP_ID)) {
            return DeviceActionResult.VerifiedFailure("validated app launch accepts only appId")
        }
        val launch = packageManager.getLaunchIntentForPackage(packageName)
            ?: return DeviceActionResult.VerifiedFailure("validated package has no launchable activity")
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return dispatch(launch, "validated app launch")
    }

    private fun launchLink(
        command: DeviceActionCommand,
        app: ai.aurora.device.app.AppIntegrationDescriptor,
    ): DeviceActionResult {
        if (command.arguments.keys != setOf(ARG_APP_ID, ARG_URI)) {
            return DeviceActionResult.VerifiedFailure("validated app link requires exactly appId and uri")
        }
        val route = app.route as? LinkRouteBinding
            ?: return DeviceActionResult.VerifiedFailure("current app route is not a validated link route")
        val rawUri = command.arguments[ARG_URI].orEmpty()
        if (!AppLinkValidator.isAllowed(route, rawUri)) {
            return DeviceActionResult.VerifiedFailure("app link is outside the validated route boundary")
        }
        val launch =
            Intent(Intent.ACTION_VIEW, Uri.parse(rawUri)).apply {
                setPackage(app.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        return dispatch(launch, "validated app-link launch")
    }

    private fun dispatch(intent: Intent, label: String): DeviceActionResult =
        try {
            appContext.startActivity(intent)
            DeviceActionResult.Ambiguous("$label dispatched; foreground/external state is not verified")
        } catch (_: ActivityNotFoundException) {
            DeviceActionResult.VerifiedFailure("validated package handler disappeared")
        } catch (failure: SecurityException) {
            DeviceActionResult.VerifiedFailure(
                "Android rejected validated package launch: ${failure.javaClass.simpleName}",
            )
        }

    companion object {
        const val OPEN_CAPABILITY_ID = "app.open"
        const val APP_LINK_CAPABILITY_ID = "app.deep_link.open"
        private const val ARG_APP_ID = "appId"
        private const val ARG_URI = "uri"
    }
}
