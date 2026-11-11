/*
 * Stage19 Android-only MockDeviceKit test of the already-compiled Stage18 G Glass code.
 * Synthetic images/phrases only. No real glasses, GPT API, credentials, network uploads,
 * production app or physical-device installation.
 */
package com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.selectors.SpecificDeviceSelector
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.core.types.RegistrationState
import com.meta.wearable.dat.mockdevice.MockDeviceKit
import com.meta.wearable.dat.mockdevice.api.GlassesModel
import com.meta.wearable.dat.mockdevice.api.MockDeviceKitConfig
import com.meta.wearable.dat.mockdevice.api.MockDeviceKitInterface
import com.meta.wearable.dat.mockdevice.api.MockGlasses
import com.meta.wearable.dat.mockdevice.api.speech.MockSpeechSource
import com.meta.wearable.dat.speech.addSpeech
import com.meta.wearable.dat.speech.removeSpeech
import com.meta.wearable.dat.speech.types.SpeechState
import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.delay
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GGlassStage19MockDeviceKitTest {
    private lateinit var context: Context
    private lateinit var kit: MockDeviceKitInterface
    private lateinit var glasses: MockGlasses
    private lateinit var session: DeviceSession
    private var testPhoto: File? = null

    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
        kit = MockDeviceKit.getInstance(context)
        kit.enable(MockDeviceKitConfig(initiallyRegistered = true, initialPermissionsGranted = true))
        glasses = kit.pairGlasses(GlassesModel.RAYBAN_META).getOrNull()
            ?: error("STAGE19_MOCK_PAIR_FAILED")
        glasses.powerOn()
        glasses.unfold()
        glasses.don()
        kit.permissions.set(Permission.CAMERA, PermissionStatus.Granted)
        kit.permissions.set(Permission.MICROPHONE, PermissionStatus.Granted)
        glasses.services.speech.setTranscriptionSource(MockSpeechSource.INJECTED)

        // Synthetic image only: no camera, patient data, gallery or network I/O.
        val file = File(context.cacheDir, "gglass-stage19-synthetic.jpg")
        val bitmap = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888)
        try {
            FileOutputStream(file).use { out ->
                assertTrue(bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out))
            }
        } finally {
            bitmap.recycle()
        }
        testPhoto = file
        val photoUri = Uri.fromFile(file)
        glasses.services.camera.setCapturedImage(photoUri)
        glasses.services.cameraCapture.setCapturedPhoto(photoUri)

        // MockDeviceKit registration and connection become visible asynchronously.
        // Wait for the SDK to observe this pair before requesting its session.
        session = runBlocking {
            withTimeout(20_000L) {
                Wearables.registrationState.first { it == RegistrationState.REGISTERED }
                Wearables.devices.first { it.contains(glasses.deviceIdentifier) }
                var selected: DeviceSession? = null
                for (attempt in 0 until 12) {
                    selected = Wearables.createSession(
                        SpecificDeviceSelector(glasses.deviceIdentifier)
                    ).getOrNull()
                    if (selected != null) break
                    delay(300L) // test-only transient connection readiness
                }
                selected ?: error("STAGE19_MOCK_SESSION_FAILED_AFTER_REGISTRATION")
            }
        }
        session.start()
        runBlocking {
            withTimeout(20_000L) {
                session.state.first { it == DeviceSessionState.STARTED }
            }
        }
    }

    @After
    fun tearDown() {
        if (::session.isInitialized) {
            session.stop()
            runBlocking {
                withTimeoutOrNull(5_000L) {
                    session.state.first { it == DeviceSessionState.STOPPED }
                }
            }
        }
        if (::kit.isInitialized) kit.disable()
        testPhoto?.delete()
    }

    @Test
    fun exactFinalUtteranceCanRequestOnePhoto() {
        assertTrue(GGlassOnePhotoCommand.matchesFinalUtterance("이게 뭐야?", true))
        assertTrue(GGlassOnePhotoCommand.matchesFinalUtterance("지글라스 이거 뭐야", true))
        assertFalse(GGlassOnePhotoCommand.matchesFinalUtterance("이게 뭐야?", false))
    }

    @Test
    fun ambientAndNegatedSpeechDoNotTriggerCamera() {
        assertFalse(GGlassOnePhotoCommand.matchesFinalUtterance("사진 찍지 마", true))
        assertFalse(GGlassOnePhotoCommand.matchesFinalUtterance("진료실에서 이게 뭐야 라고 했어", true))
        assertFalse(GGlassOnePhotoCommand.matchesFinalUtterance("이게 뭐야".repeat(25), true))
    }

    @Test
    fun deniedCameraPermissionFailsClosed() = runBlocking {
        kit.permissions.set(Permission.CAMERA, PermissionStatus.Denied)
        val status = mutableListOf<String>()
        val received = GGlassOneShotPhotoProbe.captureOnce(session) { status.add(it) }
        assertFalse(received)
        assertEquals(listOf("GLASSES_CAMERA_PERMISSION_REQUIRED"), status)
    }

    @Test
    fun injectedSpeechDeliversKoreanFinalOnMockGlasses() = runBlocking {
        val recognizer = session.addSpeech().getOrNull()
            ?: error("STAGE19_MOCK_SPEECH_ATTACH_FAILED")
        try {
            coroutineScope {
                val waiting = async(start = CoroutineStart.UNDISPATCHED) {
                    withTimeout(12_000L) {
                        recognizer.transcriptions.first {
                            it != null && it.isFinal && it.text.isNotBlank()
                        }
                    }
                }
                try {
                    val started = recognizer.start().getOrNull()
                    assertTrue("Speech start rejected", started != null)
                    // SDK start accepted is NOT the same as listening. Inject
                    // mock results only after the recognizer actually starts.
                    withTimeout(10_000L) {
                        recognizer.state.first { it == SpeechState.STARTED }
                    }
                    // The SDK may reinitialize the mock source during addSpeech/start.
                    // Bind INJECTED to the live recognizer and avoid immediate
                    // partial/final conflation in the SDK StateFlow.
                    glasses.services.speech.setTranscriptionSource(MockSpeechSource.INJECTED)
                    delay(350L)
                    glasses.services.speech.simulateTranscription("이게 뭐야", true, 0.95f)
                    val received = withTimeoutOrNull(9_000L) { waiting.await() }
                    assertTrue(
                        "SDK_MOCK_FINAL_MISSING state=${recognizer.state.value} " +
                            "sdkLast=${recognizer.transcriptions.value?.isFinal}",
                        received != null,
                    )
                    assertEquals("이게 뭐야", received?.text)
                } finally {
                    waiting.cancel()
                }
            }
        } finally {
            recognizer.stop()
            session.removeSpeech()
        }
    }

    @Test
    fun standalonePhotoReceivesOneSyntheticEventWithoutUpload() = runBlocking {
        val status = mutableListOf<String>()
        val received = GGlassOneShotPhotoProbe.captureOnce(session) { status.add(it) }
        assertTrue("No standalone synthetic photo event; statuses=$status", received)
        assertEquals("GLASSES_ONE_PHOTO_EVENT_RECEIVED", status.lastOrNull())
    }
}
