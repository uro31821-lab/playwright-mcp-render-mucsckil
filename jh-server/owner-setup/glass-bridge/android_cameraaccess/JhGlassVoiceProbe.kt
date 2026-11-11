/*
 * Stage14 hands-free feasibility probe for the official Meta CameraAccess
 * Android SDK 1.0.1; source-only candidate. NOT a finished JH assistant.
 * No GPT app, photo upload, online inference, recording or paid API calls.
 * Runtime has to be activated by an actual wearer-initiated voice launch.
 */
package com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.selectors.AutoDeviceSelector
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.core.types.RegistrationState
import com.meta.wearable.dat.core.voiceinvocations.startVoiceInvocationsStream
import com.meta.wearable.dat.core.voiceinvocations.types.actions.LaunchApp
import com.meta.wearable.dat.speech.addSpeech
import com.meta.wearable.dat.speech.types.TranscriptionResult
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Single-turn test only. The last spoken reply is fixed and never contains
 * picture facts: image understanding, offline models and JH routing are NOT
 * yet connected. A local media route that seems Bluetooth capable does not
 * PROVE that the sound came from Ray-Ban Meta; device test still required.
 */
class JhGlassVoiceProbe(
    context: Context,
    private val scope: CoroutineScope,
    private val status: (String) -> Unit = {},
) {
  private val appContext = context.applicationContext
  private var launchJob: Job? = null
  private var questionJob: Job? = null
  private var session: DeviceSession? = null
  private var tts: TextToSpeech? = null
  private var closed = false

  /** Opens only once SDK initialization/registration actually succeeds. */
  fun startVoiceLaunchListener(onLaunch: () -> Unit) {
    if (closed || launchJob?.isActive == true) return
    launchJob = scope.launch {
      var closeChannel: (() -> Unit)? = null
      try {
        // A voice launch can cold-start the Activity via its intent, while this
        // independent stream handles other delivered launches while alive.
        Wearables.registrationState.first { it == RegistrationState.REGISTERED }
        val stream = Wearables.startVoiceInvocationsStream(AutoDeviceSelector())
        closeChannel = { stream.close() }
        coroutineScope {
          launch { stream.errors.collect { status("VOICE_CHANNEL_ERROR") } }
          launch {
            stream.invocations.collect { invocation ->
              when (invocation) {
                is LaunchApp -> {
                  // Meta waits for exactly one response. Acknowledge before
                  // starting potentially slow microphone permission/session.
                  val answered = invocation.responseHandle.sendSuccess(null)
                  if (answered) onLaunch() else status("VOICE_LAUNCH_ACK_FAILED")
                }
              }
            }
          }
        }
      } catch (e: CancellationException) {
        throw e
      } catch (_: Exception) {
        status("VOICE_CHANNEL_UNAVAILABLE")
      } finally {
        closeChannel?.invoke()
      }
    }
  }

  /**
   * Entered from a real Meta voice launch intent/LaunchApp action ONLY.
   * Initial microphone approval may open Meta AI as required by DAT; this is
   * not an automatic security-popup click.
   */
  fun startOneVoiceQuestion(
      requestMicPermission: suspend (Permission) -> PermissionStatus
  ) {
    if (closed || questionJob?.isActive == true) return
    questionJob = scope.launch {
      try {
        val checked = Wearables.checkPermissionStatus(Permission.MICROPHONE).getOrNull()
        val permission = if (checked == PermissionStatus.Granted) checked
            else requestMicPermission(Permission.MICROPHONE)
        if (permission != PermissionStatus.Granted) {
          status("MICROPHONE_PERMISSION_REQUIRED")
          return@launch
        }

        val selected = Wearables.createSession(AutoDeviceSelector()).getOrNull()
        if (selected == null) {
          status("GLASSES_SESSION_UNAVAILABLE")
          return@launch
        }
        session = selected
        selected.start()
        val active = withTimeoutOrNull(12_000) {
          selected.state.first { it == DeviceSessionState.STARTED }
        }
        if (active == null) {
          status("GLASSES_SESSION_NOT_STARTED")
          return@launch
        }

        val recognition = selected.addSpeech().getOrNull()
        if (recognition == null) {
          status("GLASSES_SPEECH_UNAVAILABLE")
          return@launch
        }
        status("GLASSES_SPEECH_READY")
        try {
          // The collector starts UNDISTPATCHED before recognition.start(),
          // so even an immediate first final cannot be dropped.
          val finalDeferred = async(start = CoroutineStart.UNDISPATCHED) {
            recognition.transcriptions.first { result: TranscriptionResult? ->
              result != null && result.isFinal && result.text.isNotBlank()
            }
          }
          try {
            val started = recognition.start().getOrNull()
            if (started == null) {
              status("GLASSES_SPEECH_START_FAILED")
            } else {
              status("GLASSES_SPEECH_START_ACCEPTED")
              val heard = withTimeoutOrNull(18_000) { finalDeferred.await() }
              if (heard == null) {
                status("GLASSES_TRANSCRIPT_TIMEOUT")
              } else {
                status("GLASSES_FINAL_TRANSCRIPT_RECEIVED")
                // Intentional fixed known test words. NEVER persist the raw
                // recognized transcript, patient speech or ambient audio.
                val normalized = heard.text.filterNot(Char::isWhitespace)
                val matched = normalized.contains("에비서") && normalized.contains("안녕")
                status(if (matched) "KOREAN_TEST_PHRASE_MATCH"
                    else "KOREAN_TEST_PHRASE_NOT_MATCHED")
                recognition.stop()
                speakFixedTestReply()
              }
            }
          } finally {
            finalDeferred.cancel()
          }
        } finally {
          recognition.stop()
        }
      } catch (e: CancellationException) {
        throw e
      } catch (_: Exception) {
        status("VOICE_PROBE_FAILED")
      } finally {
        session?.stop()
        session = null
        status("VOICE_PROBE_STOPPED")
      }
    }
  }

  /** Does not force the phone loudspeaker on or override Android route. */
  private suspend fun speakFixedTestReply() {
    val manager = appContext.getSystemService(AudioManager::class.java)
    val supportsBluetoothOutput = manager?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        ?.any { device ->
          device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
              device.type == AudioDeviceInfo.TYPE_BLE_HEADSET
        } == true
    if (!supportsBluetoothOutput) {
      status("BLUETOOTH_MEDIA_OUTPUT_NOT_FOUND")
      return
    }
    val ready = CompletableDeferred<Boolean>()
    val engine = TextToSpeech(appContext) { result ->
      ready.complete(result == TextToSpeech.SUCCESS)
    }
    tts = engine
    try {
      if (withTimeoutOrNull(6000) { ready.await() } != true) {
        status("KOREAN_TTS_UNAVAILABLE")
        return
      }
      val support = engine.setLanguage(Locale.KOREAN)
      if (support == TextToSpeech.LANG_MISSING_DATA ||
          support == TextToSpeech.LANG_NOT_SUPPORTED) {
        status("KOREAN_TTS_VOICE_MISSING")
        return
      }
      engine.setAudioAttributes(
          AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build()
      )
      val spoken = CompletableDeferred<Boolean>()
      engine.setOnUtteranceProgressListener(
          object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit
            override fun onDone(utteranceId: String?) {
              spoken.complete(true)
            }
            override fun onError(utteranceId: String?) {
              spoken.complete(false)
            }
            override fun onError(utteranceId: String?, errorCode: Int) {
              spoken.complete(false)
            }
            override fun onStop(utteranceId: String?, interrupted: Boolean) {
              spoken.complete(false)
            }
          }
      )
      val result = engine.speak(
          "안경 음성 연결 시험입니다. 사진 분석은 아직 연결되지 않았습니다.",
          TextToSpeech.QUEUE_FLUSH, null, "jh_glass_probe_one"
      )
      if (result != TextToSpeech.SUCCESS) {
        status("KOREAN_TTS_QUEUE_REJECTED")
        return
      }
      val finished = withTimeoutOrNull(10_000) { spoken.await() }
      status(
          if (finished == true) "KOREAN_TTS_CALLBACK_DONE_ROUTE_UNVERIFIED"
          else "KOREAN_TTS_COMPLETION_UNVERIFIED"
      )
    } finally {
      // Never use a fixed 1.5-second cutoff that clips Korean replies.
      engine.stop()
      engine.shutdown()
      if (tts === engine) tts = null
    }
  }

  fun close() {
    closed = true
    questionJob?.cancel()
    launchJob?.cancel()
    session?.stop()
    session = null
    tts?.stop()
    tts?.shutdown()
    tts = null
  }
}
