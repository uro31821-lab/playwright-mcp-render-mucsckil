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
SIGNATURE = (
    "@Composable\nfun CapturePreviewScreen(\n"
    "    preview: CapturePreview,\n"
    "    onDismiss: () -> Unit,\n"
    "    modifier: Modifier = Modifier,\n"
    ") {"
)
SHARE_LABEL = "          Text(text = stringResource(R.string.share), color = Color.White)\n"
STATE_CODE = '''  // Only the explicitly confirmed photo may be offered to JH. Reset on new preview.
  var showJhConfirm by remember(preview) { mutableStateOf(false) }
  var jhPrivacyConfirmed by remember(preview) { mutableStateOf(false) }
  var jhSendSubmitted by remember(preview) { mutableStateOf(false) }
'''
BUTTON = '''          if (preview is CapturePreview.Photo) {
            // No server-approved credential => button stays disabled.
            androidx.compose.material3.Button(
                onClick = {
                  if (jhTransferEnabled && !jhSendSubmitted) {
                    jhPrivacyConfirmed = false
                    showJhConfirm = true
                  }
                },
                enabled = jhTransferEnabled && !jhSendSubmitted,
                modifier = Modifier.testTag("jh_transfer_button"),
            ) {
              Text(text = "JH로 보내기")
            }
            if (!jhTransferEnabled) {
              Text(text = "JH 보안 연결 검증 후 활성화", color = Color.LightGray)
            }
          }
'''
CONFIRM = '''
  if (showJhConfirm && preview is CapturePreview.Photo) {
    androidx.compose.material3.AlertDialog(
        modifier = Modifier.testTag("jh_photo_consent_dialog"),
        onDismissRequest = { showJhConfirm = false },
        title = { Text("JH 사진 전송 확인") },
        text = {
          Column {
            Text("이 사진은 JH로 전달됩니다. 환자나 다른 사람의 개인정보가 있다면 취소하세요.")
            Row(verticalAlignment = Alignment.CenterVertically) {
              androidx.compose.material3.Checkbox(
                  checked = jhPrivacyConfirmed,
                  onCheckedChange = { jhPrivacyConfirmed = it },
                  modifier = Modifier.testTag("jh_privacy_checkbox"),
              )
              Text("환자·개인 식별정보가 없는 사진임을 확인")
            }
          }
        },
        confirmButton = {
          androidx.compose.material3.TextButton(
              enabled = jhTransferEnabled && jhPrivacyConfirmed && !jhSendSubmitted,
              modifier = Modifier.testTag("jh_final_send_button"),
              onClick = {
                showJhConfirm = false
                if (jhTransferEnabled && jhPrivacyConfirmed && !jhSendSubmitted) {
                  jhSendSubmitted = true // never dispatch twice from the same preview
                  onJhTransferPhoto(preview.bitmap)
                }
              },
          ) { Text("전송 승인") }
        },
        dismissButton = {
          androidx.compose.material3.TextButton(onClick = { showJhConfirm = false }) {
            Text("취소")
          }
        },
    )
  }
'''


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
            "jhTransferEnabled: Boolean = false", 'jh_photo_consent_dialog',
            'jh_privacy_checkbox', 'jh_final_send_button', 'Intent.ACTION_SEND',
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
        "    onJhTransferPhoto: (android.graphics.Bitmap) -> Unit = {},\n"
        "    jhTransferEnabled: Boolean = false,\n",
    ))
    text = text.replace(context_marker, context_marker + STATE_CODE)
    text = text.replace(SHARE_LABEL, SHARE_LABEL + BUTTON)
    text = text.replace(trailer, CONFIRM + trailer)
    if (text.count('Modifier.testTag("jh_transfer_button")') != 1 or
        text.count('jh_photo_consent_dialog') != 1 or
        text.count('Intent.ACTION_SEND') != 1):
        fail("Patch output validation failed")
    target = root / CODEC
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(kotlin_file.read_bytes())
    original.write_text(text, encoding="utf-8", newline="\n")
    return "APPLIED"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        fail("Specify CameraAccess project directory")
    print("JH_GLASS_CAMERAACCESS_PATCH_" + patch(
        Path(sys.argv[1]), Path(__file__).with_name("JhGlassPhotoClient.kt")
    ))