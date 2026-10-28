package ai.aurora.device.wake

import java.util.Base64
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraWakeModelStoreTest {
    private val keyBytes = ByteArray(32) { index -> (index + 1).toByte() }
    private val key = SecretKeySpec(keyBytes, "AES")

    @Test
    fun `codec round trips the exact derived model shape`() {
        val model = sampleModel()
        val encoded = AuroraWakeModelCodec.encode(model)
        val decoded = AuroraWakeModelCodec.decode(encoded)

        assertEquals(model, decoded)
        assertEquals(6, encoded.lineSequence().filter { it.isNotBlank() }.count())
    }

    @Test
    fun `aead envelope survives protector recreation with the same key`() {
        val payload = AuroraWakeModelCodec.encode(sampleModel())
        val firstProcess = AesGcmWakeModelProtector { key }
        val envelope = firstProcess.seal(payload)
        val recreatedProcess = AesGcmWakeModelProtector { SecretKeySpec(keyBytes.copyOf(), "AES") }

        assertEquals(payload, recreatedProcess.open(envelope))
    }

    @Test
    fun `aead envelope fails closed after ciphertext or iv tampering`() {
        val payload = AuroraWakeModelCodec.encode(sampleModel())
        val protector = AesGcmWakeModelProtector { key }
        val envelope = protector.seal(payload)

        assertNull(protector.open(envelope.copy(ciphertextBase64 = mutate(envelope.ciphertextBase64))))
        assertNull(protector.open(envelope.copy(ivBase64 = mutate(envelope.ivBase64))))
    }

    @Test
    fun `aead envelope cannot be opened with a different key`() {
        val payload = AuroraWakeModelCodec.encode(sampleModel())
        val envelope = AesGcmWakeModelProtector { key }.seal(payload)
        val otherKey = SecretKeySpec(ByteArray(32) { 0x5A.toByte() }, "AES")

        assertNull(AesGcmWakeModelProtector { otherKey }.open(envelope))
    }

    private fun mutate(value: String): String {
        val bytes = Base64.getDecoder().decode(value)
        bytes[0] = (bytes[0].toInt() xor 0x01).toByte()
        return Base64.getEncoder().encodeToString(bytes)
    }

    private fun sampleModel(): AuroraWakeTemplateModel =
        AuroraWakeTemplateModel(
            modelVersion = "aurora-wake-local-v1",
            templates =
                (1..3).map { template ->
                    WakeFeatureVector(List(WakeFeatureVector.DIMENSIONS) { index -> (template * (index + 1)).toDouble() })
                },
        )
}
