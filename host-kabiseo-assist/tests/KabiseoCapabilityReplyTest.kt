package com.koreanlifehub.bridge

import org.junit.Assert.*
import org.junit.Test

class KabiseoCapabilityReplyTest {
    private val request = KabiseoCapabilityReply.Request("job_1", "a".repeat(32), "b".repeat(32), "s56_fixture",
        "secure_device_status", "life_android_secure_status", "READ_ONLY", "c".repeat(64), "d".repeat(64),
        KabiseoCapabilityReply.CHALLENGE, 40_000)
    private val live = KabiseoCapabilityReply.Live(false, 35, true, true, true,
        request.commandId, request.sessionId, request.deviceDigest, 10_000)
    private fun reply(r: KabiseoCapabilityReply.Request = request, l: KabiseoCapabilityReply.Live = live,
                      code: String = "secure_verified", verified: Boolean = true) =
        KabiseoCapabilityReply.evaluate(r, code, verified, l)
    @Test fun defaultFeatureOffIsNotSupport() { assertEquals(false, reply()!!["enabled"]) }
    @Test fun validReviewedEnableOnlyReportsCapability() {
        val r = reply(l = live.copy(metadataEnabled = true))!!
        assertEquals(true, r["enabled"]); assertEquals(true, r["readOnly"])
        for (k in listOf("pixelsRead", "gestureDispatched", "cameraSettingsChanged", "automaticZoomEnabled", "restoreVerified", "cameraSurfaceMatched")) assertEquals(false, r[k])
        assertEquals(12, r.size)
    }
    @Test fun ordinaryStatusIsUnchanged() { assertNull(reply(r = request.copy(challenge = ""))) }
    @Test fun unrelatedOrUnknownChallengeIsNotAdvertised() { assertNull(reply(r = request.copy(challenge = "ZOOM"))) }
    @Test fun originalAuthenticationAndStatusRequired() {
        for (code in listOf("", "legacy_job", "secure_rejected")) assertNull(reply(code = code))
        assertNull(reply(verified = false))
    }
    @Test fun typeToolEffectAreExact() {
        for (r in listOf(request.copy(type = "agent_step"), request.copy(tool = "life_android_kabiseo_metadata"), request.copy(effect = "MUTATION"))) assertNull(reply(r))
    }
    @Test fun requestIdentifiersAreStrict() {
        for (r in listOf(request.copy(id = ""), request.copy(requestId = "bad"), request.copy(commandId = "B".repeat(32)), request.copy(sessionId = ""), request.copy(taskDigest = "x"), request.copy(deviceDigest = "x"))) assertNull(reply(r))
    }
    @Test fun changedSessionDeviceAndCommandAreRejected() {
        for (l in listOf(live.copy(sessionId = "new"), live.copy(deviceDigest = "e".repeat(64)), live.copy(commandId = "e".repeat(32)), live.copy(generationCurrent = false))) assertNull(reply(l = l))
    }
    @Test fun expiredAndSkewedRequestsAreRejected() {
        assertNull(reply(r = request.copy(expiresAt = 10_000)))
        assertNull(reply(r = request.copy(expiresAt = 70_001)))
        assertNull(reply(l = live.copy(nowMillis = -1)))
    }
    @Test fun api33CannotEnableButDoesNotBreakStatus() { assertEquals(false, reply(l = live.copy(metadataEnabled = true, apiLevel = 33))!!["enabled"]) }
    @Test fun disconnectedOrLockedCannotClaimEnabled() {
        assertEquals(false, reply(l = live.copy(metadataEnabled = true, connected = false))!!["enabled"])
        assertEquals(false, reply(l = live.copy(metadataEnabled = true, unlocked = false))!!["enabled"])
    }
    @Test fun requestEchoMatchesServerV012Contract() {
        val r = reply()!!
        assertEquals(request.requestId, r["requestId"]); assertEquals(1, r["version"])
        assertEquals("KABISEO_CAMERA_METADATA_CAPABILITY_V1", r["schema"])
        assertEquals("com.openai.chatgpt", r["cameraTargetPackage"])
    }
    @Test fun cameraToolCannotBorrowWriteAuthority() {
        val session = SecureBridge56()
        assertFalse(session.bindTool("life_android_kabiseo_metadata", "a".repeat(64), "b".repeat(64), "MUTATION", "b".repeat(64)).ok)
        assertTrue(session.bindTool("life_android_kabiseo_metadata", "a".repeat(64), "b".repeat(64), "READ_ONLY", "b".repeat(64)).ok)
    }
}
