package com.koreanlifehub.bridge

/** Scalar-only reply AFTER the existing Secure56 MAC/nonce/payload/status checks.
 * Does not read windows/pixels, grant permission, enable the route, or perform camera actions.
 * Ordinary secure_device_status replies remain unchanged (null when no challenge).
 */
object KabiseoCapabilityReply {
    const val CHALLENGE = "KABISEO_CAMERA_METADATA_V1"
    data class Request(
        val id: String, val requestId: String, val commandId: String,
        val sessionId: String, val type: String, val tool: String, val effect: String,
        val deviceDigest: String, val taskDigest: String, val challenge: String,
        val expiresAt: Long
    )
    data class Live(
        val metadataEnabled: Boolean = false, val apiLevel: Int,
        val connected: Boolean, val unlocked: Boolean, val generationCurrent: Boolean,
        val commandId: String, val sessionId: String, val deviceDigest: String,
        val nowMillis: Long
    )
    fun evaluate(r: Request, verifiedCode: String, statusVerified: Boolean, live: Live): Map<String, Any>? {
        if (r.challenge != CHALLENGE || verifiedCode != "secure_verified" || !statusVerified) return null
        if (!r.id.matches(Regex("[A-Za-z0-9_.:-]{1,128}")) ||
            !hex(r.requestId, 32) || !hex(r.commandId, 32) ||
            !r.sessionId.matches(Regex("[A-Za-z0-9_.:-]{1,160}")) ||
            !hex(r.deviceDigest, 64) || !hex(r.taskDigest, 64)) return null
        if (r.type != "secure_device_status" || r.tool != "life_android_secure_status" || r.effect != "READ_ONLY") return null
        if (!live.generationCurrent || r.commandId != live.commandId ||
            r.sessionId != live.sessionId || r.deviceDigest != live.deviceDigest) return null
        if (live.nowMillis < 0 || r.expiresAt <= live.nowMillis || r.expiresAt - live.nowMillis > 60_000) return null
        return mapOf(
            "schema" to "KABISEO_CAMERA_METADATA_CAPABILITY_V1", "requestId" to r.requestId,
            "version" to 1,
            "enabled" to (live.metadataEnabled && live.apiLevel >= 34 && live.connected && live.unlocked),
            "cameraTargetPackage" to "com.openai.chatgpt", "readOnly" to true,
            "pixelsRead" to false, "gestureDispatched" to false, "cameraSettingsChanged" to false,
            "automaticZoomEnabled" to false, "restoreVerified" to false, "cameraSurfaceMatched" to false
        )
    }
    private fun hex(s: String, length: Int) = s.matches(Regex("[a-f0-9]{$length}"))
}
