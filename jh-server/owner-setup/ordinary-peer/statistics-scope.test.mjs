import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {openPeerService} from './peer-service.mjs';
import {unknownCount} from './registration-statistics.mjs';

const owner='statistics-scope-fixture';
const unrelated={requester:'book',actor:'statistics',purpose:'제공된 연대표 비교',
  question:'가상 소설에서 유학 기간이 1912~1917년과 1917~1922년일 때 겹치는 연도는 언제인가요?',
  retryKey:'book-statistics-era-79'};
const hash=s=>createHash('sha256').update(s).digest('hex');
function fixture(t){
  const stateDir=mkdtempSync(join(tmpdir(),'jh-stats-scope-'));
  const config={stateDir,accountDigest:owner,serverOrigin:'https://example.invalid'};
  const peer=openPeerService({config,noticeJson:JSON.stringify({event:'갈색 모임',pickup:'합성 자료대'}),
    statisticsJson:JSON.stringify([{event:'갈색 모임',teams:[{label:'해팀',confirmed:3},{label:'달팀',confirmed:8}]}]),recordPilot(){}});
  t.after(()=>{peer.close();rmSync(stateDir,{recursive:true,force:true});});
  const session=()=>({owner,aud:config.serverOrigin,client:'local-test'});
  return {peer,config,session,ask:a=>peer.ask(a,session),accept:a=>peer.accept(a,session)};
}

test('an unrelated two-period question cannot produce a registration answer or receipt before host work',async t=>{
  const f=fixture(t);
  const pending=(await f.ask(unrelated)).structuredContent;
  assert.equal(pending.status,'awaiting_role_work');
  assert.equal(pending.actor,'statistics');
  assert.equal(pending.replyRef,undefined);
  assert.equal(pending.text,undefined);
  assert.deepEqual((await f.ask(unrelated)).structuredContent,pending);
  const {requestRef,returnToken,actor,requester}=pending;
  const reply=(await f.accept({requestRef,returnToken,actor,requester,basis:'conversation_material',text:'공통으로 들어가는 연도는 1917년 한 해입니다.'})).structuredContent;
  assert.equal(reply.origin,'host_composed');
  assert.equal(reply.basis,'conversation_material');
  assert.equal(reply.availability,'available');
  assert.ok(reply.replyRef);
  assert.deepEqual((await f.ask(unrelated)).structuredContent,reply);
  assert.ok((await f.ask({...unrelated,question:'갈색 모임의 확정 등록 인원은 몇 명인가요?'})).isError);
});

test('known, unknown and restricted registration questions retain the existing aggregate semantics',async t=>{
  const f=fixture(t);
  const ask=async question=>(await f.ask({requester:'preparation',actor:'statistics',purpose:'행사 준비',question})).structuredContent;
  const known=await ask('갈색 모임 확정 등록 인원은 몇 명인가요?');
  assert.equal(known.text,'확정 등록 인원은 총 11명입니다.');
  assert.equal(known.operation,'confirmed_registration_total');assert.equal(known.availability,'available');
  for(const q of ['미지 행사 확정 신청자 수가 몇 명인가요?','갈색 모임의 해팀 등록 인원은 몇 명인가요?','갈색 모임의 취소 인원은 몇 명인가요?']){
    const withheld=await ask(q);assert.equal(withheld.text,unknownCount);assert.equal(withheld.availability,'unavailable');
  }
});

test('new off-topic call without a lead, or with typed data for a different actor, does not yield an invented peer answer',async t=>{
  const f=fixture(t);
  for(const a of [{...unrelated,requester:undefined},{...unrelated,workInput:{offers:[{name:'A',price:2,quantity:1}]}}]){
    const result=await f.ask(a);assert.equal(result.isError,true);assert.equal(result.structuredContent?.replyRef,undefined);
  }
});

test('an already recorded legacy unavailable return is replayed with its original receipt and preserves question binding',async t=>{
  const f=fixture(t);
  const db=new DatabaseSync(join(f.config.stateDir,'ordinary-peer.sqlite'));
  const source=hash(JSON.stringify([hash(JSON.stringify(null)),unrelated.requester]));
  db.prepare('INSERT INTO peer_requests VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(owner,hash(unrelated.retryKey),'past-request','statistics',unrelated.question,unrelated.purpose,source,'past-receipt',unknownCount,new Date().toISOString(),new Date().toISOString());
  db.close();
  const old=(await f.ask(unrelated)).structuredContent;assert.equal(old.replyRef,'past-receipt');assert.equal(old.text,unknownCount);
  assert.equal((await f.ask({...unrelated,question:'서기 17년 기록의 연도는 무엇인가요?'})).isError,true);
});
