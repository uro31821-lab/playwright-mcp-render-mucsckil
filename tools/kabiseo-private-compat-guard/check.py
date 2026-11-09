"""Local-only source preflight for JH PhotoMaster CameraX 1.4.2 consideration.
Never uploads or extracts private source. No app build, signing, installation, or
security authorization. A clean report is not proof of compiler compatibility.
"""
from __future__ import annotations
import argparse, hashlib, io, json, pathlib, re, sys, zipfile

EXPECTED_SHA="f4f85d1b3d9bbe66d392076e59ee967f4ff368a01b7a2bb5977afa6ecd59ee1c"
TARGET_FILES=("MainActivity.kt","SceneAnalyzer.kt")
NEWER_API_MARKERS=(
 "SessionConfig","LowLightBoost","CameraPresenceListener",
 "CameraPresenceSource","CompositionSettings","CameraUseCaseAdapterProvider",
 "PostviewSettings","TapToFocusInfo","CameraIdentifier",
 "FeatureCombinationQuery","GroupableFeature"
)
CALLS=("takePicture","bindToLifecycle","unbind","setZoomRatio",
       "setExposureCompensationIndex","startFocusAndMetering")
def sha(b:bytes)->str:return hashlib.sha256(b).hexdigest()

def strip_literals_and_comments(source:str)->str:
    """Conservative lexer. Keep punctuation/length/linebreaks; mask comments
    and string payloads so they do not create misleading API detections.
    Fail closed for unterminated strings or comment blocks.
    """
    out=[];i=0;state="CODE";nest=0
    while i<len(source):
        if state=="CODE":
            if source.startswith("//",i):out.extend("  ");i+=2;state="LINE"
            elif source.startswith("/*",i):out.extend("  ");i+=2;state="BLOCK";nest=1
            elif source.startswith('"""',i):out.extend("   ");i+=3;state="TRIPLE"
            elif source[i]=='"':out.append(" ");i+=1;state="STRING"
            elif source[i]=="'":out.append(" ");i+=1;state="CHAR"
            else:out.append(source[i]);i+=1
        elif state=="LINE":
            if source[i]=="\n":out.append("\n");i+=1;state="CODE"
            else:out.append(" ");i+=1
        elif state=="BLOCK":
            if source.startswith("/*",i):out.extend("  ");i+=2;nest+=1
            elif source.startswith("*/",i):out.extend("  ");i+=2;nest-=1;state="CODE" if nest==0 else "BLOCK"
            elif source[i]=="\n":out.append("\n");i+=1
            else:out.append(" ");i+=1
        elif state=="TRIPLE":
            if source.startswith('"""',i):out.extend("   ");i+=3;state="CODE"
            elif source[i]=="\n":out.append("\n");i+=1
            else:out.append(" ");i+=1
        else:
            if source[i]=="\\" and i+1<len(source):out.extend("  ");i+=2
            elif (source[i]=='"' and state=="STRING") or (source[i]=="'" and state=="CHAR"):
                out.append(" ");i+=1;state="CODE"
            elif source[i]=="\n" and state=="STRING":raise ValueError("UNTERMINATED_KOTLIN_STRING")
            else:out.append(" ");i+=1
    if state not in ("CODE","LINE"):raise ValueError("UNTERMINATED_KOTLIN_LEXICAL_ELEMENT")
    return "".join(out)

def count_call_args(text:str,open_paren:int):
    """Return comma-separated argument count, conservatively reject ambiguous
    delimiters and multilevel calls; no Kotlin overload is inferred here.
    """
    if text[open_paren]!="(":raise ValueError("CALL_START")
    stack=["("];i=open_paren+1;commas=0;nonspace=False
    while i<len(text):
        ch=text[i]
        if ch in "([{":stack.append(ch)
        elif ch in ")]}":
            if not stack or "([{".index(stack[-1])!=")]}".index(ch):
                return None
            stack.pop()
            if not stack:return 0 if not nonspace else commas+1
        elif ch=="," and len(stack)==1:commas+=1
        elif not ch.isspace() and len(stack)==1:nonspace=True
        i+=1
    return None

def analyze(name:str,code:str):
    text=strip_literals_and_comments(code)
    reported=[]
    for token in NEWER_API_MARKERS:
        for m in re.finditer(r"\b"+re.escape(token)+r"\b",text):
            reported.append({"line":text.count("\n",0,m.start())+1,
                             "kind":"NEWER_API_TOKEN","symbol":token})
    for m in re.finditer(r"\b("+ "|".join(CALLS)+r")\s*\(",text):
        name0=m.group(1);arity=count_call_args(text,text.index("(",m.start(1)))
        flag=None
        if arity is None:flag="UNPARSEABLE_CALL"
        elif name0=="takePicture" and arity>=4:flag="POSSIBLE_CAMERAX_15_FOUR_ARG_SAVE"
        # The SessionConfig type is independently caught above, and named
        # forwarding/extension methods are not proved safe by arity alone.
        if flag:reported.append({"line":text.count("\n",0,m.start())+1,
                                 "kind":flag,"symbol":name0,"arity":arity})
    return {"path":name,"sourceLines":len(code.splitlines()),
            "newerApiReviewFindings":sorted(reported,key=lambda x:x["line"]),
            "callNameOccurrences":{n:len(re.findall(r"\b"+re.escape(n)+r"\s*\(",text)) for n in CALLS},
            "sourceSha256":sha(code.encode("utf-8")),
            "lexicalOnly":True}

def scan_zip_bytes(archive:bytes,expected_sha=EXPECTED_SHA):
    archive_hash=sha(archive)
    if expected_sha and archive_hash!=expected_sha:raise ValueError("PRIVATE_PATCH_SHA_MISMATCH")
    if len(archive)>25*1024*1024:raise ValueError("ZIP_SIZE_LIMIT")
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        infos=z.infolist()
        if len(infos)>5000:raise ValueError("ZIP_ENTRY_LIMIT")
        total=0;seen=set();files=[]
        for item in infos:
            p=pathlib.PurePosixPath(item.filename);n=item.filename
            if n in seen or p.is_absolute() or ".." in p.parts or "\\" in n or ":" in n or item.flag_bits&1:
                raise ValueError("ZIP_PATH_REJECTED")
            if ((item.external_attr>>16)&0o170000)==0o120000:raise ValueError("ZIP_SYMLINK_REJECTED")
            total+=item.file_size
            if item.file_size>8*1024*1024 or total>65*1024*1024:raise ValueError("ZIP_CONTENT_LIMIT")
            seen.add(n)
            if item.is_dir():continue
            if n.endswith(".kt") and ("/photomaster/" in n.lower() or pathlib.PurePosixPath(n).name in TARGET_FILES):
                if item.file_size>750_000:raise ValueError("SOURCE_OVERSIZE")
                files.append((n,z.read(item)))
        if z.testzip() is not None:raise ValueError("ZIP_CRC_FAILED")
    if not files:raise ValueError("NO_PHOTOMASTER_SOURCES")
    findings=[analyze(n,b.decode("utf-8")) for n,b in sorted(files)]
    return {"schema":"JH_CAMERA_PRIVATE_142_LOCAL_SOURCE_PREFLIGHT_V035",
      "exactArchiveSha256":archive_hash,"examinedSources":len(findings),
      "sources":findings,"findingCount":sum(len(x["newerApiReviewFindings"]) for x in findings),
      "staticVerdict":"MANUAL_REVIEW_REQUIRED" if any(x["newerApiReviewFindings"] for x in findings) else "NO_KNOWN_15_ONLY_TOKEN_IN_INSPECTED_SOURCES",
      "importantLimit":"Not a Kotlin parser. Does not prove all 299 ABI differences absent, Android compile, or runtime behavior.",
      "privateArchiveExported":False,"modelInferred":False,"androidAppBuilt":False,
      "securityGateVerdict":"REVIEW","releaseApproved":False}

def fixture(code):
    b=io.BytesIO()
    with zipfile.ZipFile(b,"w",compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("app/src/main/java/com/jh/photomaster/MainActivity.kt",code)
        z.writestr("app/src/main/java/com/jh/photomaster/SceneAnalyzer.kt","class SceneAnalyzer {}")
    return b.getvalue()

def tests():
    checks={}
    def ok(key,condition):
        checks[key]=bool(condition)
        if not checks[key]:raise AssertionError(key)
    benign=fixture('''
        // SessionConfig bogus takePicture(a,b,c,d)
        val example = "LowLightBoost"
        val raw = """SessionConfig; takePicture(a,b,c,d)"""
        camera.cameraControl.setZoomRatio(1.2f)
        imageCapture.takePicture(options, executor, savedCallback)
        provider.bindToLifecycle(this, selector, preview, imageCapture)
    ''')
    base=scan_zip_bytes(benign,expected_sha=None)
    ok("benign_comments_strings_filtered",base["findingCount"]==0)
    ok("basic_camera_call_detected",base["sources"][0]["callNameOccurrences"]["takePicture"]==1)
    ok("four_arg_new_api_detected",scan_zip_bytes(fixture("capture.takePicture(a,b,c,d)"),None)["findingCount"]==1)
    ok("session_config_token_detected",scan_zip_bytes(fixture("val x = SessionConfig.Builder()"),None)["findingCount"]==1)
    ok("nested_comments_filtered",scan_zip_bytes(fixture("/* a /* SessionConfig */ b */ zoom.setZoomRatio(1f)"),None)["findingCount"]==0)
    try:scan_zip_bytes(benign,"0"*64)
    except ValueError as e:ok("sha_mismatch_rejected",str(e)=="PRIVATE_PATCH_SHA_MISMATCH")
    else:ok("sha_mismatch_rejected",False)
    try:scan_zip_bytes(fixture('val x = "unterminated'),None)
    except ValueError:ok("unterminated_string_rejected",True)
    else:ok("unterminated_string_rejected",False)
    unsafe=io.BytesIO()
    with zipfile.ZipFile(unsafe,"w") as z:z.writestr("../MainActivity.kt","test")
    try:scan_zip_bytes(unsafe.getvalue(),None)
    except ValueError as e:ok("zip_path_traversal_rejected",str(e)=="ZIP_PATH_REJECTED")
    else:ok("zip_path_traversal_rejected",False)
    ok("unclosed_call_rejected",count_call_args("takePicture(a,b",11) is None)
    ok("nested_arg_count",count_call_args("(a, fn(1,2), listOf(3,4))",0)==3)
    return checks

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--self-test",action="store_true")
    ap.add_argument("--zip")
    ap.add_argument("--expected-sha",default=EXPECTED_SHA)
    ap.add_argument("--out")
    args=ap.parse_args()
    if args.self_test:
        data={"tests":tests(),"scope":"Synthetic fixtures only, no private archive","releaseApproved":False}
    else:
        if not args.zip:ap.error("--zip is required unless --self-test")
        p=pathlib.Path(args.zip)
        data=scan_zip_bytes(p.read_bytes(),args.expected_sha)
    print("KABISEO_PRIVATE_SCAN_GUARD="+json.dumps(data,ensure_ascii=False,separators=(",",":"))[:10000])
    if args.out:pathlib.Path(args.out).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")

if __name__=="__main__":main()
