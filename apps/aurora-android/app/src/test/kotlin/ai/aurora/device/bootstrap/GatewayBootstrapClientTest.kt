package ai.aurora.device.bootstrap

import ai.aurora.device.network.GatewayHttpChannel
import ai.aurora.device.network.GatewayHttpChannelFactory
import ai.aurora.device.network.GatewayHttpResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayBootstrapClientTest {
    private val binding =
        GatewayBootstrapBinding(
            tenantId = "tenant:test",
            deviceId = "dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            deviceSessionId = "device-session:test",
        )

    @Test
    fun acceptsOnlyBoundShortLivedBootstrapAndKeepsCredentialProcessLocal() {
        val channel = FakeChannel(
            """{"ok":true,"value":{"gatewaySessionId":"gws_test","credential":"gwc_test","tenantId":"tenant:test","deviceId":"dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV","deviceSessionId":"device-session:test","expiresAtMs":2000,"authorizesExecution":false}}""",
        )
        val client = GatewayBootstrapClient(FakeFactory(channel), binding)

        assertTrue(client.stageReference("gbr_${"r".repeat(43)}") is GatewayBootstrapClientResult.Success)
        val exchanged = client.exchange(1000)
        assertTrue(exchanged is GatewayBootstrapClientResult.Success)
        val provider = client.credentialProvider(1001)
        assertTrue(provider is GatewayBootstrapClientResult.Success)
        assertEquals("gwc_test", (provider as GatewayBootstrapClientResult.Success).value.currentCredential())
        assertEquals("/v1/gateway/bootstrap/exchange", channel.path)
    }

    @Test
    fun failsClosedOnReferenceInvalidAndDeviceSessionDrift() {
        val channel =
            FakeChannel(
                """{"ok":true,"value":{"gatewaySessionId":"gws_test","credential":"gwc_test","tenantId":"tenant:other","deviceId":"dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV","deviceSessionId":"device-session:test","expiresAtMs":2000,"authorizesExecution":false}}""",
            )
        val client = GatewayBootstrapClient(FakeFactory(channel), binding)

        assertEquals(
            GatewayBootstrapClientError.REFERENCE_INVALID,
            (client.stageReference("client-minted") as GatewayBootstrapClientResult.Rejected).error,
        )
        client.stageReference("gbr_${"r".repeat(43)}")
        assertEquals(
            GatewayBootstrapClientError.DEVICE_SESSION_MISMATCH,
            (client.exchange(1000) as GatewayBootstrapClientResult.Rejected).error,
        )
        assertTrue(client.credentialProvider(1001) is GatewayBootstrapClientResult.Rejected)
    }

    private class FakeFactory(private val channel: FakeChannel) : GatewayHttpChannelFactory {
        override fun open(): GatewayHttpChannel = channel
    }

    private class FakeChannel(private val body: String) : GatewayHttpChannel {
        var path: String? = null

        override fun post(path: String, body: String): GatewayHttpResponse {
            this.path = path
            return GatewayHttpResponse(200, this.body)
        }

        override fun close() = Unit
    }
}
