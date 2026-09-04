package ai.aurora.device.session

import ai.aurora.device.lifecycle.AppVisibility
import ai.aurora.device.lifecycle.LocalServicePhase
import ai.aurora.device.lifecycle.PresenceSnapshot
import ai.aurora.device.lifecycle.ProcessPhase
import org.junit.Assert.assertEquals
import org.junit.Test

class SessionLifecycleHooksTest {
    @Test
    fun `restart signal contains lifecycle metadata only`() {
        val observations = mutableListOf<SessionLifecycleObservation>()
        val hooks = SessionLifecycleHooks { observations += it }
        val restarted =
            PresenceSnapshot(
                processPhase = ProcessPhase.RUNNING,
                visibility = AppVisibility.BACKGROUND,
                localServicePhase = LocalServicePhase.STOPPED,
                processGeneration = 2,
                transitionSequence = 8,
            )

        hooks.publish(null, restarted)

        assertEquals(1, observations.size)
        assertEquals(SessionLifecycleSignal.PROCESS_RESTARTED, observations.single().signal)
        assertEquals(2L, observations.single().processGeneration)
        assertEquals(8L, observations.single().transitionSequence)
    }

    @Test
    fun `unchanged presence produces no observation`() {
        val observations = mutableListOf<SessionLifecycleObservation>()
        val hooks = SessionLifecycleHooks { observations += it }
        val snapshot =
            PresenceSnapshot(
                processPhase = ProcessPhase.RUNNING,
                visibility = AppVisibility.BACKGROUND,
                localServicePhase = LocalServicePhase.STOPPED,
                processGeneration = 1,
                transitionSequence = 1,
            )

        hooks.publish(snapshot, snapshot)

        assertEquals(emptyList<SessionLifecycleObservation>(), observations)
    }
}
