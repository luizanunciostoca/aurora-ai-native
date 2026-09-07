package ai.aurora.device.network

import ai.aurora.device.security.PublicDeviceKeyMaterial
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64

class DeviceProofEnvelopeFactoryTest {
    @Test
    fun `proof envelope is canonical ES256 over the exact W14 message`() {
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec("secp256r1"))
        val pair = generator.generateKeyPair()
        val spki = pair.public.encoded
        val keySource = object : DeviceProofKeySource {
            override fun currentOrCreate(): PublicDeviceKeyMaterial =
                PublicDeviceKeyMaterial(
                    alias = "test-key",
                    algorithm = "EC",
                    publicKeySpkiBase64Url = Base64.getUrlEncoder().withoutPadding().encodeToString(spki),
                    fingerprintSha256 = MessageDigest.getInstance("SHA-256").digest(spki).toHex(),
                )

            override fun sign(alias: String, payload: ByteArray): ByteArray {
                assertEquals("test-key", alias)
                return Signature.getInstance("SHA256withECDSA").run {
                    initSign(pair.private)
                    update(payload)
                    sign()
                }
            }
        }
        val message = "AURORA_DEVICE_REGISTRATION_V1\ngws_1\nconn_1\n1\ndvc_1\nten_1\nidn_1\ncor_1"
        val proof = Es256DeviceProofEnvelopeFactory(keySource).sign(message)

        val envelopeJson = String(Base64.getUrlDecoder().decode(proof), Charsets.UTF_8)
        val envelope = StrictJson.parseObject(envelopeJson)
        assertEquals("1", envelope.jsonString("v"))
        assertEquals("ES256", envelope.jsonString("alg"))
        assertEquals(Base64.getUrlEncoder().withoutPadding().encodeToString(spki), envelope.jsonString("spki"))

        val signature = Base64.getUrlDecoder().decode(envelope.jsonString("signature"))
        val verified = Signature.getInstance("SHA256withECDSA").run {
            initVerify(pair.public)
            update(message.toByteArray())
            verify(signature)
        }
        assertTrue(verified)
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
