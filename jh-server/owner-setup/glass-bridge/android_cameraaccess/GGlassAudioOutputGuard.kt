package com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass

/** Source-only, pure Kotlin Bluetooth media output preflight.
 * Inspired by the hardware-routing risk described in the user's open-source
 * research, NOT copied from any third-party code.
 * A single available Bluetooth media output is merely a CANDIDATE, never
 * proof that TextToSpeech is actually routed to Ray-Ban Meta speakers.
 */
internal data class GGlassAudioOutput(val deviceId: Int, val deviceType: Int)

internal enum class GGlassAudioOutputReadiness {
    NONE,
    AMBIGUOUS,
    SINGLE_BLUETOOTH_CANDIDATE
}

internal object GGlassAudioOutputGuard {
    fun evaluate(outputs: List<GGlassAudioOutput>, mediaTypes: Set<Int>): GGlassAudioOutputReadiness {
        if (mediaTypes.isEmpty()) return GGlassAudioOutputReadiness.NONE
        val candidates = outputs.filter { it.deviceId > 0 && it.deviceType in mediaTypes }
        if (candidates.isEmpty()) return GGlassAudioOutputReadiness.NONE
        // A single ID with inconsistent types is not a stable route.
        val byId = candidates.groupBy { it.deviceId }
        if (byId.any { (_, devices) -> devices.map { it.deviceType }.distinct().size != 1 }) {
            return GGlassAudioOutputReadiness.AMBIGUOUS
        }
        return if (byId.size == 1) GGlassAudioOutputReadiness.SINGLE_BLUETOOTH_CANDIDATE
            else GGlassAudioOutputReadiness.AMBIGUOUS
    }
}
