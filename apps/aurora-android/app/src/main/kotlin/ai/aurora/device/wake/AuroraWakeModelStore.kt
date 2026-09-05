package ai.aurora.device.wake

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey

/** Persists derived enrollment features only. Raw PCM is never written to disk. */
class AuroraWakeModelStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val integrity = AndroidKeystoreWakeModelIntegrity()

    fun save(model: AuroraWakeTemplateModel) {
        val payload = encode(model)
        val signature = integrity.sign(payload)
        check(
            preferences.edit()
                .putString(KEY_PAYLOAD, payload)
                .putString(KEY_SIGNATURE, signature)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .commit(),
        ) { "failed to persist wake model" }
    }

    fun load(): AuroraWakeTemplateModel? {
        val payload = preferences.getString(KEY_PAYLOAD, null) ?: return null
        val signature = preferences.getString(KEY_SIGNATURE, null) ?: return null
        if (!integrity.verify(payload, signature)) return null
        return runCatching { decode(payload) }.getOrNull()
    }

    fun hasValidModel(): Boolean = load() != null

    fun clear() {
        preferences.edit().clear().commit()
    }

    fun updatedAtMs(): Long = preferences.getLong(KEY_UPDATED_AT, 0L)

    private fun encode(model: AuroraWakeTemplateModel): String = buildString {
        append(model.modelVersion).append('\n')
        append(model.languageTag).append('\n')
        append(model.keyword).append('\n')
        model.templates.forEach { vector ->
            append(vector.values.joinToString(",") { value -> "%.12f".format(java.util.Locale.US, value) })
            append('\n')
        }
    }

    private fun decode(payload: String): AuroraWakeTemplateModel {
        val lines = payload.lineSequence().filter { it.isNotBlank() }.toList()
        require(lines.size in 6..15) { "invalid wake model payload" }
        val version = lines[0]
        val language = lines[1]
        val keyword = lines[2]
        val templates = lines.drop(3).map { line ->
            val values = line.split(',').map(String::toDouble)
            WakeFeatureVector(values)
        }
        return AuroraWakeTemplateModel(
            modelVersion = version,
            languageTag = language,
            keyword = keyword,
            templates = templates,
        )
    }

    companion object {
        private const val PREFERENCES = "aurora.wake.model.v1"
        private const val KEY_PAYLOAD = "payload"
        private const val KEY_SIGNATURE = "signature"
        private const val KEY_UPDATED_AT = "updated_at_ms"
    }
}

private class AndroidKeystoreWakeModelIntegrity {
    fun sign(payload: String): String {
        val mac = Mac.getInstance(ALGORITHM)
        mac.init(key())
        val bytes = mac.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    fun verify(payload: String, encodedSignature: String): Boolean {
        val actual = runCatching { Base64.decode(encodedSignature, Base64.NO_WRAP) }.getOrNull() ?: return false
        val mac = Mac.getInstance(ALGORITHM)
        mac.init(key())
        val expected = mac.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
        return java.security.MessageDigest.isEqual(expected, actual)
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
            )
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "aurora.wake.model.integrity.v1"
        private const val ALGORITHM = "HmacSHA256"
    }
}
