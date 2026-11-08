/* Diagnostic only: exact current composed host + trusted Secure56 + synthetic phone. */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {randomBytes,generateKeyPairSync,sign,createHmac} from 'node:crypto';
import {buildCurrentAudioReleaseCandidate} from './audio-compose-current-host.mjs';
import {audioExtensionEnvelope} from './audio-release-authority.mjs';
import {AUDIO_PROTOCOL} from './audio-extension-catalog.mjs';

const source=process.env.EBISEO_TEST_CURRENT_OWNER_ROOT;
assert.ok(source);
const hostDir=mkdtempSync(path.join(tmpdir(),'ebiseo-current-http-probe-'));
const host=path.join(hostDir,'jh-server');
cpSync(path.dirname(path.resolve(source)),host,{recursive:true,
  filter:p=>!p.includes('ebiseo-audio-v04')&&!p.includes('ebiseo-audio-v05')});
const root=path.join(host,'owner-setup');
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
  JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
  JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
  JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
  JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'EXPLICIT_SIGNED_COMMAND_CAUSE_V1',
  JH_STAGE44_DEVICE_FOCUS:'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1',
  JH_MOBILE13_COMMAND_DIAGNOSTICS:'EXPLICIT_OWNER_DEVICE_READ_ONLY_V1'};
Object.assign(process.env,env,{
  PUBLIC_BASE_URL:'https://jh-secure-bridge-fix4.onrender.com',
  LIFE_HUB_TOKEN:randomBytes(32).toString('base64url')
});
const built=await buildCurrentAudioReleaseCandidate(root,env);
const runtime=await import(pathToFileURL(built.file).href+'?diag='+Date.now());
const registryModule=await import(pathToFileURL(path.join(root,'trusted-server/trusted-device-registry.mjs')).href);
const authorityModule=await import(pathToFileURL(path.join(root,'trusted-server/trusted-bridge-session-authority.mjs')).href);
const {TrustedDeviceRegistry,sha256,canonicalChallenge}=registryModule;
const {activationMaterial}=authorityModule;
const dir=mkdtempSync(path.join(tmpdir(),'ebiseo-current-http-registry-'));
const ctx={},tok=()=>randomBytes(24).toString('base64url');
const h=(key,msg)=>createHmac('sha256',key).update(msg).digest('hex');
let origin,registry,p,seq=0;
async function request(route,body,headers={}){
  const raw=body===undefined?undefined:JSON.stringify(body);
  const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',
    headers:{...(body===undefined?{}:{'content-type':'application/json'}),...headers},
    body:raw,signal:AbortSignal.timeout(7000)});
  const text=await r.text();let value;try{value=JSON.parse(text)}catch{value=text}
  return {status:r.status,text,value};
}
function signedHeaders(action,jobId,body){
  const nonce=tok(),exp=Date.now()+20000,sid=p.o.secureSessionId,dev=p.o.deviceDigest;
  const out={'x-jh-session':sid,'x-jh-device':dev,'x-jh-nonce':nonce,'x-jh-expires':String(exp)};
  let material=`poll|${sid}|${dev}|${nonce}|${exp}`;
  if(action==='complete'){
    out['x-jh-result-digest']=sha256(JSON.stringify(body));
    material=`complete|${sid}|${jobId}|${dev}|${nonce}|${exp}|${out['x-jh-result-digest']}`;
  }
  out['x-jh-mac']=h(Buffer.from(p.o.secureSessionSecret,'base64url'),material);
  return out;
}
async function mcp(name,args){
  return request('/mcp',{jsonrpc:'2.0',id:++seq,method:'tools/call',params:{name,arguments:args}},
    {authorization:'Bearer '+process.env.LIFE_HUB_TOKEN,accept:'application/json, text/event-stream'});
}
async function pollJob(){
  for(let i=0;i<100;i++){
    const r=await request('/device/poll?deviceId='+p.d,undefined,signedHeaders('poll'));
    if(r.status===200)return r.value;
    if(r.status!==204){
      const job=await request('/job/job_1',undefined,{});
      throw Error('POLL_'+r.status+':'+r.text+':JOB1='+job.status+':'+job.text);
    }
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw Error('POLL_JOB_TIMEOUT');
}
async function complete(job,result){
  const body={result};
  return request('/job/'+job.id+'/complete',body,signedHeaders('complete',job.id,body));
}

test('current trusted host completes the real audio capability probe then dispatches audio status',async()=>{
  registry=new TrustedDeviceRegistry({
    databasePath:path.join(dir,'registry.db'),
    serverDigest:sha256(process.env.PUBLIC_BASE_URL+'/mcp|jh-secure-bridge56'),
    catalogDigest:'a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1',
    authorizeEnrollment:(c,e)=>c===ctx?{ownerDigest:sha256('synthetic owner'),
      enrollmentId:e.consentRequestId,expiresAt:Date.now()+30000,exactConsentDigest:sha256(JSON.stringify(e))}:null,
    authorizeRevocation:()=>null
  });
  runtime.installTrustedSessionRegistry56(registry);
  runtime.installDurableNativeCircuit56({
    file:path.join(dir,'manual.sqlite'),
    key:Buffer.alloc(32,47),
    namespace:sha256('synthetic-audio-owner'),
    mode:'EXPLICIT_ONE_TIME'
  });
  runtime.httpServer.listen(0,'127.0.0.1');await once(runtime.httpServer,'listening');
  origin='http://127.0.0.1:'+runtime.httpServer.address().port;

  const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),d=tok();
  const trust=registry.enroll({publicKeySpki:key.publicKey.export({format:'der',type:'spki'}).toString('base64url'),
    deviceDigest:sha256('jh56|'+d),requestedTrustMs:86400000,consentRequestId:tok()},ctx);
  const challenge=(await request('/device/trusted/challenge',{trustId:trust.trustId,clientNonce:tok(),deviceId:d})).value;
  const proof={challenge,signature:sign('sha256',canonicalChallenge(challenge),key.privateKey).toString('base64url')};
  const reconnect=await request('/device/trusted/reconnect',{deviceId:d,proof});
  assert.equal(reconnect.status,200,reconnect.text);p={d,o:reconnect.value,trust,key};
  const activation={deviceId:d,trustId:p.o.trustId,challengeId:p.o.challengeId,redemptionId:p.o.redemptionId,
    sessionId:p.o.secureSessionId,deviceDigest:p.o.deviceDigest,sessionDigest:p.o.sessionDigest,
    nonce:tok(),expiresAt:Math.min(Date.now()+10000,p.o.activationExpiresAt)};
  activation.mac=h(Buffer.from(p.o.secureSessionSecret,'base64url'),activationMaterial(activation));
  assert.equal((await request('/device/trusted/activate',activation)).status,200);

  const commandId=randomBytes(16).toString('hex');
  const begin=await mcp('life_android_workflow_link',{mode:'BEGIN_COMMAND',request_id:commandId});
  assert.equal(begin.status,200,begin.text);assert.match(begin.text,new RegExp(commandId));

  const taskDigest=sha256('synthetic-ebiseo-current-http-probe');
  const waiting=mcp('life_android_audio_status',{device_id:d,task_digest:taskDigest,query:'status',command_id:commandId});

  const probe=await pollJob();
  assert.equal(probe.type,'secure_device_status');
  assert.equal(probe.mcpToolName,'life_android_secure_status');
  assert.equal(probe.secureRequestedEffect,'READ_ONLY');
  assert.equal(probe.commandId,commandId);
  assert.equal(probe.audioCapabilityProbe?.commandId,commandId);
  assert.equal(probe.audioCapabilityProbe?.taskDigest,taskDigest);
  assert.match(String(probe.audioCapabilityProbe?.nonce||''),/^[A-Za-z0-9_-]{16,160}$/);
  const capability={...audioExtensionEnvelope(),protocol:AUDIO_PROTOCOL};
  const probeDone=await complete(probe,{ok:true,code:'secure_status_verified',secureActive:true,
    deviceResponded:true,phoneCapabilities:{EBISEO_AUDIO_EXTENSION:capability}});
  assert.equal(probeDone.status,200,probeDone.text);

  const audio=await pollJob();
  assert.equal(audio.type,'ebiseo_audio_status');
  assert.equal(audio.mcpToolName,'life_android_audio_status');
  assert.equal(audio.commandId,commandId);
  assert.equal(audio.audioExtension.id,capability.id);
  const audioResult={protocol:AUDIO_PROTOCOL,ok:true,accepted:true,code:'AUDIO_STATUS_SYNTHETIC',
    preferencesSaved:false,stateChanged:false,engineConfirmed:false,releaseConfirmed:true,
    automaticReplayAllowed:false,activation:{armed:false,status:'OFF',applicationVerified:false},
    startFlow:{action:'KEEP_CURRENT_SESSION',observationRefreshed:true,appLaunchPerformed:false,
      playbackControlSent:false,launchRecommendation:null}};
  const audioDone=await complete(audio,audioResult);
  assert.equal(audioDone.status,200,audioDone.text);

  const final=await waiting;
  assert.equal(final.status,200,final.text);
  assert.match(final.text,/AUDIO_STATUS_SYNTHETIC/);
  assert.doesNotMatch(final.text,/AUDIO_PHONE_CAPABILITY_UNCONFIRMED/);
});

after(async()=>{
  try{runtime.httpServer.closeAllConnections();await new Promise(resolve=>runtime.httpServer.close(resolve));}catch{}
  try{registry?.close();}catch{}
  rmSync(dir,{recursive:true,force:true});rmSync(hostDir,{recursive:true,force:true});
});
