package com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass

/**
 * A single Meta spoken "launch app" can arrive twice: as a validated Android
 * launch Intent AND as LaunchApp from the VoiceInvocationsStream. Those are
 * two deliveries of one user gesture, not consent to process two voice turns.
 *
 * Clock MUST be monotonic (elapsed real time), never wall clock.
 * This is an application-level duplicate gate, not a substitute for Meta
 * voice launch verification, OS permissions, or JH owner authorization.
 */
class JhVoiceActivationGate(
    private val nowMs: () -> Long = { System.nanoTime() / 1_000_000L },
    private val dedupeWindowMs: Long = 2_500L,
) {
  init {
    require(dedupeWindowMs in 250L..10_000L)
  }

  private var lastLaunchMs: Long? = null

  @Synchronized
  fun acceptVoiceLaunch(): Boolean {
    val current = nowMs()
    if (current < 0L) return false
    val previous = lastLaunchMs
    if (previous != null) {
      // A clock jump backwards is NOT permission to replay an old event.
      if (current < previous) return false
      if (current - previous < dedupeWindowMs) return false
    }
    lastLaunchMs = current
    return true
  }
}
