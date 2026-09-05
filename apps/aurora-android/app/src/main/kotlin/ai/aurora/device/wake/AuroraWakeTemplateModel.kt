package ai.aurora.device.wake

import kotlin.math.sqrt

data class WakeFeatureVector(val values: List<Double>) {
    init {
        require(values.size == DIMENSIONS) { "wake feature vector must have $DIMENSIONS dimensions" }
        require(values.all { it.isFinite() })
    }

    fun normalized(): WakeFeatureVector {
        val magnitude = sqrt(values.sumOf { it * it })
        require(magnitude > 1e-9) { "wake feature vector must not be silent/zero" }
        return WakeFeatureVector(values.map { it / magnitude })
    }

    companion object {
        const val DIMENSIONS = 24
    }
}

data class AuroraWakeTemplateModel(
    val modelVersion: String,
    val languageTag: String = "pt-BR",
    val keyword: String = "Aurora",
    val templates: List<WakeFeatureVector>,
) {
    init {
        require(modelVersion.isNotBlank() && modelVersion.length <= 64)
        require(languageTag == "pt-BR")
        require(keyword == "Aurora")
        require(templates.size in 3..12) { "enrollment requires 3..12 local templates" }
    }

    /** Returns max cosine similarity. Only derived features are consumed; no raw audio is retained. */
    fun confidence(candidate: WakeFeatureVector): Double {
        val normalizedCandidate = candidate.normalized()
        return templates.maxOf { template ->
            val normalizedTemplate = template.normalized()
            normalizedCandidate.values.indices.sumOf { index ->
                normalizedCandidate.values[index] * normalizedTemplate.values[index]
            }.coerceIn(-1.0, 1.0)
        }.coerceAtLeast(0.0)
    }
}
