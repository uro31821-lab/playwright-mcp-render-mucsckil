#!/usr/bin/env python3
"""Fail-closed, pinned CameraAccess UI patch. Never overwrites an installed app.

Usage: python apply_cameraaccess_patch.py /path/to/samples/CameraAccess
Requires upstream: meta/meta-wearables-dat-android commit
f4371bc9f90249d51eb07d7f8a61e8d829294f16
"""
from pathlib import Path
import sys

BASE = Path("app/src/main/java/com/meta/wearable/dat/externalsampleapps/cameraaccess")
UI = BASE / "ui/CapturePreviewScreen.kt"
CODEC = BASE / "jhglass/JhGlassPhotoClient.kt"
BUTTON = '''          if (preview is CapturePreview.Photo) {
            // This button remains disabled until a real verified Secure56
            // pairing provider is wired in the existing JH Android app.
            androidx.compose.material3.Button(
                onClick = { onJhTransferPhoto(preview.bitmap) },
                enabled = jhTransferEnabled,
                modifier = Modifier.testTag("jh_transfer_button"),
            ) {
              Text(text = "JH로 보내기")
            }
            if (!jhTransferEnabled) {
              Text(text = "JH 보안 연결 검증 후 활성화", color = Color.LightGray)
            }
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
        if "jhTransferEnabled: Boolean = false" not in text:
            fail("Existing JH button is not default-disabled")
        return "ALREADY_APPLIED"
    expected = (
        "@Composable\nfun CapturePreviewScreen(\n"
        "    preview: CapturePreview,\n"
        "    onDismiss: () -> Unit,\n"
        "    modifier: Modifier = Modifier,\n"
        ") {"
    )
    if text.count(expected) != 1:
        fail("Unexpected upstream preview signature; do not patch")
    if text.count("          Text(text = stringResource(R.string.share), color = Color.White)\n") != 1:
        fail("Unexpected upstream Share UI; do not patch")
    if "Intent.ACTION_SEND" not in text or "savePhotoToCache" not in text:
        fail("Official Share implementation changed")
    text = text.replace(expected, expected.replace("    modifier: Modifier = Modifier,\n",
        "    modifier: Modifier = Modifier,\n    onJhTransferPhoto: (android.graphics.Bitmap) -> Unit = {},\n    jhTransferEnabled: Boolean = false,\n"))
    insertion = "          Text(text = stringResource(R.string.share), color = Color.White)\n"
    text = text.replace(insertion, insertion + BUTTON)
    if text.count('Modifier.testTag("jh_transfer_button")') != 1:
        fail("Patch output invalid")
    if CODEC.as_posix() == UI.as_posix():
        fail("Unsafe destination")
    target = root / CODEC
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(kotlin_file.read_bytes())
    original.write_text(text, encoding="utf-8", newline="\n")
    return "APPLIED"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        fail("Specify CameraAccess project directory")
    state = patch(Path(sys.argv[1]), Path(__file__).with_name("JhGlassPhotoClient.kt"))
    print("JH_GLASS_CAMERAACCESS_PATCH_" + state)