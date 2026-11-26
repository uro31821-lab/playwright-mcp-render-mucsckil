import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {compareRepairQuotes, repairQuotesSchema} from './repair-quotes.mjs';

const prefix='제공된 두 견적의 작업 범위입니다. ';
const entry = (item, status, note) => note === undefined ? {item,status} : {item,status,note};
const input = (scopeItems, one, two) => ({scopeItems, quotes:[{ref:'Q1',entries:one},{ref:'Q2',entries:two}]});
const basic = input(['문짝 조정','출장비'],[entry('문짝 조정','included'),entry('출장비','extra')],[entry('문짝 조정','excluded')]);
const statuses = ['included','excluded','extra','unclear'];
const korean = {included:'포함',excluded:'제외',extra:'별도 비용',unclear:'확인 필요'};

test('two named quotes keep explicit inclusion, exclusion, separate charge and omission distinct',()=>{
  assert.deepEqual(compareRepairQuotes(basic),{operation:'compare_supplied_repair_scopes',text:prefix+'문짝 조정〔Q1 포함 / Q2 제외〕. 출장비〔Q1 별도 비용 / Q2 제공분에 기재 없음〕.'});
  const swapped=compareRepairQuotes({...basic,quotes:basic.quotes.toReversed()});
  assert.equal(swapped.text,prefix+'문짝 조정〔Q2 제외 / Q1 포함〕. 출장비〔Q2 제공분에 기재 없음 / Q1 별도 비용〕.');
});

test('only requested sections match; an unmentioned line is not free, excluded or a nearby specification',()=>{
  const result=compareRepairQuotes(input(['경첩 3개','출장비'],[entry('경첩 2개','included')],[entry('출장비','unclear','현장 확인')]));
  assert.equal(result.availability,'unavailable');
  assert.equal(result.text,prefix+'경첩 3개〔Q1 제공분에 기재 없음 / Q2 제공분에 기재 없음〕. 출장비〔Q1 제공분에 기재 없음 / Q2 확인 필요(현장 확인)〕.');
});

test('conditions, quantities and partial knowledge survive; duplicate copies of a line do not strengthen it',()=>{
  const provided=entry('문짝 조정','included','2개까지');
  const result=compareRepairQuotes(input(['문짝 조정'],[provided,{...provided}],[entry('문짝 조정','unclear','현장 측정 후')]));
  assert.equal(result.availability,undefined);
  assert.equal(result.text,prefix+'문짝 조정〔Q1 포함(2개까지) / Q2 확인 필요(현장 측정 후)〕.');
});

test('contradictory or differently qualified lines stay unresolved regardless of file order',()=>{
  for(const later of [entry('운반','extra','1층'),entry('운반','included','2층')]){
    const set=[entry('운반','included','1층'),later];
    for(const rows of [set,set.toReversed()]){
      const result=compareRepairQuotes(input(['운반'],rows,[]));
      assert.equal(result.availability,'unavailable');
      assert.match(result.text,/Q1 기재가 달라 확인 필요/);
      for(const {status,note} of rows)assert.ok(result.text.includes(korean[status]+'('+note+')'));
    }
  }
});

test('NFC-equivalent labels refer to one item and quote identifiers remain distinct',()=>{
  const label='재봉선', raw=label.normalize('NFD');
  const result=compareRepairQuotes(input([label],[entry(raw,'included')],[entry(label,'extra')]));
  assert.equal(result.text,prefix+'재봉선〔Q1 포함 / Q2 별도 비용〕.');
  assert.throws(()=>compareRepairQuotes(input([label,raw],[],[])),/DUPLICATE_SCOPE_ITEM/);
  assert.throws(()=>compareRepairQuotes({...basic,quotes:[{ref:label,entries:[]},{ref:raw,entries:[]}]}),/SAME_QUOTE_REFERENCE/);
});

test('input requires exactly two quotes and bounded literal source text without extra fields',()=>{
  const schema=repairQuotesSchema(z);
  for(const malformed of [
    {...basic,quotes:basic.quotes.slice(0,1)}, {...basic,quotes:[...basic.quotes,basic.quotes[0]]},
    {...basic,scopeItems:[]},{...basic,scopeItems:Array(13).fill('경첩')},input(['금액'],Array(25).fill(entry('금액','extra')),[]),
    input(['한 줄\n둘째'],[],[]),input(['  섬유'],[],[]),input(['경첩'],[entry('경첩','free')],[]),
    input(['경첩'],[{item:'경첩',status:'included',note:null}],[]),
    input(['경첩'],[{item:'경첩',status:'included',amount:0}],[]),{...basic,purchase:true}
  ]) {
    assert.equal(schema.safeParse(malformed).success,false);
    assert.throws(()=>compareRepairQuotes(malformed));
  }
});

test('exhaustive two-quote status oracle checks the availability and position of each term',()=>{
  const spec='작업';
  const choices=[[],...statuses.flatMap(left=>[
    [entry(spec,left)],...statuses.map(right=>[entry(spec,left),entry(spec,right)])
  ])];
  const expected=rows=>{
    const distinct=[...new Set(rows.map(row=>row.status))];
    if (!distinct.length) return ['제공분에 기재 없음',false];
    if (distinct.length===1) return [korean[distinct[0]],distinct[0]!=='unclear'];
    return ['기재가 달라 확인 필요('+distinct.map(s=>korean[s]).join(', ')+')',false];
  };
  let seen=0;
  for(const left of choices)for(const right of choices){
    const [a,knownA]=expected(left),[b,knownB]=expected(right);
    const result=compareRepairQuotes(input([spec],left,right));
    assert.equal(result.text,prefix+'작업〔Q1 '+a+' / Q2 '+b+'〕.');
    assert.equal(result.availability,(knownA||knownB)?undefined:'unavailable');seen++;
  }
  assert.equal(seen,441);
});
