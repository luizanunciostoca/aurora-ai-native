package ai.aurora.device.offline

import ai.aurora.device.executor.DeviceActionCommand
import ai.aurora.device.executor.DeviceExecutionRequest
import ai.aurora.device.permission.RuntimePermissionRequirement
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Restart-safe Android store for W15-H's non-authoritative queue projection.
 *
 * No W07 authorization snapshot, policy token, approval, arbitrary action argument, secret,
 * Keystore material or gateway credential is persisted here. Records are bounded by the queue model
 * and the complete serialized store has an independent hard byte ceiling.
 */
class AndroidOfflineExecutionQueueStore(context: Context) : OfflineExecutionQueueStore {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    override fun loadAll(): List<OfflineDeferredExecution> {
        val encoded = preferences.getString(KEY_RECORDS, null) ?: return emptyList()
        return try {
            check(encoded.toByteArray(Charsets.UTF_8).size <= MAX_STORED_QUEUE_BYTES) {
                "offline queue exceeds storage bound"
            }
            val array = JSONArray(encoded)
            buildList {
                for (index in 0 until array.length()) {
                    add(decodeRecord(array.getJSONObject(index)))
                }
            }
        } catch (error: Exception) {
            throw IllegalStateException(
                "offline queue state is unreadable; refusing unsafe replay",
                error,
            )
        }
    }

    override fun saveAll(records: List<OfflineDeferredExecution>) {
        val array = JSONArray()
        records.forEach { record -> array.put(encodeRecord(record)) }
        val encoded = array.toString()
        check(encoded.toByteArray(Charsets.UTF_8).size <= MAX_STORED_QUEUE_BYTES) {
            "offline queue exceeds storage bound"
        }
        check(preferences.edit().putString(KEY_RECORDS, encoded).commit()) {
            "failed to persist offline execution queue"
        }
    }

    private fun encodeRecord(record: OfflineDeferredExecution): JSONObject =
        JSONObject().apply {
            check(record.request.action.arguments.isEmpty()) {
                "offline queue must not persist arbitrary action arguments"
            }
            put("idempotencyKey", record.idempotencyKey)
            put("operationName", record.operationName)
            put("canonicalPayloadHash", record.canonicalPayloadHash)
            put("enqueuedAtMs", record.enqueuedAtMs)
            put("state", record.state.name)
            put("executionId", record.request.executionId)
            put("tenantId", record.request.tenantId)
            put("deviceId", record.request.deviceId)
            put("deviceSessionId", record.request.deviceSessionId)
            put("capabilityId", record.request.capabilityId)
            put("deadlineAtMs", record.request.deadlineAtMs)
            if (record.request.appId == null) put("appId", JSONObject.NULL)
            else put("appId", record.request.appId)
            put("actionId", record.request.action.actionId)
            put("permissionRequirements", encodePermissions(record.request.permissionRequirements))
        }

    private fun decodeRecord(json: JSONObject): OfflineDeferredExecution {
        check(!json.has("actionArguments")) {
            "offline queue record contains prohibited action arguments"
        }
        return OfflineDeferredExecution(
            idempotencyKey = json.getString("idempotencyKey"),
            operationName = json.getString("operationName"),
            canonicalPayloadHash = json.getString("canonicalPayloadHash"),
            enqueuedAtMs = json.getLong("enqueuedAtMs"),
            state = OfflineQueueState.valueOf(json.getString("state")),
            request =
                DeviceExecutionRequest(
                    executionId = json.getString("executionId"),
                    tenantId = json.getString("tenantId"),
                    deviceId = json.getString("deviceId"),
                    deviceSessionId = json.getString("deviceSessionId"),
                    capabilityId = json.getString("capabilityId"),
                    permissionRequirements = decodePermissions(json.getJSONArray("permissionRequirements")),
                    appId = if (json.isNull("appId")) null else json.getString("appId"),
                    action = DeviceActionCommand(actionId = json.getString("actionId")),
                    deadlineAtMs = json.getLong("deadlineAtMs"),
                ),
        )
    }

    private fun encodePermissions(requirements: List<RuntimePermissionRequirement>): JSONArray =
        JSONArray().apply {
            requirements.forEach { requirement ->
                put(
                    JSONObject().apply {
                        put("permission", requirement.permission)
                        put("requiresBackgroundAccess", requirement.requiresBackgroundAccess)
                    },
                )
            }
        }

    private fun decodePermissions(array: JSONArray): List<RuntimePermissionRequirement> =
        buildList {
            for (index in 0 until array.length()) {
                val value = array.getJSONObject(index)
                add(
                    RuntimePermissionRequirement(
                        permission = value.getString("permission"),
                        requiresBackgroundAccess = value.getBoolean("requiresBackgroundAccess"),
                    ),
                )
            }
        }

    private companion object {
        const val PREFERENCES_NAME = "aurora_offline_execution_queue"
        const val KEY_RECORDS = "records_json"
        const val MAX_STORED_QUEUE_BYTES = 1024 * 1024
    }
}
