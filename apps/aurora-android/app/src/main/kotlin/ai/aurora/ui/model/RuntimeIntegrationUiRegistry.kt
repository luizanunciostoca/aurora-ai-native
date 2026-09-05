package ai.aurora.ui.model

import java.util.concurrent.atomic.AtomicReference

/**
 * Process-local presentation hook for fresh runtime integration snapshots.
 *
 * The provider is presentation-only. It cannot grant authority and failure to read a provider
 * returns the default fail-closed [RuntimeIntegrationUiState].
 */
object RuntimeIntegrationUiRegistry {
    private val providerRef = AtomicReference<(() -> RuntimeIntegrationUiState)?>(null)

    fun install(provider: () -> RuntimeIntegrationUiState) {
        providerRef.set(provider)
    }

    fun snapshot(): RuntimeIntegrationUiState =
        runCatching { providerRef.get()?.invoke() }
            .getOrNull()
            ?: RuntimeIntegrationUiState()

    fun clear() {
        providerRef.set(null)
    }
}
