package ai.aurora.device.network

import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.config.RuntimeEnvironmentConfig
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.EOFException
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URI
import java.nio.charset.StandardCharsets

internal data class GatewayHttpResponse(
    val statusCode: Int,
    val body: String,
)

internal enum class GatewayTransportFailure {
    CONFIGURATION_REJECTED,
    CONNECTION_UNAVAILABLE,
    PROTOCOL_MALFORMED,
    RESPONSE_TOO_LARGE,
    REQUEST_LIMIT_REACHED,
    TRANSPORT_UNCERTAIN,
}

internal class GatewayTransportException(
    val failure: GatewayTransportFailure,
    val requestMayHaveReachedPeer: Boolean,
    cause: Throwable? = null,
) : Exception(failure.name, cause)

internal interface GatewayHttpChannel : AutoCloseable {
    @Throws(GatewayTransportException::class)
    fun post(path: String, body: String): GatewayHttpResponse
}

internal fun interface GatewayHttpChannelFactory {
    @Throws(GatewayTransportException::class)
    fun open(): GatewayHttpChannel
}

internal class PersistentGatewayHttpChannel private constructor(
    private val endpoint: Endpoint,
    private val limits: Limits,
) : GatewayHttpChannel {
    private val socket: Socket
    private val input: BufferedInputStream
    private val output: BufferedOutputStream
    private var requests = 0
    private var closed = false

    init {
        var connectedSocket: Socket? = null
        try {
            connectedSocket = Socket()
            connectedSocket.tcpNoDelay = true
            connectedSocket.keepAlive = true
            connectedSocket.soTimeout = limits.readTimeoutMs
            connectedSocket.connect(
                InetSocketAddress(endpoint.host, endpoint.port),
                limits.connectTimeoutMs,
            )
            socket = connectedSocket
            input = BufferedInputStream(socket.getInputStream(), limits.bufferBytes)
            output = BufferedOutputStream(socket.getOutputStream(), limits.bufferBytes)
        } catch (error: Exception) {
            runCatching { connectedSocket?.close() }
            throw GatewayTransportException(
                GatewayTransportFailure.CONNECTION_UNAVAILABLE,
                requestMayHaveReachedPeer = false,
                cause = error,
            )
        }
    }

    @Synchronized
    override fun post(path: String, body: String): GatewayHttpResponse {
        if (closed || socket.isClosed || !socket.isConnected) {
            throw GatewayTransportException(
                GatewayTransportFailure.CONNECTION_UNAVAILABLE,
                requestMayHaveReachedPeer = false,
            )
        }
        if (requests >= limits.maxRequests) {
            throw GatewayTransportException(
                GatewayTransportFailure.REQUEST_LIMIT_REACHED,
                requestMayHaveReachedPeer = false,
            )
        }
        requireSafePath(path)
        val bodyBytes = body.toByteArray(StandardCharsets.UTF_8)
        if (bodyBytes.size > limits.maxRequestBodyBytes) {
            throw GatewayTransportException(
                GatewayTransportFailure.CONFIGURATION_REJECTED,
                requestMayHaveReachedPeer = false,
            )
        }

        var wroteRequest = false
        try {
            val requestHead = buildString {
                append("POST ")
                append(path)
                append(" HTTP/1.1\r\n")
                append("Host: ")
                append(endpoint.hostHeader)
                append("\r\n")
                append("Content-Type: application/json\r\n")
                append("Accept: application/json\r\n")
                append("Cache-Control: no-store\r\n")
                append("Content-Length: ")
                append(bodyBytes.size)
                append("\r\n")
                append("Connection: keep-alive\r\n")
                append("\r\n")
            }.toByteArray(StandardCharsets.US_ASCII)

            output.write(requestHead)
            output.write(bodyBytes)
            output.flush()
            wroteRequest = true
            requests += 1

            val statusLine = readAsciiLine(input, limits.maxHeaderBytes)
            val statusCode = parseStatus(statusLine)
            val headers = linkedMapOf<String, String>()
            var headerBytes = statusLine.length + 2
            while (true) {
                val line = readAsciiLine(input, limits.maxHeaderBytes - headerBytes)
                headerBytes += line.length + 2
                if (line.isEmpty()) break
                val colon = line.indexOf(':')
                if (colon <= 0) protocolFailure()
                val name = line.substring(0, colon).trim().lowercase()
                val value = line.substring(colon + 1).trim()
                if (name.isEmpty() || value.isEmpty() || headers.put(name, value) != null) {
                    protocolFailure()
                }
            }

            if (headers.containsKey("transfer-encoding")) protocolFailure()
            val contentLength = headers["content-length"]?.toIntOrNull() ?: protocolFailure()
            if (contentLength < 0 || contentLength > limits.maxResponseBodyBytes) {
                throw GatewayTransportException(
                    GatewayTransportFailure.RESPONSE_TOO_LARGE,
                    requestMayHaveReachedPeer = true,
                )
            }
            val responseBytes = input.readExactly(contentLength)
            val responseBody = responseBytes.toString(StandardCharsets.UTF_8)
            val connection = headers["connection"]?.lowercase()
            if (connection == "close") close()
            return GatewayHttpResponse(statusCode, responseBody)
        } catch (error: GatewayTransportException) {
            close()
            throw error
        } catch (error: Exception) {
            close()
            throw GatewayTransportException(
                if (wroteRequest) {
                    GatewayTransportFailure.TRANSPORT_UNCERTAIN
                } else {
                    GatewayTransportFailure.CONNECTION_UNAVAILABLE
                },
                requestMayHaveReachedPeer = wroteRequest,
                cause = error,
            )
        }
    }

    @Synchronized
    override fun close() {
        if (closed) return
        closed = true
        runCatching { output.flush() }
        runCatching { socket.close() }
    }

    private fun protocolFailure(): Nothing =
        throw GatewayTransportException(
            GatewayTransportFailure.PROTOCOL_MALFORMED,
            requestMayHaveReachedPeer = true,
        )

    private fun parseStatus(statusLine: String): Int {
        val match = HTTP_STATUS.matchEntire(statusLine) ?: protocolFailure()
        val code = match.groupValues[1].toIntOrNull() ?: protocolFailure()
        if (code !in 100..599) protocolFailure()
        return code
    }

    private fun requireSafePath(path: String) {
        if (!SAFE_PATH.matches(path) || path.contains("..")) {
            throw GatewayTransportException(
                GatewayTransportFailure.CONFIGURATION_REJECTED,
                requestMayHaveReachedPeer = false,
            )
        }
    }

    internal data class Limits(
        val connectTimeoutMs: Int = 5_000,
        val readTimeoutMs: Int = 10_000,
        val maxRequests: Int = 64,
        val maxRequestBodyBytes: Int = 32 * 1024,
        val maxResponseBodyBytes: Int = 64 * 1024,
        val maxHeaderBytes: Int = 16 * 1024,
        val bufferBytes: Int = 8 * 1024,
    ) {
        init {
            require(connectTimeoutMs in 1..60_000)
            require(readTimeoutMs in 1..60_000)
            require(maxRequests in 1..128)
            require(maxRequestBodyBytes in 1..1024 * 1024)
            require(maxResponseBodyBytes in 1..1024 * 1024)
            require(maxHeaderBytes in 1024..64 * 1024)
            require(bufferBytes in 1024..64 * 1024)
        }
    }

    private data class Endpoint(
        val host: String,
        val port: Int,
        val hostHeader: String,
    )

    companion object {
        fun factory(
            config: RuntimeEnvironmentConfig,
            limits: Limits = Limits(),
        ): GatewayHttpChannelFactory {
            val endpoint = endpoint(config)
            return GatewayHttpChannelFactory { PersistentGatewayHttpChannel(endpoint, limits) }
        }

        fun physicalAdbReverseFactory(
            port: Int = 8080,
            limits: Limits = Limits(),
        ): GatewayHttpChannelFactory {
            require(port in 1..65_535) { "physical adb-reverse port must be valid" }
            val endpoint = Endpoint("127.0.0.1", port, "127.0.0.1:$port")
            return GatewayHttpChannelFactory { PersistentGatewayHttpChannel(endpoint, limits) }
        }

        private fun endpoint(config: RuntimeEnvironmentConfig): Endpoint {
            if (config.environment != AuroraEnvironment.LOCAL || !config.allowCleartextTraffic) {
                throw GatewayTransportException(
                    GatewayTransportFailure.CONFIGURATION_REJECTED,
                    requestMayHaveReachedPeer = false,
                )
            }
            val uri = runCatching { URI(config.gatewayOrigin) }.getOrElse {
                throw GatewayTransportException(
                    GatewayTransportFailure.CONFIGURATION_REJECTED,
                    requestMayHaveReachedPeer = false,
                    cause = it,
                )
            }
            if (uri.scheme != "http" || uri.host !in LOOPBACK_OR_EMULATOR_HOSTS) {
                throw GatewayTransportException(
                    GatewayTransportFailure.CONFIGURATION_REJECTED,
                    requestMayHaveReachedPeer = false,
                )
            }
            val port = if (uri.port == -1) 80 else uri.port
            if (port !in 1..65_535) {
                throw GatewayTransportException(
                    GatewayTransportFailure.CONFIGURATION_REJECTED,
                    requestMayHaveReachedPeer = false,
                )
            }
            return Endpoint(uri.host, port, "${uri.host}:$port")
        }

        private val LOOPBACK_OR_EMULATOR_HOSTS = setOf("127.0.0.1", "localhost", "10.0.2.2")
        private val SAFE_PATH = Regex("/[A-Za-z0-9._/-]{1,256}")
        private val HTTP_STATUS = Regex("HTTP/1\\.[01] ([0-9]{3})(?: .*)?")
    }
}

private fun readAsciiLine(input: BufferedInputStream, remainingLimit: Int): String {
    if (remainingLimit <= 0) {
        throw GatewayTransportException(
            GatewayTransportFailure.PROTOCOL_MALFORMED,
            requestMayHaveReachedPeer = true,
        )
    }
    val bytes = ArrayList<Byte>(64)
    var previousWasCr = false
    while (bytes.size < remainingLimit) {
        val next = input.read()
        if (next == -1) throw EOFException("unexpected EOF while reading HTTP line")
        val byte = next.toByte()
        if (previousWasCr) {
            if (byte == '\n'.code.toByte()) {
                return bytes.dropLast(1).toByteArray().toString(StandardCharsets.US_ASCII)
            }
        }
        bytes.add(byte)
        previousWasCr = byte == '\r'.code.toByte()
        if (byte == '\n'.code.toByte() && !previousWasCr) {
            throw GatewayTransportException(
                GatewayTransportFailure.PROTOCOL_MALFORMED,
                requestMayHaveReachedPeer = true,
            )
        }
    }
    throw GatewayTransportException(
        GatewayTransportFailure.PROTOCOL_MALFORMED,
        requestMayHaveReachedPeer = true,
    )
}

private fun BufferedInputStream.readExactly(length: Int): ByteArray {
    val result = ByteArray(length)
    var offset = 0
    while (offset < length) {
        val count = read(result, offset, length - offset)
        if (count < 0) throw EOFException("unexpected EOF while reading HTTP body")
        offset += count
    }
    return result
}
