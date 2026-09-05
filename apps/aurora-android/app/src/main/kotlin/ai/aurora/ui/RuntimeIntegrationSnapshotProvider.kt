package ai.aurora.ui

import ai.aurora.device.AuroraApplication
import ai.aurora.device.offline.AndroidOfflineExecutionQueueStore
import ai.aurora.device.offline.OfflineQueueState
import ai.aurora.device.voice.GovernedVoiceCatalogResult
import ai.aurora.device.voice.GovernedVoiceCommandCatalog
import ai.aurora.ui.model.RuntimeIntegrationUiState

/**
 * Read-only composition of already-owned Android runtime projections for presentation.
 *
 * This provider never drains the offline queue, submits a voice candidate, resolves policy,
 * authorizes execution, or interprets ACK/Receipt as success. Failure to read any source is rendered
 * as a fail-closed status rather than synthesized data.
 */
class RuntimeIntegrationSnapshotProvider(
    private val application: AuroraApplication,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    fun snapshot(): RuntimeIntegrationUiState {
        val now = nowMs()
        val voiceResult =
            GovernedVoiceCommandCatalog(
                projectionProvider = { application.voiceProjectionStore().current() },
                nowMs = { now },
            ).snapshot()

        val voiceState =
            when (voiceResult) {
                is GovernedVoiceCatalogResult.Ready ->
                    RuntimeIntegrationUiState(
                        governedVoiceStatus = "READY",
                        w04RegistryVersion = voiceResult.snapshot.registryVersion,
                        w15gVocabularyVersion = voiceResult.snapshot.vocabularyVersion,
                        currentDeviceCapabilities = voiceResult.snapshot.availableCapabilityIds.size,
                        deterministicVoiceCommands = voiceResult.snapshot.commands.size,
                        w07VoiceIngressStatus = W07_VOICE_INGRESS_STATUS,
                    )

                is GovernedVoiceCatalogResult.Rejected ->
                    RuntimeIntegrationUiState(
                        governedVoiceStatus = "FAIL_CLOSED:${voiceResult.reason.name}",
                        w07VoiceIngressStatus = W07_VOICE_INGRESS_STATUS,
                    )
            }

        val queue =
            runCatching { AndroidOfflineExecutionQueueStore(application).loadAll() }
                .fold(
                    onSuccess = { records ->
                        val deferred = records.count { it.state == OfflineQueueState.DEFERRED }
                        val reconciliation =
                            records.count { it.state == OfflineQueueState.RECONCILIATION_REQUIRED }
                        QueueSnapshot(
                            status = if (records.isEmpty()) "EMPTY" else "READ_ONLY",
                            total = records.size,
                            deferred = deferred,
                            reconciliation = reconciliation,
                        )
                    },
                    onFailure = {
                        QueueSnapshot(
                            status = "UNREADABLE_FAIL_CLOSED",
                            total = 0,
                            deferred = 0,
                            reconciliation = 0,
                        )
                    },
                )

        return voiceState.copy(
            offlineQueueStatus = queue.status,
            offlineQueueTotal = queue.total,
            offlineQueueDeferred = queue.deferred,
            offlineQueueReconciliationRequired = queue.reconciliation,
        )
    }

    private data class QueueSnapshot(
        val status: String,
        val total: Int,
        val deferred: Int,
        val reconciliation: Int,
    )

    companion object {
        const val W07_VOICE_INGRESS_STATUS = "NOT_COMPOSED_FAIL_CLOSED"
    }
}
