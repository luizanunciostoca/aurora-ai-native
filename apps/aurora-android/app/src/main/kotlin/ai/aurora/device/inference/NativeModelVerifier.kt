package ai.aurora.device.inference

import java.security.MessageDigest

/**
 * Streaming verifier for an already-open app-private file. Default identity is fixed, never supplied
 * by an inference request. The explicit constructor values exist for small JVM verifier fixtures;
 * they do not attest a real model, Android sandbox or an authorized production composition.
 */
internal class NativeModelVerifier(
    private val expectedLengthBytes: Long = NativePinnedModel.LENGTH_BYTES,
    private val expectedSha256: String = NativePinnedModel.SHA256,
) {
    fun verify(model: NativeModelHandle, stop: NativeStopSignal): NativeModelVerification {
        if (expectedLengthBytes < 8 || !SHA256_PATTERN.matches(expectedSha256)) {
            return NativeModelVerification.INVALID
        }
        return try {
            if (stop.isStopped()) return NativeModelVerification.STOPPED
            val before = model.stamp()
            if (
                !before.regularFile || !before.readOnlyDescriptor || !before.ownedByApp ||
                    before.lengthBytes != expectedLengthBytes || model.descriptor < 0
            ) {
                return NativeModelVerification.INVALID
            }
            val digest = MessageDigest.getInstance("SHA-256")
            var count = 0L
            val header = ByteArray(8)
            val buffer = ByteArray(65_536)
            model.openHashStream().use { stream ->
                while (true) {
                    if (stop.isStopped()) return NativeModelVerification.STOPPED
                    val read = stream.read(buffer)
                    if (read == -1) break
                    // A non-progressing/unbounded stream cannot manufacture a successful digest.
                    if (read <= 0 || read > expectedLengthBytes - count) {
                        return NativeModelVerification.INVALID
                    }
                    if (count < header.size) {
                        val headerBytes = minOf(read, header.size - count.toInt())
                        buffer.copyInto(header, count.toInt(), 0, headerBytes)
                    }
                    digest.update(buffer, 0, read)
                    count += read
                }
            }
            if (stop.isStopped()) return NativeModelVerification.STOPPED
            val after = model.stamp()
            if (before != after || count != expectedLengthBytes || !validHeader(header)) {
                return NativeModelVerification.INVALID
            }
            val expected = expectedSha256.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            if (!MessageDigest.isEqual(digest.digest(), expected)) {
                return NativeModelVerification.INVALID
            }
            if (stop.isStopped()) NativeModelVerification.STOPPED else NativeModelVerification.VERIFIED
        } catch (_: Exception) {
            // Do not propagate filenames, prompt content, exception messages or private paths.
            NativeModelVerification.UNAVAILABLE
        }
    }

    private fun validHeader(header: ByteArray): Boolean =
        header[0] == 'G'.code.toByte() && header[1] == 'G'.code.toByte() &&
            header[2] == 'U'.code.toByte() && header[3] == 'F'.code.toByte() &&
            header[4] == 3.toByte() && header[5] == 0.toByte() &&
            header[6] == 0.toByte() && header[7] == 0.toByte()

    private companion object {
        val SHA256_PATTERN = Regex("[0-9a-f]{64}")
    }
}
