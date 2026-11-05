#!/usr/bin/env python3
"""Read-only metadata contract subset. No APK, device, server, credentials or network."""
from pathlib import Path
import subprocess, tempfile, shutil
root=Path(__file__).resolve().parents[1]
if not all(shutil.which(x) for x in ("javac","java")):
    raise SystemExit("JDK 17+ required; tests NOT RUN")
package=root/"core/src/main/java/com/jh/pobiseo/assist"
names=("CameraMetadataRouteTests","CameraMetadataHardeningTests")
sources=[package/"CameraSurfacePolicy.java",package/"CameraMetadataRoute.java"]
sources += [root/"tests"/(name+".java") for name in names]
with tempfile.TemporaryDirectory(prefix="kabiseo-metadata-") as out:
    subprocess.run(["javac","--release","17","-Xlint:all","-Werror","-encoding","UTF-8","-d",out,*map(str,sources)],check=True)
    for name in names:
        subprocess.run(["java","-ea","-cp",out,"com.jh.pobiseo.assist."+name],check=True)
print("PASS: metadata JVM subset only. NOT Android/APK/live JH/device verification.")
