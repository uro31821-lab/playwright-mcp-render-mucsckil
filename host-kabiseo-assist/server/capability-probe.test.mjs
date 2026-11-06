import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createKabiseoCapabilityProbe} from './capability-probe.mjs';
const hex=(n,c='a')=>c.repeat(n);
function fixture(){
 const f={now:1000,on:true,sent:0,waits:0,jobs:new Map(),during:async()=>{},
  b:{deviceId:'fixture_device',sessionId:'fixture_session',trustId:'fixture_trust',ownerDigest:hex(64,'b'),
   deviceDigest:hex(64,'c'),commandId:hex(32,'d'),runtimeDigest:hex(64,'e'),expiresAt:100000}};
 f.args={mode:'PROBE',request_id:hex(32),task_digest:hex(64,'f'),runtime_digest:f.b.runtimeDigest};
 f.api=createKabiseoCapabilityProbe({enabled:()=>f.on,now:()=>f.now,binding:()=>({...f.b}),
  enqueue(p,b){f.sent++;if(f.throwSubmit)throw Error('SECRET');const j={...p,id:'job_'+f.sent,
   type:'secure_device_status',mcpToolName:'life_android_secure_status',secureRequestedEffect:'READ_ONLY',
   commandId:b.commandId,targetDeviceId:b.deviceId,targetDeviceDigest:b.deviceDigest,secureSessionId:b.sessionId,
   secureExpiresAt:f.now+45000,secureMac:f.unsigned?undefined:hex(64),status:'queued'};
   f.jobs.set(j.id,j);f.last=j;return {id:j.id};},lookup:id=>f.jobs.get(id),
  wait:async id=>{f.waits++;await f.during(f.jobs.get(id));}});
 f.claim=j=>({schema:'KABISEO_CAMERA_METADATA_CAPABILITY_V1',requestId:j.requestId,version:1,enabled:true,
   cameraTargetPackage:'com.openai.chatgpt',readOnly:true,pixelsRead:false,gestureDispatched:false,
   cameraSettingsChanged:false,automaticZoomEnabled:false,restoreVerified:false,cameraSurfaceMatched:false});
 f.complete=j=>{j.status='complete';j.result={ok:true,kabiseoCameraMetadata:f.claim(j)};delete j.secureMac;};
 f.probe=extra=>f.api.handle({...f.args,...extra});
 f.supported=()=>f.api.supported({...f.b});
 return f;
}
test('disabled probe sends no status or camera job',async()=>{const f=fixture();f.on=false;assert.equal((await f.probe()).code,'camera_metadata_disabled');assert.equal(f.sent,0);});
test('status does not send and unchecked advertised version is ignored',async()=>{const f=fixture();f.b.kabiseoCameraMetadataVersion=1;assert.equal((await f.api.handle({mode:'STATUS'})).deviceSupported,false);assert.equal(f.sent,0);});
test('valid status result confirms support, never camera or zoom',async()=>{const f=fixture();f.during=f.complete;const r=await f.probe();assert.equal(r.ok,true);assert.equal(f.supported(),true);assert.equal(f.last.type,'secure_device_status');assert.equal(f.last.secureMac,undefined);for(const k of ['cameraSurfaceMatched','pixelsRead','gestureDispatched','cameraSettingsChanged','automaticZoomEnabled','restoreVerified'])assert.equal(r[k],false);});
test('ordinary legacy status lacking capability stays unsupported',async()=>{const f=fixture();f.during=j=>{j.status='complete';j.result={ok:true};delete j.secureMac;};assert.equal((await f.probe()).code,'device_capability_not_supported');assert.equal(f.supported(),false);});
for(const [field,value] of [['version',2],['version','1'],['enabled',false],['requestId',hex(32,'b')],['cameraTargetPackage','other.app'],['readOnly',false],['pixelsRead',true],['gestureDispatched',true],['automaticZoomEnabled',true],['cameraSettingsChanged',true],['restoreVerified',true],['cameraSurfaceMatched',true]])test('incompatible claim rejected: '+field,async()=>{const f=fixture();f.during=j=>{f.complete(j);j.result.kabiseoCameraMetadata[field]=value;};assert.equal((await f.probe()).deviceSupported,false);assert.equal(f.supported(),false);});
test('pending request uses result lookup, never automatically resends',async()=>{const f=fixture();assert.equal((await f.probe()).code,'capability_result_unconfirmed_use_result');assert.equal((await f.probe()).code,'capability_already_requested_use_result');f.complete(f.last);assert.equal((await f.probe({mode:'RESULT'})).deviceSupported,true);assert.equal(f.sent,1);});
test('missing result request is not recreated',async()=>{const f=fixture();assert.equal((await f.probe({mode:'RESULT'})).code,'capability_request_not_found_no_recreation');assert.equal(f.sent,0);});
test('result polling cannot extend 30-second capability lifetime',async()=>{const f=fixture();f.during=f.complete;await f.probe();f.now=30999;assert.equal((await f.probe({mode:'RESULT'})).deviceSupported,true);f.now=31000;assert.equal(f.supported(),false);assert.equal((await f.probe({mode:'RESULT'})).deviceSupported,false);assert.equal(f.sent,1);});
test('completion delayed beyond lifetime cannot activate support',async()=>{const f=fixture();f.during=j=>{f.now=31000;f.complete(j);};assert.equal((await f.probe()).deviceSupported,false);});
for(const field of ['sessionId','trustId','ownerDigest','deviceDigest','commandId','runtimeDigest','expiresAt'])test('binding change rejects capability: '+field,async()=>{const f=fixture();f.during=f.complete;await f.probe();f.b[field]=field==='expiresAt'?110000:field==='commandId'?hex(32,'1'):['sessionId','trustId'].includes(field)?'other_binding':hex(64,'1');assert.equal(f.supported(),false);});
test('clock rollback fails closed',async()=>{const f=fixture();f.during=f.complete;await f.probe();f.now=999;assert.equal(f.supported(),false);});
test('new probe revokes old grant; old result cannot re-enable it',async()=>{const f=fixture();f.during=f.complete;await f.probe();assert.equal(f.supported(),true);f.during=async()=>{};await f.probe({request_id:hex(32,'b')});assert.equal(f.supported(),false);assert.equal((await f.probe({mode:'RESULT'})).deviceSupported,false);assert.equal(f.sent,2);});
test('unsigned submission remains consumed and cannot be promoted',async()=>{const f=fixture();f.unsigned=true;assert.equal((await f.probe()).code,'capability_signed_submission_unverified');assert.equal(f.waits,0);f.complete(f.last);assert.equal((await f.probe({mode:'RESULT'})).deviceSupported,false);assert.equal((await f.probe()).code,'capability_already_requested_use_result');assert.equal(f.sent,1);});
test('equal-looking replacement job is rejected',async()=>{const f=fixture();f.during=j=>{f.complete(j);f.jobs.set(j.id,{...j});};assert.equal((await f.probe()).deviceSupported,false);});
test('changed completed claim cannot silently preserve or refresh grant',async()=>{const f=fixture();f.during=f.complete;await f.probe();f.last.result.kabiseoCameraMetadata.enabled=false;assert.equal(f.supported(),false);});
test('completed result object replacement invalidates support',async()=>{const f=fixture();f.during=f.complete;await f.probe();f.last.result={...f.last.result};assert.equal(f.supported(),false);assert.equal((await f.probe({mode:'RESULT'})).code,'capability_receipt_changed');});
test('feature disabled immediately blocks support',async()=>{const f=fixture();f.during=f.complete;await f.probe();f.on=false;assert.equal(f.supported(),false);f.on=true;assert.equal(f.supported(),false);});
test('untrusted request cannot inject supported flag',async()=>{const f=fixture();assert.equal((await f.probe({supported:true})).code,'capability_request_invalid');assert.equal(f.sent,0);});
test('task change cannot reuse probe identity',async()=>{const f=fixture();await f.probe();assert.equal((await f.probe({task_digest:hex(64,'1')})).code,'capability_request_scope_changed');assert.equal(f.sent,1);});
test('host exception consumes request and does not leak private text',async()=>{const f=fixture();f.throwSubmit=true;assert.equal((await f.probe()).code,'capability_unavailable_no_retry');assert.ok(!JSON.stringify(await f.probe({mode:'RESULT'})).includes('SECRET'));assert.equal(f.sent,1);});
test('capacity blocks rather than evicting uncertain requests',async()=>{const f=fixture();for(let i=0;i<256;i++)await f.probe({request_id:i.toString(16).padStart(32,'0')});assert.equal((await f.probe()).code,'capability_capacity_no_eviction');assert.equal(f.sent,256);});
test('metadata composer uses verified probe, not raw device metadata',()=>{const source=readFileSync(new URL('./source-patch.mjs',import.meta.url),'utf8');assert.ok(source.includes('supported:jhKabiseoCapability56.supported(b)'));assert.ok(!source.includes('meta.kabiseoCameraMetadataVersion'));assert.ok(source.includes("exactEnvelope56('life_android_secure_status','secure_device_status','READ_ONLY'"));});
