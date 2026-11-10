import tempfile
import unittest
from pathlib import Path
from apply_cameraaccess_patch import patch, UI, CODEC, SIGNER

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

class Stage10PatchTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.root = Path(self.d.name)
        (self.root / UI).parent.mkdir(parents=True)
        (self.root / UI).write_text(PREVIEW,encoding='utf-8')
        self.codec = Path(__file__).with_name('JhGlassPhotoClient.kt')

    def tearDown(self): self.d.cleanup()

    def test_jh_button_requires_real_sender_and_one_explicit_tap(self):
        self.assertEqual(patch(self.root, self.codec), 'APPLIED')
        actual = (self.root/UI).read_text(encoding='utf-8')
        self.assertIn('jhTransferEnabled: Boolean = false', actual)
        self.assertIn('onJhTransferPhoto: ((android.graphics.Bitmap) -> Unit)? = null', actual)
        self.assertIn('enabled = jhTransferEnabled && onJhTransferPhoto != null && !jhSendSubmitted', actual)
        self.assertIn('jhSendSubmitted = true', actual)
        self.assertIn('onJhTransferPhoto.invoke(preview.bitmap)', actual)
        self.assertIn('Intent.ACTION_SEND', actual)
        self.assertIn('savePhotoToCache', actual)
        self.assertNotIn('jh_photo_consent_dialog', actual)
        self.assertNotIn('jh_privacy_checkbox', actual)
        self.assertNotIn('showJhConfirm', actual)
        self.assertIn('환자·개인정보 전송 금지', actual)
        self.assertEqual(patch(self.root, self.codec), 'ALREADY_APPLIED')

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
        self.assertEqual(len(list(self.root.rglob('*.kt'))),3)
        self.assertTrue((self.root/SIGNER).exists())

    def test_android_keystore_nonexportable_key_and_repeated_prompt_elimination(self):
        signer = Path(__file__).with_name("JhGlassDeviceSigner.kt").read_text()
        self.assertIn('KeyStore.getInstance("AndroidKeyStore")', signer)
        self.assertIn('ECGenParameterSpec("secp256r1")', signer)
        self.assertIn('Signature.getInstance("SHA256withECDSA")', signer)
        self.assertIn('.setUserAuthenticationRequired(false)', signer)
        self.assertIn('fun signUserRequestedPhoto(', signer)
        self.assertIn('JH_GLASS_PHOTO_INTENT_P256_V1', signer)
        self.assertIn('JH_GLASS_ENROLL_P256_V1', signer)
        self.assertNotIn('Log.', signer)
        self.assertNotIn('OPENAI_API_KEY', signer)

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