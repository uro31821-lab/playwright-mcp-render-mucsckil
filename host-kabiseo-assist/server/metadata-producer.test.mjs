import test from 'node:test';
import assert from 'node:assert/strict';
import {createKabiseoMetadataProducer} from './metadata-producer.mjs';
const h=n=>'a'.repeat(n);
function fixture(){
 const f={enabled:true,supported:true,now:1000,reads:0,waits:0,lookups:0,jobs:new Map(),during:()=>{},
   binding:{deviceId:'device_fixture',sessionId:'session_fixture',trustId:'trust_fixture',
     ownerDigest:'b'.repeat(64),deviceDigest:'c'.repeat(64),commandId:h(32),runtimeDigest:h(64),expiresAt:61000}};
 f.api=createKabiseoMetadataProducer({enabled:()=>f.enabled,now:()=>f.now,
   binding:()=>({...f.binding,supported:f.supported}),
   enqueue(p,b){f.reads++;if(f.throwSubmit)throw Error('secret');
     const j={...p,id:'job_'+f.reads,type:'kabiseo_camera_metadata',commandId:b.commandId,
       targetDeviceId:b.deviceId,targetDeviceDigest:b.deviceDigest,secureSessionId:b.sessionId,
       mcpToolName:'life_android_kabiseo_metadata',secureRequestedEffect:'READ_ONLY',secureMac:h(64),status:'queued'};
     f.jobs.set(j.id,j);return {id:j.id};},
   lookup(id){f.lookups++;return f.jobs.get(id);},async wait(id){f.waits++;f.during(f.jobs.get(id));}});
 f.args={mode:'READ',request_id:'d'.repeat(32),task_digest:'e'.repeat(64),runtime_digest:h(64)};
 f.read=(a={})=>f.api.handle({...f.args,...a});
 f.complete=j=>{j.status='complete';j.result={ok:true,code:'kabiseo_camera_metadata_verified',
   readOnly:true,pixelsRead:false,gestureDispatched:false,cameraSettingsChanged:false,automaticZoomEnabled:false,restoreVerified:false};};
 return f;
}
test('default disabled does not enqueue',async()=>{const f=fixture();f.enabled=false;assert.equal((await f.read()).code,'camera_metadata_disabled');assert.equal(f.reads,0);});
test('status reports capability but does not read the phone',async()=>{const f=fixture();const r=await f.api.handle({mode:'STATUS'});assert.equal(r.runtimeDigest,h(64));assert.equal(f.reads,0);assert.equal(f.lookups,0);});
test('unnegotiated capability blocks dispatch',async()=>{const f=fixture();f.supported=false;assert.equal((await f.read()).code,'device_camera_metadata_not_supported');assert.equal(f.reads,0);});
test('payload matches Android gate literal values',async()=>{const f=fixture();await f.read();const j=f.jobs.get('job_1');assert.equal(j.action,'KABISEO_CAMERA_METADATA');assert.equal(j.cameraTargetPackage,'com.openai.chatgpt');assert.equal(j.secureRequestedEffect,'READ_ONLY');assert.equal(j.mcpToolName,'life_android_kabiseo_metadata');});
test('uncertain result has no automatic retry',async()=>{const f=fixture();assert.equal((await f.read()).code,'result_unconfirmed_use_result');assert.equal((await f.read()).code,'already_requested_use_result');assert.equal(f.reads,1);});
test('result-only request never recreates missing job',async()=>{const f=fixture();assert.equal((await f.read({mode:'RESULT'})).code,'request_not_found_no_recreation');assert.equal(f.reads,0);});
test('late result is historical and cannot authorize frame or restoration',async()=>{const f=fixture();await f.read();f.complete(f.jobs.get('job_1'));const r=await f.read({mode:'RESULT'});assert.equal(r.ok,true);assert.equal(r.historical,true);assert.equal(r.currentFrameVerified,false);assert.equal(r.restoreVerified,false);assert.equal(f.reads,1);});
test('fresh success remains metadata-only',async()=>{const f=fixture();f.during=f.complete;const r=await f.read();assert.equal(r.ok,true);assert.equal(r.pixelsRead,false);assert.equal(r.gestureDispatched,false);assert.equal(r.automaticZoomEnabled,false);});
test('profile required is not success',async()=>{const f=fixture();f.during=j=>{f.complete(j);j.result.ok=false;j.result.code='kabiseo_profile_not_enrolled';};assert.equal((await f.read()).code,'camera_profile_required');});
test('submission failure consumes request and hides exception',async()=>{const f=fixture();f.throwSubmit=true;assert.equal((await f.read()).code,'metadata_unavailable_no_retry');assert.equal((await f.read()).code,'already_requested_use_result');assert.equal(f.reads,1);});
test('same request cannot switch task',async()=>{const f=fixture();await f.read();assert.equal((await f.read({task_digest:'f'.repeat(64)})).code,'request_scope_changed');assert.equal(f.reads,1);});
test('server restart runtime identity rejects previous request',async()=>{const f=fixture();f.binding.runtimeDigest='f'.repeat(64);assert.equal((await f.read()).code,'runtime_changed_no_replay');assert.equal(f.reads,0);});
for(const field of ['sessionId','commandId','deviceDigest','ownerDigest','runtimeDigest','expiresAt'])test('binding changes during wait: '+field,async()=>{const f=fixture();f.during=j=>{f.complete(j);f.binding[field]=field==='expiresAt'?62000:field==='sessionId'?'session_other':'f'.repeat(field==='commandId'?32:64);};assert.notEqual((await f.read()).ok,true);});
test('feature revoked during wait hides success',async()=>{const f=fixture();f.during=j=>{f.complete(j);f.enabled=false;};assert.notEqual((await f.read()).ok,true);});
for(const field of ['pixelsRead','gestureDispatched','cameraSettingsChanged','automaticZoomEnabled','restoreVerified'])test('unsafe receipt rejected: '+field,async()=>{const f=fixture();f.during=j=>{f.complete(j);j.result[field]=true;};assert.equal((await f.read()).code,'receipt_boundary_invalid');});
test('arbitrary phone text never leaves allowlisted reply',async()=>{const f=fixture();f.during=j=>{f.complete(j);j.result.url='PRIVATE_IMAGE';j.result.secret='PRIVATE_TEXT';};assert.ok(!JSON.stringify(await f.read()).includes('PRIVATE'));});
test('different result job identity rejected',async()=>{const f=fixture();f.during=j=>{f.complete(j);j.targetDeviceDigest='f'.repeat(64);};assert.equal((await f.read()).code,'job_binding_unverified');});
for(const extra of [{data_class:'SECRET'},{cameraTargetPackage:'other.app'},{mode:'ZOOM'},{request_id:'x'},{runtime_digest:undefined}])test('malformed or unsupported request '+JSON.stringify(extra),async()=>{const f=fixture();assert.equal((await f.read(extra)).ok,false);assert.equal(f.reads,0);});
test('capacity denies instead of evicting uncertain history',async()=>{const f=fixture();for(let n=0;n<256;n++)await f.read({request_id:n.toString(16).padStart(32,'0')});assert.equal((await f.read()).code,'request_capacity_no_eviction');assert.equal(f.reads,256);});
