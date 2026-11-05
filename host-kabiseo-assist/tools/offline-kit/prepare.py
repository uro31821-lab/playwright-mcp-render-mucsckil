#!/usr/bin/env python3
"""Seed public Android build dependencies. No JH source, credential, signing or device access."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,tarfile
base=Path(os.environ['RUNNER_TEMP'])
seed=base/'kabiseo-public-seed'
home=Path(os.environ['GRADLE_USER_HOME'])
sdk=Path(os.environ['ANDROID_HOME'])
mode=__import__('sys').argv[1]
def write(name,content):
 p=seed/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content,encoding='utf-8')
if mode=='seed':
 if seed.exists(): raise SystemExit('seed already exists')
 write('settings.gradle.kts','''pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name="PublicDependencySeed"
include(":app")
''')
 write('build.gradle.kts','''plugins {
 id("com.android.application") version "8.7.3" apply false
 id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
''')
 write('gradle.properties','org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nkotlin.compiler.execution.strategy=in-process\n')
 write('app/build.gradle.kts','''plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
 namespace="example.publicseed"
 compileSdk=35
 defaultConfig { applicationId="example.publicseed"; minSdk=26; targetSdk=35; versionCode=1; versionName="dependency-seed" }
 buildTypes { getByName("debug") { signingConfig=null }; getByName("release") { signingConfig=null; isMinifyEnabled=false } }
 compileOptions { sourceCompatibility=JavaVersion.VERSION_17; targetCompatibility=JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget="17" }
}
dependencies {
 implementation("com.squareup.okhttp3:okhttp:4.12.0")
 implementation("com.squareup.okio:okio-jvm:3.6.0")
 implementation("androidx.credentials:credentials:1.5.0")
 implementation("androidx.credentials:credentials-play-services-auth:1.5.0")
 implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
 implementation("com.google.mlkit:text-recognition-korean:16.0.1")
 testImplementation("junit:junit:4.13.2")
}
''')
 write('app/src/main/AndroidManifest.xml','<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="Public dependency seed" android:allowBackup="false" /></manifest>\n')
 write('app/src/main/java/example/publicseed/Seed.kt','package example.publicseed\nclass Seed { fun sum(a:Int,b:Int)=a+b }\n')
 write('app/src/test/java/example/publicseed/SeedTest.kt','package example.publicseed\nimport org.junit.Test\nimport org.junit.Assert.assertEquals\nclass SeedTest { @Test fun arithmetic(){ assertEquals(3,Seed().sum(1,2)) } }\n')
 print('PUBLIC_SEED_READY; this is not the JH app')
elif mode=='export':
 subprocess.run(['gradle','--stop'],check=True,cwd=seed)
 out=base/'kabiseo-offline-kit';out.mkdir(exist_ok=False)
 selections=[(base/'gradle-8.9','gradle-8.9'),(home/'caches/modules-2','gradle-home/caches/modules-2'),
             (sdk/'platforms/android-35','sdk/platforms/android-35')]
 for version in ('34.0.0','35.0.0'):
  p=sdk/'build-tools'/version
  if p.is_dir(): selections.append((p,'sdk/build-tools/'+version))
 if not (sdk/'build-tools/34.0.0/aapt2').is_file(): raise SystemExit('required AGP default Build Tools 34 missing')
 manifest={}
 with tarfile.open(out/'public-offline-kit.tar.gz','w:gz',compresslevel=3) as archive:
  for root,prefix in selections:
   if not root.is_dir(): raise SystemExit('required root missing: '+prefix)
   for p in sorted(root.rglob('*')):
    if p.is_dir(): continue
    if p.is_symlink(): raise SystemExit('unexpected toolchain symlink: '+str(p))
    if p.name.endswith('.lock') or p.name=='gc.properties' or p.suffix.lower() in ('.ttf','.otf','.woff','.woff2'): continue
    if not p.is_file(): raise SystemExit('unexpected file type')
    rel=prefix+'/'+p.relative_to(root).as_posix();data=p.read_bytes()
    manifest[rel]={'size':len(data),'sha256':hashlib.sha256(data).hexdigest(),'executable':bool(p.stat().st_mode&0o111)}
    archive.add(p,arcname=rel,recursive=False)
  raw=json.dumps({'schema':'KABISEO_PUBLIC_OFFLINE_KIT_V1','run_id':os.environ['GITHUB_RUN_ID'],
    'git_sha':os.environ['GITHUB_SHA'],'private_source_included':False,'files':manifest},sort_keys=True,indent=2).encode()
  import io
  info=tarfile.TarInfo('MANIFEST.json');info.size=len(raw);info.mode=0o644
  archive.addfile(info,io.BytesIO(raw))
 p=out/'public-offline-kit.tar.gz'
 digest=hashlib.sha256(p.read_bytes()).hexdigest()
 (out/'SHA256SUMS.txt').write_text(digest+'  '+p.name+'\n')
 print(json.dumps({'public_offline_kit_sha256':digest,'bytes':p.stat().st_size,'files':len(manifest),'host_app_built':False}))
else: raise SystemExit('expected seed or export')
