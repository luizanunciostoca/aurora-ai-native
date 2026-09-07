package ai.aurora.device.wake

import android.app.Activity
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.voice.VoiceInteractionService

/**
 * Android-only assistant selection coordinator.
 *
 * Assistant-role state is platform/device state only. Holding this role never grants Aurora
 * business authority, verified outcome, execution eligibility, or retry authorization.
 */
data class AuroraAssistantRoleSnapshot(
    val roleAvailable: Boolean,
    val roleHeld: Boolean,
    val activeVoiceInteractionService: Boolean,
) {
    val selected: Boolean
        get() = roleHeld || activeVoiceInteractionService
}

enum class AuroraAssistantSelectionLaunch {
    ALREADY_SELECTED,
    ROLE_REQUEST,
    DEFAULT_APPS_SETTINGS,
    VOICE_INPUT_SETTINGS,
    GENERAL_SETTINGS,
    FAILED,
}

object AuroraAssistantRoleCoordinator {
    fun snapshot(activity: Activity): AuroraAssistantRoleSnapshot {
        val activeService =
            VoiceInteractionService.isActiveService(
                activity,
                ComponentName(activity, AuroraVoiceInteractionService::class.java),
            )
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return AuroraAssistantRoleSnapshot(
                roleAvailable = false,
                roleHeld = false,
                activeVoiceInteractionService = activeService,
            )
        }

        val roles = activity.getSystemService(RoleManager::class.java)
        val roleAvailable = roles?.isRoleAvailable(RoleManager.ROLE_ASSISTANT) == true
        val roleHeld = roleAvailable && roles?.isRoleHeld(RoleManager.ROLE_ASSISTANT) == true
        return AuroraAssistantRoleSnapshot(
            roleAvailable = roleAvailable,
            roleHeld = roleHeld,
            activeVoiceInteractionService = activeService,
        )
    }

    fun requestSelection(
        activity: Activity,
        requestCode: Int,
    ): AuroraAssistantSelectionLaunch {
        val current = snapshot(activity)
        if (current.selected) return AuroraAssistantSelectionLaunch.ALREADY_SELECTED

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && current.roleAvailable) {
            val roles = activity.getSystemService(RoleManager::class.java)
            val roleIntent = runCatching { roles?.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT) }.getOrNull()
            if (
                roleIntent != null &&
                runCatching { activity.startActivityForResult(roleIntent, requestCode) }.isSuccess
            ) {
                return AuroraAssistantSelectionLaunch.ROLE_REQUEST
            }
        }

        return openSystemSelection(activity)
    }

    fun openSystemSelection(activity: Activity): AuroraAssistantSelectionLaunch {
        val routes =
            listOf(
                Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS to
                    AuroraAssistantSelectionLaunch.DEFAULT_APPS_SETTINGS,
                Settings.ACTION_VOICE_INPUT_SETTINGS to
                    AuroraAssistantSelectionLaunch.VOICE_INPUT_SETTINGS,
                Settings.ACTION_SETTINGS to AuroraAssistantSelectionLaunch.GENERAL_SETTINGS,
            )

        for ((action, result) in routes) {
            val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            val resolvable = runCatching { intent.resolveActivity(activity.packageManager) != null }.getOrDefault(false)
            if (!resolvable) continue
            if (runCatching { activity.startActivity(intent) }.isSuccess) return result
        }
        return AuroraAssistantSelectionLaunch.FAILED
    }
}
