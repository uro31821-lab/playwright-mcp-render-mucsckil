/**
 * JH167 V4 — single ORIGINAL Secure56 Gemini host composition (development only).
 *
 * This is an internal dependency adapter, NOT a new MCP route, OAuth client,
 * Android executor, background worker or production registration. All effects
 * use exactOriginalEnvelope from the existing authenticated Secure56 host.
 *
 * State transitions are caller-invoked one at a time: no automatic approval,
 * replay, background sending, or leap from PREPARE to EXECUTE. A phone status
 * label like APPROVED is never the one-shot Android grant contract.
 */
import {FileDurableExecutionStore} from '../deployment/jh-result-verification/file-durable-execution-store.mjs';
import {createV4OriginalGeminiPrepareLedger} from './gemini-v4-original-computer-durable.mjs';
import {createV4OriginalSecure56GeminiPreparePort} from './gemini-v4-original-computer-prepare.mjs';
import {createV4OriginalGeminiPrepareStatusPort} from './gemini-v4-original-computer-prepare-status.mjs';
import {createV4OriginalGeminiPhoneApprovalPort} from './gemini-v4-original-computer-approval.mjs';
import {createV4OriginalGeminiApprovedExecuteGate} from './gemini-v4-original-computer-execute.mjs';

const REQUIRED=[
 'readOriginalOwner','verifyOriginalOwner','readOriginalTask','verifyOriginalTask',
 'readSignedSubmitTarget','verifySignedSubmitTarget','exactOriginalEnvelope',
 'readOriginalJob','verifyOriginalQueuedJob','verifyOriginalCompletedJob',
 'waitOriginalJob','verifyOriginalPreparedJob',
 'verifyOriginalApprovalRequestJob','verifyOriginalPhoneApprovalStatus',
 'originalPhoneGrantContractReady','readOriginalPhoneOneShotGrant',
 'verifyOriginalPhoneOneShotGrant','prepareOriginalApprovedAction',
 'verifyOriginalFreshPreparedJob'
];

/** Only host-local callbacks from ORIGINAL Secure56 are supported. */
export function createV4OriginalGeminiSecure56Composition({
 store,original,sendAttestor,enabled=false,clock=Date.now
}={}){
 if(!(store instanceof FileDurableExecutionStore)||
    original?.backend!=='JH_ANDROID_NATIVE'||
    original?.usesOriginalSecure56!==true||
    REQUIRED.some(k=>typeof original[k]!=='function')||
    typeof sendAttestor?.verify!=='function'||
    typeof clock!=='function')
   throw Error('ORIGINAL_JH_SECURE56_IN_PROCESS_PORTS_REQUIRED');

 // Do not manufacture a second database. One ORIGINAL execution guard
 // persists PREPARE, local approval request and EXECUTE reservations.
 const durable=createV4OriginalGeminiPrepareLedger({store});
 const common={
  enabled:enabled===true,clock,
  readOriginalOwner:original.readOriginalOwner,
  verifyOriginalOwner:original.verifyOriginalOwner,
  readOriginalTask:original.readOriginalTask,
  verifyOriginalTask:original.verifyOriginalTask,
  readOriginalJob:original.readOriginalJob,
  verifyOriginalQueuedJob:original.verifyOriginalQueuedJob,
  verifyOriginalCompletedJob:original.verifyOriginalCompletedJob,
  exactOriginalEnvelope:original.exactOriginalEnvelope
 };
 const prepare=createV4OriginalSecure56GeminiPreparePort({
  enabled:common.enabled,clock,
  readOwner:original.readOriginalOwner,
  verifyOwner:original.verifyOriginalOwner,
  readTask:original.readOriginalTask,
  verifyTask:original.verifyOriginalTask,
  readSignedSubmitTarget:original.readSignedSubmitTarget,
  verifySignedSubmitTarget:original.verifySignedSubmitTarget,
  claimOriginalOperation:durable.claim,
  attachOriginalJob:durable.attachJob,
  exactOriginalEnvelope:original.exactOriginalEnvelope,
  verifyOriginalQueuedJob:original.verifyOriginalQueuedJob
 });
 const prepareStatus=createV4OriginalGeminiPrepareStatusPort({
  ...common,durable
 });
 const approve=createV4OriginalGeminiPhoneApprovalPort({
  ...common,store,
  readOriginalPrepareOperation:durable.lookup,
  verifyOriginalPrepareOperation:durable.verify,
  readOriginalPrepareJob:original.readOriginalJob,
  verifyOriginalPreparedJob:original.verifyOriginalPreparedJob,
  readOriginalPrepareStatus:prepareStatus.status,
  waitOriginalJob:original.waitOriginalJob,
  verifyOriginalPhoneApprovalStatus:original.verifyOriginalPhoneApprovalStatus
 });
 const execute=createV4OriginalGeminiApprovedExecuteGate({
  ...common,store,sendAttestor,
  originalPhoneGrantContractReady:original.originalPhoneGrantContractReady,
  readOriginalPrepareOperation:durable.lookup,
  verifyOriginalPrepareOperation:durable.verify,
  readOriginalPrepareJob:original.readOriginalJob,
  verifyOriginalPrepareJob:original.verifyOriginalPreparedJob,
  readOriginalApprovalRequestJob:original.readOriginalJob,
  verifyOriginalApprovalRequestJob:original.verifyOriginalApprovalRequestJob,
  readOriginalPhoneOneShotGrant:original.readOriginalPhoneOneShotGrant,
  verifyOriginalPhoneOneShotGrant:original.verifyOriginalPhoneOneShotGrant,
  prepareOriginalApprovedAction:original.prepareOriginalApprovedAction,
  verifyOriginalFreshPreparedJob:original.verifyOriginalFreshPreparedJob
 });
 // Each operation is explicit, never a loop or an auto-resume transition.
 return Object.freeze({
  prepareOriginalSubmit:q=>prepare.prepare(q),
  inspectOriginalPrepare:q=>prepareStatus.status(q),
  requestPhoneApproval:q=>approve.request(q),
  inspectPhoneApprovalRequest:q=>approve.checkRequest(q),
  inspectPhoneApproval:q=>approve.pollPhoneApproval(q),
  executeOnlyAfterOriginalGrant:q=>execute.execute(q),
  inspectOriginalExecution:q=>execute.status(q),
  capabilities:()=>Object.freeze({
   enabled:common.enabled,
   engine:'JH_ANDROID_NATIVE',
   oneOriginalSecure56:true,
   oneOriginalDurableLedger:true,
   automaticReplay:false,automaticResume:false,
   autoExecuteAfterPhoneStatus:false,
   phoneApprovalBypassed:false,
   phoneGrantContractRequired:true,
   fullGeminiReplyVerified:false,
   chatGptDeliveryConnected:false,
   productionRegistered:false,
   androidApkBuilt:false,
   physicalPhoneTested:false
  })
 });
}
