import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
 selectPendingApprovalStartup56,
 selectJH168FollowupOperator56
} from '../deployment/published-host-router.mjs';

const gitBlob=src=>{
 const data=Buffer.from(src,'utf8');
 return createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
};
const file=path.join(import.meta.dirname,'../deployment/published-host-router.mjs');
const source=readFileSync(file,'utf8');
const BASE_BLOB='ff7c1c17a419526bef1c1f0bd8bfd3755db64696';
const helper=String.raw`/** Exact opt-in to the existing pending-approval + learning operator with
 * an ADDITIONAL read-only FOLLOW_UP receipt. No default route change. */
export function selectJH168FollowupOperator56(env=process.env){
 const flag=env.JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE;
 if(flag===undefined||flag==='')return 'original';
 if(flag!=='EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1')
  fail('JH_STAGE25_FOLLOWUP_OPERATOR_FLAG_INVALID');
 if(env.JH_PENDING_APPROVAL_OPERATOR_ENABLE!=='EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1'||
    env.JH_DURABLE_RELEASE!=='SERVE_READY_V1'||
    env.RENDER_SERVICE_ID!=='srv-db0fjl2d0e5s73be114g')
  fail('JH_STAGE25_EXISTING_OPERATOR_REQUIRED');
 if(env.CI==='true'||env.JH_OWNER_DEFER_LISTEN!==undefined)
  fail('JH_STAGE25_PRODUCTION_TEST_BYPASS_FORBIDDEN');
 return 'followup';
}
`;
const originalBody=String.raw`  const {main:operatorMain}=await import('../server-integration/pending-approval-operator-entry.mjs');
  return operatorMain(process.env);`;
const routedBody=String.raw`  if(selectJH168FollowupOperator56(process.env)==='followup'){
   const {main:operatorMain}=await import('../jh168-mobile-unification/stage25-live-operator-followup-entry.mjs');
   return operatorMain(process.env);
  }
  const {main:operatorMain}=await import('../server-integration/pending-approval-operator-entry.mjs');
  return operatorMain(process.env);`;
const another=" if(selectJH168FollowupOperator56(process.env)!=='original')fail('JH_STAGE25_PENDING_OPERATOR_REQUIRED');\n";

test('router change is exactly a reversible bounded opt-in over the original published source',()=>{
 assert.equal(source.split(helper).length,2);
 assert.equal(source.split(routedBody).length,2);
 assert.equal(source.split(another).length,2);
 const reconstructed=source.replace(helper,'').replace(routedBody,originalBody).replace(another,'');
 assert.equal(gitBlob(reconstructed),BASE_BLOB);
 const pending=source.indexOf("if(selectPendingApprovalStartup56(process.env)==='pending-approval')");
 const originalCheck=source.indexOf('assertPublishedHost(hostRoot,sourceRoot)',pending);
 const gated=source.indexOf("if(selectJH168FollowupOperator56(process.env)==='followup')",pending);
 assert.ok(pending>0&&originalCheck>pending&&gated>originalCheck);
 assert.ok(!source.includes('automaticReplayAllowed:true'));
});

test('old JH startup remains exactly unchanged with no new explicit flag',()=>{
 assert.equal(selectJH168FollowupOperator56({}),'original');
 assert.equal(selectJH168FollowupOperator56({JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:''}),'original');
 assert.equal(selectPendingApprovalStartup56({JH_PENDING_APPROVAL_OPERATOR_ENABLE:undefined}),'original');
 assert.equal(selectPendingApprovalStartup56({
  JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1',
  JH_DURABLE_RELEASE:'SERVE_READY_V1',RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'
 }),'pending-approval');
});

test('Stage25 requires original pending operator, correct service and explicit exact flag',()=>{
 const cfg={
  JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1',
  JH_PENDING_APPROVAL_OPERATOR_ENABLE:'EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1',
  JH_DURABLE_RELEASE:'SERVE_READY_V1',RENDER_SERVICE_ID:'srv-db0fjl2d0e5s73be114g'
 };
 assert.equal(selectJH168FollowupOperator56(cfg),'followup');
 assert.equal(selectPendingApprovalStartup56(cfg),'pending-approval');
 for(const changed of [
  {JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE:'enabled'},
  {JH_PENDING_APPROVAL_OPERATOR_ENABLE:undefined},
  {JH_DURABLE_RELEASE:undefined},{RENDER_SERVICE_ID:'another'},
  {CI:'true'},{JH_OWNER_DEFER_LISTEN:'1'}
 ])assert.throws(()=>selectJH168FollowupOperator56({...cfg,...changed}));
});

