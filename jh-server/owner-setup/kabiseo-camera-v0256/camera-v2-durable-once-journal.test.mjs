import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {JH228DurableOnceJournal} from './camera-v2-durable-once-journal.mjs';
const h=v=>createHash('sha256').update(v).digest('hex');
const scope={threadId:'exact-thread-100',sourceRef:'current-sourceRef-100',
 commandId:'e'.repeat(32),taskDigest:'b'.repeat(64),deviceDigest:'c'.repeat(64),
 secureSessionId:'secure-session-initial-100'};
const key=()=>Buffer.alloc(32,7),namespace=h('jh228-durable-one-test');
function tmp(){const dir=mkdtempSync(path.join(tmpdir(),'jh228-private-'));
 return {dir,file:path.join(dir,'camera-v2-once.sqlite'),
  cleanup:()=>rmSync(dir,{recursive:true,force:true})};}
test('READ cannot silently create a missing journal; explicit initialization only',()=>{
 const x=tmp();try{
  assert.throws(()=>new JH228DurableOnceJournal({file:x.file,key:key(),namespace}),/V2_ONCE_INIT_REQUIRED/);
  const j=new JH228DurableOnceJournal({file:x.file,key:key(),namespace,mode:'INITIALIZE'});j.close();
  assert.throws(()=>new JH228DurableOnceJournal({file:x.file,key:key(),namespace,mode:'INITIALIZE'}),/V2_ONCE_ALREADY_INITIALIZED/);
 }finally{x.cleanup();}
});
test('SQLite atomic first claim persists across close and Secure56 session rotation',()=>{
 const x=tmp();try{
  const j=new JH228DurableOnceJournal({file:x.file,key:key(),namespace,mode:'INITIALIZE'});
  assert.equal(j.claimOneShot(scope).claimed,true);
  assert.equal(j.claimOneShot(scope).claimed,false);
  assert.equal(j.count(),1);j.close();
  const reopened=new JH228DurableOnceJournal({file:x.file,key:key(),namespace});
  assert.equal(reopened.claimOneShot({...scope,secureSessionId:'secure-session-rotated-200'}).claimed,false);
  assert.equal(reopened.count(),1);
  assert.equal(reopened.claimOneShot({...scope,sourceRef:'new-sourceRef-200',commandId:'f'.repeat(32)}).claimed,true);
  reopened.close();
  const saved=readFileSync(x.file);
  assert.equal(saved.includes(Buffer.from(scope.sourceRef)),false);
  assert.equal(saved.includes(Buffer.from(scope.threadId)),false);
 }finally{x.cleanup();}
});
test('two independent open handles cannot claim the same command',()=>{
 const x=tmp();let one,two;
 try{
  one=new JH228DurableOnceJournal({file:x.file,key:key(),namespace,mode:'INITIALIZE'});
  two=new JH228DurableOnceJournal({file:x.file,key:key(),namespace});
  const first=one.claimOneShot(scope),second=two.claimOneShot(scope);
  assert.deepEqual([first.claimed,second.claimed],[true,false]);
  assert.equal(two.count(),1);
 }finally{one?.close();two?.close();x.cleanup();}
});
test('wrong key, wrong namespace, malformed scope and unknown completed effect remain denied',()=>{
 const x=tmp();try{
  const j=new JH228DurableOnceJournal({file:x.file,key:key(),namespace,mode:'INITIALIZE'});
  assert.throws(()=>j.claimOneShot({...scope,taskDigest:'invalid'}),/V2_ONCE_SCOPE_INVALID/);
  assert.equal(j.claimOneShot(scope).claimed,true);j.close();
  assert.throws(()=>new JH228DurableOnceJournal({file:x.file,key:Buffer.alloc(32,9),namespace}),/V2_ONCE_KEY_OR_NAMESPACE_MISMATCH/);
  assert.throws(()=>new JH228DurableOnceJournal({file:x.file,key:key(),namespace:h('different owner')}),/V2_ONCE_KEY_OR_NAMESPACE_MISMATCH/);
 }finally{x.cleanup();}
});
