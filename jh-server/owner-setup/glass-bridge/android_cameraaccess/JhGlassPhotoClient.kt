/*
 * JH Glass Bridge CameraAccess add-on — development candidate only.
 * Copyright (c) 2026 JH Glass Bridge contributors.
 *
 * NO production integration until Secure56 phone approval, owner binding,
 * HTTPS ingress, safe JPEG decoding, and chat-claim routing are verified.
 */
package com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass

import android.graphics.Bitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/**
 * A single 90-second, one-shot upload credential supplied by an authenticated,
 * phone-locally approved JH pairing provider. Never obtain it from an Intent,
 * clipboard, static API key, unverified deep link, or SharedPreferences.
 */
class JhPairingCredential(
    val requestId: String,
    val pairingToken: String,
    val expiresAtEpochMs: Long,
) {
  override fun toString(): String = "JhPairingCredential(<redacted>)"
}

/** The default provider has no credential and cannot initiate a request. */
fun interface JhPairingProvider {
  suspend fun getApprovedPairing(): JhPairingCredential?
}

sealed interface JhPhotoSendResult {
  data object NotConnected : JhPhotoSendResult
  data object ExpiredOrInvalid : JhPhotoSendResult
  data object ImageTooLargeOrInvalid : JhPhotoSendResult
  data object Rejected : JhPhotoSendResult
  data object NetworkUnavailable : JhPhotoSendResult
  data object Accepted : JhPhotoSendResult
}

/** Pixel-only re-encoding; no source file or original EXIF is copied. */
object JhPhotoJpegEncoder {
  private const val MAX_BYTES = 2 * 1024 * 1024
  private const val MAX_SIDE = 2304
  private val QUALITIES = intArrayOf(88, 76, 64, 52, 40)

  fun encode(bitmap: Bitmap): ByteArray? {
    if (bitmap.isRecycled || bitmap.width <= 0 || bitmap.height <= 0) return null
    val scale = minOf(1.0, MAX_SIDE.toDouble() / maxOf(bitmap.width, bitmap.height))
    var resized = if (scale < 1.0) {
      Bitmap.createScaledBitmap(bitmap, maxOf(1, (bitmap.width * scale).toInt()),
          maxOf(1, (bitmap.height * scale).toInt()), true)
    } else bitmap
    try {
      repeat(5) { attempt ->
        for (quality in QUALITIES) {
          val out = ByteArrayOutputStream()
          if (!resized.compress(Bitmap.CompressFormat.JPEG, quality, out)) return null
          val result = out.toByteArray()
          if (result.size in 32..MAX_BYTES && result[0] == 0xff.toByte() &&
              result[1] == 0xd8.toByte() && result[result.lastIndex - 1] == 0xff.toByte() &&
              result[result.lastIndex] == 0xd9.toByte()) {
            return result
          }
          result.fill(0)
        }
        if (attempt < 4) {
          val nextWidth = (resized.width * 0.75).toInt()
          val nextHeight = (resized.height * 0.75).toInt()
          if (minOf(nextWidth, nextHeight) < 160) return null
          val next = Bitmap.createScaledBitmap(resized, nextWidth, nextHeight, true)
          if (resized !== bitmap) resized.recycle()
          resized = next
        }
      }
      return null
    } finally {
      if (resized !== bitmap) resized.recycle()
    }
  }
}

/**
 * The upload credential NEVER appears in URLs, files, logs or clipboard.
 * The remote route deliberately does not exist on the production server yet.
 * With the default provider, this class performs **zero network requests**.
 */
class JhGlassPhotoClient(
    private val pairingProvider: JhPairingProvider = JhPairingProvider { null },
) {
  companion object {
    private const val JH_PHOTO_ENDPOINT =
        "https://jh-secure-bridge-fix4.onrender.com/jh-glass/v1/photo"
    private const val CREDENTIAL_PATTERN = "^[A-Za-z0-9_-]{43}$"
    private const val REQUEST_PATTERN = "^[A-Za-z0-9_-]{32}$"
    private const val MAX_PAIRING_MS = 90_000L
  }

  suspend fun sendPhoto(bitmap: Bitmap): JhPhotoSendResult {
    val credential = pairingProvider.getApprovedPairing() ?: return JhPhotoSendResult.NotConnected
    val now = System.currentTimeMillis()
    if (!credential.pairingToken.matches(Regex(CREDENTIAL_PATTERN)) ||
        !credential.requestId.matches(Regex(REQUEST_PATTERN)) ||
        credential.expiresAtEpochMs <= now ||
        credential.expiresAtEpochMs - now > MAX_PAIRING_MS) {
      return JhPhotoSendResult.ExpiredOrInvalid
    }
    return withContext(Dispatchers.IO) {
      val jpeg = JhPhotoJpegEncoder.encode(bitmap)
          ?: return@withContext JhPhotoSendResult.ImageTooLargeOrInvalid
      try {
        // Re-check after potentially expensive compression.
        if (credential.expiresAtEpochMs <= System.currentTimeMillis()) {
          return@withContext JhPhotoSendResult.ExpiredOrInvalid
        }
        val conn = URL(JH_PHOTO_ENDPOINT).openConnection() as HttpsURLConnection
        try {
          conn.requestMethod = "POST"
          conn.instanceFollowRedirects = false
          conn.connectTimeout = 10_000
          conn.readTimeout = 10_000
          conn.doOutput = true
          conn.useCaches = false
          conn.setRequestProperty("Authorization", "Bearer ${credential.pairingToken}")
          conn.setRequestProperty("Content-Type", "image/jpeg")
          conn.setRequestProperty("Cache-Control", "no-store")
          conn.setFixedLengthStreamingMode(jpeg.size)
          conn.outputStream.use { it.write(jpeg) }
          if (conn.responseCode != 202) return@withContext JhPhotoSendResult.Rejected
          // Read an intentionally bounded response and verify the actual receipt.
          val response = conn.inputStream.use { input ->
            val out = ByteArrayOutputStream()
            val chunk = ByteArray(1024)
            while (out.size() <= 4096) {
              val n = input.read(chunk)
              if (n == -1) break
              out.write(chunk, 0, n)
            }
            chunk.fill(0)
            out.toByteArray()
          }
          if (response.size > 4096) return@withContext JhPhotoSendResult.Rejected
          val validReceipt = try {
            val obj = JSONObject(String(response, Charsets.UTF_8))
            obj.optBoolean("ok") && obj.optString("code") == "PHOTO_RECEIVED"
          } finally {
            response.fill(0)
          }
          return@withContext if (validReceipt) JhPhotoSendResult.Accepted
              else JhPhotoSendResult.Rejected
        } finally {
          conn.disconnect()
        }
      } catch (_: Exception) {
        JhPhotoSendResult.NetworkUnavailable
      } finally {
        jpeg.fill(0)
      }
    }
  }
}