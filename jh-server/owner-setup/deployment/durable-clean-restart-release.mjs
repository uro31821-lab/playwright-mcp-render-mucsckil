/**
 * Runtime wrapper that keeps the reviewed durable-live release file untouched,
 * generates an exact clean-restart variant beside it, and starts that variant.
 */
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const DIR=import.meta.dirname;
const SOURCE=path.join(DIR,'durable-live-release.mjs');
const GENERATED_NAME='durable-live-clean-restart-generated.mjs';
const GENERATED=path.join(DIR,GENERATED_NAME);
const sha=x=>createHash('sha256').update(x).digest('hex');
function count(s,n){return s.split(n).length-1;}
function one(s,a,b,code){if(count(s,a)!==1)throw Error(code);return s.replace(a,b);}

export function buildCleanRestartRelease56(){
  const original=readFileSync(SOURCE,'utf8');
  let next=one(original,
    "import {patchDurableMcpWorkflow56} from './durable-mcp-workflow-patch.mjs';",
    "import {patchJH167OperationalReadOnly56} from './jh167-operational-guide-reservation-patch.mjs';",
    'CLEAN_RESTART_RELEASE_IMPORT_ANCHOR');
  next=one(next,
    'const output=patchDurableMcpWorkflow56(patchExistingDurableReturnRoute56(input));',
    'const output=patchJH167OperationalReadOnly56(patchExistingDurableReturnRoute56(input));',
    'CLEAN_RESTART_RELEASE_CALL_ANCHOR');
  const selfOld="./durable-live-release.mjs",selfNew="./"+GENERATED_NAME;
  const refs=count(next,selfOld);if(refs<3)throw Error('CLEAN_RESTART_RELEASE_SELF_REFERENCE_ANCHOR');
  next=next.split(selfOld).join(selfNew);
  if(next===original||!next.includes('patchJH167OperationalReadOnly56'))throw Error('CLEAN_RESTART_RELEASE_NOT_APPLIED');
  const tmp=GENERATED+'.tmp';writeFileSync(tmp,next,{encoding:'utf8',mode:0o600});renameSync(tmp,GENERATED);
  if(readFileSync(GENERATED,'utf8')!==next)throw Error('CLEAN_RESTART_RELEASE_READBACK');
  return Object.freeze({file:GENERATED,sha256:sha(next),sourceSha256:sha(original),selfReferencesRewritten:refs});
}


/**
 * Optional OCR review candidate. The legacy buildCleanRestartRelease56 above
 * is untouched, so original G3-G12 source and runtime expectations remain true.
 * This sibling entry is selected only by explicit JH_FOLD8_OCR_REVIEW_ENABLED=1.
 * It never serves by itself and never changes the original generated file.
 */
const OCR_GENERATED_NAME='durable-live-clean-restart-ocr-generated.mjs';
export function buildOcrCleanRestartRelease56(){
  const base=buildCleanRestartRelease56();
  const original=readFileSync(base.file,'utf8');
  let next=one(original,
    "import {patchJH167OperationalReadOnly56} from './jh167-operational-guide-reservation-patch.mjs';",
    "import {patchJH167OperationalOcrReview56} from './jh167-durable-ocr-review-patch.mjs';",
    'OCR_REVIEW_GENERATED_IMPORT_ANCHOR');
  next=one(next,
    'const output=patchJH167OperationalReadOnly56(patchExistingDurableReturnRoute56(input));',
    "const output=patchJH167OperationalOcrReview56(patchExistingDurableReturnRoute56(input),'1');",
    'OCR_REVIEW_GENERATED_CALL_ANCHOR');
  const before='./'+GENERATED_NAME,after='./'+OCR_GENERATED_NAME,refs=count(next,before);
  if(refs<3)throw Error('OCR_REVIEW_GENERATED_SELF_REFERENCE_ANCHOR');
  next=next.split(before).join(after);
  const file=path.join(DIR,OCR_GENERATED_NAME),tmp=file+'.tmp';
  writeFileSync(tmp,next,{encoding:'utf8',mode:0o600});renameSync(tmp,file);
  if(readFileSync(file,'utf8')!==next)throw Error('OCR_REVIEW_GENERATED_READBACK_FAILED');
  return Object.freeze({file,sha256:sha(next),sourceSha256:base.sha256,selfReferencesRewritten:refs,explicitOptInOnly:true});
}

export async function main(env=process.env){
  const requested=env.JH_FOLD8_OCR_REVIEW_ENABLED;
  if(![undefined,'0','1'].includes(requested))throw Error('JH_OCR_EXPLICIT_FLAG_INVALID');
  const built=requested==='1'?buildOcrCleanRestartRelease56():buildCleanRestartRelease56();
  const mod=await import(pathToFileURL(built.file).href+'?sha256='+built.sha256);
  const running=await mod.main(env);
  console.log('JH_CLEAN_RESTART_POLICY_ACTIVE '+JSON.stringify({
    policy:'DISCARD_UNFINISHED',bridgeReconnectOnly:true,automaticTaskRestore:false,
    duplicateReplayAllowed:false,generatedSha256:built.sha256
  }));
  return running;
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  main().catch(e=>{console.error(String(e?.code||e?.message||'CLEAN_RESTART_START_FAILED'));process.exitCode=1;});
}
