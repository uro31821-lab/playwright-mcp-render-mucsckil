package com.koreanlifehub.bridge.foldable

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.view.accessibility.AccessibilityWindowInfo

/**
 * Candidate adapter for a future merge into the CURRENT signed JH167 APK.
 * No auto-click, new permission, transport or signature implementation.
 * Never treat these observations as Secure56-verified proof without the
 * existing signed Android snapshot job and existing authorization chain.
 *
 * Android AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS and
 * canRetrieveWindowContent=true are required for service.windows.
 * The existing APK must already have/obtain those permissions legitimately.
 */
data class FoldPaneObservation(
    val browserPackage: String,
    val browserWindowId: Int,
    val browserBounds: Rect,
    val gptWindowId: Int,
    val gptBounds: Rect,
    val observedAtMs: Long,
    val foldPosture: String = "UNKNOWN" // not inferred from width
)

private val browserPackages = setOf(
    "com.android.chrome",
    "com.sec.android.app.sbrowser",
    "org.mozilla.firefox"
)

/** Uses two interactive *application* windows, not the focused root alone. */
fun observeLeftBrowserRightGpt(service: AccessibilityService): FoldPaneObservation? {
    val candidates = service.windows.orEmpty().filter {
        it.type == AccessibilityWindowInfo.TYPE_APPLICATION && it.root != null
    }
    fun bounds(win: AccessibilityWindowInfo): Rect =
        Rect().also { win.getBoundsInScreen(it) }
    val leftBrowsers = candidates.filter {
        it.root?.packageName?.toString() in browserPackages
    }
    val rightGpts = candidates.filter {
        it.root?.packageName?.toString() == "com.openai.chatgpt"
    }
    if (leftBrowsers.size != 1 || rightGpts.size != 1) return null
    val browser = leftBrowsers.single()
    val gpt = rightGpts.single()
    if (browser.id == gpt.id) return null
    val left = bounds(browser)
    val right = bounds(gpt)
    if (left.width() < 100 || right.width() < 100 ||
        left.height() < 100 || right.height() < 100 ||
        left.right > right.left ||
        minOf(left.bottom, right.bottom) - maxOf(left.top, right.top) < 100
    ) return null
    return FoldPaneObservation(
        browserPackage = browser.root?.packageName.toString(),
        browserWindowId = browser.id,
        browserBounds = left,
        gptWindowId = gpt.id,
        gptBounds = right,
        observedAtMs = System.currentTimeMillis()
    )
}
