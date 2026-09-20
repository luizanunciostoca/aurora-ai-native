package ai.aurora.device.executor

import java.math.BigInteger
import java.security.SecureRandom

/**
 * Local canonical ULID factory for W15 receipt/evidence identifiers.
 *
 * IDs carry time + cryptographic randomness only. They contain no authority, tenant secret,
 * biometric material, device key or retry state.
 */
class CanonicalLocalEvidenceIdFactory(
    private val random: SecureRandom = SecureRandom(),
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    fun receiptId(): String = "rcp_${ulid()}"

    fun evidenceId(): String = "evd_${ulid()}"

    private fun ulid(): String {
        val timestamp = nowMs()
        require(timestamp in 0..MAX_ULID_TIMESTAMP) { "ULID timestamp is out of range" }
        val bytes = ByteArray(16)
        for (index in 0 until 6) {
            val shift = (5 - index) * 8
            bytes[index] = ((timestamp ushr shift) and 0xff).toByte()
        }
        val randomness = ByteArray(10)
        random.nextBytes(randomness)
        randomness.copyInto(bytes, destinationOffset = 6)

        var value = BigInteger(1, bytes)
        val output = CharArray(26)
        for (index in output.indices.reversed()) {
            output[index] = CROCKFORD[value.and(BASE32_MASK).toInt()]
            value = value.shiftRight(5)
        }
        check(value == BigInteger.ZERO) { "ULID encoding overflow" }
        return output.concatToString()
    }

    private companion object {
        const val MAX_ULID_TIMESTAMP = 0xFFFFFFFFFFFFL
        const val CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
        val BASE32_MASK: BigInteger = BigInteger.valueOf(31)
    }
}
