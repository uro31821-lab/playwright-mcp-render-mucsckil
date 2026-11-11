package com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass

/**
 * A FULL final utterance can request exactly one photo; partial transcripts and
 * incidental speech must never turn the camera on. Tests use this pure JVM
 * predicate. No recording, storage, camera, or API access is performed here.
 */
internal object GGlassOnePhotoCommand {
  fun matchesFinalUtterance(text: String, isFinal: Boolean): Boolean {
    if (!isFinal || text.length > 80) return false
    val normalized = text
        .lowercase(java.util.Locale.KOREAN)
        .replace(Regex("[\\s,.!?！？。·]"), "")
    return normalized in setOf(
        "이게뭐야", "이거뭐야", "이게뭔지알려줘", "이것이뭐야",
        "지글라스이게뭐야", "지글라스이거뭐야",
        "지글라스이게뭔지알려줘", "지글라스이것이뭐야",
    )
  }
}
