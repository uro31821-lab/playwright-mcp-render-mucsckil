/** Whole generated Stage25 runtime + actual MCP/HTTP + original trusted-session
 * and signed completion routes. The device, enrollment authorizer, keys and
 * camera replies are SYNTHETIC. No phone, production listener or APK is used.
 * No guards are replaced. The test composes a separate ephemeral runtime next
 * to the original so its existing relative imports resolve unchanged.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,unlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {request as httpRequest} from 'node:http';
import {spawnSync} from 'node:child_process';
import {createHash,createHmac,randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {applyKabiseoMetadataPatch,reverseKabiseoMetadataPatch} from './source-patch.mjs';
const REPORT='KABISEO_GENERATED_MCP_RESULT=';
const sha=x=>createHash('sha256').update(x).digest('hex');
const token=()=>randomBytes(24).toString('base64url');
const hexId=()=>randomBytes(16).toString('hex');
const mac=(key,message)=>createHmac('sha256',key).update(message).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function child(root,out){
 const ownerRoot=path.join(root,'jh-server/owner-setup');
 const expectedEnv=['PATH','CI','NODE_ENV','JH_OWNER_DEFER_LISTEN','JH_MOBILE_WEB_13_MODE'];
 assert.deepEqual(Object.keys(process.env).sort(),expectedEnv.sort(),'isolated environment only');
 const dir=mkdtempSync(path.join(tmpdir(),'kabiseo-mcp-'));
 const checks=[];let runtime,registry,circuit,candidateFile,original,originalBytes;
 let externalRequests=0,seq=0,commandId,offer,port;
 let receivedJobs=0;
 const mark=(name,yes=true)=>{assert.ok(yes,name);checks.push(name);console.log('PASS '+name);};
 globalThis.fetch=async()=>{externalRequests++;throw Error('EXTERNAL_FETCH_FORBIDDEN_IN_TEST');};
 const owner=sha('synthetic-kabiseo-owner'),device='synthetic-kabiseo-generated-runtime';
 const publicBase='https://kabiseo-fixture.invalid';
 const bearer=token();
 Object.assign(process.env,{LIFE_HUB_TOKEN:bearer,PUBLIC_BASE_URL:publicBase,
  JH_OPERATIONAL_ACCOUNT_DIGEST:owner,JH_OAUTH_STATE_FILE:path.join(dir,'oauth.json')});
 const importOwner=p=>import(pathToFileURL(path.join(ownerRoot,p)).href);
 function request(route,body,headers={}){
  return new Promise((resolve,reject)=>{
   const bytes=body===undefined?null:Buffer.from(JSON.stringify(body));
   const q=httpRequest({hostname:'127.0.0.1',port,path:route,method:bytes?'POST':'GET',agent:false,
    headers:{connection:'close',...(bytes?{'content-type':'application/json','content-length':String(bytes.length)}:{}),...headers}},res=>{
    const chunks=[];let size=0;
    res.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){res.destroy(Error('TEST_RESPONSE_LIMIT'));return;}chunks.push(chunk);});
    res.once('error',reject);res.once('end',()=>{const text=Buffer.concat(chunks).toString();let value;try{value=JSON.parse(text);}catch{value=text;}resolve({status:res.statusCode,value});});
   });q.once('error',reject);q.setTimeout(20000,()=>q.destroy(Error('TEST_HTTP_TIMEOUT')));q.end(bytes);
  });
 async function rpc(method,params,authenticated=true){
  const reply=await request('/mcp',{jsonrpc:'2.0',id:++seq,method,params},
   {accept:'application/json, text/event-stream',...(authenticated?{authorization:'Bearer '+bearer}:{})});
  assert.equal(reply.status,200,'MCP HTTP status');return reply.value;
 }
 async function call(name,args={},includeCommand=true){
  const r=await rpc('tools/call',{name,arguments:{...args,...(includeCommand&&commandId?{command_id:commandId}:{})}});
  assert.equal(r.result?.isError===true,false,'MCP tool error '+JSON.stringify(r));
  const text=r.result?.content?.find(x=>x.type==='text')?.text;
  assert.equal(typeof text,'string','MCP text result');
  return JSON.parse(text);
 }
 function headers(action,jobId,body){
  const nonce=token(),expires=Date.now()+20000,sid=offer.secureSessionId,dev=offer.deviceDigest;
  const h={'x-jh-session':sid,'x-jh-device':dev,'x-jh-nonce':nonce,'x-jh-expires':String(expires)};
  let material=['poll',sid,dev,nonce,expires].join('|');
  if(action==='complete'){h['x-jh-result-digest']=sha(JSON.stringify(body));material=['complete',sid,jobId,dev,nonce,expires,h['x-jh-result-digest']].join('|');}
  h['x-jh-mac']=mac(Buffer.from(offer.secureSessionSecret,'base64url'),material);return h;
 }
 const poll=()=>request('/device/poll?deviceId='+encodeURIComponent(device),undefined,headers('poll'));
 async function exchange(tool,args,expectedType,replyFor,badMac=false){
  let settled=false,answer,error;
  const waiting=call(tool,args).then(r=>{settled=true;answer=r;return r;},e=>{settled=true;error=e;});
  let job;
  for(let n=0;n<100;n++){
   const r=await poll();
   if(r.status===200){job=r.value;break;}
   assert.equal(r.status,204,'signed poll '+JSON.stringify(r.value));
   if(settled){if(error)throw error;throw Error('TOOL_RETURNED_WITHOUT_EXPECTED_JOB '+JSON.stringify(answer));}
   await pause(20);
  }
  assert.ok(job,'signed job missing');receivedJobs++;
  assert.equal(job.type,expectedType);assert.equal(job.commandId,commandId);
  assert.equal(job.secureRequestedEffect,'READ_ONLY');assert.match(job.secureMac,/^[a-f0-9]{64}$/);
  assert.equal(job.requestId,args.request_id);
  const body={result:replyFor(job)};
  if(badMac){const bad=headers('complete',job.id,body);bad['x-jh-mac']='0'.repeat(64);
   assert.equal((await request('/job/'+job.id+'/complete',body,bad)).status,401);mark('full runtime rejects forged completion MAC');}
  assert.equal((await request('/job/'+job.id+'/complete',body,headers('complete',job.id,body))).status,200,'authentic completion accepted');
  await waiting;if(error)throw error;
  return {answer,job};
 }
 const args=(runtimeDigest,mode)=>({mode,request_id:hexId(),task_digest:sha('synthetic camera task'),runtime_digest:runtimeDigest});
 const boundary={readOnly:true,pixelsRead:false,gestureDispatched:false,cameraSettingsChanged:false,automaticZoomEnabled:false,restoreVerified:false};
 try{
  const builder=await importOwner('jh168-mobile-unification/stage25-live-operator-followup-entry.mjs');
  original=await builder.buildStage25PendingOperatorEntrypoint56(ownerRoot,process.env);
  assert.equal(original.listenerStarted,false);assert.equal(original.productionEnabled,false);
  originalBytes=readFileSync(original.runtimeFile,'utf8');
  const candidate=applyKabiseoMetadataPatch(originalBytes);
  assert.equal(reverseKabiseoMetadataPatch(candidate),originalBytes);
  candidateFile=path.join(path.dirname(original.runtimeFile),'server-kabiseo-mcp-test-'+process.pid+'.mjs');
  writeFileSync(candidateFile,candidate,{flag:'wx',mode:0o600});
  runtime=await import(pathToFileURL(candidateFile).href);
  assert.equal(runtime.httpServer.listening,false);
  mark('complete composed runtime imports without starting a listener');
  const {TrustedDeviceRegistry,canonicalChallenge}=await importOwner('trusted-server/trusted-device-registry.mjs');
  const {activationMaterial,receiptMaterial}=await importOwner('trusted-server/trusted-bridge-session-authority.mjs');
  const context={};
  registry=new TrustedDeviceRegistry({databasePath:path.join(dir,'registry.db'),
   serverDigest:sha(publicBase+'/mcp|jh-secure-bridge56'),catalogDigest:'a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1',
   authorizeEnrollment:(c,e)=>c===context?{ownerDigest:owner,enrollmentId:e.consentRequestId,expiresAt:Date.now()+30000,exactConsentDigest:sha(JSON.stringify(e))}:null,
   authorizeRevocation:()=>null});
  runtime.installTrustedSessionRegistry56(registry);
  circuit=runtime.installDurableNativeCircuit56({file:path.join(dir,'circuit.db'),key:Buffer.alloc(32,19),namespace:sha('synthetic-kabiseo-circuit'),mode:'EXPLICIT_ONE_TIME'});
  await new Promise((resolve,reject)=>{runtime.httpServer.once('error',reject);runtime.httpServer.listen(0,'127.0.0.1',resolve);});
  port=runtime.httpServer.address().port;assert.equal(runtime.httpServer.address().address,'127.0.0.1');
  assert.equal((await request('/mcp')).status,401);mark('unauthenticated full MCP endpoint remains protected');
  const catalog=await rpc('tools/list',{});
  for(const name of ['life_android_kabiseo_capability','life_android_kabiseo_metadata'])
   assert.equal(catalog.result.tools.filter(t=>t.name===name).length,1,name+' registered exactly once');
  mark('both camera tools are present in the actual MCP catalog');
  const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const trust=registry.enroll({publicKeySpki:key.publicKey.export({format:'der',type:'spki'}).toString('base64url'),deviceDigest:sha('jh56|'+device),requestedTrustMs:86400000,consentRequestId:token()},context);
  const challengeReply=await request('/device/trusted/challenge',{trustId:trust.trustId,clientNonce:token(),deviceId:device});
  assert.equal(challengeReply.status,200);const challenge=challengeReply.value;
  const reconnected=await request('/device/trusted/reconnect',{deviceId:device,proof:{challenge,signature:sign('sha256',canonicalChallenge(challenge),key.privateKey).toString('base64url')}});
  assert.equal(reconnected.status,200);offer=reconnected.value;
  const activation={deviceId:device,trustId:offer.trustId,challengeId:offer.challengeId,redemptionId:offer.redemptionId,
   sessionId:offer.secureSessionId,deviceDigest:offer.deviceDigest,sessionDigest:offer.sessionDigest,nonce:token(),
   expiresAt:Math.min(Date.now()+10000,offer.activationExpiresAt),processEpoch:'synthetic-kabiseo-process-1',restartDisposition:'DISCARD_PREVIOUS'};
  activation.mac=mac(Buffer.from(offer.secureSessionSecret,'base64url'),activationMaterial(activation));
  const active=await request('/device/trusted/activate',activation);assert.equal(active.status,200);
  assert.equal(active.value.mac,mac(Buffer.from(offer.secureSessionSecret,'base64url'),receiptMaterial(active.value)));
  mark('original trusted challenge signature and process activation succeed for synthetic device');
  const begin=await call('life_android_workflow_link',{mode:'BEGIN_COMMAND',request_id:hexId()},false);
  commandId=begin.commandId??begin.command_id;assert.match(commandId,/^[a-f0-9]{32}$/,'original command creation '+JSON.stringify(begin));
  assert.equal((await call('life_android_kabiseo_capability',{mode:'STATUS'})).code,'camera_metadata_disabled');
  assert.equal((await poll()).status,204);mark('default disabled camera sends no job');
  process.env.JH_KABISEO_METADATA_REVIEW='EXPLICIT_READ_ONLY_CAMERA_V1';
  const status=await call('life_android_kabiseo_capability',{mode:'STATUS'});
  assert.equal(status.code,'capability_status','actual wrapped STATUS '+JSON.stringify(status));assert.equal(status.deviceSupported,false);
  assert.match(status.runtimeDigest,/^[a-f0-9]{64}$/);assert.equal((await poll()).status,204);
  mark('command-bound actual STATUS is lookup-only and starts unsupported');
  const unsupported=await call('life_android_kabiseo_metadata',args(status.runtimeDigest,'READ'));
  assert.equal(unsupported.code,'device_camera_metadata_not_supported');assert.equal((await poll()).status,204);
  mark('metadata cannot precede authenticated capability');
  const probeArgs=args(status.runtimeDigest,'PROBE');
  const probe=await exchange('life_android_kabiseo_capability',probeArgs,'secure_device_status',job=>({ok:true,
   kabiseoCameraMetadata:{schema:'KABISEO_CAMERA_METADATA_CAPABILITY_V1',requestId:job.requestId,version:1,enabled:true,
    cameraTargetPackage:'com.openai.chatgpt',...boundary,cameraSurfaceMatched:false}}),true);
  assert.equal(probe.answer.code,'camera_metadata_capability_verified','probe '+JSON.stringify(probe.answer));assert.equal(probe.answer.ok,true);
  mark('full MCP capability roundtrip uses original signed status and completion');
  const readArgs=args(status.runtimeDigest,'READ');
  const read=await exchange('life_android_kabiseo_metadata',readArgs,'kabiseo_camera_metadata',()=>({ok:true,code:'kabiseo_camera_metadata_verified',...boundary}));
  assert.equal(read.answer.ok,true,'metadata '+JSON.stringify(read.answer));assert.equal(read.answer.currentFrameVerified,false);
  for(const k of ['pixelsRead','gestureDispatched','cameraSettingsChanged','automaticZoomEnabled','restoreVerified'])assert.equal(read.answer[k],false);
  mark('full metadata roundtrip remains protocol-only and grants no camera action');
  assert.notEqual(probe.job.id,read.job.id);assert.equal(read.job.action,'KABISEO_CAMERA_METADATA');
  assert.equal(read.job.cameraTargetPackage,'com.openai.chatgpt');
  assert.equal((await call('life_android_kabiseo_metadata',readArgs)).code,'already_requested_use_result');
  const old=await call('life_android_kabiseo_metadata',{...readArgs,mode:'RESULT'});assert.equal(old.ok,true);assert.equal(old.historical,true);
  assert.equal((await poll()).status,204);mark('separate MCP calls preserve request history without replay');
  const profile=await exchange('life_android_kabiseo_metadata',args(status.runtimeDigest,'READ'),'kabiseo_camera_metadata',()=>({ok:false,code:'kabiseo_profile_not_enrolled',...boundary}));
  assert.equal(profile.answer.code,'camera_profile_required');assert.equal(profile.answer.ok,false);mark('profile absence stays unverified through the whole route');
  delete process.env.JH_KABISEO_METADATA_REVIEW;
  assert.equal((await call('life_android_kabiseo_metadata',{...readArgs,mode:'RESULT'})).code,'camera_metadata_disabled');
  assert.equal((await poll()).status,204);mark('disable blocks historical result with no additional job');
  assert.equal(readFileSync(original.runtimeFile,'utf8'),originalBytes);
  assert.equal(builder.selectStage25PendingOperatorRuntime56(ownerRoot,process.env).sha256,original.stamp.runtimeSha256);
  mark('original runtime bytes and selection attestation are preserved');
  assert.equal(externalRequests,0);mark('no external network or physical phone used');
  const result={schema:'KABISEO_GENERATED_MCP_V014',status:'PASS',checks,sourceSha256:sha(originalBytes),candidateSha256:sha(candidate),
   syntheticSignedJobs:receivedJobs,originalAuthGuardsChanged:false,fullGeneratedMcpTransport:true,
   syntheticEnrollmentAuthority:true,realOwnerEnrollment:false,androidExecuted:false,physicalPhoneCommands:0,
   cameraPixelsRead:0,automaticZoomEnabled:false,restoreVerified:false,apkRebuilt:false,productionDeployed:false};
  mkdirSync(out,{recursive:true});writeFileSync(path.join(out,'generated-mcp-result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(REPORT+JSON.stringify(result));
 }finally{
  if(runtime?.httpServer){runtime.httpServer.closeAllConnections();if(runtime.httpServer.listening)await new Promise(resolve=>runtime.httpServer.close(resolve));}
  circuit?.close();registry?.close();
  if(candidateFile&&existsSync(candidateFile))unlinkSync(candidateFile);
  rmSync(dir,{recursive:true,force:true});
 }
}
if(process.argv[2]==='--child'){
 await child(path.resolve(process.argv[3]),path.resolve(process.argv[4]));
}else{
 const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
 const run=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--child',root,out],{
  env:{PATH:process.env.PATH||'',CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1'},
  encoding:'utf8',timeout:70000,maxBuffer:2*1024*1024});
 process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');
 assert.equal(run.error,undefined,'isolated runtime execution failed');
 assert.equal(run.signal,null,'isolated runtime must exit without being killed');
 assert.equal(run.status,0,'whole generated MCP test did not pass');
 assert.equal((run.stdout||'').split('\n').filter(x=>x.startsWith(REPORT)).length,1,'one final evidence result required');
}
