/**
 * JH228 camera-v2 overlay. Preserve every pinned Secure56 source byte.
 * Runtime output is generated only after reviewed release hash verification.
 */
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildCleanRestartRelease56} from './durable-clean-restart-news-review-entry.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const fail=x=>{throw Error(x);};
function once(s,a,b,e){if(typeof s!=='string'||s.split(a).length!==2||s.includes(b))fail(e);return s.replace(a,b);}
const SOURCE_FENCE='if(process.env.JH_OWNER_DEFER_LISTEN!=="1")throw Error("DURABLE_HOST_BOOTSTRAP_REQUIRED");';
const CATALOG='const SECURE56_TOOL_CATALOG_DIGEST="a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1";';
const SESSION_ANCHOR='function sessionDigest56(x){';
const REQUEST_ANCHOR='  const url=new URL(req.url||"/","http://localhost");\n';
const STAGE_IMPORT='import {sharedCameraV2StageStore,createSecure56StageVerifier,serveStagedJpeg} from "../../camera-v2-secure-stage.mjs";\n';
const STAGE_BINDING=[
 '// JH228: host-only in-memory staging. No public upload or server secret export.',
 'const jh228CameraStageVerify56=createSecure56StageVerifier({',
 ' store:sharedCameraV2StageStore,',
 ' lookupActiveSession:async sid=>{',
 '  for(const id of secureStates56.keys()){',
 '   const a=active56(id);',
 '   if(a?.sessionId===sid && Buffer.isBuffer(a.secret) && Number.isSafeInteger(a.expiresAt))',
 '    return {verifiedBySecure56:true,sessionId:a.sessionId,deviceDigest:a.deviceDigest,',
 '      secret:a.secret,expiresAtMs:a.expiresAt};',
 '  }',
 '  return null;',
 ' },',
 ' claimNonce:async ({sessionId,nonce})=>{',
 '  for(const id of secureStates56.keys()){',
 '   const a=active56(id);',
 '   if(a?.sessionId===sessionId){',
 '    if(!(a.seenFrame instanceof Set))return false;',
 '    return seen56(a.seenFrame,nonce);',
 '   }',
 '  }',
 '  return false;',
 ' }',
 '});',''
].join('\n');
const REQUEST_NEW=REQUEST_ANCHOR+
 '  if(await serveStagedJpeg(req,res,{store:sharedCameraV2StageStore,verifyActiveDeviceSession:jh228CameraStageVerify56}))return;\n';
export function patchJH228CameraV2Runtime(input){
 if(typeof input!=='string'||input.length<10000)fail('JH228_RUNTIME_REQUIRED');
 for(const a of [SOURCE_FENCE,CATALOG,'const secureStates56=new Map();',
  'function active56(deviceId){','function seen56(set,nonce){',
  SESSION_ANCHOR,REQUEST_ANCHOR,'const httpServer=createServer(async(req,res)=>{'])
  if(input.split(a).length!==2)fail('JH228_SECURE_ANCHOR_CHANGED');
 if(input.includes('jh228CameraStageVerify56')||input.includes(STAGE_IMPORT))fail('JH228_DUPLICATE_STAGE');
 const output=STAGE_IMPORT+once(once(input,SESSION_ANCHOR,STAGE_BINDING+SESSION_ANCHOR,
  'JH228_SESSION_ANCHOR'),REQUEST_ANCHOR,REQUEST_NEW,'JH228_HTTP_ANCHOR');
 const undone=output.slice(STAGE_IMPORT.length).replace(REQUEST_NEW,REQUEST_ANCHOR)
  .replace(STAGE_BINDING+SESSION_ANCHOR,SESSION_ANCHOR);
 if(undone!==input)fail('JH228_OVERLAY_SCOPE_CHANGED');
 return output;
}
const REVIEW_IMPORT="import {patchJH167OperationalArticleReview56} from './jh167-article-operational-review-composition.mjs';";
const OVERLAY_IMPORT="import {patchJH228CameraV2Runtime} from './jh228-camera-v2-durable-overlay.mjs';\n";
const REVIEW_CALL='const output=patchJH167OperationalArticleReview56(patchExistingDurableReturnRoute56(input));';
const PATCHED_CALL='const output=patchJH228CameraV2Runtime(patchJH167OperationalArticleReview56(patchExistingDurableReturnRoute56(input)));';
const SELF_OLD='./durable-live-news-review-generated.mjs';
const SELF_NEW='./durable-live-news-review-jh228-generated.mjs';
export function patchJH228ReviewedRelease(source){
 if(typeof source!=='string'||source.split(REVIEW_IMPORT).length!==2||
   source.split(REVIEW_CALL).length!==2||source.includes(OVERLAY_IMPORT)||source.includes(SELF_NEW))
   fail('JH228_REVIEW_ANCHOR_CHANGED');
 const count=source.split(SELF_OLD).length-1;
 if(count<3||count>12)fail('JH228_REVIEW_SELF_ANCHOR');
 const result=OVERLAY_IMPORT+once(source,REVIEW_CALL,PATCHED_CALL,
  'JH228_REVIEW_CALL_ANCHOR').replaceAll(SELF_OLD,SELF_NEW);
 const reversed=result.slice(OVERLAY_IMPORT.length).replaceAll(SELF_NEW,SELF_OLD)
  .replace(PATCHED_CALL,REVIEW_CALL);
 if(reversed!==source)fail('JH228_REVIEW_SCOPE_CHANGED');
 return result;
}
export function buildJH228ReviewedRelease(){
 const baseline=buildCleanRestartRelease56();
 const contents=readFileSync(baseline.file,'utf8');
 if(sha(contents)!==baseline.sha256)fail('JH228_CLEAN_RESTART_HASH_CHANGED');
 const next=patchJH228ReviewedRelease(contents);
 const file=path.join(path.dirname(baseline.file),'durable-live-news-review-jh228-generated.mjs');
 const tmp=file+'.'+process.pid+'.tmp';
 writeFileSync(tmp,next,{mode:0o600});renameSync(tmp,file);
 if(sha(readFileSync(file))!==sha(next))fail('JH228_READBACK_FAILED');
 return Object.freeze({file,sha256:sha(next),parentSha256:baseline.sha256,
  pinnedSourceSha256:baseline.sourceSha256,listenStarted:false,productionDeployed:false});
}
