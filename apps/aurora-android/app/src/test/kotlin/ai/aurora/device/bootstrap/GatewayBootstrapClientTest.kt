package ai.aurora.device.bootstrap

import ai.aurora.device.network.GatewayHttpChannel
import ai.aurora.device.network.GatewayHttpChannelFactory
import ai.aurora.device.network.GatewayHttpResponse
import ai.aurora.device.network.GatewayTransportException
import ai.aurora.device.network.GatewayTransportFailure
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayBootstrapClientTest {
    private val now = 1_788_630_200_000L
    private val reference = "gbr_${"r".repeat(43)}"
    private val deviceId = "dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV"
    private val deviceSessionId = "device-session:android"

    @Test
    fun `fresh install with both expected bindings absent accepts valid server staged grant`() {
        val serverAssignedDeviceId = "dvc_01ARZ3NDEKTSV4RRFFQ69G5FB0"
        val serverAssignedSessionId = "device-session:server-assigned"
        val channel =
            RecordingChannel(
                response =
                    GatewayHttpResponse(
                        200,
                        successBody(
                            grantDeviceId = serverAssignedDeviceId,
                            grantDeviceSessionId = serverAssignedSessionId,
                        ),
                    ),
            )
        val client = GatewayBootstrapClient(GatewayHttpChannelFactory { channel }, nowMs = { now })

        val result = client.exchange(reference, expectedDeviceId = null, expectedDeviceSessionId = null)

        assertTrue(result is GatewayBootstrapClientResult.Success)
        val grant = (result as GatewayBootstrapClientResult.Success).value
        assertEquals("tenant:alpha", grant.tenantId)
        assertEquals(serverAssignedDeviceId, grant.deviceId)
        assertEquals(serverAssignedSessionId, grant.deviceSessionId)
        assertFalse(grant.authorizesExecution)
        assertFalse(grant.provesExecutionSuccess)
        assertFalse(grant.retryAuthorized)
        assertEquals("/v1/gateway/bootstrap/exchange", channel.path)
        assertEquals("{\"bootstrapReference\":\"$reference\"}", channel.body)
        assertFalse(channel.body!!.contains("deviceId"))
        assertFalse(channel.body!!.contains("deviceSessionId"))
        assertFalse(channel.body!!.contains("tenantId"))
        assertFalse(channel.body!!.contains("actor"))
        assertTrue(channel.closed)
    }

    @Test
    fun `exactly one expected binding present fails before transport`() {
        var opens = 0
        val client =
            GatewayBootstrapClient(
                GatewayHttpChannelFactory {
                    opens += 1
                    RecordingChannel(response = GatewayHttpResponse(200, successBody()))
                },
                nowMs = { now },
            )

        assertRejected(
            client.exchange(reference, expectedDeviceId = deviceId, expectedDeviceSessionId = null),
            GatewayBootstrapClientError.REFERENCE_INVALID,
        )
        assertRejected(
            client.exchange(reference, expectedDeviceId = null, expectedDeviceSessionId = deviceSessionId),
            GatewayBootstrapClientError.REFERENCE_INVALID,
        )
        assertEquals(0, opens)
    }

    @Test
    fun `both expected bindings present enforce exact device and session match`() {
        val channel = RecordingChannel(response = GatewayHttpResponse(200, successBody()))
        val client = GatewayBootstrapClient(GatewayHttpChannelFactory { channel }, nowMs = { now })

        val successResult = client.exchange(reference, expectedDeviceId = deviceId, expectedDeviceSessionId = deviceSessionId)
        assertTrue(successResult is GatewayBootstrapClientResult.Success)

        assertRejected(
            clientReturning(successBody()).exchange(
                reference,
                expectedDeviceId = "dvc_01ARZ3NDEKTSV4RRFFQ69G5FB0",
                expectedDeviceSessionId = deviceSessionId,
            ),
            GatewayBootstrapClientError.BINDING_MISMATCH,
        )
        assertRejected(
            clientReturning(successBody()).exchange(
                reference,
                expectedDeviceId = deviceId,
                expectedDeviceSessionId = "device-session:mismatched",
            ),
            GatewayBootstrapClientError.BINDING_MISMATCH,
        )
    }

    @Test
    fun `invalid server assigned deviceId or session fails closed through grant parsing`() {
        assertRejected(
            clientReturning(successBody(grantDeviceId = "dvc_invalid")).exchange(reference),
            GatewayBootstrapClientError.PROTOCOL_MALFORMED,
        )
        assertRejected(
            clientReturning(successBody(grantDeviceSessionId = "not allowed whitespace")).exchange(reference),
            GatewayBootstrapClientError.PROTOCOL_MALFORMED,
        )
    }

    @Test
    fun `process local grant remains single consume and never persisted`() {
        val channel = RecordingChannel(response = GatewayHttpResponse(200, successBody()))
        val runtime =
            ProcessLocalGatewayBootstrapRuntime(
                GatewayBootstrapClient(GatewayHttpChannelFactory { channel }, nowMs = { now }),
            )

        assertTrue(runtime.installReference(reference))
        assertTrue(runtime.hasPendingReference())

        val exchangeResult = runtime.exchangeAndHold()
        assertTrue(exchangeResult is GatewayBootstrapClientResult.Success)
        assertFalse(runtime.hasPendingReference())

        val grant = runtime.consumeGrant()
        assertEquals(deviceId, grant?.deviceId)
        assertEquals(deviceSessionId, grant?.deviceSessionId)
        assertNull(runtime.consumeGrant())

        assertTrue(runtime.installReference(reference))
        runtime.clear()
        assertFalse(runtime.hasPendingReference())
        assertNull(runtime.consumeGrant())
        assertRejected(
            runtime.exchangeAndHold(),
            GatewayBootstrapClientError.REFERENCE_INVALID,
        )
    }

    @Test
    fun `authority bearing extra field and binding drift fail closed`() {
        val authorityBody =
            successBody().replace(
                "\"authorizesExecution\":false",
                "\"authorizesExecution\":true",
            )
        assertRejected(
            clientReturning(authorityBody).exchange(reference, deviceId, deviceSessionId),
            GatewayBootstrapClientError.PROTOCOL_MALFORMED,
        )

        val extraBody =
            successBody().replace(
                "\"retryAuthorized\":false",
                "\"retryAuthorized\":false,\"ownerDecision\":\"forged\"",
            )
        assertRejected(
            clientReturning(extraBody).exchange(reference, deviceId, deviceSessionId),
            GatewayBootstrapClientError.PROTOCOL_MALFORMED,
        )
    }

    @Test
    fun `expired rejected and post-write uncertain exchange never authorizes retry`() {
        val expired = successBody(expiresAtMs = now)
        assertRejected(
            clientReturning(expired).exchange(reference, deviceId, deviceSessionId),
            GatewayBootstrapClientError.GRANT_EXPIRED,
        )

        val rejectedChannel = RecordingChannel(response = GatewayHttpResponse(401, "{}"))
        assertRejected(
            GatewayBootstrapClient(GatewayHttpChannelFactory { rejectedChannel }, nowMs = { now })
                .exchange(reference, deviceId, deviceSessionId),
            GatewayBootstrapClientError.PROTOCOL_REJECTED,
        )

        val uncertainChannel =
            RecordingChannel(
                failure =
                    GatewayTransportException(
                        GatewayTransportFailure.TRANSPORT_UNCERTAIN,
                        requestMayHaveReachedPeer = true,
                    ),
            )
        val uncertain =
            GatewayBootstrapClient(GatewayHttpChannelFactory { uncertainChannel }, nowMs = { now })
                .exchange(reference, deviceId, deviceSessionId)
        assertRejected(uncertain, GatewayBootstrapClientError.TRANSPORT_UNCERTAIN)
    }

    @Test
    fun `process-local runtime consumes reference before network and grant exactly once`() {
        val channel = RecordingChannel(response = GatewayHttpResponse(200, successBody()))
        val runtime =
            ProcessLocalGatewayBootstrapRuntime(
                GatewayBootstrapClient(GatewayHttpChannelFactory { channel }, nowMs = { now }),
            )
        assertTrue(runtime.installReference(reference))
        assertTrue(runtime.hasPendingReference())
        val acquired = runtime.exchangeAndHold(deviceId, deviceSessionId)
        assertTrue(acquired is GatewayBootstrapClientResult.Success)
        assertFalse(runtime.hasPendingReference())
        val grant = runtime.consumeGrant()
        assertEquals(deviceId, grant?.deviceId)
        assertNull(runtime.consumeGrant())

        runtime.clear()
        assertFalse(runtime.hasPendingReference())
        assertNull(runtime.consumeGrant())

        val uncertainRuntime =
            ProcessLocalGatewayBootstrapRuntime(
                GatewayBootstrapClient(
                    GatewayHttpChannelFactory {
                        RecordingChannel(
                            failure =
                                GatewayTransportException(
                                    GatewayTransportFailure.TRANSPORT_UNCERTAIN,
                                    requestMayHaveReachedPeer = true,
                                ),
                        )
                    },
                    nowMs = { now },
                ),
            )
        assertTrue(uncertainRuntime.installReference(reference))
        val uncertain = uncertainRuntime.exchangeAndHold(deviceId, deviceSessionId)
        assertRejected(uncertain, GatewayBootstrapClientError.TRANSPORT_UNCERTAIN)
        assertFalse(uncertainRuntime.hasPendingReference())
        assertNull(uncertainRuntime.consumeGrant())
    }

    @Test
    fun `invalid reference fails before opening transport`() {
        var opens = 0
        val client =
            GatewayBootstrapClient(
                GatewayHttpChannelFactory {
                    opens += 1
                    RecordingChannel(response = GatewayHttpResponse(200, successBody()))
                },
                nowMs = { now },
            )
        assertRejected(
            client.exchange("fixture-secret", deviceId, deviceSessionId),
            GatewayBootstrapClientError.REFERENCE_INVALID,
        )
        assertEquals(0, opens)
    }

    private fun clientReturning(body: String): GatewayBootstrapClient =
        GatewayBootstrapClient(
            GatewayHttpChannelFactory { RecordingChannel(response = GatewayHttpResponse(200, body)) },
            nowMs = { now },
        )

    private fun successBody(
        expiresAtMs: Long = now + 60_000,
        grantDeviceId: String = deviceId,
        grantDeviceSessionId: String = deviceSessionId,
    ): String =
        """{"ok":true,"value":{"gatewaySessionId":"gws_${"s".repeat(22)}","credential":"gwc_${"c".repeat(43)}","tenantId":"tenant:alpha","actor":{"kind":"HUMAN","identityId":"identity:alpha"},"correlationId":"correlation:android-bootstrap","deviceId":"$grantDeviceId","deviceSessionId":"$grantDeviceSessionId","issuedAtMs":${now - 1},"expiresAtMs":$expiresAtMs,"authVersion":"w14-bootstrap-v1","authorizesExecution":false,"provesExecutionSuccess":false,"retryAuthorized":false}}"""

    private fun assertRejected(
        result: GatewayBootstrapClientResult<*>,
        expected: GatewayBootstrapClientError,
    ) {
        assertTrue(result is GatewayBootstrapClientResult.Rejected)
        val rejected = result as GatewayBootstrapClientResult.Rejected
        assertEquals(expected, rejected.error)
        assertTrue(rejected.requiresFreshBootstrap)
        assertFalse(rejected.authorizesExecution)
        assertFalse(rejected.provesExecutionSuccess)
        assertFalse(rejected.retryAuthorized)
    }

    private class RecordingChannel(
        private val response: GatewayHttpResponse? = null,
        private val failure: GatewayTransportException? = null,
    ) : GatewayHttpChannel {
        var path: String? = null
        var body: String? = null
        var closed = false

        override fun post(path: String, body: String): GatewayHttpResponse {
            this.path = path
            this.body = body
            failure?.let { throw it }
            return requireNotNull(response)
        }

        override fun close() {
            closed = true
        }
    }
}
