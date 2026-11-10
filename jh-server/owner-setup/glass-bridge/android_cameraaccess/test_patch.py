import tempfile
import unittest
from pathlib import Path
from apply_cameraaccess_patch import patch, UI, CODEC

PREVIEW = '''import android.content.Intent
import androidx.compose.runtime.Composable
@Composable
fun CapturePreviewScreen(
    preview: CapturePreview,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
  val context = LocalContext.current
  val source = Intent.ACTION_SEND
  val saved = savePhotoToCache
          Text(text = stringResource(R.string.share), color = Color.White)
}

@Composable
private fun VideoPreview(uri: Uri) {}
'''

class Stage7PatchTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.root = Path(self.d.name)
        (self.root / UI).parent.mkdir(parents=True)
        (self.root / UI).write_text(PREVIEW,encoding='utf-8')
        self.codec = Path(__file__).with_name('JhGlassPhotoClient.kt')

    def tearDown(self): self.d.cleanup()

    def test_default_disabled_consent_before_any_dispatch(self):
        self.assertEqual(patch(self.root,self.codec),'APPLIED')
        actual=(self.root/UI).read_text(encoding='utf-8')
        self.assertIn('jhTransferEnabled: Boolean = false',actual)
        self.assertIn('enabled = jhTransferEnabled && !jhSendSubmitted',actual)
        self.assertIn('jh_photo_consent_dialog',actual)
        self.assertIn('jh_privacy_checkbox',actual)
        self.assertIn('jh_final_send_button',actual)
        self.assertIn('jhPrivacyConfirmed && !jhSendSubmitted',actual)
        self.assertIn('jhSendSubmitted = true',actual)
        self.assertIn('onJhTransferPhoto(preview.bitmap)',actual)
        self.assertIn('Intent.ACTION_SEND',actual)
        self.assertIn('savePhotoToCache',actual)
        self.assertEqual(patch(self.root,self.codec),'ALREADY_APPLIED')

    def test_does_not_modify_unknown_upstream_code(self):
        p=self.root/UI
        p.write_text(PREVIEW.replace('modifier: Modifier = Modifier,','modifier: Modifier = Unknown,'))
        with self.assertRaises(SystemExit):patch(self.root,self.codec)
        self.assertFalse((self.root/CODEC).exists())
        self.assertEqual(p.read_text().count('jh_transfer_button'),0)

    def test_blocks_incompatible_prior_patch(self):
        p=self.root/UI
        p.write_text(PREVIEW.replace('  val context = LocalContext.current',
                                     '  val broken = "jh_transfer_button"'))
        with self.assertRaises(SystemExit):patch(self.root,self.codec)

    def test_reuses_only_official_preview_and_independent_client(self):
        self.assertEqual(patch(self.root,self.codec),'APPLIED')
        self.assertTrue((self.root/CODEC).exists())
        self.assertEqual(len(list(self.root.rglob('*.kt'))),2)

    def test_sender_default_no_network_and_no_secrets(self):
        s=self.codec.read_text()
        self.assertIn('JhPairingProvider { null }',s)
        self.assertIn('https://jh-secure-bridge-fix4.onrender.com/jh-glass/v1/photo',s)
        self.assertIn('Authorization", "Bearer ${credential.pairingToken}',s)
        self.assertIn('private const val MAX_BYTES = 2 * 1024 * 1024',s)
        self.assertIn('conn.instanceFollowRedirects = false',s)
        self.assertNotIn('Log.',s)
        self.assertNotIn('getSharedPreferences(',s)
        self.assertNotIn('OPENAI_API_KEY',s)

    def test_sender_verifies_end_to_end_receipt_and_unknown_status(self):
        s=self.codec.read_text()
        self.assertIn('"sha256") == sha256Hex(jpeg)',s)
        self.assertIn('"byteLength", -1) == jpeg.size',s)
        self.assertIn('requestMayHaveReachedServer',s)
        self.assertIn('JhPhotoSendResult.UnknownAfterSend',s)
        self.assertIn('JhPhotoSendResult.AlreadySubmitted',s)
        self.assertIn('tokenDigests.containsKey(fingerprint)',s)

if __name__=='__main__': unittest.main()