import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewNotice} from './notice-review.mjs';

const noticeId = '흰나비 오후반 낭독회';
const original = {noticeId,ref:'원안-서른',text:'문서번호: 원안-서른\n대상: 진행자\n제출기한: 11월 28일 오후 4시\n제출처: 2층 안내대'};
const amendment = {noticeId,ref:'정정-하나',corrects:original.ref,mode:'amend',text:'제출기한: 11월 30일 오전 10시'};
const later = {noticeId,ref:'정정-둘',corrects:amendment.ref,mode:'amend',text:'제출처: 초록 창구'};
const foreign = {noticeId:'흰나비 오전반 낭독회',ref:'다른 원안',text:'대상: 오전반\n제출기한: 1월 1일\n제출처: 동쪽 사무실'};
const read = (...documents) => reviewNotice({noticeId,documents});
const assertUnresolved = result => {
  assert.equal(result.availability,'unavailable');
  assert.equal(result.operation,'notice_current_terms');
  assert.doesNotMatch(result.text,/11월 28일|2층 안내대|1월 1일|동쪽 사무실/u);
};
function permutations(values) {
  if (!values.length) return [[]];
  return values.flatMap((v,i) => permutations(values.filter((_,j)=>j!==i)).map(rest=>[v,...rest]));
}

test('source links set precedence even when all 24 document orders differ', () => {
  const expected='제공된 「흰나비 오후반 낭독회」 안내 기준입니다. 대상 “진행자”〔원안-서른〕, 제출기한 “11월 30일 오전 10시”〔정정-하나〕, 제출처 “초록 창구”〔정정-둘〕.';
  for (const docs of permutations([original,amendment,later,foreign])) {
    assert.deepEqual(read(...docs),{operation:'notice_current_terms',availability:'available',text:expected});
  }
});

test('a replacement drops every term it does not repeat; a later amendment can fill it', () => {
  const allNew={...amendment,mode:'replace',text:'제출 기한：접수 확인 다음 영업일'};
  const before=read(allNew,original);
  assert.equal(before.availability,'available');
  assert.match(before.text,/대상 미확인, 제출기한 “접수 확인 다음 영업일”〔정정-하나〕, 제출처 미확인/u);
  assert.doesNotMatch(before.text,/11월|2층|진행자/u);
  const after=read(allNew,later,original);
  assert.match(after.text,/대상 미확인, 제출기한 “접수 확인 다음 영업일”〔정정-하나〕, 제출처 “초록 창구”〔정정-둘〕/u);
});

test('a field explicitly missing or withdrawn supersedes its old value and keeps the quotation', () => {
  for (const withdrawal of ['철회','삭제','취소','미정','추후 공지','별도 안내','']) {
    const r=read(original,{...amendment,text:'제출처: '+withdrawal});
    assert.match(r.text,/제출처 미확인〔정정-하나/u);
    if (withdrawal) assert.ok(r.text.includes('원문 “'+withdrawal+'”'));
    assert.ok(r.text.includes('11월 28일 오후 4시'));
    assert.ok(!r.text.includes('2층 안내대'));
  }
});

test('different values within a label remain unresolved even when its first value repeats', () => {
  for (const labels of ['제출처: 갑\n제출처: 을','제출처: 갑\n제출 장소: 을\n제출처: 갑']) {
    const r=read(original,{...amendment,text:labels});
    assert.match(r.text,/제출처 미확인〔정정-하나 내 항목 충돌〕/u);
    assert.doesNotMatch(r.text,/“갑”|“을”|2층/u);
  }
  const r=read(original,{...amendment,text:'제출처: 을\n제출처: 을'});
  assert.match(r.text,/제출처 “을”〔정정-하나〕/u);
});

test('withdrawal of the entire notice is explicit and old deadlines cannot return on a partial edit', () => {
  const withdrawal={...amendment,text:'안내 상태: 철회'};
  const withdrawn=read(original,withdrawal);
  assert.match(withdrawn.text,/안내는 철회됐습니다〔정정-하나〕/u);
  assert.doesNotMatch(withdrawn.text,/11월|2층|진행자/u);
  assertUnresolved(read(original,withdrawal,later));
  const replacement={...later,mode:'replace'};
  assert.match(read(original,withdrawal,replacement).text,/대상 미확인, 제출기한 미확인, 제출처 “초록 창구”〔정정-둘〕/u);
});

test('no current answer if the original or linear correction chain is missing or ambiguous', () => {
  assertUnresolved(read(foreign));
  assertUnresolved(read(original,{...amendment,corrects:foreign.ref},foreign));
  assertUnresolved(read(original,{...amendment,ref:original.ref}));
  assertUnresolved(read(original,{...original,ref:'두 번째 독립 원안'}));
  assertUnresolved(read(amendment,later));
  assertUnresolved(read(original,amendment,{...later,corrects:original.ref}));
  assertUnresolved(read(original,{...amendment,corrects:later.ref},later));
  assertUnresolved(read(original,{...amendment,corrects:amendment.ref}));
  assertUnresolved(read(original,{...amendment,corrects:'자료 밖 번호'}));
});

test('unknown prose and conditional exceptions cannot be skipped or assumed to preserve terms', () => {
  for (const extra of ['예외: 제주팀은 접수 불가','추가조건: 부서별 별도 안내','기한 예외: 오전반 제외','단, 오후반 제외','안내상태: 조건부 적용',
    '제출처: 서관 / 제출 기한: 01월 2일','문서번호: 다른번호','정정대상 문서번호: 오전반-7']) {
    assertUnresolved(read(original,{...amendment,text:'대상: 참가자\n'+extra}));
  }
  assertUnresolved(read(original,{...amendment,text:'행사일: 2026-12-25'}));
});

test('independent dates and contacts do not become deadlines or destinations', () => {
  const text='행사일: 12월 1일\n작성일: 11월 28일\n문의처: 서관\n대상: 낭독 진행자';
  const r=read({...original,text});
  assert.match(r.text,/대상 “낭독 진행자”〔원안-서른〕, 제출기한 미확인, 제출처 미확인/u);
  assert.doesNotMatch(r.text,/12월|11월|서관/u);
});

test('the original terms need quotes and relative deadlines remain precisely as supplied', () => {
  const r=read({...original,text:'적용 대상: 해오름 연습반(기존 참가자 제외)\n기한: 수령일 다음 날부터 7영업일 이내\n제출 장소: 바람 안내대'});
  for (const value of ['해오름 연습반(기존 참가자 제외)','수령일 다음 날부터 7영업일 이내','바람 안내대']) assert.ok(r.text.includes('“'+value+'”〔원안-서른〕'));
  assert.doesNotMatch(r.text,/2026|법적|완료/u);
});

test('invalid transport values have no partial answer', () => {
  for (const bad of [null,{}, {noticeId,documents:[]},{noticeId,documents:Array(13).fill(original)},
    {noticeId,documents:[{...original,text:'x'.repeat(1201)}]},
    {noticeId,documents:[{...original,text:'대상: A\x01'}]},
    {noticeId,documents:[{...original,ref:' '}]},{noticeId,documents:[{...amendment,mode:'unknown'}]},
    {noticeId,documents:[{...amendment,mode:undefined}]},{noticeId,documents:[{...original,mode:'replace'}]}])
    assert.throws(()=>reviewNotice(bad),/INVALID_NOTICE/u);
});
