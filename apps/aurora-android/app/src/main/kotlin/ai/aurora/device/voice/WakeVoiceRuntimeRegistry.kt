package ai.aurora.device.voice

import android.Manifest
import android.app.Activity
import android.os.Looper
import ai.aurora.device.AuroraApplication
import ai.aurora.device.permission.AndroidRuntimePermissionProbe
import ai.aurora.device.permission.PermissionConsentBroker
import ai.aurora.device.permission.PermissionPromptLauncher
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.permission.SharedPreferencesPermissionHistoryStore

/**
 * W15-G composition registry. It starts fail-closed and may only be populated by authenticated,
 * reconciled upstream adapters. Neither a projection nor an ingress registration is authority.
 */
object WakeVoiceRuntimeRegistry {
    val projectionStore = GovernedVoiceProjectionStore()

    @Volatile
    private var authorityIngress: W07VoiceAuthorityIngress =
        W07VoiceAuthorityIngress {
            W07VoiceAuthorityIngressResult.Unavailable("W07 Android authority ingress not composed")
        }

    /** Module-internal composition point for the real W07 adapter. Never pass a local executor. */
    internal fun installAuthorityIngress(ingress: W07VoiceAuthorityIngress) {
        authorityIngress = ingress
    }

    internal fun clearAuthorityIngress() {
        authorityIngress =
            W07VoiceAuthorityIngress {
                W07VoiceAuthorityIngressResult.Unavailable("W07 Android authority ingress not composed")
            }
    }

    fun route(
        activity: Activity,
        transcript: String,
        transcriptConfidence: Double?,
        nowMs: Long = System.currentTimeMillis(),
    ): WakeVoiceRoute {
        var catalog = GovernedVoiceCommandCatalog(projectionStore::current, nowMs = { nowMs }).snapshot()
        if (shouldRecoverGovernedVoiceCatalog(catalog) && Looper.myLooper() != Looper.getMainLooper()) {
            // Process death intentionally clears process-local projection/ingress objects. A fresh
            // utterance may recompose that transport state once from persisted W14 metadata plus a
            // new authenticated bootstrap grant. This is transport recovery only: no command has
            // been submitted yet, and failure leaves the normal fail-closed conversation fallback.
            val app = activity.application as? AuroraApplication
            val recovered =
                runCatching { app?.reconnectLocalVoiceIngressFromPendingBootstrap() }
                    .getOrNull() is GatewayVoiceRuntimeCompositionResult.Composed
            if (recovered) {
                catalog = GovernedVoiceCommandCatalog(projectionStore::current, nowMs = { nowMs }).snapshot()
            }
        }
        if (catalog !is GovernedVoiceCatalogResult.Ready) {
            return WakeVoiceRoute.ConversationFallback(
                WakeVoiceFallbackReason.COMMAND_CATALOG_UNAVAILABLE,
            )
        }

        val app = activity.application as AuroraApplication
        val permissionBroker =
            PermissionConsentBroker(
                probe = AndroidRuntimePermissionProbe(activity),
                historyStore = SharedPreferencesPermissionHistoryStore(activity),
                promptLauncher = PermissionPromptLauncher {
                    error("wake fast path must never launch permission UI implicitly")
                },
                nowMs = { nowMs },
            )
        val microphone =
            permissionBroker.observe(RuntimePermissionRequirement(Manifest.permission.RECORD_AUDIO))
        val snapshot = catalog.snapshot
        val router =
            WakeVoiceFastPathRouter(
                inputProvider = {
                    WakeVoiceFastPathInputs(
                        commands = snapshot.commands,
                        context =
                            VoiceFastPathContext(
                                appVisibility = app.presenceSnapshot().visibility,
                                microphonePermission = microphone,
                                availableCapabilityIds = snapshot.availableCapabilityIds,
                                privacyModeEnabled =
                                    ai.aurora.device.wake.WakeRuntimePreferences(activity)
                                        .privacyModeEnabled(),
                            ),
                        registryVersion = snapshot.registryVersion,
                        vocabularyVersion = snapshot.vocabularyVersion,
                    )
                },
                authorityIngress = authorityIngress,
                nowMs = { nowMs },
            )
        return router.route(transcript, transcriptConfidence)
    }
}
