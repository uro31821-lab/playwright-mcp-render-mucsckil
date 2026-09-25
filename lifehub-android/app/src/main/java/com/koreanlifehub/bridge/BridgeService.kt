package com.koreanlifehub.bridge

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread
import kotlin.math.min

class BridgeService : AccessibilityService() {
    private val base = "https://life-hub-api-production.up.railway.app"
    private val deviceId by lazy {
        android.provider.Settings.Secure.getString(contentResolver, android.provider.Settings.Secure.ANDROID_ID) ?: "android"
    }
    @Volatile private var running = true

    override fun onServiceConnected() {
        super.onServiceConnected()
        thread(name = "lifehub-poll") { register(); loop() }
    }

    private fun conn(path: String, method: String = "GET"): HttpURLConnection {
        return (URL(base + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 20_000
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }
    }

    private fun register() {
        try {
            val c = conn("/device/register", "POST")
            c.doOutput = true
            val body = JSONObject().put("deviceId", deviceId).put("bridgeVersion", "6.0")
            c.outputStream.use { it.write(body.toString().toByteArray()) }
            c.inputStream.close()
        } catch (_: Exception) {}
    }

    private fun loop() {
        var idleMs = 1500L
        while (running) {
            var hadWork = false
            try {
                val c = conn("/device/poll?deviceId=" + java.net.URLEncoder.encode(deviceId, "UTF-8"))
                when (c.responseCode) {
                    200 -> {
                        val txt = c.inputStream.bufferedReader().readText()
                        if (txt.isNotBlank()) {
                            hadWork = true
                            idleMs = 1500L
                            handleJob(JSONObject(txt))
                        }
                    }
                    429 -> idleMs = min(idleMs * 2, 30_000L)
                }
            } catch (_: Exception) {
                idleMs = min(idleMs * 2, 30_000L)
            }
            if (!hadWork) idleMs = min((idleMs * 1.35).toLong(), 20_000L)
            try { Thread.sleep(idleMs) } catch (_: InterruptedException) {}
        }
    }

    private fun handleJob(j: JSONObject) {
        val id = j.optString("id")
        when (j.optString("type")) {
            "open_url" -> openUrlJob(id, j)
            "agent_snapshot" -> complete(id, snapshotResult())
            "agent_step" -> complete(id, stepResult(j))
            "agent_screenshot" -> screenshotJob(id)
            else -> complete(id, JSONObject().put("ok", false).put("error", "unsupported_job_type"))
        }
    }

    private fun openUrlJob(id: String, j: JSONObject) {
        val target = j.optString("target")
        val direct = j.optString("url")
        val u = if (direct.isNotBlank()) direct else when (target) {
            "다음" -> "https://www.daum.net/"
            "다음메일" -> "https://mail.daum.net/"
            "네이버" -> "https://www.naver.com/"
            "유튜브" -> "https://www.youtube.com/"
            "여기어때" -> "https://www.yeogi.com/"
            else -> target
        }
        try {
            if (u.startsWith("http") || u.startsWith("https") || u.startsWith("intent:") || u.startsWith("market:")) {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                complete(id, JSONObject().put("ok", true).put("url", u))
            } else {
                complete(id, JSONObject().put("ok", false).put("error", "invalid_url").put("url", u))
            }
        } catch (e: Exception) {
            complete(id, JSONObject().put("ok", false).put("error", e.message ?: "open_failed"))
        }
    }

    private fun snapshotResult(): JSONObject {
        val root = rootInActiveWindow ?: return JSONObject().put("ok", false).put("error", "no_active_window")
        val out = JSONArray()
        var count = 0
        fun walk(node: AccessibilityNodeInfo?, depth: Int) {
            if (node == null || count >= 350 || depth > 30) return
            val r = Rect(); node.getBoundsInScreen(r)
            val item = JSONObject()
                .put("text", node.text?.toString() ?: "")
                .put("desc", node.contentDescription?.toString() ?: "")
                .put("class", node.className?.toString() ?: "")
                .put("viewId", node.viewIdResourceName ?: "")
                .put("clickable", node.isClickable)
                .put("editable", node.isEditable)
                .put("enabled", node.isEnabled)
                .put("focused", node.isFocused)
                .put("bounds", "${r.left},${r.top},${r.right},${r.bottom}")
            if (item.optString("text").isNotBlank() || item.optString("desc").isNotBlank() || item.optBoolean("clickable") || item.optBoolean("editable")) {
                out.put(item); count++
            }
            for (i in 0 until node.childCount) walk(node.getChild(i), depth + 1)
        }
        walk(root, 0)
        return JSONObject()
            .put("ok", true)
            .put("package", root.packageName?.toString() ?: "")
            .put("count", out.length())
            .put("nodes", out)
    }

    private fun stepResult(j: JSONObject): JSONObject {
        val action = j.optString("action")
        val text = j.optString("text")
        val value = j.optString("value")
        return try {
            when (action) {
                "back" -> JSONObject().put("ok", performGlobalAction(GLOBAL_ACTION_BACK)).put("action", action)
                "home" -> JSONObject().put("ok", performGlobalAction(GLOBAL_ACTION_HOME)).put("action", action)
                "click" -> {
                    val coordinate = parseCoordinate(value)
                    val success = if (coordinate != null) tap(coordinate.first, coordinate.second) else clickByText(text.ifBlank { value })
                    JSONObject().put("ok", success).put("action", action).put("target", text.ifBlank { value })
                }
                "set_text" -> {
                    val success = setText(text, value)
                    JSONObject().put("ok", success).put("action", action).put("target", text)
                }
                else -> JSONObject().put("ok", false).put("error", "unknown_action")
            }
        } catch (e: Exception) {
            JSONObject().put("ok", false).put("error", e.message ?: "step_failed")
        }
    }

    private fun parseCoordinate(v: String): Pair<Float, Float>? {
        val p = v.split(',')
        if (p.size != 2) return null
        val x = p[0].trim().toFloatOrNull() ?: return null
        val y = p[1].trim().toFloatOrNull() ?: return null
        return Pair(x, y)
    }

    private fun tap(x: Float, y: Float): Boolean {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, 80)
        return dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    private fun findNode(query: String, editableOnly: Boolean = false): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val q = query.trim().lowercase()
        var fallback: AccessibilityNodeInfo? = null
        fun walk(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
            if (node == null) return null
            if (editableOnly && node.isEditable && fallback == null) fallback = node
            val t = node.text?.toString()?.lowercase() ?: ""
            val d = node.contentDescription?.toString()?.lowercase() ?: ""
            val id = node.viewIdResourceName?.lowercase() ?: ""
            val match = q.isNotBlank() && (t.contains(q) || d.contains(q) || id.contains(q))
            if (match && (!editableOnly || node.isEditable)) return node
            for (i in 0 until node.childCount) {
                val found = walk(node.getChild(i))
                if (found != null) return found
            }
            return null
        }
        return walk(root) ?: fallback
    }

    private fun clickByText(query: String): Boolean {
        var node = findNode(query, false) ?: return false
        var hops = 0
        while (!node.isClickable && node.parent != null && hops < 6) {
            node = node.parent
            hops++
        }
        return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    private fun setText(target: String, value: String): Boolean {
        val node = findNode(target, true) ?: return false
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
        }
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    private fun screenshotJob(id: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            complete(id, JSONObject().put("ok", false).put("error", "screenshot_requires_android_11"))
            return
        }
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
                override fun onSuccess(screenshot: ScreenshotResult) {
                    try {
                        val hardware = Bitmap.wrapHardwareBuffer(screenshot.hardwareBuffer, screenshot.colorSpace)
                        val software = hardware?.copy(Bitmap.Config.ARGB_8888, false)
                        screenshot.hardwareBuffer.close()
                        hardware?.recycle()
                        if (software == null) {
                            complete(id, JSONObject().put("ok", false).put("error", "bitmap_failed"))
                            return
                        }
                        val baos = ByteArrayOutputStream()
                        software.compress(Bitmap.CompressFormat.JPEG, 55, baos)
                        val data = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
                        complete(id, JSONObject()
                            .put("ok", true)
                            .put("mimeType", "image/jpeg")
                            .put("width", software.width)
                            .put("height", software.height)
                            .put("dataBase64", data))
                        software.recycle()
                    } catch (e: Exception) {
                        complete(id, JSONObject().put("ok", false).put("error", e.message ?: "screenshot_encode_failed"))
                    }
                }
                override fun onFailure(errorCode: Int) {
                    complete(id, JSONObject().put("ok", false).put("error", "screenshot_error_$errorCode"))
                }
            })
        } catch (e: Exception) {
            complete(id, JSONObject().put("ok", false).put("error", e.message ?: "screenshot_failed"))
        }
    }

    private fun complete(id: String, result: JSONObject) {
        if (id.isBlank()) return
        thread {
            try {
                val c = conn("/job/$id/complete", "POST")
                c.doOutput = true
                c.outputStream.use {
                    it.write(JSONObject().put("result", result).toString().toByteArray())
                }
                c.inputStream.close()
            } catch (_: Exception) {}
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}
    override fun onDestroy() { running = false; super.onDestroy() }
}
