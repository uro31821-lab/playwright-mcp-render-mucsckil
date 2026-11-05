#!/usr/bin/env python3
"""Verified-only import of the historical three public CI tool parts. Execution NOT yet tested.
Arguments: --output NEW_DIR part0.zip=SHA256 part1.zip=SHA256 part2.zip=SHA256.
No network, original source mutation, signing or phone access.
"""
import argparse,hashlib,json,tarfile,zipfile
from pathlib import Path,PurePosixPath

def sha_file(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def run(output,args):
    if output.exists() or output.is_symlink():raise ValueError('output must be new')
    output.mkdir(parents=True);archive=output/'input.tar.gz';metadata=None;combined=hashlib.sha256()
    with archive.open('xb') as out:
        for index,arg in enumerate(args):
            filename,expected=arg.rsplit('=',1);path=Path(filename)
            if sha_file(path)!=expected:raise ValueError('outer artifact digest mismatch')
            with zipfile.ZipFile(path) as z:
                if z.testzip():raise ValueError('ZIP CRC failed')
                current=json.loads(z.read('PARTS.json'))
                if metadata is None:metadata=current
                if current!=metadata or current['original_artifact']!=13421056121:raise ValueError('part provenance mismatch')
                if len(metadata['parts'])!=3:raise ValueError('three parts required')
                rec=metadata['parts'][index];name=rec['filename']
                if len(z.namelist())!=2 or set(z.namelist())!={name,'PARTS.json'}:raise ValueError('unexpected ZIP members')
                h=hashlib.sha256();size=0
                with z.open(name) as f:
                    for b in iter(lambda:f.read(1024*1024),b''):h.update(b);combined.update(b);out.write(b);size+=len(b)
                if size!=rec['size'] or h.hexdigest()!=rec['sha256']:raise ValueError('part digest mismatch')
    if combined.hexdigest()!=metadata['archive_sha256']:raise ValueError('combined archive mismatch')
    with tarfile.open(archive,'r:gz') as t:
        members=t.getmembers();seen=set()
        if sum(m.size for m in members)>5*1024**3:raise ValueError('expanded archive too large')
        for m in members:
            p=PurePosixPath(m.name)
            if not m.isfile() or p.is_absolute() or '..' in p.parts or m.name in seen:raise ValueError('invalid tar member')
            seen.add(m.name)
        manifest=json.load(t.extractfile('MANIFEST.json'));records=manifest['files']
        if seen!=set(records)|{'MANIFEST.json'}:raise ValueError('file manifest mismatch')
        for m in members:
            dest=output/m.name;dest.parent.mkdir(exist_ok=True,parents=True);h=hashlib.sha256();size=0
            with t.extractfile(m) as f,dest.open('xb') as o:
                for b in iter(lambda:f.read(1024*1024),b''):h.update(b);size+=len(b);o.write(b)
            if m.name!='MANIFEST.json':
                rec=records[m.name]
                if size!=rec['size'] or h.hexdigest()!=rec['sha256']:raise ValueError('tool content mismatch: '+m.name)
                dest.chmod(0o755 if rec['executable'] else 0o644)
    return {'status':'PASS','files':len(records),'run':manifest['run_id'],'archive_sha256':combined.hexdigest()}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('parts',nargs=3);a=p.parse_args()
    try:print(json.dumps(run(a.output,a.parts)))
    except (OSError,ValueError,KeyError,tarfile.TarError,zipfile.BadZipFile) as e:raise SystemExit('BLOCKED: '+str(e))
