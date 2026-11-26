import assert from 'node:assert/strict';
import test from 'node:test';
import {z} from 'zod';
import {preferenceRevisionsSchema, resolveSuppliedPreferences} from './preference-revisions.mjs';

const query = {context:'모의 전시', item:'안내 형식'};
const row = (ref, order, value, fields = {}) => ({
  ...query, ref, order, value, scope:'standing', action:'set', ...fields
});
const once = (ref, order, value, fields = {}) => row(ref, order, value, {scope:'once', occasion:'봄 행사', ...fields});
const run = (records, occasion, target = query) =>
  resolveSuppliedPreferences({preferenceQuery:{...target, occasion}, preferenceRecords:records});

test('latest explicit correction wins by supplied order, not list position', () => {
  const old = row('메모1',1,'긴 문장'), edit = row('메모2',3,'표');
  const other = row('타 기록',100,'짧은 문장',{context:'일상'});
  for (const rows of [[edit,other,old],[old,edit,other],[other,old,edit]]) {
    assert.deepEqual(run(rows), {operation:'resolve_supplied_preference_revisions', text:'제공 기록 기준 모의 전시의 안내 형식. 기본 선호 표〔메모2〕.'});
  }
});

test('same context and item required, one-time scope restricted to named occasion', () => {
  const rows = [
    row('기본',4,'표'), once('예외',2,'한 줄'), once('다음 행사',10,'음성',{occasion:'여름 행사'}),
    row('다른 항목',900,'거짓 값',{item:'안내 위치'}), row('다른 맥락',901,'거짓 값',{context:'모의 박람회'})
  ];
  assert.match(run(rows,'봄 행사').text, /기본 선호 표〔기본〕.*이번 적용값 한 줄〔예외〕/);
  assert.match(run(rows,'여름 행사').text, /이번 적용값 음성〔다음 행사〕/);
  assert.match(run(rows,'겨울 행사').text, /일회 지시 관련 기록 없음.*이번 적용값 표〔기본〕/);
  for (const occasion of [undefined,'봄 행사','여름 행사','겨울 행사']) assert.doesNotMatch(run(rows,occasion).text, /거짓 값/);
  assert.doesNotMatch(run(rows).text, /한 줄|음성/);
});

test('a newer standing value remains after withdrawing a one-time exception', () => {
  const rows = [row('기본',1,'표'), once('예외',2,'문장'), row('기본 정정',3,'목록'), once('예외 철회',4,null,{action:'withdraw'})];
  const result = run(rows,'봄 행사');
  assert.match(result.text, /일회 지시 철회됨〔예외 철회〕.*이번 적용값 목록〔기본 정정〕/);
  assert.equal(result.availability,undefined);
});

test('withdrawn standing value does not revive an earlier value, and a new set can replace it', () => {
  const rows = [row('기본',1,'표'),row('철회',2,null,{action:'withdraw'})];
  assert.match(run(rows).text, /기본 선호 철회됨〔철회〕/);
  assert.equal(run(rows).availability,undefined);
  assert.doesNotMatch(run(rows,'봄 행사').text, /기본 선호 표|이번 적용값 표/);
  assert.match(run([...rows,once('예외',1,'단락')],'봄 행사').text, /이번 적용값 단락〔예외〕/);
  assert.match(run([...rows,row('새 지시',3,'문장')]).text, /기본 선호 문장〔새 지시〕/);
});

test('latest tied records must agree, older ties are superseded, equal normalized values coalesce', () => {
  const rows = [row('A',1,'표'),row('B',1,'문장')];
  assert.equal(run(rows).availability,'unavailable');
  assert.match(run(rows).text, /같은 순서의 기록 상충〔A, B〕/);
  assert.equal(run([...rows,row('C',2,'목록')]).availability,undefined);
  assert.equal(run([row('A',2,'음성'),row('B',2,'음성'.normalize('NFD'))]).text, '제공 기록 기준 모의 전시의 안내 형식. 기본 선호 음성〔A, B〕.');
});

test('undated records matter only when they could change the latest outcome', () => {
  const records = [row('A',0,'음성'),row('B',2,'표'),row('C',null,'표')];
  assert.match(run(records).text, /표〔B, C〕/);
  const unknown = run([...records,row('D',null,null,{action:'withdraw'})]);
  assert.equal(unknown.availability,'unavailable');
  assert.match(unknown.text, /선후 관계 확인 필요〔B, C, D〕/);
  assert.match(run([row('A',null,'카드')]).text, /카드〔A〕/);
});

test('conflicting exception takes precedence over the default, valid exception can be used with ambiguous default', () => {
  const defaultRows = [row('A',2,'표'),row('B',2,'문장')];
  assert.match(run([...defaultRows,once('봄',3,'음성')],'봄 행사').text, /기본 선호 같은 순서의 기록 상충.*이번 적용값 음성〔봄〕/);
  assert.equal(run([...defaultRows,once('봄',3,'음성')],'봄 행사').availability,undefined);
  const conflict = run([row('기본',2,'표'),once('A',4,'음성'),once('B',4,'번호')],'봄 행사');
  assert.equal(conflict.availability,'unavailable');
  assert.match(conflict.text, /일회 지시 같은 순서의 기록 상충.*이번 적용값 확인 필요/);
});

test('missing latest value never implies withdrawal or fallback, no matching records yield insufficient data', () => {
  const rows = [row('기본',2,'표'),row('미상',5,null)];
  assert.equal(run(rows).availability,'unavailable');
  assert.match(run(rows).text, /값 미기재〔미상〕/);
  assert.doesNotMatch(run(rows).text,/철회|기본 선호 표/);
  for (const records of [[], [row('A',2,'표',{item:'무관'})], [once('봄',3,'카드')]]) {
    assert.equal(run(records,'다른 행사').availability,'unavailable');
  }
});

test('NFC-equivalent context, item and occasion match; no substring matching', () => {
  const data = [once('봄',2,'수첩',{context:query.context.normalize('NFD'),item:query.item.normalize('NFD'),occasion:'봄 행사'.normalize('NFD')})];
  assert.match(run(data,'봄 행사').text, /이번 적용값 수첩/);
  assert.equal(run(data,'봄').availability,'unavailable');
  assert.equal(run(data,'봄 행사',{...query,item:'안내'}).availability,'unavailable');
});

test('schema rejects ambiguous scopes, invalid chronology, hidden content and unrequested keys', () => {
  const schema = preferenceRevisionsSchema(z);
  for (const sample of [
    row('A',1,'표',{occasion:'주말'}),once('A',1,'표',{occasion:null}),row('A',-1,'표'),row('A',1.1,'표'),
    row('A',2**53,'표'),row('A',1,'표',{action:'withdraw'}),row('A',1,'표',{write:true}),
    row('A',1,'한 줄\n외부'),row(' A',1,'표'),row('A',1,'\u202e감춤'),row('A',1,'〔변조〕')
  ]) assert.equal(schema.safeParse({preferenceQuery:query,preferenceRecords:[sample]}).success,false);
  assert.equal(schema.safeParse({preferenceQuery:{...query,wrong:1},preferenceRecords:[]}).success,false);
  assert.equal(schema.safeParse({preferenceQuery:query,preferenceRecords:Array(33).fill(row('A',1,'표'))}).success,false);
});

test('does not mutate input or carry a preference from one call to the next', () => {
  const frozen = Object.freeze({...query,ref:'A',order:1,scope:'standing',action:'set',value:'표'});
  const input = Object.freeze({preferenceQuery:Object.freeze({...query}),preferenceRecords:Object.freeze([frozen])});
  assert.deepEqual(resolveSuppliedPreferences(input),resolveSuppliedPreferences(input));
  assert.equal(run([]).availability,'unavailable');
});
