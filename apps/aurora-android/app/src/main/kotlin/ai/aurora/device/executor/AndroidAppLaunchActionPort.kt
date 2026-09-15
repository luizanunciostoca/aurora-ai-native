package ai.aurora.device.executor

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent

const val W15_OPEN_VALIDATED_APP_ACTION = "OPEN_VALIDATED_APP"

/**
 * Launches only the package carried by an already-current AppIntegrationDescriptor.
 *
 * The package name is never taken from voice/model arguments. Signer/package/route freshness belongs
 * to W15-D before this port is reached. Successful Activity dispatch is not external success proof.
 */
class AndroidAppLaunchActionPort(context: Context) : DeviceActionPort {
    private val appContext = context.applicationContext
    private val packageManager = appContext.packageManager

    override fun execute(command: DeviceActionCommand, context: DeviceActionContext): DeviceActionResult {
        if (context.capabilityId != CAPABILITY_ID || command.actionId != W15_OPEN_VALIDATED_APP_ACTION) {
            return DeviceActionResult.VerifiedFailure("capability/action binding mismatch")
        }
        if (command.arguments.isNotEmpty()) {
            return DeviceActionResult.VerifiedFailure("validated app launch does not accept free-form arguments")
        }
        val app = context.app
            ?: return DeviceActionResult.VerifiedFailure("current validated app descriptor is required")
        val launch = packageManager.getLaunchIntentForPackage(app.packageName)
            ?: return DeviceActionResult.VerifiedFailure("validated package has no launchable activity")
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        return try {
            appContext.startActivity(launch)
            DeviceActionResult.Ambiguous("validated app launch dispatched; foreground state is not verified")
        } catch (_: ActivityNotFoundException) {
            DeviceActionResult.VerifiedFailure("validated package launch activity disappeared")
        } catch (failure: SecurityException) {
            DeviceActionResult.VerifiedFailure(
                "Android rejected validated package launch: ${failure.javaClass.simpleName}",
            )
        }
    }

    companion object {
        const val CAPABILITY_ID = "app.open"
    }
}
