import assert from 'node:assert/strict';
import test from 'node:test';
import {reviewSuppliedCooperation} from './cooperation-review.mjs';

const route=Object.freeze({from:'preparation',to:'repair',context:'견적 대조'});
const row=Object.freeze({...route,task:'A',source:'field',returned:true});
const positive=Object.freeze({...row,outcome:'helpful',outcomeRef:'K3',outcomeNote:'미포함 항목 발견'});
const negative=Object.freeze({...row,outcome:'unhelpful',outcomeRef:'K4',outcomeNote:'이미 답한 내용 반복'});
const run=(...workRecords)=>reviewSuppliedCooperation({route,workRecords});
const eligible=result=>result.text.includes('공동 검토 기준에 해당합니다.');
const has=(s,part)=>assert.ok(s.includes(part),s);

test('same task across rooms is one independent completed work',()=>{
  const r=run({...row,room:'하나'},{...row,room:'둘'});
  assert.equal(r.availability,undefined);
  has(r.text,'독립 업무 1건(A), 동일 업무 중복 기록 1건, 확인된 이득 0건.');
  assert.equal(eligible(r),false);
  assert.equal(run(row).operation,'review_supplied_cooperation');
});

test('only the requested direction and specific situation count',()=>{
  const r=run(row,{...row,task:'B',from:route.to,to:route.from},{...row,task:'C',context:'방문 예약'});
  has(r.text,'다른 방향·상황 2건 제외.');
  has(r.text,'독립 업무 1건(A)');assert.equal(eligible(r),false);
  const matches=run(row,{...row,task:'B'});
  assert.equal(eligible(matches),true);has(matches.text,'독립 업무 2건(A, B)');
  has(matches.text,'보강은 주인님 승인 후');assert.equal(matches.approved,undefined);
});

test('independently attested benefit qualifies after a single task; claims without a source or outcome note do not',()=>{
  assert.equal(eligible(run(positive)),true);
  has(run(positive).text,'이득 근거 A〔K3〕 미포함 항목 발견.');
  for(const r of [{...row,outcome:'helpful'},{...row,outcome:'helpful',outcomeRef:'R'},
                  {...row,outcome:'helpful',outcomeNote:'좋아짐'},{...positive,outcome:'unconfirmed'}]){
    assert.equal(eligible(run(r)),false);
    has(run(r).text,'확인된 이득 0건.');
  }
});

test('trial and incomplete returns never qualify as independent field work',()=>{
  const t={...positive,source:'trial'}, u={...positive,source:'unknown'}, partial={...positive,returned:null};
  assert.equal(eligible(run(t)),false);assert.equal(run(t).availability,undefined);
  has(run(t).text,'시험 기록 1건 제외.');
  for(const sample of [[],[u],[partial],[{...positive,returned:false}],[{...positive,context:'기타'}],[t,u]]){
    const r=run(...sample);assert.equal(r.availability,'unavailable');assert.equal(eligible(r),false);
  }
  const r=run(row,t,u,partial,{...positive,returned:false});assert.equal(eligible(r),false);
  has(r.text,'확인되지 않은 기록 3건 제외.');has(r.text,'독립 업무 1건(A)');
});

test('counterexamples keep their original task and evidence and do not silently squash independent repeated use',()=>{
  const r=run(negative,{...negative,task:'B'});has(r.text,'확인된 이득 0건.');has(r.text,'반례 2건.');
  assert.equal(eligible(r),true);
  has(r.text,'A〔K4〕 이미 답한 내용 반복');has(r.text,'B〔K4〕 이미 답한 내용 반복');
});

test('opposing verdicts on the same evidence remain unresolved; distinct observations remain visible',()=>{
  const r=run(positive,{...negative,outcomeRef:positive.outcomeRef});
  assert.equal(eligible(r),false);has(r.text,'효과가 엇갈린 기록 1건');
  const split=run(positive,negative,{...positive,outcomeNote:'작업 범위 발견'},positive);
  assert.equal(eligible(split),true);has(split.text,'확인된 이득 1건.');has(split.text,'반례 1건.');
  assert.equal(split.text,run(positive,{...positive,outcomeNote:'작업 범위 발견'},negative,positive).text);
});

test('invalid roles, self direction and unbounded or unknown fields are rejected',()=>{
  for(const change of [{from:'missing-role'},{to:'preparation'},{task:' '},{source:'production'},{room:'하나\n둘'},
                        {extra:'X'},{returned:1},{outcomeNote:'a'.repeat(65)}])assert.throws(()=>run({...row,...change}));
  for(const bad of [{route:{...route,to:'preparation'},workRecords:[row]},
                    {route,workRecords:Array(25).fill(row)},{route,workRecords:[row],approve:true}]){
    assert.throws(()=>reviewSuppliedCooperation(bad));
  }
});

test('compare pair and retry permutations to an independent eligibility oracle',()=>{
  let combinations=0;
  const inputs=[];
  for(const task of ['A','B'])for(const source of ['field','trial','unknown'])for(const returned of [true,false,null])
    for(const quality of ['none','supported','unsupported']){
      const evidence=quality==='supported'?{outcome:'helpful',outcomeRef:'F',outcomeNote:'본문 차이 확인'}:
        quality==='unsupported'?{outcome:'helpful'}:{};
      inputs.push({...row,task,source,returned,...evidence});
    }
  for(const a of inputs)for(const b of inputs){
    const fieldA=a.source==='field'&&a.returned;const fieldB=b.source==='field'&&b.returned;
    const independent=Boolean(fieldA&&fieldB&&a.task!==b.task);
    const proved=Boolean((fieldA&&a.outcomeRef)||(fieldB&&b.outcomeRef));
    assert.equal(eligible(run(a,b)),independent||proved);combinations++;
  }
  assert.equal(combinations,2916);
});
