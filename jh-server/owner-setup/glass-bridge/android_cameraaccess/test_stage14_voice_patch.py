import tempfile
import unittest
from pathlib import Path
from apply_handsfree_probe import patch, MAIN, VOICE, GRADLE, VOICEMARKER

ORIGINAL_MAIN = '''package com.meta.wearable.dat.externalsampleapps.cameraaccess
import androidx.activity.ComponentActivity
import kotlinx.coroutines.sync.Mutex
class MainActivity : ComponentActivity() {
  val viewModel: WearablesViewModel by viewModels()
  private val permissionCheckLauncher =
      registerForActivityResult(RequestMultiplePermissions()) { permissionsResult ->
        viewModel.onPermissionsResult(permissionsResult) {
          Wearables.initialize(this)
        }
      }
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    maybeStartMockDeviceTestServer()
    enableEdgeToEdge()
  }
  override fun onStart() {
    super.onStart()
  }
}
'''
ORIGINAL_GRADLE = '''dependencies {
  implementation(libs.mwdat.camera)
  implementation(libs.mwdat.mockdevice)
}
'''
class Stage14VoiceSourceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        main = self.root / MAIN
        main.parent.mkdir(parents=True)
        main.write_text(ORIGINAL_MAIN, encoding="utf-8")
        gradle = self.root / GRADLE
        gradle.parent.mkdir(parents=True, exist_ok=True)
        gradle.write_text(ORIGINAL_GRADLE, encoding="utf-8")
        self.overlay = Path(__file__).resolve().parent
    def tearDown(self):
        self.temp.cleanup()
    def test_applies_bounded_voice_patch_once_and_is_idempotent(self):
        self.assertEqual(patch(self.root, self.overlay),"APPLIED")
        self.assertEqual(patch(self.root, self.overlay),"ALREADY_APPLIED")
        main = (self.root/MAIN).read_text(encoding="utf-8")
        self.assertEqual(main.count(VOICEMARKER),1)
        self.assertIn("isVoiceInvocationsIntent(intent)",main)
        self.assertIn("override fun onNewIntent(intent: Intent)",main)
        self.assertIn("jhVoiceProbe.startOneVoiceQuestion(",main)
        self.assertIn("jhVoiceProbe.startVoiceLaunchListener",main)
        self.assertIn("jhVoiceProbe.close()",main)
    def test_upstream_camera_and_meta_permissions_untouched(self):
        self.assertEqual(patch(self.root,self.overlay),"APPLIED")
        src=(self.root/MAIN).read_text()
        for term in ("maybeStartMockDeviceTestServer()", "Wearables.initialize(this)",
                     "onPermissionsResult(permissionsResult)", "requestWearablesPermission"):
            if term=="requestWearablesPermission":
                self.assertIn("::requestWearablesPermission",src)
            else: self.assertIn(term,src)
        self.assertNotIn("MediaProjection",src)
        self.assertNotIn("ACTION_SEND",src)
    def test_only_speech_dependency_added(self):
        self.assertEqual(patch(self.root,self.overlay),"APPLIED")
        g=(self.root/GRADLE).read_text()
        self.assertEqual(g.count("implementation(libs.mwdat.speech)"),1)
        self.assertIn("implementation(libs.mwdat.camera)",g)
        self.assertIn("implementation(libs.mwdat.mockdevice)",g)
    def test_voice_source_never_calls_api_or_takes_a_photo(self):
        s=(self.overlay/"JhGlassVoiceProbe.kt").read_text()
        self.assertIn("startVoiceInvocationsStream",s)
        self.assertIn("is LaunchApp",s)
        self.assertIn("responseHandle.sendSuccess(null)",s)
        self.assertIn("Permission.MICROPHONE",s)
        self.assertIn("selected.addSpeech()",s)
        self.assertIn("recognition.transcriptions.first",s)
        self.assertIn("TextToSpeech",s)
        self.assertIn("Locale.KOREAN",s)
        self.assertNotIn("OPENAI_API_KEY",s)
        self.assertNotIn("capturePhoto(",s)
        self.assertNotIn("https://",s)
    def test_prior_unknown_upstream_activity_is_rejected_without_writes(self):
        p=self.root/MAIN
        orig=p.read_text()
        p.write_text(orig.replace("  override fun onStart() {","  override fun onNewIntent(intent: Intent) {"))
        with self.assertRaises(RuntimeError):
            patch(self.root,self.overlay)
        self.assertEqual((self.root/GRADLE).read_text(),ORIGINAL_GRADLE)
        self.assertFalse((self.root/VOICE).exists())
    def test_partial_existing_patch_is_blocked(self):
        p=self.root/MAIN
        p.write_text(ORIGINAL_MAIN.replace("class MainActivity : ComponentActivity() {",
              "class MainActivity : ComponentActivity() { // JH_GLASS_HANDSFREE_STAGE14"))
        with self.assertRaises(RuntimeError):
            patch(self.root,self.overlay)
    def test_copied_voice_source_preserved_exactly(self):
        self.assertEqual(patch(self.root,self.overlay),"APPLIED")
        self.assertEqual((self.root/VOICE).read_bytes(),
                         (self.overlay/"JhGlassVoiceProbe.kt").read_bytes())
    def test_no_new_android_permissions_or_foreground_service(self):
        self.assertEqual(patch(self.root,self.overlay),"APPLIED")
        src=(self.root/MAIN).read_text()
        self.assertNotIn("REQUEST_INSTALL_PACKAGES",src)
        self.assertNotIn("FOREGROUND_SERVICE",src)
        self.assertNotIn("Manifest.permission.RECORD_AUDIO",src)
        self.assertNotIn("getSharedPreferences",src)

if __name__ == "__main__":
    unittest.main()
