import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {collectRuntimeMetadata,emitRuntimeMetadata} from './runtime-metadata.mjs';
const service='srv-db0fjl2d0e5s73be114g';
const key='JH_LIFE_KEY_FILE';
const mount='20 1 0:1 / /var/data rw - ext4 /dev/synthetic rw\n';
function fixture(t) {
  const dir=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),'jh-metadata-')));
  const reads=[]; const env={RENDER_SERVICE_ID:service};
  const io={lstatSync:fs.lstatSync,realpathSync:fs.realpathSync,readFileSync:(p,e)=>{reads.push(p);assert.equal(p,'/proc/self/mountinfo');assert.equal(e,'utf8');return mount;}};
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return {dir,env,io,reads,getUid:()=>process.getuid()};
}
function file(f,name='private.key',content='synthetic-secret-not-to-log') {
  const p=join(f.dir,name);fs.writeFileSync(p,content,{mode:0o600});f.env[key]=p;return p;
}
test('wrong service performs no metadata or uid reads',()=>{
  let calls=0; const forbidden=new Proxy({},{get(){calls++;throw Error('not allowed');}});
  assert.equal(collectRuntimeMetadata({env:{},io:forbidden,getUid(){calls++;throw Error('not allowed');}}).status,'WRONG_SERVICE_OR_CONTEXT');assert.equal(calls,0);
});
test('missing configuration is not release readiness',t=>{
  const f=fixture(t),r=collectRuntimeMetadata(f);assert.equal(r.status,'OBSERVED');assert.equal(r.releaseReady,false);
  assert(Object.values(r.flags).every(x=>x==='NOT_SET'));assert(Object.values(r.files).every(x=>x==='NOT_SET'));
  assert.equal(r.dataMount,'MOUNT_POINT_OBSERVED_NOT_DURABILITY_PROOF');
});
test('flag values are fixed enums, never raw values',t=>{
  const f=fixture(t);f.env.JH_OWNER_ENABLED='1';f.env.JH_LIFE_ENABLED='private-flag-value';
  const r=collectRuntimeMetadata(f);assert.equal(r.flags.JH_OWNER_ENABLED,'ENABLED');assert.equal(r.flags.JH_LIFE_ENABLED,'NOT_ENABLED');assert(!JSON.stringify(r).includes('private-flag-value'));
});
test('present private file is observed without reading or changing content',t=>{
  const f=fixture(t),p=file(f),before=fs.readFileSync(p),s=fs.statSync(p);
  const r=collectRuntimeMetadata(f);assert.equal(r.files[key],'FILE_PRESENT_CONTENT_NOT_CHECKED');
  assert.deepEqual(f.reads,['/proc/self/mountinfo']);assert.deepEqual(fs.readFileSync(p),before);assert.equal(fs.statSync(p).mtimeMs,s.mtimeMs);
  assert(!JSON.stringify(r).includes(p));assert(!JSON.stringify(r).includes(before.toString()));assert.equal(r.releaseReady,false);
});
test('empty file is not a valid credential',t=>{const f=fixture(t);file(f,'empty','');assert.equal(collectRuntimeMetadata(f).files[key],'EMPTY_FILE');});
test('group-readable file requires review',t=>{const f=fixture(t),p=file(f);fs.chmodSync(p,0o640);assert.equal(collectRuntimeMetadata(f).files[key],'PERMISSIONS_REVIEW');});
test('other owner requires review',t=>{const f=fixture(t);file(f);f.getUid=()=>process.getuid()+1;assert.equal(collectRuntimeMetadata(f).files[key],'PERMISSIONS_REVIEW');});
test('unknown uid never approves file permissions',t=>{const f=fixture(t);file(f);f.getUid=()=>undefined;assert.equal(collectRuntimeMetadata(f).files[key],'PERMISSIONS_REVIEW');});
test('symlink target is rejected without content access',t=>{const f=fixture(t),p=file(f);const q=join(f.dir,'linked');fs.symlinkSync(p,q);f.env[key]=q;assert.equal(collectRuntimeMetadata(f).files[key],'NOT_SINGLE_REGULAR_FILE');});
test('symlink parent is rejected',t=>{const f=fixture(t);const sub=join(f.dir,'sub');fs.mkdirSync(sub);fs.writeFileSync(join(sub,'k'),'synthetic',{mode:0o600});const link=join(f.dir,'alias');fs.symlinkSync(sub,link);f.env[key]=join(link,'k');assert.equal(collectRuntimeMetadata(f).files[key],'LINKED_PARENT');});
test('hardlinked files are rejected',t=>{const f=fixture(t),p=file(f);fs.linkSync(p,join(f.dir,'other'));assert.equal(collectRuntimeMetadata(f).files[key],'NOT_SINGLE_REGULAR_FILE');});
test('directory does not count as configuration file',t=>{const f=fixture(t);f.env[key]=f.dir;assert.equal(collectRuntimeMetadata(f).files[key],'NOT_SINGLE_REGULAR_FILE');});
test('invalid paths are rejected without traversal',t=>{const f=fixture(t);for(const p of ['relative','/a/../b','/bad\0path','/'+ 'a'.repeat(4097),null]){f.env[key]=p;assert.equal(collectRuntimeMetadata(f).files[key],'INVALID_PATH');}});
test('missing path and permission exceptions reveal no error or path',t=>{const f=fixture(t);f.env[key]=join(f.dir,'absent');assert.equal(collectRuntimeMetadata(f).files[key],'MISSING_OR_INACCESSIBLE');f.io.realpathSync=()=>{throw Error('private-error-path');};assert(!JSON.stringify(collectRuntimeMetadata(f)).includes('private-error-path'));});
test('mount absent or unreadable is not called durable',t=>{const f=fixture(t);f.io.readFileSync=()=> '1 2 0:1 / /other rw - x y z';assert.equal(collectRuntimeMetadata(f).dataMount,'NOT_OBSERVED');f.io.readFileSync=()=>{throw Error('private');};assert.equal(collectRuntimeMetadata(f).dataMount,'NOT_CHECKED');});
test('oversized mount metadata is not accepted',t=>{const f=fixture(t);f.io.readFileSync=()=> 'x'.repeat(1024*1024+1);assert.equal(collectRuntimeMetadata(f).dataMount,'NOT_CHECKED');});
test('only a public 40-character commit identifier is included',t=>{const f=fixture(t);f.env.RENDER_GIT_COMMIT='secret\nvalue';assert(!('commit' in collectRuntimeMetadata(f)));f.env.RENDER_GIT_COMMIT='95010cefe67639b23af7493b5b16d1cf553ed4c9';assert.equal(collectRuntimeMetadata(f).commit,f.env.RENDER_GIT_COMMIT);});
test('log is one bounded JSON record without arbitrary env values',t=>{const f=fixture(t);file(f);f.env.UNRELATED='do-not-log';const lines=[];emitRuntimeMetadata(f,x=>lines.push(x));assert.equal(lines.length,1);assert(lines[0].startsWith('JH_RUNTIME_METADATA '));assert(lines[0].length<2048);assert(!lines[0].includes(f.dir));assert(!lines[0].includes('do-not-log'));assert.equal(JSON.parse(lines[0].slice(20)).releaseReady,false);});
test('collector/logging exceptions never escape or expose details',()=>{
  const env=new Proxy({},{get(){throw Error('secret-error');}}),lines=[];
  assert.equal(emitRuntimeMetadata({env},x=>lines.push(x)).status,'CHECK_FAILED_NO_DETAILS');assert(!lines[0].includes('secret-error'));
  assert.doesNotThrow(()=>emitRuntimeMetadata({env:{}},()=>{throw Error('sink-failed');}));
});
test('only two entry lines changed; prior verified entry bytes are preserved',()=>{
  const src=fs.readFileSync(new URL('./auth-diagnostics-entry.mjs',import.meta.url),'utf8');
  const addedImport="import { emitRuntimeMetadata } from './runtime-metadata.mjs';\n",addedCall='emitRuntimeMetadata();\n';
  assert.equal(src.split(addedImport).length,2);assert.equal(src.split(addedCall).length,2);
  assert(src.endsWith('await import(persistentRuntimeUrl.href);\n'+addedCall));
  const original=src.replace(addedImport,'').replace(addedCall,'');
  const bytes=Buffer.from(original);assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),'1b9f96b288a57656418ba47a21db13de83e7f78a');
});
