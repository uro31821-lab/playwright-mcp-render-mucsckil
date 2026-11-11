#!/usr/bin/env python3
"""Stage14 source-only voice+Speech+TTS probe on PINNED Meta CameraAccess.
No APK install, WDC registration, server deployment, API call or OS permission bypass.
python3 apply_handsfree_probe.py /path/to/samples/CameraAccess
"""
from pathlib import Path
import sys

BASE = Path("app/src/main/java/com/meta/wearable/dat/externalsampleapps/cameraaccess")
MAIN = BASE / "MainActivity.kt"
VOICE = BASE / "jhglass/JhGlassVoiceProbe.kt"
LAUNCH_GATE = BASE / "jhglass/JhVoiceActivationGate.kt"
GRADLE = Path("app/build.gradle.kts")
CATALOG = Path("gradle/libs.versions.toml")
VOICEMARKER = "JH_GLASS_HANDSFREE_STAGE14"

def require_once(text, needle):
    if text.count(needle) != 1:
        raise RuntimeError("STAGE14_PINNED_UPSTREAM_MISMATCH")
    return True

def patch(root: Path, overlay: Path) -> str:
    main_path = root / MAIN
    gradle_path = root / GRADLE
    catalog_path = root / CATALOG
    voice_path = overlay / "JhGlassVoiceProbe.kt"
    gate_path = overlay / "JhVoiceActivationGate.kt"
    if not all(p.is_file() for p in (main_path, gradle_path, catalog_path, voice_path, gate_path)):
        raise RuntimeError("STAGE14_SOURCE_FILES_MISSING")
    main = main_path.read_text("utf-8")
    gradle = gradle_path.read_text("utf-8")
    catalog = catalog_path.read_text("utf-8")
    if VOICEMARKER in main:
        if ("JhGlassVoiceProbe" in main and "libs.mwdat.speech" in gradle
                and 'mwdat-speech = ' in catalog and (root / VOICE).is_file()
                and (root / LAUNCH_GATE).is_file() and 'jhVoiceGate.acceptVoiceLaunch()' in main):
            return "ALREADY_APPLIED"
        raise RuntimeError("STAGE14_INCOMPATIBLE_PARTIAL_PATCH")
    # Nothing runs if DAT version/app source deviates from the pinned sample.
    for needle in (
        "class MainActivity : ComponentActivity() {",
        "  val viewModel: WearablesViewModel by viewModels()",
        "          Wearables.initialize(this)",
        "    maybeStartMockDeviceTestServer()",
        "  override fun onStart() {",
        "import androidx.activity.ComponentActivity",
        "import kotlinx.coroutines.sync.Mutex",
        "  override fun onCreate(savedInstanceState: Bundle?) {",
    ): require_once(main, needle)
    if "override fun onNewIntent(" in main or "override fun onDestroy(" in main:
        raise RuntimeError("STAGE14_UPSTREAM_LIFECYCLE_CHANGED")
    for needle in ("  implementation(libs.mwdat.camera)",):
        require_once(gradle, needle)
    if "mwdat.speech" in gradle or 'mwdat-speech = ' in catalog:
        raise RuntimeError("STAGE14_SPEECH_ALREADY_PATCHED")
    speech_dependency = 'mwdat-camera = { group = "com.meta.wearable", name = "mwdat-camera", version.ref = "mwdat" }'
    require_once(catalog, speech_dependency)
    if "class JhGlassVoiceProbe" not in voice_path.read_text("utf-8"):
        raise RuntimeError("STAGE14_VOICE_SOURCE_INVALID")
    if "class JhVoiceActivationGate" not in gate_path.read_text("utf-8"):
        raise RuntimeError("STAGE15_LAUNCH_GATE_MISSING")

    main = main.replace(
        "import androidx.activity.ComponentActivity\n",
        "import android.content.Intent\n"
        "import androidx.activity.ComponentActivity\n"
        "import androidx.compose.runtime.collectAsState\n"
        "import androidx.compose.runtime.getValue\n"
        "import kotlinx.coroutines.flow.MutableStateFlow\n"
        "import kotlinx.coroutines.flow.update\n"
        "import androidx.lifecycle.lifecycleScope\n"
        "import com.meta.wearable.dat.core.voiceinvocations.isVoiceInvocationsIntent\n"
        "import com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass.JhGlassVoiceProbe\n"
        "import com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass.JhVoiceActivationGate\n",
    )
    main = main.replace(
        "  val viewModel: WearablesViewModel by viewModels()\n",
        """  val viewModel: WearablesViewModel by viewModels()

  // JH_GLASS_HANDSFREE_STAGE14: experimental, NO backend API and no image use.
  // Meta AI can launch this app by app name only when its beta WDC setup works.
  // Status contains enum-like diagnostic codes ONLY, never a speech transcript.
  // This is a DEBUG-only in-memory hardware test view, not a GPT screen reader.
  private val jhVoiceEvents = MutableStateFlow(listOf("JH_VOICE_NOT_STARTED"))
  private val jhVoiceGate = JhVoiceActivationGate()
  private fun recordJhVoiceStatus(code: String) {
    if (!code.matches(Regex("^[A-Z0-9_]{3,64}$"))) return
    jhVoiceEvents.update { previous -> (previous + code).takeLast(5) }
  }
  private val jhVoiceProbe by lazy {
    JhGlassVoiceProbe(applicationContext, lifecycleScope, ::recordJhVoiceStatus)
  }
  private var jhDatReady = false
  private var jhVoiceLaunchPending = false

  private fun dispatchJhVoiceLaunch() {
    if (!jhDatReady || !jhVoiceLaunchPending) return
    jhVoiceLaunchPending = false
    if (!jhVoiceGate.acceptVoiceLaunch()) {
      recordJhVoiceStatus("VOICE_DUPLICATE_IGNORED")
      return
    }
    recordJhVoiceStatus("META_VOICE_INTENT_RECEIVED")
    jhVoiceProbe.startOneVoiceQuestion(::requestWearablesPermission)
  }

""",
    )
    main = main.replace(
        "          Wearables.initialize(this)\n",
        """          Wearables.initialize(this).onSuccess {
            jhDatReady = true
            recordJhVoiceStatus("DAT_INITIALIZED")
            // Meta may deliver BOTH an Intent and LaunchApp for one command.
            jhVoiceProbe.startVoiceLaunchListener {
              if (jhVoiceGate.acceptVoiceLaunch()) {
                recordJhVoiceStatus("META_VOICE_STREAM_RECEIVED")
                jhVoiceProbe.startOneVoiceQuestion(::requestWearablesPermission)
              } else {
                recordJhVoiceStatus("VOICE_DUPLICATE_IGNORED")
              }
            }
            dispatchJhVoiceLaunch()
          }.onFailure { _, _ ->
            recordJhVoiceStatus("DAT_INITIALIZATION_FAILED")
          }
""",
    )
    main = main.replace(
        "    super.onCreate(savedInstanceState)\n",
        """    super.onCreate(savedInstanceState)
    // Only a real SDK-validated app-launch intent activates voice capture.
    jhVoiceLaunchPending = savedInstanceState == null && isVoiceInvocationsIntent(intent)
""",
    )
    main = main.replace(
        "  override fun onStart() {\n",
        """  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    if (isVoiceInvocationsIntent(intent)) {
      jhVoiceLaunchPending = true
      dispatchJhVoiceLaunch()
    }
  }

  override fun onDestroy() {
    jhVoiceProbe.close()
    super.onDestroy()
  }

  override fun onStart() {
""",
    )

    # Keep the original Meta CameraAccess UI; add a DEBUG-only readout for
    # hardware trials when the voice wake phrase is not supported in ko-KR.
    setup_original = """    enableEdgeToEdge()
    setContent {
      CameraAccessScaffold(
          viewModel = viewModel,
          onRequestWearablesPermission = ::requestWearablesPermission,
          onRequestRecordAudioPermission = ::requestRecordAudioPermission,
      )
    }"""
    setup_debug = """    enableEdgeToEdge()
    setContent {
      androidx.compose.foundation.layout.Box {
        CameraAccessScaffold(
            viewModel = viewModel,
            onRequestWearablesPermission = ::requestWearablesPermission,
            onRequestRecordAudioPermission = ::requestRecordAudioPermission,
        )
        // This button is compiled only into DEBUG applications.
        // User taps it explicitly to test downstream Korean glasses ASR/TTS.
        if (BuildConfig.DEBUG) {
          val history by jhVoiceEvents.collectAsState()
          androidx.compose.material3.Surface(
              modifier = androidx.compose.ui.Modifier.align(
                  androidx.compose.ui.Alignment.TopCenter),
              color = androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.70f),
          ) {
            androidx.compose.foundation.layout.Column {
              androidx.compose.material3.Button(
                  onClick = {
                    if (!jhDatReady) {
                      recordJhVoiceStatus("DAT_NOT_INITIALIZED")
                    } else if (jhVoiceGate.acceptVoiceLaunch()) {
                      recordJhVoiceStatus("DEBUG_USER_TAP_STARTED")
                      jhVoiceProbe.startOneVoiceQuestion(::requestWearablesPermission)
                    } else {
                      recordJhVoiceStatus("VOICE_DUPLICATE_IGNORED")
                    }
                  },
                  enabled = jhDatReady,
              ) { androidx.compose.material3.Text("안경 음성 시험") }
              androidx.compose.material3.Text(
                  text = history.takeLast(3).joinToString("\\n"),
                  color = androidx.compose.ui.graphics.Color.White,
              )
            }
          }
        }
      }
    }"""
    require_once(main, setup_original)
    main = main.replace(setup_original, setup_debug)

    gradle = gradle.replace(
        "  implementation(libs.mwdat.camera)\n",
        "  implementation(libs.mwdat.camera)\n"
        "  // Stage14 experimental on-glasses speech support; no online inference.\n"
        "  implementation(libs.mwdat.speech)\n",
    )
    catalog = catalog.replace(speech_dependency, speech_dependency + '\n' +
        'mwdat-speech = { group = "com.meta.wearable", name = "mwdat-speech", version.ref = "mwdat" }')
    (root / VOICE).parent.mkdir(parents=True, exist_ok=True)
    (root / VOICE).write_bytes(voice_path.read_bytes())
    (root / LAUNCH_GATE).write_bytes(gate_path.read_bytes())
    main_path.write_text(main, encoding="utf-8", newline="\n")
    gradle_path.write_text(gradle, encoding="utf-8", newline="\n")
    catalog_path.write_text(catalog, encoding="utf-8", newline="\n")
    return "APPLIED"

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: apply_handsfree_probe.py /path/to/samples/CameraAccess")
    try:
        result = patch(Path(sys.argv[1]).resolve(), Path(__file__).resolve().parent)
        print("JH_GLASS_HANDSFREE_STAGE14_" + result)
    except Exception as error:
        raise SystemExit("JH_GLASS_HANDSFREE_STAGE14_BLOCKED: " + str(error))
