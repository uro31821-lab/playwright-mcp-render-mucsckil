/** Restart proof for opt-in HMAC-only journal. No live device, no service changes. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,chmodSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DurableManualCircuitFence} from '../owner-setup/deployment/durable-manual-circuit-fence.mjs';
const key=Buffer.alloc(32,23),namespace=createHash('sha256').update('synthetic-owner-namespace').digest('hex');
const verifyAuthenticatedCompletion=({hostEvidence})=>hostEvidence==='SYNTHETIC_HOST_ACCEPTED_SIGNATURE';
const action={deviceId:'synthetic-device-name',type:'agent_step',payload:{action:'set_text',text:'sensitive-fixture-secret',value:'do_not_store_plaintext'}};
const equal={deviceId:'synthetic-device-name',type:'agent_step',payload:{value:'do_not_store_plaintext',text:'sensitive-fixture-secret',action:'set_text'}};
const different={deviceId:'another-synthetic-device',type:'agent_step',payload:action.payload};
const digest=x=>createHash('sha256').update(x).digest('hex');
function childPhase(phase,file,recordId){
 const options={file,key,namespace,verifyAuthenticatedCompletion},j=new DurableManualCircuitFence({...options,mode:phase==='A'?'EXPLICIT_ONE_TIME':'read'});
 try{
  if(phase==='A'){
   const a=j.reserveDispatch(action);assert.equal(a.allowed,true);
   process.stdout.write(JSON.stringify({recordId:a.recordId,counts:j.counts()}));return;
  }
  if(phase!=='D'){
   assert.equal(j.inspect(equal).blocked,true);
   assert.equal(j.reserveDispatch(equal).allowed,false);
  }
  assert.equal(j.inspect(different).blocked,false);
  if(phase==='B'){process.stdout.write(JSON.stringify({blocked:true,counts:j.counts()}));return;}
  if(phase==='C'){
   const p=j.recordAuthenticatedDeviceResult({recordId,resultDigest:digest('authenticated_result'),hostEvidence:'SYNTHETIC_HOST_ACCEPTED_SIGNATURE'});
   assert.equal(p.recorded,true);assert.equal(p.taskSuccessVerified,false);
   process.stdout.write(JSON.stringify({receipt:p,counts:j.counts()}));return;
  }
  if(phase==='D'){
   assert.equal(j.inspect(equal).blocked,false);
   const newer=j.reserveDispatch(equal);assert.equal(newer.allowed,true);
   process.stdout.write(JSON.stringify({recordId:newer.recordId,counts:j.counts()}));return;
  }
  throw Error('unexpected phase');
 }finally{j.close()}
}
if(['A','B','C','D'].includes(process.argv[2])){
 try{childPhase(process.argv[2],process.argv[3],process.argv[4])}
 catch(e){console.error(e);process.exitCode=1}
}else{
 const tests=[];
 const check=(name,b)=>{assert.ok(b,name);tests.push(name)};
 const home=mkdtempSync(join(tmpdir(),'jh-circuit-durable-'));
 const secretDir=join(home,'private');mkdirSync(secretDir,{mode:0o700});
 const file=join(secretDir,'manual-fence.sqlite');
 const phase=(name,recordId)=>{
  const p=spawnSync(process.execPath,[fileURLToPath(import.meta.url),name,file,recordId||''],{encoding:'utf8',timeout:12000});
  assert.equal(p.status,0,p.stderr);
  return JSON.parse(p.stdout);
 };
 try{
  const before=phase('A');
  check('explicit initialization records one unknown dispatch',before.counts.uncertain===1&&before.counts.received===0);
  const seen=phase('B',before.recordId);
  check('a different process detects pre-crash uncertain action',seen.blocked===true&&seen.counts.uncertain===1);
  const bits=readFileSync(file);
  check('no original payload or deviceId is stored',!bits.includes('sensitive-fixture-secret')&&!bits.includes('do_not_store_plaintext')&&!bits.includes('synthetic-device-name'));
  check('correct owner namespace is required',(()=>{
   try{new DurableManualCircuitFence({file,key,namespace:digest('wrong-namespace'),verifyAuthenticatedCompletion});return false}
   catch(e){return e.code==='JOURNAL_KEY_OR_NAMESPACE_MISMATCH'}})());
  check('incorrect encryption/HMAC secret is rejected',(()=>{
   try{new DurableManualCircuitFence({file,key:Buffer.alloc(32,24),namespace,verifyAuthenticatedCompletion});return false}
   catch(e){return e.code==='JOURNAL_KEY_OR_NAMESPACE_MISMATCH'}})());
  const x=new DurableManualCircuitFence({file,key,namespace,verifyAuthenticatedCompletion});
  try{
   check('record is scoped to exact device and action',x.inspect(action).blocked&&!x.inspect(different).blocked);
   check('canonical ordering cannot bypass duplicate fence',x.inspect(equal).blocked);
   check('reinitialization cannot erase evidence',(()=>{
    try{new DurableManualCircuitFence({file,key,namespace,verifyAuthenticatedCompletion,mode:'EXPLICIT_ONE_TIME'});return false}
    catch(e){return e.code==='JOURNAL_EXISTS_NO_RESET'}})());
   check('invalid receipt is rejected',(()=>{
    try{x.recordAuthenticatedDeviceResult({recordId:before.recordId,resultDigest:'wrong'});return false}
    catch(e){return e.code==='JOURNAL_RECEIPT_INVALID'}})());
  }finally{x.close()}
  const forged=new DurableManualCircuitFence({file,key,namespace,verifyAuthenticatedCompletion});
  try{
   check('untrusted receipt cannot clear a queued action',(()=>{
    try{forged.recordAuthenticatedDeviceResult({recordId:before.recordId,resultDigest:digest('authenticated_result'),hostEvidence:'FORGED'});return false}
    catch(e){return e.code==='JOURNAL_RECEIPT_NOT_AUTHENTICATED'}})());
   check('untrusted receipt preserves unknown state',forged.inspect(equal).blocked);
  }finally{forged.close()}
  const acknowledged=phase('C',before.recordId);
  check('authenticated result can be journaled without claiming business completion',acknowledged.receipt.recorded&&acknowledged.receipt.taskSuccessVerified===false&&acknowledged.counts.uncertain===0);
  const updated=phase('D');
  check('future explicit command possible only after prior outcome receipt',updated.recordId!==before.recordId&&updated.counts.uncertain===1);
  const y=new DurableManualCircuitFence({file,key,namespace,verifyAuthenticatedCompletion});
  try{
   check('crash after second dispatch still remains blocked',y.inspect(equal).blocked);
   const same=y.recordAuthenticatedDeviceResult({recordId:before.recordId,resultDigest:digest('authenticated_result'),hostEvidence:'SYNTHETIC_HOST_ACCEPTED_SIGNATURE'});
   check('idempotent receipt returns recorded false',same.recorded===false);
   check('conflicting receipt is rejected',(()=>{
    try{y.recordAuthenticatedDeviceResult({recordId:before.recordId,resultDigest:digest('conflicting'),hostEvidence:'SYNTHETIC_HOST_ACCEPTED_SIGNATURE'});return false}
    catch(e){return e.code==='JOURNAL_RESULT_CONFLICT'}})());
   check('journal contains only bounded private metadata',y.counts().uncertain===1&&y.counts().received===1);
  }finally{y.close()}
  console.log('JH_DURABLE_MANUAL_FENCE_TEST_PASS '+JSON.stringify({passed:tests.length,failed:0,checks:tests,processRestarts:3,productionDeployments:0,phoneActions:0,ownerMountModified:false}));
 }catch(e){console.error('JH_DURABLE_MANUAL_FENCE_TEST_FAIL',e);process.exitCode=1}
 finally{rmSync(home,{recursive:true,force:true})}
}
