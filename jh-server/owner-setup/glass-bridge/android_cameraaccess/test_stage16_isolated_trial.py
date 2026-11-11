import tempfile
import unittest
from pathlib import Path
import test_stage14_voice_patch as stage14
from apply_handsfree_probe import patch as apply_stage15, MAIN, GRADLE, CATALOG
from isolate_stage16_voice_trial import (
    isolate, TRIAL_ID, UPSTREAM_ID, MAIN_ID, TRIAL_NAME, TRIAL_SCHEME, MANIFEST, STRINGS
)

MANIFEST_SOURCE = '''<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
  <uses-permission android:name="android.permission.INTERNET" />
  <application android:label="@string/app_name">
    <activity android:name=".MainActivity" android:exported="true">
      <intent-filter>
        <data android:scheme="cameraaccess" />
      </intent-filter>
    </activity>
    <provider android:authorities="${applicationId}.fileprovider"
        android:exported="false"/>
  </application>
</manifest>
'''
STRINGS_SOURCE = '''<resources>
  <string name="app_name" description="Launcher label / app name">Camera Access</string>
  <string name="share">Share</string>
</resources>
'''

class Stage16IsolatedVoiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.overlay = Path(__file__).resolve().parent
        original_gradle = stage14.ORIGINAL_GRADLE.replace(
            "  implementation(libs.mwdat.camera)", 
            f'  namespace = "{UPSTREAM_ID}"\n  applicationId = "{UPSTREAM_ID}"\n  implementation(libs.mwdat.camera)')
        for p,src in [
            (MAIN,stage14.ORIGINAL_MAIN),
            (GRADLE,original_gradle),
            (CATALOG,stage14.ORIGINAL_CATALOG),
            (MANIFEST,MANIFEST_SOURCE),
            (STRINGS,STRINGS_SOURCE),
        ]:
            out=self.root/p
            out.parent.mkdir(parents=True,exist_ok=True)
            out.write_text(src,encoding="utf-8")
        self.assertEqual(apply_stage15(self.root,self.overlay),"APPLIED")

    def tearDown(self): self.tmp.cleanup()

    def test_isolation_is_single_shot_and_idempotent(self):
        self.assertEqual(isolate(self.root),"ISOLATED")
        self.assertEqual(isolate(self.root),"ALREADY_ISOLATED")
        g=(self.root/GRADLE).read_text()
        self.assertIn(f'applicationId = "{TRIAL_ID}"',g)
        self.assertNotIn(f'applicationId = "{UPSTREAM_ID}"',g)

    def test_original_java_namespace_is_untouched(self):
        orig=(self.root/GRADLE).read_text()
        self.assertIn(f'namespace = "{UPSTREAM_ID}"',orig)
        isolate(self.root)
        self.assertIn(f'namespace = "{UPSTREAM_ID}"',(self.root/GRADLE).read_text())

    def test_original_installed_jh_and_cameraaccess_package_untouched(self):
        self.assertNotEqual(TRIAL_ID,UPSTREAM_ID)
        self.assertNotEqual(TRIAL_ID,MAIN_ID)
        isolate(self.root)
        self.assertEqual((self.root/MAIN).read_text().count("JH_GLASS_HANDSFREE_STAGE14"),1)

    def test_manifest_changes_exactly_one_deep_link_scheme(self):
        source=(self.root/MANIFEST).read_text()
        isolate(self.root)
        updated=(self.root/MANIFEST).read_text()
        self.assertEqual(updated.replace(f'android:scheme="{TRIAL_SCHEME}"',
                                         'android:scheme="cameraaccess"'),source)
        self.assertIn('${applicationId}.fileprovider',updated)
        self.assertIn('BLUETOOTH_CONNECT',updated)
        self.assertNotIn('REQUEST_INSTALL_PACKAGES',updated)
        self.assertNotIn('QUERY_ALL_PACKAGES',updated)

    def test_launcher_name_is_unique_for_WDC_trial_but_not_approved(self):
        before=(self.root/STRINGS).read_text()
        isolate(self.root)
        after=(self.root/STRINGS).read_text()
        self.assertEqual(after.replace(f'>{TRIAL_NAME}</string>',
                                       '>Camera Access</string>'),before)
        self.assertIn('>Share</string>',after)

    def test_requires_voice_overlay_first(self):
        g=self.root/GRADLE
        g.write_text(g.read_text().replace('  implementation(libs.mwdat.speech)',''))
        with self.assertRaises(RuntimeError): isolate(self.root)
        self.assertIn(f'applicationId = "{UPSTREAM_ID}"',g.read_text())

    def test_rejects_partial_package_change(self):
        g=self.root/GRADLE
        g.write_text(g.read_text().replace(f'applicationId = "{UPSTREAM_ID}"',
                                           f'applicationId = "{TRIAL_ID}"'))
        with self.assertRaises(RuntimeError): isolate(self.root)

    def test_rejects_nonpinned_missing_deeplink_and_preserves_files(self):
        m=self.root/MANIFEST
        m.write_text(m.read_text().replace('android:scheme="cameraaccess"',
                                           'android:scheme="other"'))
        g=(self.root/GRADLE).read_text()
        with self.assertRaises(RuntimeError): isolate(self.root)
        self.assertEqual((self.root/GRADLE).read_text(),g)

if __name__ == "__main__": unittest.main()
