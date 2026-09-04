package ai.aurora.device.lifecycle

import ai.aurora.device.session.SessionLifecycleHooks
import ai.aurora.device.session.SessionLifecycleSignal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PresenceReducerTest {
    @Test
    fun `process starts background with service stopped`() {
        val started = applied(PresenceReducer.reduce(null, PresenceEvent.ProcessStarted()))

        assertEquals(ProcessPhase.RUNNING, started.processPhase)
        assertEquals(AppVisibility.BACKGROUND, started.visibility)
        assertEquals(LocalServicePhase.STOPPED, started.localServicePhase)
        assertEquals(1L, started.processGeneration)
    }

    @Test
    fun `duplicate visibility transition is idempotent`() {
        val started = applied(PresenceReducer.reduce(null, PresenceEvent.ProcessStarted()))
        val foreground = applied(PresenceReducer.reduce(started, PresenceEvent.EnteredForeground))
        val duplicate = PresenceReducer.reduce(foreground, PresenceEvent.EnteredForeground)

        assertTrue(duplicate is PresenceTransition.Applied)
        duplicate as PresenceTransition.Applied
        assertFalse(duplicate.changed)
        assertEquals(foreground.transitionSequence, duplicate.snapshot.transitionSequence)
    }

    @Test
    fun `service running cannot be claimed before service starting`() {
        val started = applied(PresenceReducer.reduce(null, PresenceEvent.ProcessStarted()))
        val transition = PresenceReducer.reduce(started, PresenceEvent.ServiceStarted)

        assertTrue(transition is PresenceTransition.Rejected)
    }

    @Test
    fun `process restart resets volatile presence and advances generation`() {
        val started = applied(PresenceReducer.reduce(null, PresenceEvent.ProcessStarted()))
        val foreground = applied(PresenceReducer.reduce(started, PresenceEvent.EnteredForeground))
        val serviceStarting = applied(PresenceReducer.reduce(foreground, PresenceEvent.ServiceStarting))
        val serviceRunning = applied(PresenceReducer.reduce(serviceStarting, PresenceEvent.ServiceStarted))

        val restarted =
            applied(PresenceReducer.reduce(null, PresenceEvent.ProcessStarted(serviceRunning.checkpoint())))

        assertEquals(serviceRunning.processGeneration + 1, restarted.processGeneration)
        assertTrue(restarted.transitionSequence > serviceRunning.transitionSequence)
        assertEquals(AppVisibility.BACKGROUND, restarted.visibility)
        assertEquals(LocalServicePhase.STOPPED, restarted.localServicePhase)
    }

    @Test
    fun `engine restores checkpoint after simulated process death without claiming foreground`() {
        val store = MemoryCheckpointStore()
        val signals = mutableListOf<SessionLifecycleSignal>()
        val firstProcess = PresenceEngine(store, SessionLifecycleHooks { signals += it.signal })
        firstProcess.apply(PresenceEvent.EnteredForeground)
        val firstGeneration = firstProcess.snapshot.processGeneration

        val secondProcess = PresenceEngine(store, SessionLifecycleHooks { signals += it.signal })

        assertEquals(firstGeneration + 1, secondProcess.snapshot.processGeneration)
        assertEquals(AppVisibility.BACKGROUND, secondProcess.snapshot.visibility)
        assertEquals(LocalServicePhase.STOPPED, secondProcess.snapshot.localServicePhase)
        assertEquals(
            listOf(
                SessionLifecycleSignal.PROCESS_STARTED,
                SessionLifecycleSignal.ENTERED_FOREGROUND,
                SessionLifecycleSignal.PROCESS_RESTARTED,
            ),
            signals,
        )
    }

    @Test
    fun `stopped process rejects foreground transition`() {
        val started = applied(PresenceReducer.reduce(null, PresenceEvent.ProcessStarted()))
        val stopped = applied(PresenceReducer.reduce(started, PresenceEvent.ProcessStopping))

        assertTrue(PresenceReducer.reduce(stopped, PresenceEvent.EnteredForeground) is PresenceTransition.Rejected)
    }

    private fun applied(transition: PresenceTransition): PresenceSnapshot =
        (transition as PresenceTransition.Applied).snapshot

    private class MemoryCheckpointStore : PresenceCheckpointStore {
        private var checkpoint: PresenceCheckpoint? = null

        override fun load(): PresenceCheckpoint? = checkpoint

        override fun save(checkpoint: PresenceCheckpoint) {
            this.checkpoint = checkpoint
        }
    }
}
