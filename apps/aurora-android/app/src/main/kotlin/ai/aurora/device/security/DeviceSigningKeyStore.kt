package ai.aurora.device.security

data class PublicDeviceKeyMaterial(
    val alias: String,
    val algorithm: String,
    val publicKeySpkiBase64Url: String,
    val fingerprintSha256: String,
) {
    init {
        require(alias.isNotBlank()) { "key alias must not be blank" }
        require(algorithm.isNotBlank()) { "key algorithm must not be blank" }
        require(publicKeySpkiBase64Url.isNotBlank()) { "public key material must not be blank" }
        require(fingerprintSha256.isNotBlank()) { "public key fingerprint must not be blank" }
    }

    val authorizesExecution: Boolean
        get() = false
}

interface DeviceSigningKeyStore {
    fun ensureKey(alias: String): PublicDeviceKeyMaterial

    fun rotateKey(alias: String): PublicDeviceKeyMaterial

    fun sign(alias: String, payload: ByteArray): ByteArray

    fun contains(alias: String): Boolean

    fun delete(alias: String)
}

class MissingDeviceSigningKeyException(alias: String) :
    IllegalStateException("device signing key is missing for alias: $alias")
