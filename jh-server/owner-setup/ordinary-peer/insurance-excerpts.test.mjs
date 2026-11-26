import assert from 'node:assert/strict';
import test from 'node:test';
import {z} from 'zod';
import {insuranceExcerptsSchema, compareInsuranceExcerpts} from './insurance-excerpts.mjs';

const entry = (kind, quote, item = '제출 서류') => ({item, kind, quote});
const supplied = (left = [], right = []) => ({
  policyItems: ['제출 서류'], excerpts: [{ref: '솔안', entries: left}, {ref: '돌안', entries: right}]
});
const schema = insuranceExcerptsSchema(z);

test('same item in distinct sources keeps evidence, including conditions and exceptions', () => {
  const result = compareInsuranceExcerpts(supplied([
    entry('exception', '분실 때에는 사유서를 붙인다'), entry('stated', '영수증을 첨부한다')
  ], [entry('stated', '신청서를 먼저 낸다')]));
  assert.deepEqual(result, {operation: 'compare_supplied_insurance_excerpts', text:
    '제공된 두 보험 발췌문 기준입니다. 제출 서류〔솔안 명시 "영수증을 첨부한다", 조건·예외 "분실 때에는 사유서를 붙인다" / 돌안 명시 "신청서를 먼저 낸다"〕.'});
});

test('missing, unclear and explicitly conflicting items never imply a decision about coverage', () => {
  const result = compareInsuranceExcerpts(supplied([entry('conflict', '두 쪽의 설명이 상충한다고 기록됨')], [entry('unclear', '서류명 판독 불가')]));
  assert.equal(result.availability, 'unavailable');
  assert.match(result.text, /솔안 상충 표기 "두 쪽의 설명이 상충한다고 기록됨" \/ 돌안 표기 불명 "서류명 판독 불가"/);
  assert.equal(compareInsuranceExcerpts(supplied()).text, '제공된 두 보험 발췌문 기준입니다. 제출 서류〔솔안 미기재 / 돌안 미기재〕.');
});

test('every mixture of issue types in each source keeps the independently identifiable text', () => {
  const types = [
    ['stated', '명시'], ['exception','조건·예외'], ['unclear','표기 불명'], ['conflict','상충 표기']
  ];
  for (let left = 0; left < 16; left++) for (let right = 0; right < 16; right++) {
    const masks = [left, right];
    const sides = masks.map((mask, side) => types.flatMap(([kind], i) =>
      mask & (1 << i) ? [entry(kind, side + '-' + i)] : []));
    const result = compareInsuranceExcerpts(supplied(...sides));
    const expected = masks.map((mask, side) => {
      const notes = types.flatMap(([, label], i) => mask & (1 << i) ? [label + ' "' + side + '-' + i + '"'] : []);
      return ['솔안', '돌안'][side] + ' ' + (notes.join(', ') || '미기재');
    });
    assert.equal(result.text, '제공된 두 보험 발췌문 기준입니다. 제출 서류〔' + expected.join(' / ') + '〕.');
    const certain = mask => (mask % 4 > 0) && mask < 8;
    assert.equal(result.availability, masks.some(certain) ? undefined : 'unavailable');
  }
});

test('duplicate entries within a source are shown once and independent explicit clauses stay intact', () => {
  const a = entry('stated', '서류 "가"를 첨부한다');
  const b = entry('stated', '사본은 한 부 낸다');
  const result = compareInsuranceExcerpts(supplied([a,b,a], [b]));
  assert.equal(result.text, '제공된 두 보험 발췌문 기준입니다. 제출 서류〔솔안 명시 "서류 \\"가\\"를 첨부한다" · "사본은 한 부 낸다" / 돌안 명시 "사본은 한 부 낸다"〕.');
});

test('only requested items are compared, in request order, with original Korean spellings', () => {
  const source = supplied([entry('stated', '세 번째 줄', '기한'.normalize('NFD')), entry('exception','접수 채널 추가','별도 항목')]);
  source.policyItems.unshift('기한');
  const output = compareInsuranceExcerpts(source);
  assert.equal(output.text, '제공된 두 보험 발췌문 기준입니다. 기한〔솔안 명시 "세 번째 줄" / 돌안 미기재〕. 제출 서류〔솔안 미기재 / 돌안 미기재〕.');
  assert.equal(output.availability, undefined);
});

test('a corrected follow-up depends only on the new two sources', () => {
  const input = supplied([entry('stated', '영수증을 첨부한다')]);
  const before = JSON.stringify(input);
  assert.match(compareInsuranceExcerpts(input).text, /돌안 미기재/);
  assert.equal(JSON.stringify(input), before);
  input.excerpts[1].entries.push(entry('exception','분실 시 확인서를 쓴다'));
  const changed = compareInsuranceExcerpts(input);
  assert.match(changed.text, /돌안 조건·예외 "분실 시 확인서를 쓴다"/);
  assert.doesNotMatch(changed.text, /미기재/);
});

test('invalid shapes, duplicate NFC-identical references or items, hidden formatting and extra actions fail', () => {
  const bad = [
    {policyItems: [], excerpts: supplied().excerpts},
    {...supplied(), actor:'submit'},
    supplied([entry('payout','10만 원')]),
    supplied([entry('stated','aa\nbb')]),
    supplied([entry('stated','ab\u202Ecd')]),
    {...supplied(), policyItems:['서류','서류'.normalize('NFD')]},
    {...supplied(), excerpts:[{ref:'솔안',entries:[]},{ref:'솔안'.normalize('NFD'),entries:[]}]},
    supplied([{...entry('stated','사본'), payNow:true}]),
    {...supplied(), excerpts:[]},
    supplied([entry('exception',' ')]),
    supplied([entry('stated','x'.repeat(129))])
  ];
  for (const value of bad) assert.throws(() => compareInsuranceExcerpts(value));
  assert.equal(schema.safeParse(supplied()).success, true);
});
