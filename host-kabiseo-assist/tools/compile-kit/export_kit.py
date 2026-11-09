#!/usr/bin/env python3
"""Export public compile inputs only; never copy credentials, Gradle home, app data or source."""
from pathlib import Path
import hashlib, json, os, shutil, zipfile
root=Path(__file__).resolve().parent
inputs=root/'build/compile-kit-input'
out=Path(os.environ['RUNNER_TEMP'])/'kabiseo-compile-kit'
out.mkdir()
for name in ('deps','compiler','sdk'):(out/name).mkdir()
seen=set()
for f in sorted((inputs/'dependencies').iterdir()):
    payloads=[]
    if f.suffix=='.jar':payloads=[(f.name,f.read_bytes())]
    elif f.suffix=='.aar':
        with zipfile.ZipFile(f) as z:
            for n in sorted(z.namelist()):
                if n=='classes.jar' or (n.startswith('libs/') and n.endswith('.jar')):
                    payloads.append((f.stem+'-'+n.replace('/','_'),z.read(n)))
    else:raise SystemExit('Unexpected dependency type: '+f.suffix)
    for name,data in payloads:
        digest=hashlib.sha256(data).hexdigest()
        if digest not in seen:(out/'deps'/name).write_bytes(data);seen.add(digest)
for f in (inputs/'compiler').iterdir():
    if f.suffix!='.jar':raise SystemExit('Unexpected compiler input')
    shutil.copy2(f,out/'compiler'/f.name)
sdk=Path(os.environ['ANDROID_HOME'])
shutil.copy2(sdk/'platforms/android-35/android.jar',out/'sdk/android.jar')
shutil.copy2(sdk/'build-tools/35.0.0/aapt2',out/'sdk/aapt2')
shutil.copy2(sdk/'build-tools/35.0.0/lib/d8.jar',out/'sdk/d8.jar')
shutil.copy2(inputs/'resolved-dependencies.tsv',out/'resolved-dependencies.tsv')
files={p.relative_to(out).as_posix():{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'size':p.stat().st_size} for p in sorted(out.rglob('*')) if p.is_file()}
report={'schema':'KABISEO_PUBLIC_HOST_COMPILE_KIT_V1','run_id':os.environ.get('GITHUB_RUN_ID'),'git_sha':os.environ.get('GITHUB_SHA'),'compiler':'Kotlin 1.9.24','sdk':35,'jvm_target':17,'application_compiled':False,'apk_built':False,'files':files}
(out/'MANIFEST.json').write_text(json.dumps(report,indent=2)+'\n')
print('COMPILE_KIT_FILES',len(files),'BYTES',sum(x['size'] for x in files.values()))
print('This is tooling preparation, NOT application compilation or phone validation.')
