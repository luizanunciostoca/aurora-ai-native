package ai.aurora.device.verification

import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.config.RuntimeEnvironmentConfig
import ai.aurora.device.lifecycle.AppVisibility
import ai.aurora.device.lifecycle.LocalServicePhase
import ai.aurora.device.lifecycle.PresenceCheckpoint
import ai.aurora.device.lifecycle.PresenceCheckpointStore
import ai.aurora.device.lifecycle.PresenceEngine
import ai.aurora.device.lifecycle.PresenceEvent
import ai.aurora.device.lifecycle.PresenceReducer
import ai.aurora.device.lifecycle.PresenceSnapshot
import ai.aurora.device.lifecycle.PresenceTransition
import ai.aurora.device.lifecycle.ProcessPhase
import ai.aurora.device.session.SessionLifecycleHooks
import ai.aurora.device.session.SessionLifecycleSignal

private class MemoryCheckpointStore : PresenceCheckpointStore {
    var value: PresenceCheckpoint? = null

    override fun load(): PresenceCheckpoint? = value

    override fun save(checkpoint: PresenceCheckpoint) {
        value = checkpoint
    }
}

private fun PresenceTransition.requireApplied(): PresenceSnapshot =
    (this as? PresenceTransition.Applied)?.snapshot ?: error("expected Applied, got $this")

fun main() {
    val firstStart = PresenceReducer.reduce(null, PresenceEvent.ProcessStarted()).requireApplied()
    check(firstStart.processGeneration == 1L)
    check(firstStart.visibility == AppVisibility.BACKGROUND)
    check(firstStart.localServicePhase == LocalServicePhase.STOPPED)

    val foreground = PresenceReducer.reduce(firstStart, PresenceEvent.EnteredForeground).requireApplied()
    check(foreground.visibility == AppVisibility.FOREGROUND)
    val duplicateForeground = PresenceReducer.reduce(foreground, PresenceEvent.EnteredForeground)
    check(duplicateForeground is PresenceTransition.Applied && !duplicateForeground.changed)

    val impossibleServiceStart = PresenceReducer.reduce(foreground, PresenceEvent.ServiceStarted)
    check(impossibleServiceStart is PresenceTransition.Rejected)

    val starting = PresenceReducer.reduce(foreground, PresenceEvent.ServiceStarting).requireApplied()
    val running = PresenceReducer.reduce(starting, PresenceEvent.ServiceStarted).requireApplied()
    check(running.localServicePhase == LocalServicePhase.RUNNING)

    val stopped = PresenceReducer.reduce(running, PresenceEvent.ProcessStopping).requireApplied()
    check(stopped.processPhase == ProcessPhase.STOPPED)
    check(stopped.visibility == AppVisibility.NONE)
    check(stopped.localServicePhase == LocalServicePhase.STOPPED)

    val observations = mutableListOf<SessionLifecycleSignal>()
    val store = MemoryCheckpointStore()
    val firstProcess = PresenceEngine(store, SessionLifecycleHooks { observations += it.signal })
    firstProcess.apply(PresenceEvent.EnteredForeground)
    firstProcess.apply(PresenceEvent.ServiceStarting)
    firstProcess.apply(PresenceEvent.ServiceStarted)
    val beforeDeath = firstProcess.snapshot
    val secondProcess = PresenceEngine(store, SessionLifecycleHooks { observations += it.signal })
    check(secondProcess.snapshot.processGeneration == beforeDeath.processGeneration + 1)
    check(secondProcess.snapshot.visibility == AppVisibility.BACKGROUND)
    check(secondProcess.snapshot.localServicePhase == LocalServicePhase.STOPPED)
    check(secondProcess.snapshot.transitionSequence > beforeDeath.transitionSequence)
    check(observations.first() == SessionLifecycleSignal.PROCESS_STARTED)
    check(observations.contains(SessionLifecycleSignal.ENTERED_FOREGROUND))
    check(observations.last() == SessionLifecycleSignal.PROCESS_RESTARTED)

    RuntimeEnvironmentConfig(AuroraEnvironment.LOCAL, "http://10.0.2.2:8080", true)
    RuntimeEnvironmentConfig(AuroraEnvironment.STAGING, "https://staging.invalid", false)
    RuntimeEnvironmentConfig(AuroraEnvironment.PRODUCTION, "https://production.invalid", false)

    check(runCatching {
        RuntimeEnvironmentConfig(AuroraEnvironment.PRODUCTION, "http://production.invalid", true)
    }.isFailure)
    check(runCatching {
        RuntimeEnvironmentConfig(AuroraEnvironment.STAGING, "https://user:secret@staging.invalid", false)
    }.isFailure)
    check(runCatching {
        RuntimeEnvironmentConfig(AuroraEnvironment.LOCAL, "http://example.com", true)
    }.isFailure)

    println("W15-A fundamentals verification: PASS")
}
