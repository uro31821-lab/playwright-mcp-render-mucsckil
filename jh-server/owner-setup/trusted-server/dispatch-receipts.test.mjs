import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {EventEmitter} from 'node:events';
import {installReceiptSchema,pendingReceiptCount,insertDeviceReceipt,digest} from './dispatch-receipts.mjs';
import {installCompletionObserver} from './completion-observer.mjs';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'jh-receipt-')),db=new DatabaseSync(join(dir,'r.db'));
 db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE trusts(id TEXT PRIMARY KEY,owner TEXT,device TEXT,server TEXT,catalog TEXT,revoked INTEGER,expires INTEGER);
 CREATE TABLE trusted_dispatches(job_digest TEXT PRIMARY KEY,trust_id TEXT REFERENCES trusts(id),created INTEGER);
 CREATE TABLE redemptions(trust_id TEXT,max_session_expires INTEGER);`);installReceiptSchema(db);
 const tid='t'.repeat(32),now=1800000000000,sel={ownerDigest:digest('o'),deviceDigest:digest('d'),serverDigest:digest('s'),catalogDigest:digest('c'),cutoffMs:now-2000000,expectedCount:56,now};
 db.prepare('INSERT INTO trusts VALUES(?,?,?,?,?,NULL,?)').run(tid,sel.ownerDigest,sel.deviceDigest,sel.serverDigest,sel.catalogDigest,now+86400000);
 for(let i=0;i<56;i++)db.prepare('INSERT INTO trusted_dispatches VALUES(?,?,?)').run(digest(i),tid,now-3600000);
 return{db,tid,now,sel,close(){db.close();rmSync(dir,{recursive:true,force:true})}};
}
function check(fn){const f=fixture();try{fn(f)}finally{f.close()}}
test('schema installation leaves 56 original rows pending',()=>check(f=>{assert.equal(pendingReceiptCount(f.db,f.tid),56);installReceiptSchema(f.db);assert.equal(pendingReceiptCount(f.db,f.tid),56)}));
test('device result receipt is not task success and preserves original',()=>check(f=>{const r=insertDeviceReceipt(f.db,f.tid,digest(0),digest('failure result'),f.now);assert.equal(r.taskSuccessVerified,false);assert.equal(pendingReceiptCount(f.db,f.tid),55);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM trusted_dispatches').get().n,56)}));
test('same result is idempotent; altered result cannot replace evidence',()=>check(f=>{insertDeviceReceipt(f.db,f.tid,digest(0),digest('r'),f.now);assert.equal(insertDeviceReceipt(f.db,f.tid,digest(0),digest('r'),f.now).recorded,false);assert.throws(()=>insertDeviceReceipt(f.db,f.tid,digest(0),digest('x'),f.now),/CONFLICT/)}));
test('result receipt is trust-bound',()=>check(f=>assert.throws(()=>insertDeviceReceipt(f.db,'x'.repeat(32),digest(0),digest('r'),f.now),/SCOPE/)));
test('untracked reads do not create dispatch records',()=>check(f=>{assert.equal(insertDeviceReceipt(f.db,f.tid,digest('read'),digest('r'),f.now).reason,'NOT_TRACKED');assert.equal(pendingReceiptCount(f.db,f.tid),56)}));
test('observer ignores unauthenticated, noncompletion and interrupted responses',()=>{const s=new EventEmitter();let count=0;const o=installCompletionObserver(s,{recordAuthenticatedCompletion:()=>count++});for(const [url,status,ev]of [['/job/job_1/complete',401,'finish'],['/device/poll',200,'finish'],['/job/job_2/complete',200,'close']]){const r=new EventEmitter();r.statusCode=status;s.emit('request',{method:'POST',url},r);r.emit(ev);}assert.equal(count,0);o.close()});
test('observer records only after successful existing response',()=>{const s=new EventEmitter(),calls=[];const o=installCompletionObserver(s,{recordAuthenticatedCompletion:x=>calls.push(x)});const r=new EventEmitter();r.statusCode=200;s.emit('request',{method:'POST',url:'/job/job_1/complete'},r);assert.equal(calls.length,0);r.emit('finish');r.emit('close');assert.deepEqual(calls,['job_1']);o.close()});
test('receipt failure does not modify HTTP response or disconnect service',()=>{const s=new EventEmitter(),errors=[];const o=installCompletionObserver(s,{recordAuthenticatedCompletion:()=>{throw Error('db failure')}},x=>errors.push(x));const r=new EventEmitter();r.statusCode=200;s.emit('request',{method:'POST',url:'/job/job_1/complete'},r);assert.doesNotThrow(()=>r.emit('finish'));assert.equal(r.statusCode,200);assert.equal(errors.length,1);assert.throws(()=>installCompletionObserver(s,{}));o.close()});

test('old 56 remain unresolved after recording a newer delivery',()=>check(f=>{f.db.prepare('INSERT INTO trusted_dispatches VALUES(?,?,?)').run(digest('new job'),f.tid,f.now-1);insertDeviceReceipt(f.db,f.tid,digest('new job'),digest('new result'),f.now);assert.equal(pendingReceiptCount(f.db,f.tid),56);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM trusted_dispatches').get().n,57)}));
test('receipt evidence cannot be changed or removed',()=>check(f=>{insertDeviceReceipt(f.db,f.tid,digest(0),digest('r'),f.now);assert.throws(()=>f.db.exec('DELETE FROM trusted_dispatch_receipts'),/IMMUTABLE/);assert.throws(()=>f.db.exec('UPDATE trusted_dispatch_receipts SET recorded=1'),/IMMUTABLE/)}));
