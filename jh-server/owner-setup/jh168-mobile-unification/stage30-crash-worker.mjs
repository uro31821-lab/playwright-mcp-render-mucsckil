/**
 * Synthetic disposable SQLite crash tests ONLY. Executes no device action
 * or HTTP request. The exit codes intentionally leave DB transactions open.
 */
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createStage30AtomicReceiptWriter}
 from './stage30-atomic-receipt-writer.mjs';

const [file,phase]=process.argv.slice(2);
const namespace='d'.repeat(64),key=Buffer.alloc(32,0x29);
const t0=1793508400000;
const hash=x=>createHash('sha256').update(x).digest('hex');
const command='Open Chrome overflow menu once in RIGHT work window';
const job={
 id:'job_301',type:'split_screen_session_followup',
 mcpToolName:'life_android_execute_computer_action',
 secureRequestedEffect:'REVERSIBLE_WRITE',action:'CLICK',
 targetDeviceId:'synthetic-phone',targetDeviceDigest:'b'.repeat(64),
 secureSessionId:'secure56_fixture_session',commandId:'1'.repeat(32),
 taskDigest:'c'.repeat(64),requestId:'2'.repeat(32),
 contextId:'ssc_'+'3'.repeat(32),targetItemRef:'item_'+'4'.repeat(16),
 expiresAtMs:t0+60000,status:'queued'
};
const identityPayload={contextId:job.contextId,requestId:job.requestId,
 action:'CLICK',targetItemRef:job.targetItemRef,commandDigest:hash(command)};
const result={ok:true,action:'CLICK',resultVerified:true,
 verificationScope:'UI_TRANSITION_ONLY',actionReplayed:false};
const candidatePath=resolve(import.meta.dirname,'../deployment/stage30-durable-manual-circuit-fence-candidate.mjs');
const {DurableManualCircuitFence}=await import(pathToFileURL(candidatePath).href);
const writer=createStage30AtomicReceiptWriter({file,key,namespace});
const journal=new DurableManualCircuitFence({file,key,namespace,clock:()=>t0,mode:'read',
 verifyAuthenticatedCompletion:()=>true,
 stage30ReceiptWriter:input=>{
  if(phase==='after_original_update')process.exit(81);
  writer.append(input);
  if(phase==='after_stage30_insert')process.exit(82);
 }});
const receipt=journal.reserveDispatch({deviceId:job.targetDeviceId,type:job.type,
 payload:identityPayload});
if(!receipt.allowed)throw Error('SYNTHETIC_DISPATCH_NOT_RESERVED');
job.status='in_progress';
journal.recordAuthenticatedDeviceResult({recordId:receipt.recordId,
 resultDigest:hash(JSON.stringify([job.id,job.secureSessionId,result])),
 hostEvidence:{},stage30Original:{job,result,identityPayload}});
if(phase==='after_commit')process.exit(83);
throw Error('STAGE30_UNEXPECTED_TEST_PHASE');
