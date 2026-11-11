package com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass

/**
 * Standalone Kotlin/JVM executable source test (no Android / SDK).
 * Run: kotlinc JhVoiceActivationGate.kt JhVoiceActivationGateSelfTest.kt
 *      -include-runtime -d /tmp/jh-voice-gate-test.jar
 *      && java -jar /tmp/jh-voice-gate-test.jar
 */
fun main() {
  var checked = 0
  fun eq(actual: Any?, expected: Any?, label: String) {
    check(actual == expected) { "$label: got $actual expected $expected" }
    checked++
  }
  var now = 100_000L
  val gate = JhVoiceActivationGate({ now })
  eq(gate.acceptVoiceLaunch(),true,"first")
  eq(gate.acceptVoiceLaunch(),false,"same-millisecond duplicate")
  now += 50
  eq(gate.acceptVoiceLaunch(),false,"Intent and stream within 50ms")
  now += 2_449
  eq(gate.acceptVoiceLaunch(),false,"before boundary")
  now += 1
  eq(gate.acceptVoiceLaunch(),true,"at boundary")
  now += 100
  eq(gate.acceptVoiceLaunch(),false,"duplicate on fresh window")
  now -= 50
  eq(gate.acceptVoiceLaunch(),false,"clock regression blocks replay")
  now = 105_001L
  eq(gate.acceptVoiceLaunch(),true,"new command after interval")
  now = -1
  eq(gate.acceptVoiceLaunch(),false,"invalid monotonic reading")
  now = 109_000
  eq(gate.acceptVoiceLaunch(),true,"healthy clock after invalid")
  val strict = JhVoiceActivationGate({ now },250L)
  eq(strict.acceptVoiceLaunch(),true,"shortest valid window")
  now += 249
  eq(strict.acceptVoiceLaunch(),false,"shorter than minimum")
  now += 1
  eq(strict.acceptVoiceLaunch(),true,"minimum boundary")
  var invalidRejected = false
  try { JhVoiceActivationGate({ 0L }, 0L) }
  catch (_: IllegalArgumentException) { invalidRejected = true }
  eq(invalidRejected,true,"zero window forbidden")
  invalidRejected = false
  try { JhVoiceActivationGate({ 0L },10_001L) }
  catch (_: IllegalArgumentException) { invalidRejected = true }
  eq(invalidRejected,true,"unbounded window forbidden")
  var updates = 0
  var seq = 90_000L
  val burst = JhVoiceActivationGate({ seq })
  repeat(100) { if (burst.acceptVoiceLaunch()) updates++ }
  eq(updates,1,"one action for burst of 100")
  println("JH_GLASS_VOICE_ACTIVATION_GATE_KOTLIN_PASS tests=$checked")
}
