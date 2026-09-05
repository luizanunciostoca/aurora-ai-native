package ai.aurora.device.network

import ai.aurora.device.security.DeviceSigningKeyStore
import ai.aurora.device.security.PublicDeviceKeyMaterial
import ai.aurora.device.session.SecureDeviceSessionClient
import java.nio.charset.StandardCharsets
import java.util.Base64

internal interface DeviceProofKeySource {
    fun currentOrCreate(): PublicDeviceKeyMaterial

    fun sign(alias: String, payload: ByteArray): ByteArray
}

internal class W15BDeviceProofKeySource(
    private val sessionClient: SecureDeviceSessionClient,
    private val keyStore: DeviceSigningKeyStore,
) : DeviceProofKeySource {
    override fun currentOrCreate(): PublicDeviceKeyMaterial = sessionClient.prepareRegistrationKey()

    override fun sign(alias: String, payload: ByteArray): ByteArray = keyStore.sign(alias, payload)
}

internal fun interface DeviceProofFactory {
    fun sign(message: String): String
}

internal class Es256DeviceProofEnvelopeFactory(
    private val keySource: DeviceProofKeySource,
) : DeviceProofFactory {
    override fun sign(message: String): String {
        require(message.isNotEmpty() && message.length <= MAX_MESSAGE_CHARS) {
            "device proof message exceeds bound"
        }
        val publicMaterial = keySource.currentOrCreate()
        require(publicMaterial.algorithm.equals("EC", ignoreCase = true)) {
            "device proof key must be EC"
        }
        val signature = keySource.sign(
            publicMaterial.alias,
            message.toByteArray(StandardCharsets.UTF_8),
        )
        require(signature.isNotEmpty() && signature.size <= MAX_SIGNATURE_BYTES) {
            "device proof signature exceeds bound"
        }
        val signatureBase64Url = BASE64_URL.encodeToString(signature)
        val envelope = StrictJson.encodeObject(
            listOf(
                "v" to "1",
                "alg" to "ES256",
                "spki" to publicMaterial.publicKeySpkiBase64Url,
                "signature" to signatureBase64Url,
            ),
        )
        val encoded = BASE64_URL.encodeToString(envelope.toByteArray(StandardCharsets.UTF_8))
        require(encoded.length <= MAX_ENVELOPE_CHARS) { "device proof envelope exceeds bound" }
        return encoded
    }

    private companion object {
        const val MAX_MESSAGE_CHARS = 4096
        const val MAX_SIGNATURE_BYTES = 160
        const val MAX_ENVELOPE_CHARS = 4096
        val BASE64_URL: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()
    }
}
