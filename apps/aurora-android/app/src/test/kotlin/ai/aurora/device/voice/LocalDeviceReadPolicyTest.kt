package ai.aurora.device.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class LocalDeviceReadPolicyTest {
    @Test
    fun resolvesBoundedPortugueseReadOnlyQuestions() {
        assertEquals(LocalDeviceReadIntent.TIME, LocalDeviceReadPolicy.resolve("Que horas são?"))
        assertEquals(LocalDeviceReadIntent.DATE, LocalDeviceReadPolicy.resolve("Qual a data de hoje?"))
        assertEquals(LocalDeviceReadIntent.BATTERY, LocalDeviceReadPolicy.resolve("Quanto tem de bateria?"))
        assertEquals(LocalDeviceReadIntent.MEDIA_VOLUME, LocalDeviceReadPolicy.resolve("Qual o volume?"))
    }

    @Test
    fun imperativeSideEffectsNeverMatchReadOnlyPolicy() {
        assertNull(LocalDeviceReadPolicy.resolve("aumente o volume"))
        assertNull(LocalDeviceReadPolicy.resolve("abaixe o volume"))
        assertNull(LocalDeviceReadPolicy.resolve("abra as configurações"))
        assertNull(LocalDeviceReadPolicy.resolve("abra o spotify"))
    }

    @Test
    fun localReadResultCannotCarryAuthorityOrExecutionProof() {
        val result = LocalDeviceReadResult(LocalDeviceReadIntent.TIME, "Agora são 10:30.")

        assertFalse(result.authorizesExecution)
        assertFalse(result.provesExecutionSuccess)
        assertFalse(result.retryAuthorized)
    }
}
