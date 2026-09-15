package ai.aurora.device.wake

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Persists derived enrollment features only. Raw PCM is never written to disk. */
class AuroraWakeModelStore(context: Context) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val legacyPreferences =
        appContext.getSharedPreferences(LEGACY_PREFERENCES, Context.MODE_PRIVATE)
    private val protector =
        AesGcmWakeModelProtector(AndroidKeystoreWakeModelKeyProvider::getOrCreate)

    fun save(model: AuroraWakeTemplateModel) {
        val payload = AuroraWakeModelCodec.encode(model)
        val envelope = protector.seal(payload)
        check(
            preferences
                .edit()
                .putInt(KEY_SCHEMA_VERSION, SCHEMA_VERSION)
                .putString(KEY_IV, envelope.ivBase64)
                .putString(KEY_CIPHERTEXT, envelope.ciphertextBase64)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .commit(),
        ) { "failed to persist wake model" }
        check(legacyPreferences.edit().clear().commit()) { "failed to clear legacy wake model" }
    }

    fun load(): AuroraWakeTemplateModel? {
        if (preferences.getInt(KEY_SCHEMA_VERSION, 0) != SCHEMA_VERSION) return null
        val iv = preferences.getString(KEY_IV, null) ?: return null
        val ciphertext = preferences.getString(KEY_CIPHERTEXT, null) ?: return null
        if (iv.length !in 16..64 || ciphertext.length !in 24..32_768) return null
        val payload = protector.open(WakeModelEnvelope(iv, ciphertext)) ?: return null
        return runCatching { AuroraWakeModelCodec.decode(payload) }.getOrNull()
    }

    fun hasValidModel(): Boolean = load() != null

    fun clear() {
        val currentCleared = preferences.edit().clear().commit()
        val legacyCleared = legacyPreferences.edit().clear().commit()
        check(currentCleared && legacyCleared) { "failed to clear wake model" }
    }

    fun updatedAtMs(): Long = preferences.getLong(KEY_UPDATED_AT, 0L)

    companion object {
        private const val PREFERENCES = "aurora.wake.model.v2"
        private const val LEGACY_PREFERENCES = "aurora.wake.model.v1"
        private const val SCHEMA_VERSION = 2
        private const val KEY_SCHEMA_VERSION = "schema_version"
        private const val KEY_IV = "iv"
        private const val KEY_CIPHERTEXT = "ciphertext"
        private const val KEY_UPDATED_AT = "updated_at_ms"
    }
}

internal object AuroraWakeModelCodec {
    fun encode(model: AuroraWakeTemplateModel): String =
        buildString {
            append(model.modelVersion).append('\n')
            append(model.languageTag).append('\n')
            append(model.keyword).append('\n')
            model.templates.forEach { vector ->
                append(
                    vector.values.joinToString(",") { value ->
                        "%.12f".format(java.util.Locale.US, value)
                    },
                )
                append('\n')
            }
        }

    fun decode(payload: String): AuroraWakeTemplateModel {
        val lines = payload.lineSequence().filter { it.isNotBlank() }.toList()
        require(lines.size in 6..15) { "invalid wake model payload" }
        val templates = lines.drop(3).map { line -> WakeFeatureVector(line.split(',').map(String::toDouble)) }
        return AuroraWakeTemplateModel(
            modelVersion = lines[0],
            languageTag = lines[1],
            keyword = lines[2],
            templates = templates,
        )
    }
}

internal data class WakeModelEnvelope(
    val ivBase64: String,
    val ciphertextBase64: String,
)

/**
 * AEAD protection for derived wake templates. This is local model integrity/confidentiality only;
 * it does not grant Aurora execution authority, retry permission, or physical acceptance.
 */
internal class AesGcmWakeModelProtector(
    private val keyProvider: () -> SecretKey,
) {
    fun seal(payload: String): WakeModelEnvelope {
        val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, keyProvider())
        cipher.updateAAD(AAD)
        val iv = cipher.iv
        require(iv.size == GCM_IV_BYTES) { "unexpected GCM IV length" }
        val ciphertext = cipher.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
        return WakeModelEnvelope(
            ivBase64 = ENCODER.encodeToString(iv),
            ciphertextBase64 = ENCODER.encodeToString(ciphertext),
        )
    }

    fun open(envelope: WakeModelEnvelope): String? =
        runCatching {
            val iv = DECODER.decode(envelope.ivBase64)
            require(iv.size == GCM_IV_BYTES) { "invalid GCM IV length" }
            val ciphertext = DECODER.decode(envelope.ciphertextBase64)
            val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                keyProvider(),
                GCMParameterSpec(GCM_TAG_BITS, iv),
            )
            cipher.updateAAD(AAD)
            String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
        }.getOrNull()

    companion object {
        private const val CIPHER_TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_BITS = 128
        private const val GCM_IV_BYTES = 12
        private val AAD = "aurora.wake.model.aead.v2".toByteArray(StandardCharsets.UTF_8)
        private val ENCODER = Base64.getEncoder()
        private val DECODER = Base64.getDecoder()
    }
}

private object AndroidKeystoreWakeModelKeyProvider {
    @Synchronized
    fun getOrCreate(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private const val KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "aurora.wake.model.aead.v2"
}
