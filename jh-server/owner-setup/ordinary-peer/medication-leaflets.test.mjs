import test from 'node:test';
import assert from 'node:assert/strict';
import {compareMedicationLeaflets} from './medication-leaflets.mjs';

const sample = (left, right = []) => ({
  leafletItems: ['문의처'],
  leaflets: [{ref:'봄안', entries:left}, {ref:'가을안', entries:right}]
});
const entry = (kind, quote, item = '문의처') => ({item, kind, quote});
const operation = 'compare_supplied_medication_leaflets';

test('returns exact wording for each requested item and visibly labels the missing source', () => {
  const input = sample([entry('stated', '문의는 솔 창구로'), entry('stated', '파란 봉투', '포장')]);
  assert.deepEqual(compareMedicationLeaflets(input), {
    operation, text:'제공된 두 복약 안내문 기준입니다. 문의처〔봄안 명시 "문의는 솔 창구로" / 가을안 미기재〕.'
  });
});

test('lists different original instructions by source without selecting or combining them', () => {
  const result = compareMedicationLeaflets(sample([
    entry('stated','목요일에는 솔 안내소'),entry('exception','휴일에는 별 안내소')
  ],[entry('stated','문의는 달 안내소')]));
  assert.equal(result.text, '제공된 두 복약 안내문 기준입니다. 문의처〔봄안 명시 "목요일에는 솔 안내소", 조건·예외 "휴일에는 별 안내소" / 가을안 명시 "문의는 달 안내소"〕.');
});

test('incomplete, unclear and explicitly conflicting records preserve what can be read', () => {
  const bothUnclear = sample([entry('unclear','안내소 이름 판독 불가')], [entry('conflict','쪽지 두 장의 창구 표기가 상충함')]);
  assert.deepEqual(compareMedicationLeaflets(bothUnclear), {
    operation, availability:'unavailable', text:'제공된 두 복약 안내문 기준입니다. 문의처〔봄안 표기 불명 "안내소 이름 판독 불가" / 가을안 상충 표기 "쪽지 두 장의 창구 표기가 상충함"〕.'
  });
  assert.equal(compareMedicationLeaflets(sample([])).availability,'unavailable');
});

test('never recycles an old leaflet after its wording is corrected', () => {
  const first = sample([entry('stated','문의는 솔 창구로')],[entry('stated', '문의는 별 창구로')]);
  const after = structuredClone(first);
  after.leaflets[1].entries[0].quote = '문의는 강 창구로';
  assert.ok(compareMedicationLeaflets(first).text.includes('별 창구'));
  assert.match(compareMedicationLeaflets(after).text, /가을안 명시 "문의는 강 창구로"/);
  assert.doesNotMatch(compareMedicationLeaflets(after).text,/별 창구/);
});

test('only the two named source records and requested items are accepted', () => {
  const data = sample([]);
  assert.throws(() => compareMedicationLeaflets({...data,dose:2}));
  assert.throws(() => compareMedicationLeaflets({...data,leaflets:[data.leaflets[0]]}));
  assert.throws(() => compareMedicationLeaflets({...data,leaflets:[data.leaflets[0],data.leaflets[0]]}), /SAME_MEDICATION_LEAFLET_REFERENCE/);
  assert.throws(() => compareMedicationLeaflets({...data,leafletItems:['문의처','문의처']}), /DUPLICATE_MEDICATION_ITEM/);
});
