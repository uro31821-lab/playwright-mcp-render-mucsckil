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
const GENERATED_NAME='durable-live-news-review-generated.mjs';
const GENERATED=path.join(DIR,GENERATED_NAME);
const sha=x=>createHash('sha256').update(x).digest('hex');
// GitHub / Render service jh-secure-bridge-fix4, deployed 2026-10-22.
// This release reviewer must fail closed if the CURRENT production source differs.
const EXPECTED_LIVE_RELEASE_BLOB='7eb67cd9d682a23561f08e3444548f98afebbb38';
const gitBlob=x=>{const b=Buffer.from(x);return createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');};
function count(s,n){return s.split(n).length-1;}
function one(s,a,b,code){if(count(s,a)!==1)throw Error(code);return s.replace(a,b);}

export function buildCleanRestartRelease56(){
  const original=readFileSync(SOURCE,'utf8');
  if(gitBlob(original)!==EXPECTED_LIVE_RELEASE_BLOB)
    throw Error('JH167_NEWS_LIVE_RELEASE_VERSION_MISMATCH');
  if(!original.includes("const descOld='Browser-capable services use Playwright; native-only services use the selected Android device.';")||
     !original.includes('const rightWeb=String.raw`const j=mk("open_url",{target:"chrome",url});'))
    throw Error('JH167_RIGHT_CHROME_OPEN_ROUTE_NOT_VERIFIED');
  let next=one(original,
    "import {patchDurableMcpWorkflow56} from './durable-mcp-workflow-patch.mjs';",
    "import {patchJH167OperationalArticleReview56} from './jh167-article-operational-review-composition.mjs';",
    'CLEAN_RESTART_RELEASE_IMPORT_ANCHOR');
  next=one(next,
    'const output=patchDurableMcpWorkflow56(patchExistingDurableReturnRoute56(input));',
    'const output=patchJH167OperationalArticleReview56(patchExistingDurableReturnRoute56(input));',
    'CLEAN_RESTART_RELEASE_CALL_ANCHOR');
  const selfOld="./durable-live-release.mjs",selfNew="./"+GENERATED_NAME;
  const refs=count(next,selfOld);if(refs<3)throw Error('CLEAN_RESTART_RELEASE_SELF_REFERENCE_ANCHOR');
  next=next.split(selfOld).join(selfNew);
  if(next===original||!next.includes('patchJH167OperationalArticleReview56'))throw Error('CLEAN_RESTART_RELEASE_NOT_APPLIED');
  const tmp=GENERATED+'.tmp';writeFileSync(tmp,next,{encoding:'utf8',mode:0o600});renameSync(tmp,GENERATED);
  if(readFileSync(GENERATED,'utf8')!==next)throw Error('CLEAN_RESTART_RELEASE_READBACK');
  return Object.freeze({file:GENERATED,sha256:sha(next),sourceSha256:sha(original),selfReferencesRewritten:refs});
}

export async function main(env=process.env){
  const built=buildCleanRestartRelease56();
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
