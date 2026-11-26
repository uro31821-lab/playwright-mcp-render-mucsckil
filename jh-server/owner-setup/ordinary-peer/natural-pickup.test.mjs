import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openPeerService} from './peer-service.mjs';
import {pairEvent} from './synthetic-pair.mjs';

function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'natural-pickup-'));
  const config={stateDir:dir,accountDigest:'local-owner',serverOrigin:'https://example.invalid'};
  const event='파란연필 전시 오전반';
  const records=[{event,revision:1,pickup:'모래 4번 창구'},
    {event:'파란연필 전시 오후반',revision:1,pickup:'솔 8번 창구'}];
  const lines=[];
  const peer=openPeerService({config,noticeJson:JSON.stringify({schema:'jh.preparation-notices.v1',notices:records}),
    statisticsJson:JSON.stringify([{event,teams:[{label:'가팀',confirmed:8},{label:'나팀',confirmed:7}]}]),
    recordPilot:l=>lines.push(l),recordTrial(){}});
  const session=()=>({owner:config.accountDigest,aud:config.serverOrigin,client:'isolated-test'});
  t.after(()=>{peer.close();rmSync(dir,{force:true,recursive:true});});
  async function ask(actor,question) {
    const reply=await peer.ask({requester:'guide',actor,purpose:'첫 방문 안내',question},session);
    assert.ok(!reply.isError);return reply;
  }
  const source=JSON.parse(lines.find(l=>l.startsWith('JH_PEER_PILOT66_SOURCE ')).split(' ').slice(1).join(' '));
  return {ask,event,source,lines};
}

test('guide can get the regular notice desk with a natural material pickup question',async t=>{
  const {ask,event}=fixture(t);
  for(const title of [event,'‘'+event+'’','“'+event+'”']){
    for(const q of ['자료 받는 창구는 어디예요?','키트를 받는 창구를 알려 주세요.','자료 받는 창구를 한 줄로 알려 주세요.']){
      const response=await ask('preparation',title+' '+q);
      assert.equal(response.structuredContent.availability,'available');
      assert.equal(response.content[0].text,'모래 4번 창구');
      assert.ok(response.structuredContent.replyRef);
    }
  }
});

test('a typographic quoted event is the same event for confirmed registration totals',async t=>{
  const {ask,event}=fixture(t);
  for(const title of [event,'‘'+event+'’','“'+event+'”']){
    const response=await ask('statistics',title+'의 확정 등록 인원은 몇 명인가요?');
    assert.equal(response.structuredContent.availability,'available');
    assert.equal(response.content[0].text,'확정 등록 인원은 총 15명입니다.');
  }
});

test('original synthetic source can answer a natural pickup location request without a tracing suffix',async t=>{
  const {ask,source,lines}=fixture(t);
  const q='설비서, 가상 행사 ‘'+pairEvent+'’에 처음 가는 사람에게 자료 받는 창구를 안내하는 한 문장을 써 줘.';
  for (const question of [q,pairEvent+' 자료 받는 창구를 한 줄로 알려 주세요.']){
    const response=await ask('preparation',question);
    assert.equal(response.structuredContent.availability,'available');
    assert.equal(response.content[0].text,source.pickup);
    const receipt=lines.filter(l=>l.startsWith('JH_PEER_PILOT66_REPLY ')).at(-1);
    assert.ok(receipt);assert.equal(JSON.parse(receipt.slice(receipt.indexOf('{'))).replyRef,response.structuredContent.replyRef);
  }
});

test('another branch, unrelated help desk, cancellation or mixed titles cannot supply a location or total',async t=>{
  const {ask,event,source}=fixture(t);
  const cases=[
    ['preparation', '‘파란연필 전시’ 자료 받는 창구를 알려 주세요.'],
    ['preparation', '‘'+event+'별관’ 자료 받는 창구는 어디예요?'],
    ['preparation', '‘'+event+'’ 환불금을 받는 창구는 어디예요?'],
    ['preparation', '‘'+event+'’ 자료 받는 창구는 필요 없어요.'],
    ['preparation', '‘'+pairEvent+'’ 응급상담을 받는 창구를 알려 주세요.'],
    ['statistics', '‘'+event+'별관’ 확정 등록 인원은 몇 명인가요?'],
    ['statistics', '‘'+event+'’의 취소 인원은 몇 명인가요?'],
    ['statistics', '‘'+event+'’과 ‘'+pairEvent+'’의 확정 등록 인원은 몇 명인가요?']];
  for(const [actor,q] of cases){
    const response=await ask(actor,q);
    assert.equal(response.structuredContent.availability,'unavailable',q);
    assert.ok(!response.structuredContent.text.includes(source.pickup),q);
    assert.ok(!/모래 4번|솔 8번|15명/.test(response.structuredContent.text),q);
  }
});
