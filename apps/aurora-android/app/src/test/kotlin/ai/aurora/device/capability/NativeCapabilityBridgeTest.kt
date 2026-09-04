package ai.aurora.device.capability

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeCapabilityBridgeTest {
    @Test
    fun `discovery is independent from execution authorization`() {
        val fixture = fixture()
        var authorizationCalls = 0

        val observation = fixture.bridge.discover(CAPABILITY_ID)

        assertTrue(observation.isAvailable)
        assertEquals(0, authorizationCalls)

        val result =
            fixture.bridge.dispatch(command()) {
                authorizationCalls += 1
                ExecutionTargetAuthorizationDecision.AUTHORIZED_DEVICE_TARGET
            }

        assertTrue(result is NativeDispatchResult.Dispatched)
        assertEquals(1, authorizationCalls)
        assertEquals(1, fixture.handlerCalls())
    }

    @Test
    fun `unknown capability fails closed without probing or dispatch`() {
        var probeCalls = 0
        var handlerCalls = 0
        val bridge =
            NativeCapabilityBridge(
                registrations =
                    listOf(
                        NativeCapabilityRegistration(binding()) {
                            handlerCalls += 1
                            NativeHandlerResult.Success()
                        },
                    ),
                runtimeProbe = NativeRuntimeProbe {
                    probeCalls += 1
                    availableSnapshot()
                },
                nowMs = { NOW_MS },
            )

        val observation = bridge.discover("aurora.test.unknown.v1")
        val dispatch =
            bridge.dispatch(command("aurora.test.unknown.v1")) {
                ExecutionTargetAuthorizationDecision.AUTHORIZED_DEVICE_TARGET
            }

        assertEquals(NativeCapabilityAvailability.UNKNOWN_CAPABILITY, observation.availability)
        assertEquals(NativeDispatchRejection.UNKNOWN_CAPABILITY, rejected(dispatch).reason)
        assertEquals(0, probeCalls)
        assertEquals(0, handlerCalls)
    }

    @Test
    fun `stale runtime state fails before target authorization`() {
        var authorizationCalls = 0
        val fixture =
            fixture(
                snapshot = availableSnapshot(observedAtMs = NOW_MS - MAX_AGE_MS),
            )

        val result =
            fixture.bridge.dispatch(command()) {
                authorizationCalls += 1
                ExecutionTargetAuthorizationDecision.AUTHORIZED_DEVICE_TARGET
            }

        assertEquals(NativeDispatchRejection.STALE_RUNTIME_STATE, rejected(result).reason)
        assertEquals(0, authorizationCalls)
        assertEquals(0, fixture.handlerCalls())
    }

    @Test
    fun `future runtime observation fails closed as stale`() {
        val fixture = fixture(snapshot = availableSnapshot(observedAtMs = NOW_MS + 1))

        val observation = fixture.bridge.discover(CAPABILITY_ID)

        assertEquals(NativeCapabilityAvailability.STALE_RUNTIME_STATE, observation.availability)
        assertFalse(observation.isAvailable)
    }

    @Test
    fun `unsupported api and feature are deterministic local availability failures`() {
        val lowApi = fixture(snapshot = availableSnapshot(apiLevel = 27), minApiLevel = 28)
        val missingFeature =
            fixture(
                snapshot = availableSnapshot(availableFeatures = emptySet()),
                requiredFeatures = setOf(FEATURE_CAMERA),
            )

        assertEquals(
            NativeCapabilityAvailability.UNSUPPORTED_API,
            lowApi.bridge.discover(CAPABILITY_ID).availability,
        )
        val featureObservation = missingFeature.bridge.discover(CAPABILITY_ID)
        assertEquals(NativeCapabilityAvailability.UNSUPPORTED_FEATURE, featureObservation.availability)
        assertEquals(setOf(FEATURE_CAMERA), featureObservation.missingFeatures)
    }

    @Test
    fun `missing runtime permission is only a precondition and never dispatches`() {
        var authorizationCalls = 0
        val fixture =
            fixture(
                snapshot = availableSnapshot(grantedPermissions = emptySet()),
                requiredPermissions = setOf(PERMISSION_CAMERA),
            )

        val observation = fixture.bridge.discover(CAPABILITY_ID)
        val result =
            fixture.bridge.dispatch(command()) {
                authorizationCalls += 1
                ExecutionTargetAuthorizationDecision.AUTHORIZED_DEVICE_TARGET
            }

        assertEquals(NativeCapabilityAvailability.PRECONDITION_REQUIRED, observation.availability)
        assertEquals(setOf(PERMISSION_CAMERA), observation.missingPermissions)
        assertEquals(NativeDispatchRejection.PRECONDITION_REQUIRED, rejected(result).reason)
        assertEquals(0, authorizationCalls)
        assertEquals(0, fixture.handlerCalls())
    }

    @Test
    fun `device target denial cannot be bypassed by available capability`() {
        val fixture = fixture()

        val result =
            fixture.bridge.dispatch(command()) {
                ExecutionTargetAuthorizationDecision.NOT_AUTHORIZED
            }

        assertEquals(NativeDispatchRejection.TARGET_NOT_AUTHORIZED, rejected(result).reason)
        assertEquals(0, fixture.handlerCalls())
    }

    @Test
    fun `stale ambiguous and wrong target decisions are normalized without dispatch`() {
        val decisions =
            listOf(
                ExecutionTargetAuthorizationDecision.STALE_TARGET to NativeDispatchRejection.TARGET_STALE,
                ExecutionTargetAuthorizationDecision.AMBIGUOUS_TARGET to NativeDispatchRejection.TARGET_AMBIGUOUS,
                ExecutionTargetAuthorizationDecision.WRONG_TARGET to NativeDispatchRejection.TARGET_WRONG_KIND,
            )

        decisions.forEach { (decision, expected) ->
            val fixture = fixture()
            val result = fixture.bridge.dispatch(command()) { decision }

            assertEquals(expected, rejected(result).reason)
            assertEquals(0, fixture.handlerCalls())
        }
    }

    @Test
    fun `handler failures are normalized without inventing retry authority`() {
        val fixture = fixture(handlerResult = NativeHandlerResult.Failure("native_busy"))

        val result =
            fixture.bridge.dispatch(command()) {
                ExecutionTargetAuthorizationDecision.AUTHORIZED_DEVICE_TARGET
            }

        val rejection = rejected(result)
        assertEquals(NativeDispatchRejection.HANDLER_REJECTED, rejection.reason)
        assertEquals("native_busy", rejection.handlerCode)
        assertEquals(1, fixture.handlerCalls())
    }

    @Test
    fun `duplicate capability registration is rejected`() {
        val first = NativeCapabilityRegistration(binding()) { NativeHandlerResult.Success() }
        val second = NativeCapabilityRegistration(binding()) { NativeHandlerResult.Success() }

        val failure =
            runCatching {
                NativeCapabilityBridge(
                    registrations = listOf(first, second),
                    runtimeProbe = NativeRuntimeProbe { availableSnapshot() },
                    nowMs = { NOW_MS },
                )
            }.exceptionOrNull()

        assertTrue(failure is IllegalArgumentException)
    }

    private fun fixture(
        snapshot: NativeRuntimeSnapshot = availableSnapshot(),
        minApiLevel: Int = 26,
        requiredFeatures: Set<String> = emptySet(),
        requiredPermissions: Set<String> = emptySet(),
        handlerResult: NativeHandlerResult = NativeHandlerResult.Success(mapOf("status" to "ok")),
    ): Fixture {
        var handlerCalls = 0
        val registration =
            NativeCapabilityRegistration(
                binding =
                    binding(
                        minApiLevel = minApiLevel,
                        requiredFeatures = requiredFeatures,
                        requiredPermissions = requiredPermissions,
                    ),
                handler = NativeCapabilityHandler {
                    handlerCalls += 1
                    handlerResult
                },
            )
        val bridge =
            NativeCapabilityBridge(
                registrations = listOf(registration),
                runtimeProbe = NativeRuntimeProbe { snapshot },
                nowMs = { NOW_MS },
            )
        return Fixture(bridge) { handlerCalls }
    }

    private fun binding(
        minApiLevel: Int = 26,
        requiredFeatures: Set<String> = emptySet(),
        requiredPermissions: Set<String> = emptySet(),
    ): NativeCapabilityBinding =
        NativeCapabilityBinding(
            capabilityId = CAPABILITY_ID,
            minApiLevel = minApiLevel,
            requiredFeatures = requiredFeatures,
            requiredPermissions = requiredPermissions,
            maxSnapshotAgeMs = MAX_AGE_MS,
        )

    private fun command(capabilityId: String = CAPABILITY_ID): NativeCapabilityCommand =
        NativeCapabilityCommand(
            requestId = "req-w15c-1",
            capabilityId = capabilityId,
            arguments = mapOf("fixture" to "camera"),
        )

    private fun availableSnapshot(
        observedAtMs: Long = NOW_MS - 1,
        apiLevel: Int = 36,
        availableFeatures: Set<String> = setOf(FEATURE_CAMERA),
        grantedPermissions: Set<String> = setOf(PERMISSION_CAMERA),
    ): NativeRuntimeSnapshot =
        NativeRuntimeSnapshot(
            observedAtMs = observedAtMs,
            apiLevel = apiLevel,
            availableFeatures = availableFeatures,
            grantedPermissions = grantedPermissions,
        )

    private fun rejected(result: NativeDispatchResult): NativeDispatchResult.Rejected {
        assertTrue(result is NativeDispatchResult.Rejected)
        return result as NativeDispatchResult.Rejected
    }

    private data class Fixture(
        val bridge: NativeCapabilityBridge,
        val handlerCalls: () -> Int,
    )

    companion object {
        private const val CAPABILITY_ID = "aurora.test.camera.capture.v1"
        private const val FEATURE_CAMERA = "android.hardware.camera.any"
        private const val PERMISSION_CAMERA = "android.permission.CAMERA"
        private const val NOW_MS = 1_000_000L
        private const val MAX_AGE_MS = 30_000L
    }
}
