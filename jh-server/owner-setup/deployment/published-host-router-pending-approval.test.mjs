import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {selectPendingApprovalStartup56} from './published-host-router.mjs';
const pinnedOriginal='de16f15dfa627cdfb431400be3aabe1a2b001cea';
const selectorAdded="/** Readable fail-closed opt-in; a blank value restores the original npm start path. */\nexport function selectPendingApprovalStartup56(env=process.env){\n const flag=env.JH_PENDING_APPROVAL_OPERATOR_ENABLE;\n if(flag===undefined||flag==='')return 'original';\n if(flag!=='EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1')fail('JH_PENDING_APPROVAL_OPERATOR_FLAG_INVALID');\n if(env.JH_DURABLE_RELEASE!=='SERVE_READY_V1')fail('JH_PENDING_APPROVAL_DURABLE_RELEASE_REQUIRED');\n if(env.RENDER_SERVICE_ID!=='srv-db0fjl2d0e5s73be114g')fail('JH_PENDING_APPROVAL_SERVICE_ID_MISMATCH');\n if(env.CI==='true'||env.JH_OWNER_DEFER_LISTEN!==undefined)fail('JH_PENDING_APPROVAL_TEST_BYPASS_FORBIDDEN');\n return 'pending-approval';\n}\n";
const branchAdded=" if(selectPendingApprovalStartup56(process.env)==='pending-approval'){\n  assertPublishedHost(hostRoot,sourceRoot);requirePcNodeVersion(process.versions.node);\n  const {main:operatorMain}=await import('../server-integration/pending-approval-operator-entry.mjs');\n  return operatorMain(process.env);\n }\n";
const currentPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'published-host-router.mjs');

const pinnedPreStage25='ff7c1c17a419526bef1c1f0bd8bfd3755db64696';
const stage25Begin='/** Exact opt-in to the existing pending-approval + learning operator with';
const stage25End='export async function main(){';
const stage25Extra=" if(selectJH168FollowupOperator56(process.env)!=='original')fail('JH_STAGE25_PENDING_OPERATOR_REQUIRED');\n";
const stage25Branch=String.raw`  if(selectJH168FollowupOperator56(process.env)==='followup'){
   const {main:operatorMain}=await import('../jh168-mobile-unification/stage25-live-operator-followup-entry.mjs');
   return operatorMain(process.env);
  }
  const {main:operatorMain}=await import('../server-integration/pending-approval-operator-entry.mjs');
  return operatorMain(process.env);`;
const stage25Original=String.raw`  const {main:operatorMain}=await import('../server-integration/pending-approval-operator-entry.mjs');
  return operatorMain(process.env);`;
const gitBlob=src=>{
 const b=Buffer.from(src);
 return createHash('sha1').update('blob '+b.length+String.fromCharCode(0)).update(b).digest('hex');
};
function reverseExactStage25(source){
 assert.equal(source.split(stage25Begin).length,2);
 assert.equal(source.split(stage25End).length,2);
 assert.equal(source.split(stage25Branch).length,2);
 assert.equal(source.split(stage25Extra).length,2);
 const from=source.indexOf(stage25Begin);
 const to=source.indexOf(stage25End,from);
 assert.ok(from>=0&&to>from);
 const stage25Removed=source.slice(0,from)+source.slice(to);
 const original=stage25Removed.replace(stage25Branch,stage25Original).replace(stage25Extra,'');
 assert.equal(gitBlob(original),pinnedPreStage25,'all prior router logic unchanged');
 return original;
}


test('operator router: opt-out preserves original published startup in exact original bytes',()=>{
 const now=readFileSync(currentPath,'utf8');
 const previous=reverseExactStage25(now);
 assert.equal(previous.split(selectorAdded).length,2);
 assert.equal(previous.split(branchAdded).length,2);
 const original=previous.replace(selectorAdded,'').replace(branchAdded,'');
 assert.equal(gitBlob(original),pinnedOriginal);
});

test('operator router: default/blank opt-out and exact explicit opt-in',()=>{
 const known={RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g',JH_DURABLE_RELEASE:'SERVE_READY_V1'};
 assert.equal(selectPendingApprovalStartup56(known),'original');
 assert.equal(selectPendingApprovalStartup56({...known,JH_PENDING_APPROVAL_OPERATOR_ENABLE:''}),'original');
 assert.equal(selectPendingApprovalStartup56({...known,JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1'}),'pending-approval');
});

test('operator router: fail closed for forged flag, wrong release/service and test bypass',()=>{
 const known={RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g',JH_DURABLE_RELEASE:'SERVE_READY_V1',
 JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1'};
 for(const other of [
 {...known,JH_PENDING_APPROVAL_OPERATOR_ENABLE:'anything'},
 {...known,JH_DURABLE_RELEASE:undefined},
 {...known,RENDER_SERVICE_ID:'srv-not-authorized'},
 {...known,CI:'true'},
 {...known,JH_OWNER_DEFER_LISTEN:'1'}
 ])assert.throws(()=>selectPendingApprovalStartup56(other),/JH_PENDING_APPROVAL_/);
});
