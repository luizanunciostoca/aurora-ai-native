package ai.aurora.device.config

import java.net.URI

enum class AuroraEnvironment {
    LOCAL,
    STAGING,
    PRODUCTION,
}

data class RuntimeEnvironmentConfig(
    val environment: AuroraEnvironment,
    val gatewayOrigin: String,
    val allowCleartextTraffic: Boolean,
) {
    init {
        validate()
    }

    private fun validate() {
        val uri = runCatching { URI(gatewayOrigin) }.getOrElse {
            throw IllegalArgumentException("gateway origin must be a valid URI", it)
        }
        require(uri.isAbsolute) { "gateway origin must be absolute" }
        require(!uri.isOpaque) { "gateway origin must be hierarchical" }
        require(!uri.host.isNullOrBlank()) { "gateway origin must contain a host" }
        require(uri.rawUserInfo == null) { "gateway origin must not contain credentials" }
        require(uri.rawQuery == null && uri.rawFragment == null) {
            "gateway origin must not contain query or fragment"
        }
        require(uri.path.isNullOrEmpty() || uri.path == "/") { "gateway origin must not contain a path" }

        when (environment) {
            AuroraEnvironment.LOCAL -> {
                require(uri.scheme == "http" || uri.scheme == "https") { "local gateway must use http or https" }
                if (uri.scheme == "http") {
                    require(allowCleartextTraffic) { "local http requires explicit cleartext opt-in" }
                    require(uri.host in LOCAL_HTTP_HOSTS) { "cleartext local gateway host is not allowlisted" }
                }
            }
            AuroraEnvironment.STAGING,
            AuroraEnvironment.PRODUCTION,
            -> {
                require(uri.scheme == "https") { "non-local gateway must use https" }
                require(!allowCleartextTraffic) { "cleartext traffic is forbidden outside LOCAL" }
            }
        }
    }

    companion object {
        private val LOCAL_HTTP_HOSTS = setOf("10.0.2.2", "127.0.0.1", "localhost")

        fun fromBuildValues(
            environment: String,
            gatewayOrigin: String,
            allowCleartextTraffic: Boolean,
        ): RuntimeEnvironmentConfig =
            RuntimeEnvironmentConfig(
                environment = AuroraEnvironment.valueOf(environment),
                gatewayOrigin = gatewayOrigin,
                allowCleartextTraffic = allowCleartextTraffic,
            )
    }
}
