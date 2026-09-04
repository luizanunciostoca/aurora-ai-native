package ai.aurora.device.capability

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeCapabilityBridgeTest {
    @Test
    fun `ready resolution is a non executable fresh binding projection`() {
        val bridge = fixture()

        val result = bridge.resolve(CAPABILITY_ID)

        assertTrue(result is NativeCapabilityResolution.Ready)
        result as NativeCapabilityResolution.Ready
        assertEquals(CAPABILITY_ID, result.binding.capabilityId)
        assertTrue(result.observation.isAvailable)
        assertEquals(NativeCapabilityAvailability.AVAILABLE, result.observation.availability)
    }

    @Test
    fun `unknown capability fails closed without probing`() {
        var probeCalls = 0
        val bridge =
            NativeCapabilityBridge(
                bindings = listOf(binding()),
                runtimeProbe = NativeRuntimeProbe {
                    probeCalls += 1
                    availableSnapshot()
                },
                nowMs = { NOW_MS },
            )

        val observation = bridge.discover("aurora.test.unknown.v1")
        val resolution = bridge.resolve("aurora.test.unknown.v1")

        assertEquals(NativeCapabilityAvailability.UNKNOWN_CAPABILITY, observation.availability)
        assertEquals(
            NativeCapabilityAvailability.UNKNOWN_CAPABILITY,
            rejected(resolution).observation.availability,
        )
        assertEquals(0, probeCalls)
    }

    @Test
    fun `stale runtime state rejects resolution at exact expiry boundary`() {
        val bridge = fixture(snapshot = availableSnapshot(observedAtMs = NOW_MS - MAX_AGE_MS))

        val result = bridge.resolve(CAPABILITY_ID)

        assertEquals(
            NativeCapabilityAvailability.STALE_RUNTIME_STATE,
            rejected(result).observation.availability,
        )
    }

    @Test
    fun `runtime state remains available immediately before expiry boundary`() {
        val bridge = fixture(snapshot = availableSnapshot(observedAtMs = NOW_MS - MAX_AGE_MS + 1))

        val result = bridge.resolve(CAPABILITY_ID)

        assertTrue(result is NativeCapabilityResolution.Ready)
    }

    @Test
    fun `future runtime observation fails closed as stale`() {
        val bridge = fixture(snapshot = availableSnapshot(observedAtMs = NOW_MS + 1))

        val observation = bridge.discover(CAPABILITY_ID)

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
            lowApi.discover(CAPABILITY_ID).availability,
        )
        val featureObservation = missingFeature.discover(CAPABILITY_ID)
        assertEquals(NativeCapabilityAvailability.UNSUPPORTED_FEATURE, featureObservation.availability)
        assertEquals(setOf(FEATURE_CAMERA), featureObservation.missingFeatures)
    }

    @Test
    fun `missing runtime permission is only a precondition`() {
        val bridge =
            fixture(
                snapshot = availableSnapshot(grantedPermissions = emptySet()),
                requiredPermissions = setOf(PERMISSION_CAMERA),
            )

        val observation = bridge.discover(CAPABILITY_ID)
        val resolution = bridge.resolve(CAPABILITY_ID)

        assertEquals(NativeCapabilityAvailability.PRECONDITION_REQUIRED, observation.availability)
        assertEquals(setOf(PERMISSION_CAMERA), observation.missingPermissions)
        assertEquals(
            NativeCapabilityAvailability.PRECONDITION_REQUIRED,
            rejected(resolution).observation.availability,
        )
    }

    @Test
    fun `permission drift is re observed on every resolution`() {
        var granted = true
        val bridge =
            NativeCapabilityBridge(
                bindings = listOf(binding(requiredPermissions = setOf(PERMISSION_CAMERA))),
                runtimeProbe = NativeRuntimeProbe {
                    availableSnapshot(
                        observedAtMs = NOW_MS - 1,
                        grantedPermissions = if (granted) setOf(PERMISSION_CAMERA) else emptySet(),
                    )
                },
                nowMs = { NOW_MS },
            )

        assertTrue(bridge.resolve(CAPABILITY_ID) is NativeCapabilityResolution.Ready)
        granted = false

        val afterRevocation = bridge.resolve(CAPABILITY_ID)
        assertEquals(
            NativeCapabilityAvailability.PRECONDITION_REQUIRED,
            rejected(afterRevocation).observation.availability,
        )
    }

    @Test
    fun `discover all is deterministic by capability id`() {
        val alpha = binding(capabilityId = "aurora.test.alpha.v1")
        val camera = binding()
        val zeta = binding(capabilityId = "aurora.test.zeta.v1")
        val bridge =
            NativeCapabilityBridge(
                bindings = listOf(zeta, camera, alpha),
                runtimeProbe = NativeRuntimeProbe { availableSnapshot() },
                nowMs = { NOW_MS },
            )

        assertEquals(
            listOf("aurora.test.alpha.v1", CAPABILITY_ID, "aurora.test.zeta.v1"),
            bridge.discoverAll().map { it.capabilityId },
        )
    }

    @Test
    fun `duplicate capability registration is rejected`() {
        val failure =
            runCatching {
                NativeCapabilityBridge(
                    bindings = listOf(binding(), binding()),
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
    ): NativeCapabilityBridge =
        NativeCapabilityBridge(
            bindings =
                listOf(
                    binding(
                        minApiLevel = minApiLevel,
                        requiredFeatures = requiredFeatures,
                        requiredPermissions = requiredPermissions,
                    ),
                ),
            runtimeProbe = NativeRuntimeProbe { snapshot },
            nowMs = { NOW_MS },
        )

    private fun binding(
        capabilityId: String = CAPABILITY_ID,
        minApiLevel: Int = 26,
        requiredFeatures: Set<String> = emptySet(),
        requiredPermissions: Set<String> = emptySet(),
    ): NativeCapabilityBinding =
        NativeCapabilityBinding(
            capabilityId = capabilityId,
            minApiLevel = minApiLevel,
            requiredFeatures = requiredFeatures,
            requiredPermissions = requiredPermissions,
            maxSnapshotAgeMs = MAX_AGE_MS,
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

    private fun rejected(result: NativeCapabilityResolution): NativeCapabilityResolution.Rejected {
        assertTrue(result is NativeCapabilityResolution.Rejected)
        return result as NativeCapabilityResolution.Rejected
    }

    companion object {
        private const val CAPABILITY_ID = "aurora.test.camera.capture.v1"
        private const val FEATURE_CAMERA = "android.hardware.camera.any"
        private const val PERMISSION_CAMERA = "android.permission.CAMERA"
        private const val NOW_MS = 1_000_000L
        private const val MAX_AGE_MS = 30_000L
    }
}
