package ai.aurora.device.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64

class AndroidKeystoreSigningKeyStore : DeviceSigningKeyStore {
    override fun ensureKey(alias: String): PublicDeviceKeyMaterial {
        require(alias.isNotBlank()) { "key alias must not be blank" }
        val keyStore = loadKeyStore()
        if (!keyStore.containsAlias(alias)) {
            generateKey(alias)
        }
        return publicMaterial(alias)
    }

    override fun rotateKey(alias: String): PublicDeviceKeyMaterial {
        delete(alias)
        generateKey(alias)
        return publicMaterial(alias)
    }

    override fun sign(alias: String, payload: ByteArray): ByteArray {
        val privateKey = loadKeyStore().getKey(alias, null) as? PrivateKey
            ?: throw MissingDeviceSigningKeyException(alias)
        return Signature.getInstance(SIGNATURE_ALGORITHM).run {
            initSign(privateKey)
            update(payload)
            sign()
        }
    }

    override fun contains(alias: String): Boolean = loadKeyStore().containsAlias(alias)

    override fun delete(alias: String) {
        val keyStore = loadKeyStore()
        if (keyStore.containsAlias(alias)) {
            keyStore.deleteEntry(alias)
        }
    }

    private fun generateKey(alias: String) {
        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEY_STORE)
        generator.initialize(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(ECGenParameterSpec(EC_CURVE))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(false)
                .build(),
        )
        generator.generateKeyPair()
    }

    private fun publicMaterial(alias: String): PublicDeviceKeyMaterial {
        val certificate = loadKeyStore().getCertificate(alias)
            ?: throw MissingDeviceSigningKeyException(alias)
        val encoded = certificate.publicKey.encoded
        val fingerprint = MessageDigest.getInstance("SHA-256").digest(encoded).toHex()
        return PublicDeviceKeyMaterial(
            alias = alias,
            algorithm = certificate.publicKey.algorithm,
            publicKeySpkiBase64Url = Base64.getUrlEncoder().withoutPadding().encodeToString(encoded),
            fingerprintSha256 = fingerprint,
        )
    }

    private fun loadKeyStore(): KeyStore =
        KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    private fun ByteArray.toHex(): String = joinToString(separator = "") { byte -> "%02x".format(byte) }

    private companion object {
        const val ANDROID_KEY_STORE = "AndroidKeyStore"
        const val EC_CURVE = "secp256r1"
        const val SIGNATURE_ALGORITHM = "SHA256withECDSA"
    }
}
