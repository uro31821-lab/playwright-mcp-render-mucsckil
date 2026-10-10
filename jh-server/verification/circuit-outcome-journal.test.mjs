import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,statSync,chmodSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {CircuitOutcomeJournal} from '../owner-setup/deployment/circuit-outcome-journal.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const config=dir=>({databasePath:join(dir,'actions.sqlite'),ownerDigest:sha('synthetic-owner'),serverDigest:sha('synthetic-server'),
 verifyAuthenticatedReceipt:({receiptDigest,hostEvidence})=>hostEvidence==='synthetic-authenticated-host-result'&&receiptDigest===sha('synthetic-receipt')});
function run(fn){const dir=mkdtempSync(join(tmpdir(),'jh-restart-guard-'));chmodSync(dir,0o700);try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
const record={deviceDigest:sha('synthetic-device'),intentDigest:sha('synthetic-user-action')};
const extra={deviceDigest:sha('synthetic-device'),intentDigest:sha('another-intent')};
test('journal starts empty and stores only opaque identifiers',()=>run(dir=>{
 const j=new CircuitOutcomeJournal(config(dir));
 assert.equal(j.inspect(record).state,'NEVER_ADMITTED');
 assert.equal(statSync(join(dir,'actions.sqlite')).mode&0o077,0);
 const a=j.admit(record);assert.ok(a.allowed);
 const b=j.inspect(record);assert.equal(b.state,'RESERVED');
 assert.equal(b.attemptDigest.length,64);
 const file=readFileSync(join(dir,'actions.sqlite'));
 assert.equal(file.includes(Buffer.from('synthetic-user-action')),false);
 j.close();
}));
test('a reserved action is blocked before dispatch, including across reopen',()=>run(dir=>{
 let j=new CircuitOutcomeJournal(config(dir));
 const a=j.admit(record);assert.ok(a.allowed);
 assert.equal(j.admit(record).allowed,false);j.close();
 j=new CircuitOutcomeJournal(config(dir));
 assert.equal(j.inspect(record).state,'RESERVED');
 assert.equal(j.admit(record).code,'PRIOR_OUTCOME_NOT_VERIFIED');
 j.close();
}));
test('committed possible delivery is durable after simulated hard process crash',()=>run(dir=>{
 const fileURL=new URL('../owner-setup/deployment/circuit-outcome-journal.mjs',import.meta.url).href;
 const childScript=[
  "import {CircuitOutcomeJournal} from "+JSON.stringify(fileURL)+";",
  "import {createHash} from 'node:crypto';",
  "const sha=x=>createHash('sha256').update(x).digest('hex');",
  "const j=new CircuitOutcomeJournal({databasePath:process.argv[1],ownerDigest:sha('synthetic-owner'),serverDigest:sha('synthetic-server'),verifyAuthenticatedReceipt:()=>false});",
  "const a=j.admit({deviceDigest:sha('synthetic-device'),intentDigest:sha('synthetic-user-action')});",
  "j.markMayHaveDispatched({deviceDigest:sha('synthetic-device'),intentDigest:sha('synthetic-user-action'),attemptDigest:a.attemptDigest});",
  "process.kill(process.pid,'SIGKILL');"
 ].join('\n');
 const x=spawnSync(process.execPath,['--input-type=module','-e',childScript,join(dir,'actions.sqlite')],{timeout:10000,encoding:'utf8'});
 assert.equal(x.signal,'SIGKILL',x.stderr);
 const j=new CircuitOutcomeJournal(config(dir));
 assert.equal(j.inspect(record).state,'DISPATCH_UNCERTAIN');
 assert.equal(j.admit(record).allowed,false);
 assert.ok(j.admit(extra).allowed,'unrelated legitimate command not blocked');
 j.close();
}));
test('a duplicate pre-dispatch mark cannot send the same attempt twice',()=>run(dir=>{
 const j=new CircuitOutcomeJournal(config(dir)),a=j.admit(record);
 assert.equal(j.markMayHaveDispatched({...record,attemptDigest:a.attemptDigest}).committed,true);
 assert.throws(()=>j.markMayHaveDispatched({...record,attemptDigest:a.attemptDigest}),/JOURNAL_DISPATCH_NOT_RESERVED/);
 j.close();
}));
test('unauthenticated or mismatched receipt cannot unblock an uncertain action',()=>run(dir=>{
 const j=new CircuitOutcomeJournal(config(dir)),a=j.admit(record);
 j.markMayHaveDispatched({...record,attemptDigest:a.attemptDigest});
 const b={...record,attemptDigest:a.attemptDigest,receiptDigest:sha('synthetic-receipt')};
 assert.throws(()=>j.recordAuthenticatedReceipt({...b,hostEvidence:'not-authenticated'}),/JOURNAL_RECEIPT_NOT_AUTHENTICATED/);
 assert.throws(()=>j.recordAuthenticatedReceipt({...b,attemptDigest:sha('wrong-attempt'),hostEvidence:'synthetic-authenticated-host-result'}),/JOURNAL_RECEIPT_STATE_INVALID/);
 assert.equal(j.inspect(record).state,'DISPATCH_UNCERTAIN');
 j.close();
}));
test('an authenticated device reply records delivery but never asserts business success',()=>run(dir=>{
 let j=new CircuitOutcomeJournal(config(dir));const a=j.admit(record);
 j.markMayHaveDispatched({...record,attemptDigest:a.attemptDigest});
 const r=j.recordAuthenticatedReceipt({...record,attemptDigest:a.attemptDigest,receiptDigest:sha('synthetic-receipt'),hostEvidence:'synthetic-authenticated-host-result'});
 assert.deepEqual(r,{receiptRecorded:true,businessSuccessVerified:false,automaticActionReplayAllowed:false});
 j.close();
 j=new CircuitOutcomeJournal(config(dir));
 assert.equal(j.inspect(record).state,'DEVICE_RESULT_RECORDED');
 const next=j.admit(record);assert.ok(next.allowed);
 assert.notEqual(next.attemptDigest,a.attemptDigest);
 assert.equal(j.inspect(record).state,'RESERVED');
 j.close();
}));
test('old attempt cannot change next attempt after verified completion',()=>run(dir=>{
 const j=new CircuitOutcomeJournal(config(dir)),a=j.admit(record);
 j.markMayHaveDispatched({...record,attemptDigest:a.attemptDigest});
 j.recordAuthenticatedReceipt({...record,attemptDigest:a.attemptDigest,receiptDigest:sha('synthetic-receipt'),hostEvidence:'synthetic-authenticated-host-result'});
 const newer=j.admit(record);
 j.markMayHaveDispatched({...record,attemptDigest:newer.attemptDigest});
 assert.throws(()=>j.recordAuthenticatedReceipt({...record,attemptDigest:a.attemptDigest,receiptDigest:sha('synthetic-receipt'),hostEvidence:'synthetic-authenticated-host-result'}),/JOURNAL_RECEIPT_STATE_INVALID/);
 assert.equal(j.inspect(record).attemptDigest,newer.attemptDigest);
 j.close();
}));
test('mismatched server or owner binding never reuses persistent records',()=>run(dir=>{
 const j=new CircuitOutcomeJournal(config(dir));j.admit(record);j.close();
 assert.throws(()=>new CircuitOutcomeJournal({...config(dir),ownerDigest:sha('different-owner')}),/JOURNAL_IDENTITY_MISMATCH/);
 assert.throws(()=>new CircuitOutcomeJournal({...config(dir),serverDigest:sha('different-server')}),/JOURNAL_IDENTITY_MISMATCH/);
}));
test('private directory and verifier required; no implicit installation',()=>run(dir=>{
 const c=config(dir);
 assert.throws(()=>new CircuitOutcomeJournal({...c,verifyAuthenticatedReceipt:undefined}),/JOURNAL_VERIFIER_REQUIRED/);
 chmodSync(dir,0o755);
 assert.throws(()=>new CircuitOutcomeJournal(c),/JOURNAL_PRIVATE_DIRECTORY_REQUIRED/);
 chmodSync(dir,0o700);
}));
test('invalid opaque identifiers rejected',()=>run(dir=>{
 const j=new CircuitOutcomeJournal(config(dir));
 assert.throws(()=>j.admit({deviceDigest:'plain-name',intentDigest:record.intentDigest}),/JOURNAL_DIGEST_INVALID/);
 const a=j.admit(record);
 assert.throws(()=>j.markMayHaveDispatched({...record,attemptDigest:a.attemptDigest.slice(1)}),/JOURNAL_DIGEST_INVALID/);
 j.close();
}));
