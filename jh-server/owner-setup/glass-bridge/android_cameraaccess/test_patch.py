import tempfile
import unittest
from pathlib import Path
from apply_cameraaccess_patch import patch, UI, CODEC, fail

PREVIEW = '''// CapturePreviewScreen - Shared preview/share for captures
import android.content.Intent
@Composable
fun CapturePreviewScreen(
    preview: CapturePreview,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
  val foo = Intent.ACTION_SEND
  val cache = savePhotoToCache
          Text(text = stringResource(R.string.share), color = Color.White)
}
'''

class CameraPatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / UI).parent.mkdir(parents=True)
        (self.root / UI).write_text(PREVIEW)
        self.codec = Path(__file__).with_name('JhGlassPhotoClient.kt')

    def tearDown(self): self.tmp.cleanup()

    def test_patch_is_default_disabled_and_keeps_original_share(self):
        self.assertEqual(patch(self.root,self.codec),'APPLIED')
        text=(self.root/UI).read_text()
        self.assertIn('jhTransferEnabled: Boolean = false',text)
        self.assertIn('Modifier.testTag("jh_transfer_button")',text)
        self.assertIn('enabled = jhTransferEnabled',text)
        self.assertIn('Intent.ACTION_SEND',text)
        self.assertIn('savePhotoToCache',text)
        self.assertTrue((self.root/CODEC).is_file())
        self.assertEqual(patch(self.root,self.codec),'ALREADY_APPLIED')

    def test_changed_upstream_fails_before_writing(self):
        (self.root / UI).write_text(PREVIEW.replace('modifier: Modifier = Modifier,','modifier: Modifier = UnknownModifier,'))
        with self.assertRaises(SystemExit): patch(self.root,self.codec)
        self.assertFalse((self.root/CODEC).exists())

    def test_patch_only_modifies_capture_preview(self):
        self.assertEqual(patch(self.root,self.codec),'APPLIED')
        self.assertEqual(len(list(self.root.rglob('*.kt'))),2)

    def test_sender_has_no_token_in_url_or_credential_logging(self):
        s=self.codec.read_text()
        self.assertIn('JhPairingProvider { null }',s)
        self.assertIn('https://jh-secure-bridge-fix4.onrender.com/jh-glass/v1/photo',s)
        self.assertIn('Authorization", "Bearer ${credential.pairingToken}',s)
        self.assertIn('private const val MAX_BYTES = 2 * 1024 * 1024',s)
        self.assertIn('conn.instanceFollowRedirects = false',s)
        self.assertIn('override fun toString(): String = "JhPairingCredential(<redacted>)"',s)
        self.assertNotIn('Log.',s)
        self.assertNotIn('getSharedPreferences(',s)
        self.assertNotIn('OPENAI_API_KEY',s)

if __name__=='__main__': unittest.main()