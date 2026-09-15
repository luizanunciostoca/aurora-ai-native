package ai.aurora.device.network

import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.config.RuntimeEnvironmentConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.ServerSocket
import java.nio.charset.StandardCharsets
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class PersistentGatewayHttpChannelTest {
    @Test
    fun `two posts share one TCP socket and use bounded content length framing`() {
        ServerSocket(0).use { server ->
            val accepted = AtomicInteger(0)
            val paths = mutableListOf<String>()
            val finished = CountDownLatch(1)
            val worker = Thread {
                server.accept().use { socket ->
                    accepted.incrementAndGet()
                    val input = BufferedInputStream(socket.getInputStream())
                    val output = BufferedOutputStream(socket.getOutputStream())
                    repeat(2) {
                        val requestLine = readLine(input)
                        paths += requestLine.split(' ')[1]
                        var contentLength = -1
                        while (true) {
                            val line = readLine(input)
                            if (line.isEmpty()) break
                            if (line.startsWith("Content-Length:", ignoreCase = true)) {
                                contentLength = line.substringAfter(':').trim().toInt()
                            }
                        }
                        require(contentLength >= 0)
                        input.readNBytes(contentLength)
                        val body = "{\"ok\":true,\"authorizesExecution\":false}"
                        val bytes = body.toByteArray(StandardCharsets.UTF_8)
                        output.write(
                            ("HTTP/1.1 200 OK\r\n" +
                                "Content-Type: application/json\r\n" +
                                "Content-Length: ${bytes.size}\r\n" +
                                "Connection: keep-alive\r\n\r\n")
                                .toByteArray(StandardCharsets.US_ASCII),
                        )
                        output.write(bytes)
                        output.flush()
                    }
                }
                finished.countDown()
            }
            worker.start()

            val config = RuntimeEnvironmentConfig(
                environment = AuroraEnvironment.LOCAL,
                gatewayOrigin = "http://127.0.0.1:${server.localPort}",
                allowCleartextTraffic = true,
            )
            PersistentGatewayHttpChannel.factory(config).open().use { channel ->
                assertEquals(200, channel.post("/v1/gateway/sessions/open", "{}").statusCode)
                assertEquals(200, channel.post("/v1/device/registrations/register", "{}").statusCode)
            }

            assertTrue(finished.await(2, TimeUnit.SECONDS))
            assertEquals(1, accepted.get())
            assertEquals(
                listOf("/v1/gateway/sessions/open", "/v1/device/registrations/register"),
                paths,
            )
        }
    }

    @Test
    fun `non local or non loopback cleartext endpoints fail before opening a socket`() {
        val rejected = runCatching {
            PersistentGatewayHttpChannel.factory(
                RuntimeEnvironmentConfig(
                    environment = AuroraEnvironment.PRODUCTION,
                    gatewayOrigin = "https://production.invalid",
                    allowCleartextTraffic = false,
                ),
            )
        }.exceptionOrNull()
        assertTrue(rejected is GatewayTransportException)
        assertEquals(
            GatewayTransportFailure.CONFIGURATION_REJECTED,
            (rejected as GatewayTransportException).failure,
        )
    }

    private fun readLine(input: BufferedInputStream): String {
        val bytes = mutableListOf<Byte>()
        while (true) {
            val next = input.read()
            require(next >= 0)
            bytes += next.toByte()
            val size = bytes.size
            if (size >= 2 && bytes[size - 2] == '\r'.code.toByte() && bytes[size - 1] == '\n'.code.toByte()) {
                return bytes.dropLast(2).toByteArray().toString(StandardCharsets.US_ASCII)
            }
        }
    }
}
