import assert from 'node:assert/strict';
import test from 'node:test';
import {z} from 'zod';
import {resolveSuppliedTradingRule, tradingRuleRevisionsSchema} from './trading-rule-revisions.mjs';

const name = '검토 표식';
const operation = 'resolve_supplied_trading_rule';
const prefix = '제공된 규칙 「검토 표식」. ';
const original = {rule:name,ref:'가',action:'original',quote:'파란 표를 쓴다'};
const correction = {rule:name,ref:'나',action:'revise',corrects:'가',quote:'흰 표를 쓴다'};
const withdrawal = {rule:name,ref:'다',action:'withdraw',corrects:'나',quote:'이 규칙을 철회한다'};
const resolve = (records,ruleName=name) => resolveSuppliedTradingRule({ruleName,ruleRecords:records});
const allOrders = rows => rows.length ? rows.flatMap((r,index) =>
  allOrders(rows.filter((_,n) => n !== index)).map(tail => [r,...tail])) : [[]];

test('original statement and latest explicit correction retain exact source quotation', () => {
  assert.deepEqual(resolve([original]),{operation,text:prefix+'현재 문구 "파란 표를 쓴다"〔가〕.'});
  assert.deepEqual(resolve([correction,original]),{operation,text:prefix+'현재 문구 "흰 표를 쓴다"〔나〕.'});
  const exact = '표시를 "보류"로 둔다';
  assert.ok(resolve([original,{...correction,quote:exact}]).text.includes(JSON.stringify(exact)));
});

test('withdrawal replaces the active rule regardless of input order', () => {
  for (const rows of allOrders([original,correction,withdrawal]))
    assert.deepEqual(resolve(rows),{operation,text:prefix+'철회됨〔다〕. 철회 원문 "이 규칙을 철회한다".'});
});

test('an unrelated rule with reused source IDs and a disconnected amendment stays separate', () => {
  const other = {...correction,rule:'용지',ref:'나',corrects:'마',quote:'노란 표'};
  assert.deepEqual(resolve([other,original,correction]),resolve([original,correction]));
  assert.deepEqual(resolve([other]),{operation,availability:'unavailable',text:prefix+'해당 원문 미기재.'});
  assert.deepEqual(resolve([]),resolve([other]));
});

test('branch, duplicate ref, missing predecessor, cycle and unordered roots are indeterminate', () => {
  for (const records of [
    [original,correction,{...withdrawal,corrects:'가'}], [original,{...correction,ref:'가'}],
    [correction], [original,withdrawal], [original,{...correction,corrects:'다'},withdrawal],
    [original,{...original,ref:'나'}]
  ]) {
    const answer = resolve(records);
    assert.equal(answer.availability,'unavailable');
    assert.match(answer.text,/연결이 상충하거나 누락/);
    assert.ok(!answer.text.includes('현재 문구 "'));
  }
});

test('latest source without text never reuses a superseded quote', () => {
  for (const quote of [null,undefined]) {
    assert.deepEqual(resolve([original,{...correction,quote}]),
      {operation,availability:'unavailable',text:prefix+'최신 문구 미기재〔나〕.'});
    assert.equal(resolve([original,correction,{...withdrawal,quote}]).availability,'unavailable');
  }
});

test('later change after withdrawal cannot silently revive the former rule', () => {
  const later = {...correction,ref:'라',corrects:'다',quote:'다시 파란 표'};
  const result = resolve([correction,later,withdrawal,original]);
  assert.equal(result.availability,'unavailable');
  assert.match(result.text,/재시행 여부를 확인/);
});

test('canonically equivalent source labels resolve while the source quote retains its spelling', () => {
  const q='파란'.normalize('NFD');
  const result=resolve([original,{...correction,rule:name.normalize('NFD'),corrects:'가'.normalize('NFD'),quote:q}]);
  assert.equal(result.text,prefix+'현재 문구 '+JSON.stringify(q)+'〔나〕.');
});

test('bad action, missing target on corrections, invalid lengths and unrelated payloads are rejected', () => {
  const schema=tradingRuleRevisionsSchema(z);
  for (const bad of [{...original,corrects:'가'}, {...correction,corrects:undefined},{...original,action:'buy'},
    {...original,shares:3},{...original,quote:'공개\n가격'},{...original,ref:'가'.repeat(49)}]) {
    assert.equal(schema.safeParse({ruleName:name,ruleRecords:[bad]}).success,false);
  }
  assert.equal(schema.safeParse({ruleName:name,ruleRecords:Array(17).fill(original)}).success,false);
  assert.equal(schema.safeParse({ruleName:name,ruleRecords:[original],account:'one'}).success,false);
});
