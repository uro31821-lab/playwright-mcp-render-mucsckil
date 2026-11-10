#!/usr/bin/env python3
"""Pinned, fail-closed CameraAccess source overlay (not an APK install).

Usage: python3 apply_cameraaccess_patch.py /path/to/samples/CameraAccess
Original Meta DAT commit f4371bc9f90249d51eb07d7f8a61e8d829294f16.
"""
from pathlib import Path
import sys

BASE = Path("app/src/main/java/com/meta/wearable/dat/externalsampleapps/cameraaccess")
UI = BASE / "ui/CapturePreviewScreen.kt"
CODEC = BASE / "jhglass/JhGlassPhotoClient.kt"
SIGNER = BASE / "jhglass/JhGlassDeviceSigner.kt"
SIGNATURE = (
    "@Composable\nfun CapturePreviewScreen(\n"
    "    preview: CapturePreview,\n"
    "    onDismiss: () -> Unit,\n"
    "    modifier: Modifier = Modifier,\n"
    ") {"
)
SHARE_LABEL = "          Text(text = stringResource(R.string.share), color = Color.White)\n"
STATE_CODE = '''  // A photo is sent only on an explicit tap. No repeated screen consent,
  // background upload, or automatic retry; reset on a NEW photo preview.
  var jhSendSubmitted by remember(preview) { mutableStateOf(false) }
'''
BUTTON = '''          if (preview is CapturePreview.Photo) {
            androidx.compose.material3.Button(
                onClick = {
                  // One explicit tap authorizes at most this photo. The signer
                  // and uploader must be invoked by the supplied trusted callback.
                  if (jhTransferEnabled && onJhTransferPhoto != null && !jhSendSubmitted) {
                    jhSendSubmitted = true
                    onJhTransferPhoto.invoke(preview.bitmap)
                  }
                },
                enabled = jhTransferEnabled && onJhTransferPhoto != null && !jhSendSubmitted,
                modifier = Modifier.testTag("jh_transfer_button"),
            ) {
              Text(text = "JH로 보내기")
            }
            if (!jhTransferEnabled || onJhTransferPhoto == null) {
              Text(text = "JH 최초 보안 연결 후 활성화", color = Color.LightGray)
            } else {
              Text(text = "누르면 이 사진 1장만 전송 · 환자·개인정보 전송 금지",
                   color = Color.LightGray)
            }
          }
'''
CONFIRM = ''


def fail(message):
    raise SystemExit("JH_GLASS_PATCH_BLOCKED: " + message)


def patch(root: Path, kotlin_file: Path) -> str:
    root = root.resolve()
    original = root / UI
    if not original.is_file():
        fail("Official CameraAccess source path not found")
    text = original.read_text(encoding="utf-8")
    if 'jh_transfer_button' in text:
        if all(token in text for token in (
            "jhTransferEnabled: Boolean = false", 'jhSendSubmitted = true',
            'onJhTransferPhoto.invoke', 'Intent.ACTION_SEND',
        )):
            return "ALREADY_APPLIED"
        fail("Unknown/previous JH patch exists; never auto-overwrite")
    if text.count(SIGNATURE) != 1:
        fail("Unexpected upstream preview signature; do not patch")
    if text.count(SHARE_LABEL) != 1 or "Intent.ACTION_SEND" not in text or "savePhotoToCache" not in text:
        fail("Unexpected upstream Share implementation; do not patch")
    context_marker = "  val context = LocalContext.current\n"
    imports_marker = "import androidx.compose.runtime.Composable\n"
    trailer = "\n}\n\n@Composable\nprivate fun VideoPreview("
    if text.count(context_marker) != 1 or text.count(imports_marker) != 1 or text.count(trailer) != 1:
        fail("Unexpected upstream Compose layout; do not patch")
    kotlin_file = kotlin_file.resolve()
    if not kotlin_file.is_file() or "class JhGlassPhotoClient" not in kotlin_file.read_text(encoding="utf-8"):
        fail("Missing verified sender source")
    text = text.replace(imports_marker, imports_marker +
        "import androidx.compose.foundation.layout.Row\n"
        "import androidx.compose.runtime.getValue\n"
        "import androidx.compose.runtime.setValue\n"
        "import androidx.compose.runtime.remember\n"
        "import androidx.compose.runtime.mutableStateOf\n")
    text = text.replace(SIGNATURE, SIGNATURE.replace(
        "    modifier: Modifier = Modifier,\n",
        "    modifier: Modifier = Modifier,\n"
        "    onJhTransferPhoto: ((android.graphics.Bitmap) -> Unit)? = null,\n"
        "    jhTransferEnabled: Boolean = false,\n",
    ))
    text = text.replace(context_marker, context_marker + STATE_CODE)
    text = text.replace(SHARE_LABEL, SHARE_LABEL + BUTTON)
    text = text.replace(trailer, CONFIRM + trailer)
    if (text.count('Modifier.testTag("jh_transfer_button")') != 1 or
        text.count('onJhTransferPhoto.invoke(preview.bitmap)') != 1 or
        text.count('Intent.ACTION_SEND') != 1):
        fail("Patch output validation failed")
    signer = kotlin_file.with_name("JhGlassDeviceSigner.kt")
    if not signer.is_file() or "class JhGlassDeviceSigner" not in signer.read_text(encoding="utf-8"):
        fail("Missing AndroidKeyStore signer source")
    target = root / CODEC
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(kotlin_file.read_bytes())
    (root / SIGNER).write_bytes(signer.read_bytes())
    original.write_text(text, encoding="utf-8", newline="\n")
    return "APPLIED"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        fail("Specify CameraAccess project directory")
    print("JH_GLASS_CAMERAACCESS_PATCH_" + patch(
        Path(sys.argv[1]), Path(__file__).with_name("JhGlassPhotoClient.kt")
    ))