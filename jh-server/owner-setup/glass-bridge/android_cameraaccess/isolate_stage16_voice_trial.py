#!/usr/bin/env python3
"""Stage16 immutable Meta CameraAccess side-by-side VOICE TEST app identity.

Must be run only AFTER the pinned official Meta 1.0.1 CameraAccess source
has been copied into an isolated temporary checkout and the source-only JH
voice patch has been applied. Never patch an installed JH or CameraAccess app.

There is intentionally no signing or installation here; private WDC IDs and
client tokens live solely in a machine's ignored local.properties file.
"""
from pathlib import Path
import sys

TRIAL_ID = "com.koreanlifehub.jhglassprobe"
UPSTREAM_ID = "com.meta.wearable.dat.externalsampleapps.cameraaccess"
MAIN_ID = "com.koreanlifehub.bridge"
TRIAL_NAME = "JH Glass Trial"
TRIAL_SCHEME = "jhglassprobe"
GRADLE = Path("app/build.gradle.kts")
MANIFEST = Path("app/src/main/AndroidManifest.xml")
STRINGS = Path("app/src/main/res/values/strings.xml")
VOICE = Path("app/src/main/java/com/meta/wearable/dat/externalsampleapps/cameraaccess/jhglass/JhGlassVoiceProbe.kt")

def once(text, needle, where):
    if text.count(needle) != 1:
        raise RuntimeError("STAGE16_PINNED_SOURCE_MISMATCH:" + where)

def isolate(root: Path) -> str:
    root = root.resolve()
    locations = [root / path for path in (GRADLE, MANIFEST, STRINGS, VOICE)]
    if not all(p.is_file() for p in locations):
        raise RuntimeError("STAGE16_REQUIRED_VOICE_SOURCE_MISSING")
    gradle, manifest, strings = (p.read_text("utf-8") for p in locations[:3])
    if ("implementation(libs.mwdat.speech)" not in gradle or
            "class JhGlassVoiceProbe" not in locations[3].read_text("utf-8")):
        raise RuntimeError("STAGE16_STAGE15_VOICE_PATCH_REQUIRED")

    if f'applicationId = "{TRIAL_ID}"' in gradle:
        if (TRIAL_NAME in strings and
                f'android:scheme="{TRIAL_SCHEME}"' in manifest and
                f'android:scheme="cameraaccess"' not in manifest and
                f'applicationId = "{UPSTREAM_ID}"' not in gradle):
            return "ALREADY_ISOLATED"
        raise RuntimeError("STAGE16_PARTIAL_ISOLATION_BLOCKED")

    for label, original in (
        ("applicationId", f'applicationId = "{UPSTREAM_ID}"'),
        ("app_name", '<string name="app_name" description="Launcher label / app name">Camera Access</string>'),
        ("deep_link", 'android:scheme="cameraaccess"'),
    ):
        once(gradle if label=="applicationId" else strings if label=="app_name" else manifest,
             original, label)

    # Do NOT touch namespace, components, permissions, versionCode, signing.
    newgradle = gradle.replace(f'applicationId = "{UPSTREAM_ID}"',
                               f'applicationId = "{TRIAL_ID}"')
    newstrings = strings.replace(
        '<string name="app_name" description="Launcher label / app name">Camera Access</string>',
        f'<string name="app_name" description="Launcher label / app name">{TRIAL_NAME}</string>')
    newmanifest = manifest.replace('android:scheme="cameraaccess"',
                                   f'android:scheme="{TRIAL_SCHEME}"')

    # Defensive cross-check to prevent package collisions and extra permissions.
    if (newgradle.replace(f'applicationId = "{TRIAL_ID}"',
                          f'applicationId = "{UPSTREAM_ID}"') != gradle or
        newmanifest.replace(f'android:scheme="{TRIAL_SCHEME}"',
                            'android:scheme="cameraaccess"') != manifest or
        newstrings.replace(f'>{TRIAL_NAME}</string>',
                           '>Camera Access</string>') != strings):
        raise RuntimeError("STAGE16_EDIT_SCOPE_MISMATCH")
    for p,data in zip(locations[:3],[newgradle,newmanifest,newstrings]):
        p.write_text(data,encoding="utf-8",newline="\n")
    return "ISOLATED"

if __name__ == "__main__":
    if len(sys.argv)!=2:
        raise SystemExit("Usage: isolate_stage16_voice_trial.py PINNED_CAMERAACCESS_CHECKOUT")
    try:
        print("JH_GLASS_STAGE16_" + isolate(Path(sys.argv[1])))
    except Exception as exc:
        raise SystemExit("JH_GLASS_STAGE16_BLOCKED:" + str(exc))
