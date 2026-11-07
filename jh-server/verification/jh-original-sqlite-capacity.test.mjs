/** Regression against ORIGINAL fence using private scratch DBs only.
 * Synthetic receipt verifier here is test-local; it grants no phone authority.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DurableManualCircuitFence} from '../owner-setup/deployment/durable-manual-circuit-fence.mjs';
import {inspectOriginalJournalReadOnly} from './jh-original-sqlite-readonly-status.mjs';

function scratchJournal(fn){
  const dir=mkdtempSync(join(tmpdir(),'jh-owner-limit-test-'));
  const file=join(dir,'manual-circuit.sqlite');
  const fence=new DurableManualCircuitFence({
    file,key:Buffer.alloc(32,0x4a),namespace:'a'.repeat(64),
    mode:'EXPLICIT_ONE_TIME',
    verifyAuthenticatedCompletion:({hostEvidence})=>hostEvidence?.syntheticTestOnly===true
  });
  try{return fn(fence,file);}finally{fence.close();rmSync(dir,{recursive:true,force:true});}
}
const action=(key)=>({deviceId:'synthetic-device',type:'open_url',payload:{syntheticId:key}});
const digest=(id)=>createHash('sha256').update(id).digest('hex');

test('29 historical UNKNOWN + 466 RECEIVED do not exhaust original global capacity',()=>{
  scratchJournal((fence,file)=>{
    for(let i=0;i<466;i++){
      const reserved=fence.reserveDispatch(action('received-'+i));
      assert.equal(reserved.allowed,true);
      assert.equal(fence.recordAuthenticatedDeviceResult({
        recordId:reserved.recordId,resultDigest:digest('result-'+i),
        hostEvidence:{syntheticTestOnly:true}
      }).recorded,true);
    }
    for(let i=0;i<29;i++)assert.equal(fence.reserveDispatch(action('unknown-'+i)).allowed,true);
    assert.deepEqual(fence.counts(),{uncertain:29,received:466,automaticRetryAllowed:false});
    const before=inspectOriginalJournalReadOnly(file);
    assert.deepEqual([before.uncertain,before.received,before.total],[29,466,495]);
    assert.equal(before.capacity.uncertainCapReached,false);
    assert.equal(before.capacity.rowsCapReached,false);
    assert.equal(before.modifiedOriginalJournal,false);
    assert.equal(before.backupAndRollbackVerified,false);
    assert.equal(fence.inspect(action('unknown-3')).blocked,true);
    const replay=fence.reserveDispatch(action('unknown-3'));
    assert.equal(replay.allowed,false);
    assert.equal(replay.code,'PREVIOUS_OUTCOME_UNKNOWN_RECONCILE_REQUIRED');
    const independent=fence.reserveDispatch(action('new-unrelated'));
    assert.equal(independent.allowed,true);
    assert.deepEqual([fence.counts().uncertain,fence.counts().received],[30,466]);
  });
});

test('512 UNKNOWN capacity remains fail-closed without deleting old evidence',()=>{
  scratchJournal((fence,file)=>{
    for(let i=0;i<512;i++)assert.equal(fence.reserveDispatch(action('pending-'+i)).allowed,true);
    assert.throws(()=>fence.reserveDispatch(action('additional-independent')),{code:'JOURNAL_CAPACITY_REVIEW_REQUIRED'});
    assert.equal(fence.counts().uncertain,512);
    assert.equal(fence.reserveDispatch(action('pending-1')).code,'PREVIOUS_OUTCOME_UNKNOWN_RECONCILE_REQUIRED');
    const report=inspectOriginalJournalReadOnly(file);
    assert.equal(report.capacity.uncertainCapReached,true);
    assert.equal(report.uncertain,512);
    assert.equal(report.received,0);
  });
});
