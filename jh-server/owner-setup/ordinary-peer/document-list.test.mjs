import assert from 'node:assert/strict';
import test from 'node:test';
import {assessDocumentList} from './document-list.mjs';

const req = {id:'A', document_type:'신청표', subject_ref:'파랑팀', source_ref:'R1', confirmed:true};
const doc = {ref:'H1', document_type:'신청표', subject_ref:'파랑팀', read_status:'verified'};
const sample = (requests, inventory, flags = {}) => assessDocumentList({
  requirements:requests, documents:inventory, ...flags
});

test('case returns exact current sources and distinguishes an explicitly missing item', () => {
  const result = sample([req,{...req,id:'B',document_type:'배치도'}],[doc],{as_of:'2026-11-26',inventory_complete:true});
  assert.deepEqual(result,{operation:'compare_supplied_documents',text:
    '제공된 요구·보유 목록 기준입니다. 신청표(파랑팀)〔요구 R1 / 보유 H1〕 준비됨. 배치도(파랑팀)〔요구 R1〕 누락(전체 보유 목록에 일치 자료 없음).'});
});

test('missing materials, a partial inventory or an unconfirmed source cannot prove absence', () => {
  for (const inventory_complete of [false,undefined]) {
    const r = sample([req],[{...doc,subject_ref:'다른팀'}],{inventory_complete,requirements_complete:true});
    assert.equal(r.availability,'unavailable');
    assert.match(r.text,/확인 필요.*제공된 보유 목록/);
    assert.doesNotMatch(r.text,/누락|H1|준비됨/);
  }
  for (const changed of [{confirmed:false},{confirmed:undefined},{source_ref:null}]) {
    const r = sample([{...req,...changed}],[doc],{inventory_complete:true});
    assert.equal(r.availability,'unavailable');
    assert.match(r.text,/요구 원문 확인 필요/);
  }
  assert.equal(sample([],[]).availability,'unavailable');
});

test('verified other person or wrong kind is never reused for a complete inventory', () => {
  for (const changed of [{subject_ref:'다른팀'},{document_type:'비슷한 신청표'}]) {
    const r = sample([req],[{...doc,...changed}],{inventory_complete:true});
    assert.match(r.text,/누락/);
    assert.doesNotMatch(r.text,/보유 H1|준비됨|발급 필요/);
  }
});

test('unreadable material or an unknown document identity cannot support a missing result', () => {
  for (const changed of [{read_status:'uncertain',subject_ref:'다른팀'},{read_status:undefined},
                         {document_type:null},{subject_ref:null}]) {
    const r = sample([req],[{...doc,...changed}],{inventory_complete:true});
    assert.equal(r.availability,'unavailable');
    assert.match(r.text,/보유 H1〕 확인 필요/);
    assert.doesNotMatch(r.text,/누락/);
  }
});

test('compares only supplied conditions, independently for each requirement, retaining source refs', () => {
  const requirements = [
    {...req,options:{형식:'원본'},period:'상반기',recipient_ref:'솔빛창구'},
    {...req,id:'B',source_ref:'R2',options:{형식:'사본'},period:'하반기',recipient_ref:'달빛창구'}
  ];
  const r = sample(requirements,[{...doc,options:{형식:'원본'},period:'상반기',recipient_ref:'솔빛창구'}]);
  assert.match(r.text,/요구 R1 \/ 보유 H1〕 준비됨/);
  assert.match(r.text,/요구 R2 \/ 보유 H1〕 조건 불충족\(형식 요구 사본 \/ 보유 원본, 기간 요구 하반기 \/ 보유 상반기, 제출처 요구 달빛창구 \/ 보유 솔빛창구\)/);
  assert.doesNotMatch(r.text,/준비완료|재발급 필요|제출 완료/);
});

test('unknown and typed options do not falsely become a matching option', () => {
  for (const [requested,owned,status] of [[true,1,'조건 불충족'],[1,'1','조건 불충족'],[null,1,'확인 필요'],
    [false,false,'준비됨'],['전체',null,'확인 필요'],['전체',undefined,'확인 필요']]) {
    const r = sample([{...req,options:{옵션:requested}}],[{...doc,options:owned===undefined?{}:{옵션:owned}}]);
    assert.match(r.text,new RegExp('〕 '+status));
    assert.equal(r.availability,status==='확인 필요'?'unavailable':undefined);
  }
});

test('checks explicit issue-date and validity boundaries without assuming a general expiry period', () => {
  const as_of='2024-02-29';
  const level = (q,d,day=as_of) =>
    sample([{...req,...q}],[{...doc,...d}],{as_of:day});
  assert.match(level({issued_on_or_after:'2024-02-29'},{issued_on:'2024-02-29',valid_until:'2024-02-29'}).text,/준비됨/);
  assert.match(level({issued_on_or_after:'2024-02-29'},{issued_on:'2024-02-28'}).text,/조건 불충족\(발급일/);
  assert.match(level({}, {issued_on:'2001-08-23'}).text,/준비됨/);
  assert.match(level({}, {valid_until:'2024-02-28'}).text,/조건 불충족\(명시 유효기한/);
  for (const d of [{issued_on:'2024-02-30'},{issued_on:'2024-03-01'},{valid_until:'2023-02-29'},
                    {valid_until:null},{valid_until:'2024-02-27',issued_on:'2024-02-28'}]) {
    assert.equal(level({},d).availability,'unavailable');
  }
  assert.equal(level({issued_on_or_after:'2024-03-01'},{issued_on:'2024-02-10'}).availability,'unavailable');
  assert.equal(level({issued_on_or_after:'2024-02-01'},{}).availability,'unavailable');
  assert.equal(level({issued_on_or_after:'2024-02-01'},{issued_on:'2024-02-03'},null).availability,'unavailable');
  assert.match(level({},{},null).text,/준비됨/);
});

test('an explicitly partial list of requirements remains partial even if all of its rows match', () => {
  assert.match(sample([req],[doc],{requirements_complete:false}).text,/준비됨.*요구 목록은 일부/);
  assert.doesNotMatch(sample([req],[doc],{requirements_complete:true}).text,/추가 요구 항목|제출 완료/);
  assert.equal(sample([req],[{...doc,valid_until:null}]).availability,'unavailable');
  assert.match(sample([req],[doc]).text,/준비됨/);
  assert.match(sample([req],[{...doc,ref:'H2',read_status:'uncertain',subject_ref:'판독안됨'},
                            {...doc,valid_until:'2026-01-11'}],{as_of:'2026-11-26'}).text,/보유 H2〕 확인 필요/);
});

test('candidate selection and tie-breaks are independent of inventory order', () => {
  const request = {...req,options:{형식:'원본'}};
  const population = [{...doc,ref:'Z',options:{형식:'원본'}},{...doc,ref:'H',options:{형식:'원본'}},
                      {...doc,ref:'Y',options:{형식:'사본'}},{...doc,ref:'S',read_status:'uncertain'}];
  function permutations(xs) {
    return !xs.length ? [[]] : xs.flatMap(x => permutations(xs.filter(y=>x!==y)).map(t=>[x,...t]));
  }
  for (const papers of permutations(population)) {
    assert.match(sample([request],papers).text,/보유 H〕 준비됨/);
  }
  assert.match(sample([request],population.slice(2)).text,/보유 S〕 확인 필요/);
});

test('reject non-unique source identities, unsupported or excessive input and invalid reference dates', () => {
  for (const [rq,dc,extra] of [
    [[req,req],[doc],{}], [[req],[doc,doc],{}], [[req],[{...doc,quantity:2}],{}],
    [[{...req,choice:'혹은'}],[doc],{}], [[{...req,options:[] }],[doc],{}],
    [[{...req,source_ref:'위조\n표시'}],[doc],{}], [[req],[doc],{as_of:'2023-02-29'}],
    [[req],[doc],{as_of:'0000-01-03'}], [[req],[doc],{file:'unrequested'}],
    [Array.from({length:13},(_,i)=>({...req,id:String(i)})),[doc],{}],
    [[req],Array.from({length:25},(_,i)=>({...doc,ref:String(i)})),{}]
  ]) assert.throws(()=>sample(rq,dc,extra));
});
