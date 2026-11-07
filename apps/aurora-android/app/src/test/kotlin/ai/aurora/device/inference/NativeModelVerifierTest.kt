package ai.aurora.device.inference

import java.io.ByteArrayInputStream
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.security.MessageDigest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/** Small header/hash fixtures only: these tests never load a model, Android file, or JNI library. */
class NativeModelVerifierTest {
    @Test
    fun verifiesPinnedFixtureAndClosesOnlyTheHashDuplicate() {
        val bytes = fixture()
        val before = bytes.copyOf()
        val model = handle(bytes)

        assertEquals(NativeModelVerification.VERIFIED, verifier(bytes).verify(model, running()))
        assertEquals(2, model.stampCalls)
        assertEquals(1, model.streamOpens)
        assertEquals(1, model.hashStreamCloses)
        assertEquals(0, model.originalCloses)
        assertArrayEquals(before, bytes)
        model.close()
        assertEquals(1, model.originalCloses)
    }

    @Test
    fun collectsTheHeaderAcrossShortReadsWithoutChangingTheDigest() {
        val bytes = fixture()
        val model = handle(bytes)
        model.streamFactory = {
            object : ByteArrayInputStream(bytes) {
                override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
                    super.read(buffer, offset, minOf(length, 3))
            }
        }

        assertEquals(NativeModelVerification.VERIFIED, verifier(bytes).verify(model, running()))
        assertEquals(1, model.hashStreamCloses)
        assertEquals(0, model.originalCloses)
    }

    @Test
    fun streamsFixturesLargerThanOneReadBuffer() {
        val bytes = fixture(150_000)
        val model = handle(bytes)
        var largestRequestedRead = 0
        var reads = 0
        model.streamFactory = {
            object : ByteArrayInputStream(bytes) {
                override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                    reads++
                    largestRequestedRead = maxOf(largestRequestedRead, length)
                    return super.read(buffer, offset, length)
                }
            }
        }

        assertEquals(NativeModelVerification.VERIFIED, verifier(bytes).verify(model, running()))
        assertEquals(65_536, largestRequestedRead)
        assertEquals(4, reads) // Three bounded chunks followed by EOF.
        assertEquals(1, model.hashStreamCloses)
    }

    @Test
    fun rejectsUntrustedMetadataOrDescriptorBeforeOpeningAnyStream() {
        val bytes = fixture()
        val valid = stamp(bytes.size.toLong())
        val invalid = listOf(
            valid.copy(regularFile = false),
            valid.copy(readOnlyDescriptor = false),
            valid.copy(ownedByApp = false),
            valid.copy(lengthBytes = valid.lengthBytes - 1),
            valid.copy(lengthBytes = valid.lengthBytes + 1),
            valid.copy(lengthBytes = -1),
        )
        for (candidate in invalid) {
            val model = handle(bytes, candidate)
            assertEquals(NativeModelVerification.INVALID, verifier(bytes).verify(model, running()))
            assertEquals(0, model.streamOpens)
            assertEquals(0, model.originalCloses)
        }
        val invalidDescriptor = handle(bytes, descriptor = -1)
        assertEquals(NativeModelVerification.INVALID, verifier(bytes).verify(invalidDescriptor, running()))
        assertEquals(0, invalidDescriptor.streamOpens)
    }

    @Test
    fun rejectsChangedIdentityOrNanosecondMetadataAfterHashing() {
        val bytes = fixture()
        val before = stamp(bytes.size.toLong())
        val changed = listOf(
            before.copy(device = before.device + 1),
            before.copy(inode = before.inode + 1),
            before.copy(lengthBytes = before.lengthBytes + 1),
            before.copy(modifiedSeconds = before.modifiedSeconds + 1),
            before.copy(modifiedNanos = before.modifiedNanos + 1),
            before.copy(changedSeconds = before.changedSeconds + 1),
            before.copy(changedNanos = before.changedNanos + 1),
            before.copy(regularFile = false),
            before.copy(readOnlyDescriptor = false),
            before.copy(ownedByApp = false),
        )
        for (after in changed) {
            val model = handle(bytes, before)
            model.stampProvider = { call -> if (call == 1) before else after }
            assertEquals(NativeModelVerification.INVALID, verifier(bytes).verify(model, running()))
            assertEquals(2, model.stampCalls)
            assertEquals(1, model.hashStreamCloses)
            assertEquals(0, model.originalCloses)
        }
    }

    @Test
    fun rejectsPayloadDigestMismatchEvenWithCorrectHeaderAndLength() {
        val expected = fixture()
        val changed = expected.copyOf().also { it[it.lastIndex] = (it.last() + 1).toByte() }
        val model = handle(changed)

        assertEquals(NativeModelVerification.INVALID, verifier(expected).verify(model, running()))
        assertEquals(1, model.hashStreamCloses)
        assertEquals(0, model.originalCloses)
    }

    @Test
    fun rejectsNonGgufOrWrongVersionEvenWhenTheHashMatchesThoseBytes() {
        val valid = fixture()
        val invalid = listOf(
            valid.copyOf().also { it[0] = 'X'.code.toByte() },
            valid.copyOf().also { it[1] = 'g'.code.toByte() },
            valid.copyOf().also { it[4] = 2 },
            valid.copyOf().also { it[4] = 4 },
            valid.copyOf().also { it[5] = 1 },
            valid.copyOf().also { it[6] = 1 },
            valid.copyOf().also { it[7] = 1 },
        )
        for (bytes in invalid) {
            val model = handle(bytes)
            assertEquals(NativeModelVerification.INVALID, verifier(bytes).verify(model, running()))
            assertEquals(1, model.hashStreamCloses)
        }
    }

    @Test
    fun rejectsActualShortOrExcessBytesDespiteAClaimedMatchingLength() {
        val expected = fixture()
        for (bytes in listOf(expected.copyOf(expected.size - 1), expected + byteArrayOf(42))) {
            val model = handle(bytes, stamp(expected.size.toLong()))
            assertEquals(NativeModelVerification.INVALID, verifier(expected).verify(model, running()))
            assertEquals(1, model.hashStreamCloses)
            assertEquals(0, model.originalCloses)
        }
    }

    @Test
    fun rejectsInvalidExpectedIdentityWithoutReadingTheModel() {
        val bytes = fixture()
        val invalidVerifiers = listOf(
            NativeModelVerifier(7, sha(bytes)),
            NativeModelVerifier(-1, sha(bytes)),
            NativeModelVerifier(bytes.size.toLong(), ""),
            NativeModelVerifier(bytes.size.toLong(), "a".repeat(63)),
            NativeModelVerifier(bytes.size.toLong(), "g".repeat(64)),
            NativeModelVerifier(bytes.size.toLong(), "A".repeat(64)),
        )
        for (candidate in invalidVerifiers) {
            val model = handle(bytes)
            assertEquals(NativeModelVerification.INVALID, candidate.verify(model, running()))
            assertEquals(0, model.stampCalls)
            assertEquals(0, model.streamOpens)
        }
    }

    @Test
    fun refusesNonProgressingStreamsAndClosesTheirDuplicate() {
        val bytes = fixture()
        val model = handle(bytes)
        model.streamFactory = {
            object : InputStream() {
                override fun read(): Int = 0
                override fun read(buffer: ByteArray, offset: Int, length: Int): Int = 0
            }
        }

        assertEquals(NativeModelVerification.INVALID, verifier(bytes).verify(model, running()))
        assertEquals(1, model.hashStreamCloses)
        assertEquals(0, model.originalCloses)
    }

    @Test
    fun stopsBeforeOpeningAFileOrReadingItsMetadata() {
        val bytes = fixture()
        val model = handle(bytes)

        assertEquals(NativeModelVerification.STOPPED, verifier(bytes).verify(model, NativeStopSignal { true }))
        assertEquals(0, model.stampCalls)
        assertEquals(0, model.streamOpens)
        assertEquals(0, model.originalCloses)
    }

    @Test
    fun cancellationDuringHashAndImmediatelyBeforeAcceptanceNeverPasses() {
        val bytes = fixture()
        // 3: after first read; 4: after stream closure; 5: after final stamp/digest.
        for (stopOnCheck in listOf(3, 4, 5)) {
            val model = handle(bytes)
            var checks = 0
            val stop = NativeStopSignal { ++checks >= stopOnCheck }
            assertEquals(NativeModelVerification.STOPPED, verifier(bytes).verify(model, stop))
            assertEquals(1, model.hashStreamCloses)
            assertEquals(0, model.originalCloses)
        }
    }

    @Test
    fun openingOrReadingFailureIsUnavailableAndDoesNotCloseTheOriginal() {
        val bytes = fixture()
        val opening = handle(bytes)
        opening.streamFactory = { throw IOException("fixture open failure") }
        assertEquals(NativeModelVerification.UNAVAILABLE, verifier(bytes).verify(opening, running()))
        assertEquals(0, opening.hashStreamCloses)
        assertEquals(0, opening.originalCloses)

        val reading = handle(bytes)
        reading.streamFactory = {
            object : InputStream() {
                override fun read(): Int = throw IOException("fixture read failure")
                override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
                    throw IOException("fixture read failure")
            }
        }
        assertEquals(NativeModelVerification.UNAVAILABLE, verifier(bytes).verify(reading, running()))
        assertEquals(1, reading.hashStreamCloses)
        assertEquals(0, reading.originalCloses)
    }

    @Test
    fun failureClosingTheHashStreamCannotBeReportedAsVerified() {
        val bytes = fixture()
        val model = handle(bytes)
        model.streamFactory = {
            object : ByteArrayInputStream(bytes) {
                override fun close() = throw IOException("fixture close failure")
            }
        }

        assertEquals(NativeModelVerification.UNAVAILABLE, verifier(bytes).verify(model, running()))
        assertEquals(1, model.hashStreamCloses)
        assertEquals(0, model.originalCloses)
    }

    @Test
    fun metadataFailureBeforeOrAfterHashingIsNotAnIdentityPass() {
        val bytes = fixture()
        for (failureOnCall in listOf(1, 2)) {
            val model = handle(bytes)
            model.stampProvider = { call ->
                if (call == failureOnCall) throw IOException("fixture stat failure")
                stamp(bytes.size.toLong())
            }
            assertEquals(NativeModelVerification.UNAVAILABLE, verifier(bytes).verify(model, running()))
            assertEquals(if (failureOnCall == 1) 0 else 1, model.hashStreamCloses)
            assertEquals(0, model.originalCloses)
        }
    }

    private fun fixture(size: Int = 56): ByteArray = ByteArray(size) { (it + 1).toByte() }.also {
        // This is a GGUF v3 identity-header fixture, not an inference-ready GGUF model.
        byteArrayOf('G'.code.toByte(), 'G'.code.toByte(), 'U'.code.toByte(), 'F'.code.toByte(), 3, 0, 0, 0)
            .copyInto(it)
    }

    private fun sha(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }

    private fun verifier(bytes: ByteArray): NativeModelVerifier = NativeModelVerifier(bytes.size.toLong(), sha(bytes))

    private fun running(): NativeStopSignal = NativeStopSignal { false }

    private fun stamp(length: Long): NativeModelStamp = NativeModelStamp(
        device = 7,
        inode = 29,
        lengthBytes = length,
        modifiedSeconds = 100,
        modifiedNanos = 123,
        changedSeconds = 101,
        changedNanos = 456,
        regularFile = true,
        readOnlyDescriptor = true,
        ownedByApp = true,
    )

    private fun handle(
        bytes: ByteArray = fixture(),
        before: NativeModelStamp = stamp(bytes.size.toLong()),
        descriptor: Int = 47,
    ): FakeModelHandle = FakeModelHandle(bytes, before, descriptor)

    private class FakeModelHandle(
        bytes: ByteArray,
        before: NativeModelStamp,
        override val descriptor: Int,
    ) : NativeModelHandle {
        var stampCalls = 0
        var streamOpens = 0
        var hashStreamCloses = 0
        var originalCloses = 0
        var stampProvider: (Int) -> NativeModelStamp = { before }
        var streamFactory: () -> InputStream = { ByteArrayInputStream(bytes) }

        override fun stamp(): NativeModelStamp = stampProvider(++stampCalls)

        override fun openHashStream(): InputStream {
            streamOpens++
            return object : FilterInputStream(streamFactory()) {
                override fun close() {
                    hashStreamCloses++
                    super.close()
                }
            }
        }

        override fun close() { originalCloses++ }
    }
}
