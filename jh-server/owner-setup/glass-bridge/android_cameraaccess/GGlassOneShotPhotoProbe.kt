package com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass

import com.meta.wearable.dat.camera.addCamera
import com.meta.wearable.dat.camera.photo.Photo
import com.meta.wearable.dat.camera.photo.types.PhotoQuality
import com.meta.wearable.dat.camera.photo.types.PhotoResolution
import com.meta.wearable.dat.camera.photo.types.PhotoState
import com.meta.wearable.dat.camera.types.StreamConfiguration
import com.meta.wearable.dat.camera.types.VideoQuality
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Stage18 proof-of-capture: one explicitly requested photo from actual glasses.
 * It does NOT open a camera video stream, persist pictures, call network/GPT,
 * or grant OS/Meta permission. Only a success/failure STATUS leaves this scope.
 *
 * Never called for partial transcription, ordinary background speech, or
 * arbitrary phone speech. Existing DAT + a connected STARTED session are
 * prerequisites checked by its caller.
 */
internal object GGlassOneShotPhotoProbe {
  suspend fun captureOnce(session: DeviceSession, status: (String) -> Unit): Boolean =
      coroutineScope {
        val permission = Wearables.checkPermissionStatus(Permission.CAMERA).getOrNull()
        if (permission != PermissionStatus.Granted) {
          // First camera permission must be granted through a user-visible
          // setup gesture. In a locked-phone voice turn do NOT auto-open Meta AI.
          status("GLASSES_CAMERA_PERMISSION_REQUIRED")
          return@coroutineScope false
        }
        var camera: com.meta.wearable.dat.camera.Camera? = null
        var activePhoto: Photo? = null
        try {
          val attached = session.addCamera(
              StreamConfiguration(videoQuality = VideoQuality.LOW, frameRate = 2)
          ).getOrNull()
          if (attached == null) {
            status("GLASSES_CAMERA_UNAVAILABLE")
            return@coroutineScope false
          }
          camera = attached
          // Accessing this experimental standalone Photo capability starts it
          // lazily. No video stream is started.
          val photo = attached.photo
          activePhoto = photo
          val ready = withTimeoutOrNull(10_000) {
            photo.state.first { it == PhotoState.STARTED }
          }
          if (ready == null) {
            status("GLASSES_PHOTO_NOT_READY")
            return@coroutineScope false
          }
          val oneEvent = async(start = CoroutineStart.UNDISPATCHED) {
            // NEVER save, upload, decode, log or retain photo.imageData.
            // Receipt event only; image bytes are left inside the ephemeral
            // SDK object and made unreachable on scope completion.
            val captured = photo.photoStream.first()
            // The SDK exposes a byte-array image and metadata. Reject an
            // empty receipt; keep neither in a field, file, log or network.
            captured.imageData.isNotEmpty()
          }
          try {
            // Official DAT 1.0.1 Photo.capturePhoto() returns Unit;
            // success is proven ONLY by the subsequent photoStream receipt.
            photo.capturePhoto(
                resolution = PhotoResolution.FULL,
                quality = PhotoQuality.HIGH,
            )
            val received = withTimeoutOrNull(20_000) { oneEvent.await() } == true
            if (!received) {
              status("GLASSES_PHOTO_TRANSFER_TIMEOUT")
              return@coroutineScope false
            }
            status("GLASSES_ONE_PHOTO_EVENT_RECEIVED")
            return@coroutineScope true
          } finally {
            oneEvent.cancel()
          }
        } catch (cancel: CancellationException) {
          throw cancel
        } catch (_: Exception) {
          status("GLASSES_PHOTO_CAPTURE_ERROR")
          return@coroutineScope false
        } finally {
          // Stopping Camera invalidates standalone Photo and its stream.
          // No immediate auto-retry: one voice request permits one attempt.
          activePhoto?.stop()
          camera?.stop()
        }
      }
}
