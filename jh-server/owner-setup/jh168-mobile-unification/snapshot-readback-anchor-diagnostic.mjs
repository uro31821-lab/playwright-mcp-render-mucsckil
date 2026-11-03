import path from 'node:path';
import {readFileSync} from 'node:fs';
import {buildPendingApprovalOperatorEntrypoint56} from '../server-integration/pending-approval-operator-entry.mjs';
import {applyJH168SplitFollowupReceiptPatch} from './split-followup-receipt-patch.mjs';
import {applyStage26CompletionAckPatch56} from './stage26-completion-delivery-patch.mjs';
import {applyComputerExecutionReceiptPatch} from './computer-execution-receipt-patch.mjs';

const root=path.resolve(import.meta.dirname,'..');
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
  JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
  JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'};
process.env.CI='true';
process.env.NODE_ENV='test';
process.env.JH_OWNER_DEFER_LISTEN='1';
process.env.JH_MOBILE_WEB_13_MODE=env.JH_MOBILE_WEB_13_MODE;
for(const key of ['RENDER_SERVICE_ID','JH_DURABLE_RELEASE','JH_PENDING_APPROVAL_OPERATOR_ENABLE','JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE']) delete process.env[key];

const base=await buildPendingApprovalOperatorEntrypoint56(root,env);
const original=readFileSync(base.runtimeFile,'utf8');
const current=applyComputerExecutionReceiptPatch(
  applyStage26CompletionAckPatch56(
    applyJH168SplitFollowupReceiptPatch(original)));
for(const needle of ['registerOAuthTool("life_android_snapshot"','registerOAuthTool("life_job_status"']){
  const i=current.indexOf(needle);
  console.log('ANCHOR_INDEX',needle,i);
  console.log(current.slice(Math.max(0,i-300),Math.min(current.length,i+1200)));
}
