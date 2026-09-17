package ai.aurora.device.wake

import android.app.Activity
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
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

    val wakeEligible: Boolean
        get() = if (roleAvailable) roleHeld else activeVoiceInteractionService
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
    fun snapshot(context: Context): AuroraAssistantRoleSnapshot {
        val activeService =
            VoiceInteractionService.isActiveService(
                context,
                ComponentName(context, AuroraVoiceInteractionService::class.java),
            )
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return AuroraAssistantRoleSnapshot(
                roleAvailable = false,
                roleHeld = false,
                activeVoiceInteractionService = activeService,
            )
        }

        val roles = context.getSystemService(RoleManager::class.java)
        val roleAvailable = runCatching {
            roles?.isRoleAvailable(RoleManager.ROLE_ASSISTANT) == true
        }.getOrDefault(false)
        val roleHeld =
            roleAvailable &&
                runCatching { roles?.isRoleHeld(RoleManager.ROLE_ASSISTANT) == true }
                    .getOrDefault(false)
        return AuroraAssistantRoleSnapshot(
            roleAvailable = roleAvailable,
            roleHeld = roleHeld,
            activeVoiceInteractionService = activeService,
        )
    }

    /**
     * Prefer the platform role-consent sheet when it is available. If an OEM does not expose the
     * role, or refuses to launch the sheet, fall back to the system's default-app settings.
     */
    fun requestSelection(
        activity: Activity,
        requestCode: Int,
    ): AuroraAssistantSelectionLaunch {
        val current = snapshot(activity)
        if (current.selected) return AuroraAssistantSelectionLaunch.ALREADY_SELECTED

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && current.roleAvailable) {
            val roles = activity.getSystemService(RoleManager::class.java)
            val roleIntent =
                runCatching { roles?.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT) }
                    .getOrNull()
            if (
                roleIntent != null &&
                runCatching { activity.startActivityForResult(roleIntent, requestCode) }.isSuccess
            ) {
                return AuroraAssistantSelectionLaunch.ROLE_REQUEST
            }
        }

        return openSystemSelection(activity)
    }

    /**
     * Continue an explicit user request after an OEM role sheet returned without selecting Aurora.
     * This never changes the role itself; it only opens a user-controlled Android settings surface.
     */
    fun continueSelectionAfterRoleResult(activity: Activity): AuroraAssistantSelectionLaunch {
        if (snapshot(activity).selected) return AuroraAssistantSelectionLaunch.ALREADY_SELECTED
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

        // Do not preflight with PackageManager.resolveActivity(). Package-visibility filtering can
        // hide a Settings activity from queries even though startActivity() is permitted. Trying the
        // public Settings actions directly and catching failure is both safer and more reliable.
        for ((action, result) in routes) {
            val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            if (runCatching { activity.startActivity(intent) }.isSuccess) return result
        }
        return AuroraAssistantSelectionLaunch.FAILED
    }

    fun userGuidance(result: AuroraAssistantSelectionLaunch): String =
        when (result) {
            AuroraAssistantSelectionLaunch.ALREADY_SELECTED ->
                "Aurora já é o assistente padrão deste dispositivo."
            AuroraAssistantSelectionLaunch.ROLE_REQUEST ->
                "Confirme Aurora na tela de seleção do Android."
            AuroraAssistantSelectionLaunch.DEFAULT_APPS_SETTINGS ->
                "Em Apps padrão, abra App assistente digital e selecione Aurora."
            AuroraAssistantSelectionLaunch.VOICE_INPUT_SETTINGS ->
                "Abra a opção de assistente/entrada por voz e selecione Aurora."
            AuroraAssistantSelectionLaunch.GENERAL_SETTINGS ->
                "Abra Aplicativos > Apps padrão > App assistente digital e selecione Aurora."
            AuroraAssistantSelectionLaunch.FAILED ->
                "Não consegui abrir a seleção automaticamente. Abra Configurações > Aplicativos > Apps padrão > App assistente digital e selecione Aurora."
        }
}