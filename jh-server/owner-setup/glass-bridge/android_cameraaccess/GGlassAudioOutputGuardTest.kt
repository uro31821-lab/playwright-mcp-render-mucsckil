package com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass

fun main() {
    var assertions = 0
    fun eq(expected: GGlassAudioOutputReadiness, actual: GGlassAudioOutputReadiness, title: String) {
        check(expected == actual) { "$title expected $expected actual $actual" }
        assertions++
    }
    val types = setOf(8, 26) // test IDs only; Android production passes SDK-defined constants
    val none = GGlassAudioOutputReadiness.NONE
    val one = GGlassAudioOutputReadiness.SINGLE_BLUETOOTH_CANDIDATE
    val ambiguous = GGlassAudioOutputReadiness.AMBIGUOUS
    fun r(vararg v: GGlassAudioOutput) = GGlassAudioOutputGuard.evaluate(v.toList(), types)
    eq(none, r(), "empty")
    eq(none, GGlassAudioOutputGuard.evaluate(listOf(GGlassAudioOutput(1, 8)), emptySet()), "empty types")
    eq(none, r(GGlassAudioOutput(1, 1)), "speaker only")
    eq(none, r(GGlassAudioOutput(0, 8)), "invalid id 0")
    eq(none, r(GGlassAudioOutput(-1, 8)), "invalid negative id")
    eq(one, r(GGlassAudioOutput(3, 8)), "one a2dp candidate")
    eq(one, r(GGlassAudioOutput(3, 26)), "one BLE candidate")
    eq(one, r(GGlassAudioOutput(3, 8), GGlassAudioOutput(4, 1)), "one BT plus speaker")
    eq(one, r(GGlassAudioOutput(3, 8), GGlassAudioOutput(3, 8)), "duplicate same output")
    eq(ambiguous, r(GGlassAudioOutput(3, 8), GGlassAudioOutput(4, 8)), "two BT headsets")
    eq(ambiguous, r(GGlassAudioOutput(3, 8), GGlassAudioOutput(4, 26)), "two BT profiles")
    eq(ambiguous, r(GGlassAudioOutput(3, 8), GGlassAudioOutput(3, 26)), "same id conflicting types")
    eq(none, r(GGlassAudioOutput(5, 3), GGlassAudioOutput(6, 5)), "wired devices")
    eq(one, r(GGlassAudioOutput(3, 8), GGlassAudioOutput(0, 8)), "ignore invalid secondary")
    eq(ambiguous, r(GGlassAudioOutput(3, 8), GGlassAudioOutput(2, 1), GGlassAudioOutput(5, 26)), "three devices two BT")
    eq(one, r(GGlassAudioOutput(3, 8), GGlassAudioOutput(4, 10)), "ignore non media BT")
    println("G_GLASS_AUDIO_ROUTE_GUARD_PASS assertions=$assertions")
}
