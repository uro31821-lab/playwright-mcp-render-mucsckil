/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,cpSync,rmSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildCurrentAudioReleaseCandidate,verifyCurrentAudioSources,AUDIO_SOURCE_COMMIT} from './audio-compose-current-host.mjs';
import {createAudioDurableClassifier} from './audio-durable-policy.mjs';
import {createPinnedAudioReleaseAuthority} from './audio-release-authority.mjs';
import {LEGACY_CATALOG_PIN} from './audio-contract.mjs';

const source=process.env.EBISEO_TEST_CURRENT_OWNER_ROOT;
assert.ok(source,'EBISEO_TEST_CURRENT_OWNER_ROOT must identify exact HEAD source; no skipped composition tests');
const sha=x=>createHash('sha256').update(x).digest('hex');
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
  JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
  JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
  JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
  JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'EXPLICIT_SIGNED_COMMAND_CAUSE_V1',
  JH_STAGE44_DEVICE_FOCUS:'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1',
  JH_MOBILE13_COMMAND_DIAGNOSTICS:'EXPLICIT_OWNER_DEVICE_READ_ONLY_V1'};
const folders=[];
function copyHost(){
  const folder=mkdtempSync(path.join(tmpdir(),'ebiseo-v05-stage71-'));folders.push(folder);
  const host=path.join(folder,'jh-server');
  cpSync(path.dirname(path.resolve(source)),host,{recursive:true,
    filter:p=>!p.includes('ebiseo-audio-v04')&&!p.includes('ebiseo-audio-v05')});
  return path.join(host,'owner-setup');
}
const root=copyHost();
const built=await buildCurrentAudioReleaseCandidate(root,env);
const current=readFileSync(built.file,'utf8'),parent=readFileSync(built.parentRuntimeFile,'utf8');
const {selectAudioCandidateRuntime}=await import(pathToFileURL(path.join(root,'ebiseo-audio-v05/audio-current-selector.mjs')).href);
after(()=>{for(const folder of folders)rmSync(folder,{recursive:true,force:true});});
function piece(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a);assert.ok(a>=0&&b>a);return text.slice(a,b);}

test('current HEAD composition retains latest feature layers and exact completion verifier',()=>{
  assert.equal(built.sourceCommit,AUDIO_SOURCE_COMMIT);
  assert.equal(built.routingModel,'ANDROID_THEN_MANUAL');assert.equal(built.activated,false);
  for(const name of ['pendingApprovalReceipts56','jhSplitFollowupReceipts56','computerExecutionReceipts56',
    'resolveSnapshotDigestReadback56','jhOwnerAdmissionNote40','jhCommandCause41','jhFocus44',
    'jhStage61Host56','jhRegisterLearningTools56']){
    assert.ok(parent.includes(name),name);assert.equal(current.split(name).length,parent.split(name).length,name);
  }
  assert.equal(piece(current,'function payloadDigest56(p){','function safeJobView56(j){'),
    piece(parent,'function payloadDigest56(p){','function safeJobView56(j){'));
  assert.equal(piece(current,'  const completeMatch=','  const frameMatch='),
    piece(parent,'  const completeMatch=','  const frameMatch='));
  assert.ok(current.indexOf('jhAudioHost56.beforeDispatch(next)')<current.indexOf('trustedSessionAuthority56.beforeDispatch(next)'));
  assert.ok(current.includes('mobile13ActionMode:"EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1",classifyExtension:jhAudioHost56.classify'));
  assert.equal(verifyCurrentAudioSources(root).files,322);
});

test('current evidence Search remains byte-identical and opt-in beside the audio delta',()=>{
  const start='  // Evidence search: server-side OAuth tool only.';
  const end='      apiKey:process.env.PERPLEXITY_API_KEY});\n  }\n';
  const snippet=piece(current,start,end)+end;
  assert.equal(snippet,piece(parent,start,end)+end);
  assert.equal(current.split('registerJHEvidenceSearchTool({').length,2);
  const evidenceImport="import {registerJHEvidenceSearchTool} from '../evidence/perplexity-search.mjs';";
  assert.equal(current.split(evidenceImport).length,2);
  assert.equal(parent.split(evidenceImport).length,2);
  const authLine=text=>text.split('\n').filter(x=>x.startsWith('  const registerOAuthTool='));
  assert.equal(authLine(parent).length,1);
  assert.deepEqual(authLine(current),authLine(parent));
  assert.equal(piece(current,'function jhRequireCommand56(device,workflowId=null){','const jhWorkflowTtl56='),
    piece(parent,'function jhRequireCommand56(device,workflowId=null){','const jhWorkflowTtl56='));
  const digestLine=text=>text.split('\n').filter(x=>x.startsWith('const SECURE56_TOOL_CATALOG_DIGEST='));
  assert.equal(digestLine(parent).length,1);
  assert.deepEqual(digestLine(current),digestLine(parent));
  const key='synthetic-key-never-sent-to-provider';
  const inputs=[{}, {PERPLEXITY_API_KEY:key}, {JH_EVIDENCE_SEARCH_ENABLED:'1'},
    {JH_EVIDENCE_SEARCH_ENABLED:'1',PERPLEXITY_API_KEY:'short'},
    {JH_EVIDENCE_SEARCH_ENABLED:'1',PERPLEXITY_API_KEY:key}];
  for(const [index,input] of inputs.entries()){
    const calls=[];
    new Function('process','registerJHEvidenceSearchTool','registerOAuthTool','z','textResult',snippet)(
      {env:Object.freeze({...input})},args=>calls.push(args),()=>{}, {}, x=>x);
    assert.equal(calls.length,index===4?1:0);
    if(index===4)assert.equal(calls[0].apiKey,key);
  }
  assert.equal(env.JH_EVIDENCE_SEARCH_ENABLED,undefined);
  assert.equal(env.PERPLEXITY_API_KEY,undefined);
});

test('both newly imported evidence sources are pinned before composition or selection',()=>{
  const manifest=JSON.parse(readFileSync(new URL('./audio-upstream-sources.json',import.meta.url),'utf8'));
  const parentManifest=JSON.parse(readFileSync(path.join(root,'ebiseo-audio-v05/audio-upstream-sources.json'),'utf8'));
  assert.deepEqual(parentManifest,manifest);
  for(const name of ['evidence/perplexity-search-composition.mjs','evidence/perplexity-search.mjs']){
    const file=path.join(root,name),original=readFileSync(file,'utf8');
    assert.equal(manifest.files['owner-setup/'+name],sha(original));
    writeFileSync(file,original+'\n// synthetic upstream drift\n');
    try{
      assert.throws(()=>verifyCurrentAudioSources(root),{code:'AUDIO_UPSTREAM_SOURCE_CHANGED'});
      assert.throws(()=>selectAudioCandidateRuntime(root,env),{code:'AUDIO_UPSTREAM_SOURCE_CHANGED'});
    }finally{writeFileSync(file,original);}
  }
});

test('installed selector revalidates original attestation and rejects audio output drift',()=>{
  const selected=selectAudioCandidateRuntime(root,env);assert.equal(selected.file,built.file);
  assert.equal(selected.sha256,built.candidateSha256);
  writeFileSync(built.file,current+'\n');
  try{assert.throws(()=>selectAudioCandidateRuntime(root,env),{code:'AUDIO_CURRENT_CANDIDATE_DRIFT'});}
  finally{writeFileSync(built.file,current);}
  const stamp=path.join(root,'server-integration/jh168-followup-operator-attestation.json');
  const original=readFileSync(stamp,'utf8'),bad=JSON.parse(original);bad.runtimeSha256='0'.repeat(64);
  writeFileSync(stamp,JSON.stringify(bad));
  try{assert.throws(()=>selectAudioCandidateRuntime(root,env),/JH_STAGE25_FOLLOWUP_ATTESTATION_SCOPE_CHANGED/);}
  finally{writeFileSync(stamp,original);}
});

test('upstream source drift is refused without updating source pins',()=>{
  const file=path.join(root,'jh168-mobile-unification/stage61-right-pane-router.mjs');
  const original=readFileSync(file,'utf8');writeFileSync(file,original+'\n');
  try{assert.throws(()=>verifyCurrentAudioSources(root),{code:'AUDIO_UPSTREAM_SOURCE_CHANGED'});}
  finally{writeFileSync(file,original);}
});

test('a changed audio adapter is rejected on its first candidate build',async()=>{
  const folder=mkdtempSync(path.join(tmpdir(),'ebiseo-v05-modified-module-'));folders.push(folder);
  const moduleRoot=path.join(folder,'server-src');cpSync(import.meta.dirname,moduleRoot,{recursive:true});
  const adapter=path.join(moduleRoot,'audio-host-adapter.mjs');writeFileSync(adapter,readFileSync(adapter,'utf8')+'\n// synthetic changed input\n');
  const changed=await import(pathToFileURL(path.join(moduleRoot,'audio-compose-current-host.mjs')).href);
  await assert.rejects(changed.buildCurrentAudioReleaseCandidate(root,env),{code:'AUDIO_REVIEWED_MODULE_CHANGED'});
});

test('actual composed durable hook preserves Mobile13 SELECT_PICK uncertainty across restart',async()=>{
  const {createDurableNativeHooks}=await import(pathToFileURL(path.join(root,'deployment/ebiseo-audio-durable-host-v05.mjs')).href);
  const directory=mkdtempSync(path.join(tmpdir(),'ebiseo-v05-mobile-journal-'));folders.push(directory);chmodSync(directory,0o700);
  const classifyExtension=createAudioDurableClassifier({releaseAuthority:createPinnedAudioReleaseAuthority(),getCatalogDigest:()=>LEGACY_CATALOG_PIN});
  const options={file:path.join(directory,'manual.sqlite'),key:Buffer.alloc(32,37),namespace:sha('synthetic-mobile-owner'),
    mobile13ActionMode:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',classifyExtension};
  const payload={contextId:'ssc_'+'a'.repeat(32),command:'옵션 선택',targetItemRef:'item_'+'b'.repeat(16),action:'CLICK',
    mcpToolName:'life_android_execute_computer_action',secureRequestedEffect:'REVERSIBLE_WRITE',
    taskDigest:sha('synthetic-task'),targetDeviceDigest:sha('synthetic-device'),secureInvocationExpiresAt:Date.now()+45000,
    containsCredential:false,dataClass:'NON_SENSITIVE',commandId:'c'.repeat(32),requestId:'d'.repeat(32),
    stage61RouteSchema:'JH168_STAGE61_ROUTE_REQUEST_V1',stage61Action:'SELECT_PICK',stage61WebOutcome:'NOT_RUN',
    stage61ComputerOutcome:'NOT_RUN',stage61PlaywrightMobileAvailable:false};
  const job={id:'synthetic-select-pick',type:'split_screen_session_followup',status:'queued',
    targetDeviceId:'synthetic-device',secureSessionId:'synthetic-session',...payload};
  let hooks=createDurableNativeHooks({...options,mode:'EXPLICIT_ONE_TIME'});
  try{
    hooks.capture(job,payload);assert.equal(hooks.beforeDispatch(job).allowed,true);
    job.status='in_progress';hooks.close();hooks=createDurableNativeHooks(options);
    const changed={...payload,requestId:'e'.repeat(32),commandId:'f'.repeat(32),taskDigest:sha('new-task')};
    const repeated={...job,...changed,id:'synthetic-select-pick-repeat',status:'queued',secureSessionId:'new-synthetic-session'};
    hooks.capture(repeated,changed);
    assert.equal(hooks.beforeDispatch(repeated).code,'DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
  }finally{hooks.close();}
  assert.throws(()=>createDurableNativeHooks({...options,mobile13ActionMode:'unreviewed'}),/DURABLE_MOBILE13_ACTION_MODE_INVALID/);
});

test('Stage71 exhausted Android routes remain manual and UNKNOWN remains no replay',async()=>{
  const {routeStage61}=await import(pathToFileURL(path.join(root,'jh168-mobile-unification/stage61-right-pane-router.mjs')).href);
  const layout={arrangement:'LEFT_RIGHT',chatPackage:'com.openai.chatgpt',chatWindowId:10,chatLeft:0,chatRight:1216,
    chatDisplayId:0,workPackage:'com.android.chrome',workWindowId:11,workLeft:1233,workRight:2448,workDisplayId:0};
  assert.equal(routeStage61({action:'SELECT_PICK',layout,webOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT',
    computerOutcome:'VERIFIED_UNSUPPORTED_NO_EFFECT'}).provider,'MANUAL');
  assert.equal(routeStage61({action:'CLICK',layout,webOutcome:'UNKNOWN'}).provider,'STOP_NO_REPLAY');
  assert.equal(current.includes('createStage67'),false);
});

test('optional upstream diagnostics flags are preserved rather than enabled by the audio composer',async()=>{
  const minimal={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',JH_MOBILE_WEB_13_MODE:env.JH_MOBILE_WEB_13_MODE};
  const minimalRoot=copyHost(),result=await buildCurrentAudioReleaseCandidate(minimalRoot,minimal);
  const stamp=JSON.parse(readFileSync(result.stampFile,'utf8'));
  assert.equal(stamp.parentStamp.stage61ApprovalRouting,true);
  for(const key of ['stage40OwnerAdmissionDiagnostics','stage41CommandLifecycleDiagnostics','stage44DeviceFocus','mobile13CommandDiagnostics'])
    assert.equal(stamp.parentStamp[key],false,key);
  assert.equal(stamp.parentStamp.signedCompletionAckStage26,undefined);
  assert.notEqual(result.candidateSha256,built.candidateSha256);
  await assert.rejects(buildCurrentAudioReleaseCandidate(minimalRoot,{CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1'}),
    {code:'AUDIO_STAGE71_ANDROID_MODE_REQUIRED'});
});

test('current owner function executes its real audio selector before the import boundary',async()=>{
  const ownerSource=readFileSync(built.ownerFile,'utf8');
  const ownerFunction=piece(ownerSource,'export async function startConfiguredOwnerServer(','export async function main(')
    .replace('export async function','async function');
  const events=[],sentinel=Error('STOP_BEFORE_RUNTIME_IMPORT');let selected;
  const deps={root,Buffer,path,process:{env:{...env}},readFileSync,sha,
    assertConfig:()=>events.push('config'),fail:code=>{throw Object.assign(Error(code),{code});},
    checkOwnerStorage:()=>events.push('storage'),
    selectAudioCandidateRuntime:(r,e)=>{events.push('original-and-audio-selectors');return selectAudioCandidateRuntime(r,e);},
    acquireOwnerRuntimeLock:()=>{events.push('lock');return {close(){events.push('close');}};},
    pathToFileURL:file=>{selected=file;events.push('import');throw sentinel;}};
  const start=new Function(...Object.keys(deps),'let startAttempted=false;\n'+ownerFunction+'\nreturn startConfiguredOwnerServer;')(...Object.values(deps));
  await assert.rejects(start({config:{serverOrigin:'https://synthetic.invalid'},key:Buffer.alloc(32,47),
    port:0,bindAddress:'127.0.0.1',runtimeMode:'unified'}),e=>e===sentinel);
  assert.equal(selected,built.file);
  assert.deepEqual(events,['config','storage','original-and-audio-selectors','lock','import','close']);
});

test('candidate entry keeps published host and operator gates before owner storage',async()=>{
  const entry=await import(pathToFileURL(path.join(root,'ebiseo-audio-v05/audio-candidate-entry.mjs')).href);
  await assert.rejects(entry.main({}),/AUDIO_EXISTING_STAGE71_OPERATOR_REQUIRED/);
  await assert.rejects(entry.main({JH_PENDING_APPROVAL_OPERATOR_ENABLE:'wrong'}),/JH_PENDING_APPROVAL_OPERATOR_FLAG_INVALID/);
  const productionShape={RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g',JH_DURABLE_RELEASE:'SERVE_READY_V1',
    JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1',
    JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1'};
  await assert.rejects(entry.main(productionShape),/AUDIO_STAGE71_ANDROID_MODE_REQUIRED/);
  await assert.rejects(entry.main({...productionShape,CI:'true'}),/JH_PENDING_APPROVAL_TEST_BYPASS_FORBIDDEN/);
});
