import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildCurrentAudioReleaseCandidate} from '../ebiseo-audio-v05/audio-compose-current-host.mjs';
import {selectAudioCandidateRuntime} from '../ebiseo-audio-v05/audio-current-selector.mjs';
import {CAMERA_EXTENSION} from './camera-contract.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const RUNTIME='server-kabiseo-camera-v0256-candidate.mjs';
const OWNER='owner-service-kabiseo-camera-v0256.mjs';
const UNIFIED='unified-service-kabiseo-camera-v0256.mjs';
const ENTRY='operational-service-kabiseo-camera-v0256.mjs';
const STAMP='kabiseo-camera-v0256-attestation.json';

function rootDir(root){
  const full=path.resolve(root),s=lstatSync(full);
  if(path.basename(full)!=='owner-setup'||!s.isDirectory()||s.isSymbolicLink()||realpathSync(full)!==full)
    fail('CAMERA_OWNER_SOURCE_LAYOUT_REQUIRED');
  return full;
}
function text(file){
  const s=lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||realpathSync(file)!==file)fail('CAMERA_SOURCE_LINK_FORBIDDEN');
  return readFileSync(file,'utf8');
}
function one(source,before,after,code='CAMERA_COMPOSE_ANCHOR_CHANGED'){
  if(source.split(before).length!==2||source.includes(after))fail(code);
  const out=source.replace(before,after);
  if(out.replace(after,before)!==source)fail('CAMERA_COMPOSE_NOT_REVERSIBLE');
  return out;
}
function writeNew(file,content){
  if(existsSync(file)){
    if(text(file)!==content)fail('CAMERA_EXISTING_CANDIDATE_CHANGED');
    return;
  }
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if(realpathSync(path.dirname(file))!==path.dirname(file))fail('CAMERA_OUTPUT_LINK_FORBIDDEN');
  writeFileSync(file,content,{flag:'wx',mode:0o600});
  if(text(file)!==content)fail('CAMERA_CANDIDATE_READBACK_FAILED');
}
function paths(root){
  return {
    runtime:path.join(root,'server-integration',RUNTIME),
    owner:path.join(root,'deployment',OWNER),
    unified:path.join(root,'deployment',UNIFIED),
    entry:path.join(root,'deployment',ENTRY),
    stamp:path.join(root,'server-integration',STAMP)
  };
}

export function composeCameraRuntime(audioRuntime){
  if(typeof audioRuntime!=='string'||(!audioRuntime.includes('JH_EBISEO_AUDIO')&&!audioRuntime.includes('jhAudioHost56')))
    fail('CAMERA_AUDIO_PARENT_REQUIRED');
  let out=audioRuntime;
  const audioImport='import {createAudioHostIntegration} from "../ebiseo-audio-v05/audio-host-integration.mjs";';
  out=one(out,audioImport,audioImport+'\nimport {createCameraHostIntegration} from "../kabiseo-camera-v0256/camera-host-integration.mjs";');

  const clean='function cleanFrameWaiters56(){';
  const cameraHost=[
    'const jhCameraRunSecure56=async ({mcpToolName,jobType,effect,args,extra={}})=>{',
    '  const x=exactEnvelope56(mcpToolName,jobType,effect,args,extra);',
    '  if(x.error)return {status:"error",error:x.error,result:null,targetDeviceId:null};',
    '  return await waitJob(x.job,15000);',
    '};',
    'const jhCameraHost56=createCameraHostIntegration({',
    '  getCatalogDigest:()=>SECURE56_TOOL_CATALOG_DIGEST,',
    '  runSecure:jhCameraRunSecure56',
    '});',
    '',
    ''
  ].join('\n');
  out=one(out,clean,cameraHost+clean);

  const beforeMk='  jhAudioHost56.beforeMk(type,p,targetDeviceId);';
  out=one(out,beforeMk,beforeMk+'\n  jhCameraHost56.beforeMk(type,p,targetDeviceId);');

  const audioDispatch='    const audioAdmission=jhAudioHost56.beforeDispatch(next);';
  const cameraDispatch=[
    '    const cameraAdmission=jhCameraHost56.beforeDispatch(next);',
    '    if(!cameraAdmission.allowed){next.status="expired";next.error=cameraAdmission.code;next.completedAt=new Date().toISOString();',
    '      res.writeHead(cameraAdmission.httpStatus,{"content-type":"application/json","cache-control":"no-store"});',
    '      res.end(JSON.stringify({ok:false,code:cameraAdmission.code}));return;}',
    ''
  ].join('\n');
  out=one(out,audioDispatch,cameraDispatch+audioDispatch);

  const audioRegister='  jhAudioHost56.register({z,registerOAuthTool});';
  out=one(out,audioRegister,audioRegister+'\n  jhCameraHost56.register({z,registerOAuthTool,textResult});');

  const oldHook=' durableNativeHooks56=jhAudioHost56.wrapDurableHooks(createDurableNativeHooks({...options,mobile13ActionMode:"EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1",classifyExtension:jhAudioHost56.classify}));';
  const newHook=' durableNativeHooks56=jhAudioHost56.wrapDurableHooks(createDurableNativeHooks({...options,mobile13ActionMode:"EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1",classifyExtension:(job,payload)=>jhCameraHost56.classify(job,payload)??jhAudioHost56.classify(job,payload)}));';
  out=one(out,oldHook,newHook);

  for(const guard of [
    'jhAudioHost56.beforeMk(type,p,targetDeviceId);',
    'jhCameraHost56.beforeMk(type,p,targetDeviceId);',
    'const cameraAdmission=jhCameraHost56.beforeDispatch(next);',
    'jhAudioHost56.register({z,registerOAuthTool});',
    'jhCameraHost56.register({z,registerOAuthTool,textResult});',
    'classifyExtension:(job,payload)=>jhCameraHost56.classify(job,payload)??jhAudioHost56.classify(job,payload)'
  ]) if(!out.includes(guard))fail('CAMERA_COMPOSE_GUARD_MISSING');
  return Object.freeze({runtime:out,sha256:sha(out),parentSha256:sha(audioRuntime)});
}

function linkStartup(audio){
  const ownerSource=text(audio.ownerFile);
  const oldImport='import {selectAudioCandidateRuntime} from "../ebiseo-audio-v05/audio-current-selector.mjs";';
  const newImport='import {selectCameraCandidateRuntime} from "../kabiseo-camera-v0256/camera-current-selector.mjs";';
  let owner=one(ownerSource,oldImport,newImport);
  owner=one(owner,
    "if(runtimeMode==='unified')serverPath=selectAudioCandidateRuntime(root,process.env).file;",
    "if(runtimeMode==='unified')serverPath=selectCameraCandidateRuntime(root,process.env).file;");

  const unifiedSource=text(audio.unifiedFile);
  const unified=one(unifiedSource,
    "from './owner-service-ebiseo-audio-v05.mjs';",
    "from './owner-service-kabiseo-camera-v0256.mjs';");

  let entry=text(audio.entryFile);
  entry=one(entry,oldImport,newImport);
  entry=one(entry,
    "from './unified-service-ebiseo-audio-v05.mjs';",
    "from './unified-service-kabiseo-camera-v0256.mjs';");
  entry=one(entry,
    'const runtime=selectAudioCandidateRuntime(ROOT,process.env).file;',
    'const runtime=selectCameraCandidateRuntime(ROOT,process.env).file;');
  return {owner,unified,entry};
}

export function selectAttestedCameraRuntime(ownerRoot,audioParent){
  const root=rootDir(ownerRoot),p=paths(root);
  const expectedParent=path.join(root,'server-integration','server-ebiseo-audio-v05-candidate.mjs');
  if(audioParent?.file!==expectedParent||!audioParent?.sha256||sha(text(expectedParent))!==audioParent.sha256)
    fail('CAMERA_AUDIO_PARENT_ATTESTATION_REQUIRED');
  const composed=composeCameraRuntime(text(expectedParent));
  let stamp;
  try{stamp=JSON.parse(text(p.stamp));}catch{fail('CAMERA_ATTESTATION_MISSING');}
  if(stamp.schema!=='KABISEO_CAMERA_V0256_OVER_AUDIO_V1'||
     stamp.parentAudioSha256!==audioParent.sha256||stamp.runtimeSha256!==composed.sha256||
     stamp.cameraExtension?.id!==CAMERA_EXTENSION.id||
     stamp.cameraExtension?.version!==CAMERA_EXTENSION.version||
     stamp.cameraExtension?.digest!==CAMERA_EXTENSION.digest||
     stamp.productionEnabled!==false||stamp.automaticReplayAllowed!==false)
    fail('CAMERA_ATTESTATION_CHANGED');
  if(text(p.runtime)!==composed.runtime||
     sha(text(p.owner))!==stamp.ownerSha256||
     sha(text(p.unified))!==stamp.unifiedSha256||
     sha(text(p.entry))!==stamp.operationalSha256)
    fail('CAMERA_CANDIDATE_DRIFT');
  return Object.freeze({file:p.runtime,sha256:composed.sha256,parentAudioSha256:audioParent.sha256,
    baseCatalogChanged:false,automaticReplayAllowed:false});
}

export const CAMERA_ENABLE_FLAG='EXPLICIT_KABISEO_CAMERA_V0256';

export function cameraActivationEnabled(env=process.env){
  const flag=env?.JH_KABISEO_CAMERA_ENABLE;
  if(flag===undefined||flag==='')return false;
  if(flag!==CAMERA_ENABLE_FLAG)fail('CAMERA_ENABLE_FLAG_INVALID');
  if(env?.JH_EBISEO_AUDIO_ENABLE!=='EXPLICIT_EBISEO_AUDIO_V05')
    fail('CAMERA_EBISEO_AUDIO_REQUIRED');
  return true;
}

export function buildCameraOverlayFromVerifiedAudio(ownerRoot,audio,env=process.env){
  const root=rootDir(ownerRoot);
  const audioParent=selectAudioCandidateRuntime(root,env);
  if(audioParent.file!==audio.file||audioParent.sha256!==audio.candidateSha256)
    fail('CAMERA_AUDIO_BUILD_SELECTION_MISMATCH');
  const composed=composeCameraRuntime(text(audio.file));
  const linked=linkStartup(audio),p=paths(root);
  writeNew(p.runtime,composed.runtime);
  writeNew(p.owner,linked.owner);
  writeNew(p.unified,linked.unified);
  writeNew(p.entry,linked.entry);
  const stamp={
    schema:'KABISEO_CAMERA_V0256_OVER_AUDIO_V1',
    parentAudioSha256:audio.candidateSha256,
    runtimeSha256:composed.sha256,
    ownerSha256:sha(linked.owner),
    unifiedSha256:sha(linked.unified),
    operationalSha256:sha(linked.entry),
    cameraExtension:CAMERA_EXTENSION,
    productionEnabled:false,
    automaticReplayAllowed:false,
    baseCatalogChanged:false,
    audioSourcePreserved:true
  };
  writeNew(p.stamp,JSON.stringify(stamp,null,2)+'\n');
  const selected=selectAttestedCameraRuntime(root,selectAudioCandidateRuntime(root,env));
  if(selected.sha256!==composed.sha256)fail('CAMERA_READBACK_MISMATCH');
  return Object.freeze({...selected,entryFile:p.entry,ownerFile:p.owner,unifiedFile:p.unified,
    stampFile:p.stamp,candidateSha256:composed.sha256,listenerStarted:false,apkChanged:false,
    cameraOverlayActive:true});
}

export async function buildCameraReleaseCandidate(ownerRoot,env=process.env){
  const root=rootDir(ownerRoot);
  const audioEnv={...env};
  delete audioEnv.JH_KABISEO_CAMERA_ENABLE;
  const audio=await buildCurrentAudioReleaseCandidate(root,audioEnv);
  return buildCameraOverlayFromVerifiedAudio(root,audio,audioEnv);
}
