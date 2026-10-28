package com.koreanlifehub.bridge.foldable

import android.accessibilityservice.AccessibilityService
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri

/**
 * Candidate only. For insertion into ORIGINAL signed JH167 Secure56 Android
 * code after a verified signed open_url(target=left_web_link) job.
 *
 * This helper has NO authority to approve a job, issue an MCP message,
 * change a split-screen layout or confirm that the page has opened.
 */
data class LeftWebLinkDispatch(
    val dispatched: Boolean,
    val code: String,
    val packageName: String? = null,
    val windowIdBefore: Int? = null,
    val browserAddressVerified: Boolean = false,
    val splitAfterVerified: Boolean = false
)

private fun trustedHttpsLink(text: String): Uri? {
    if (text.isBlank() || text.length > 2048) return null
    val uri = try { Uri.parse(text) } catch (_: Exception) { return null }
    if (!uri.scheme.equals("https", ignoreCase = true)) return null
    if (uri.userInfo != null) return null
    if (uri.port != -1 && uri.port != 443) return null
    val host = uri.host?.lowercase() ?: return null
    if (host.length < 3 || !host.contains(".") ||
        host == "localhost" || host.endsWith(".local") ||
        host.endsWith(".internal") || host.endsWith(".onion") ||
        host.startsWith("[") || host.contains(":") ||
        Regex("^\\d+(?:\\.\\d+){3}$").matches(host)
    ) return null
    return uri
}

/**
 * Dispatches ONE package-scoped Android ACTION_VIEW intent.
 *
 * The original Secure56 handler must first authenticate, authorize and
 * durably journal the work. Its existing dedupe/unknown-outcome policy is
 * mandatory: this method must NEVER be retried automatically.
 *
 * A successful return only means Android accepted startActivity(), not that
 * the browser stayed LEFT, GPT stayed RIGHT, a URL loaded, or a button worked.
 * Those require another ORIGINAL signed accessibility snapshot/job readback.
 */
internal fun requestLeftWebLinkOnPhone(
    service: AccessibilityService,
    targetUrl: String,
    expectedBrowserPackage: String,
    expectedBrowserWindowId: Int
): LeftWebLinkDispatch {
    val url = trustedHttpsLink(targetUrl)
        ?: return LeftWebLinkDispatch(false, "LEFT_WEB_URL_REJECTED")
    val before = observeLeftBrowserRightGpt(service)
        ?: return LeftWebLinkDispatch(false, "LEFT_WEB_RIGHT_GPT_PAIR_REQUIRED")
    if (before.browserPackage != expectedBrowserPackage ||
        before.browserWindowId != expectedBrowserWindowId
    ) return LeftWebLinkDispatch(false, "LEFT_WEB_WINDOW_CHANGED_BEFORE_DISPATCH")
    val intent = Intent(Intent.ACTION_VIEW, url).apply {
        setPackage(before.browserPackage)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val resolved = try { service.packageManager.resolveActivity(intent, 0) }
                   catch (_: Exception) { null }
    if (resolved == null)
        return LeftWebLinkDispatch(false, "LEFT_BROWSER_INTENT_UNAVAILABLE")
    return try {
        service.startActivity(intent)
        LeftWebLinkDispatch(
            dispatched = true,
            code = "LEFT_WEB_INTENT_SENT_NEEDS_SIGNED_READBACK",
            packageName = before.browserPackage,
            windowIdBefore = before.browserWindowId,
            browserAddressVerified = false,
            splitAfterVerified = false
        )
    } catch (_: ActivityNotFoundException) {
        LeftWebLinkDispatch(false, "LEFT_BROWSER_ACTIVITY_NOT_FOUND")
    } catch (_: SecurityException) {
        LeftWebLinkDispatch(false, "LEFT_BROWSER_START_NOT_PERMITTED")
    } catch (_: Exception) {
        LeftWebLinkDispatch(false, "LEFT_BROWSER_START_RESULT_UNKNOWN_NO_RETRY")
    }
}
