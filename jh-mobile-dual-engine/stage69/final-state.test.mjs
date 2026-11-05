import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(rel)=>JSON.parse(fs.readFileSync(new URL(rel,import.meta.url),'utf8'));
const current=read('./current.json');
const r1=read('./round1-result.json');
const r2=read('./round2-result.json');
const r3=read('./round3-result.json');
const matrix=JSON.parse(fs.readFileSync(new URL('../stage67/matrix.json',import.meta.url),'utf8'));

const manual=[
  'NATIVE_SELECT',
  'NESTED_VERTICAL_SCROLL',
  'HORIZONTAL_SCROLL',
  'PRESS_KEY',
  'RETURN_TO_CHROME_FROM_OTHER_APP'
];
const automatic=['BACK','WAIT_CONDITION','SCREENSHOT'];

test('three-round elimination completed with exactly three Android automatic routes',()=>{
  assert.equal(current.round,3);
  assert.equal(current.maxRounds,3);
  assert.equal(current.routingModel,'ANDROID_THEN_MANUAL');
  assert.deepEqual(Object.keys(current.automatic).sort(),automatic.slice().sort());
  assert.ok(Object.values(current.automatic).every(v=>v==='ANDROID'));
});

test('five unresolved features are manual after round 3',()=>{
  assert.deepEqual(current.manual.slice().sort(),manual.slice().sort());
  assert.deepEqual(r3.manualAfterRound3.slice().sort(),manual.slice().sort());
  assert.ok(r3.results.every(x=>x.decision==='MANUAL_AFTER_ROUND_3'));
});

test('round progression never reopens resolved winners',()=>{
  assert.deepEqual(r1.round1Resolved.map(x=>x.feature).sort(),automatic.slice().sort());
  assert.deepEqual(r2.round3Features.slice().sort(),manual.slice().sort());
  assert.deepEqual(r3.resolvedAutomatic.map(x=>x.feature).sort(),automatic.slice().sort());
});

test('final matrix exposes Android or manual only',()=>{
  assert.deepEqual(matrix.order,['ANDROID','MANUAL']);
  assert.deepEqual(matrix.activeAutomaticRoutes.slice().sort(),automatic.slice().sort());
  assert.deepEqual(matrix.manualAfterRound3.slice().sort(),manual.slice().sort());
  for(const f of matrix.features.filter(x=>manual.includes(x.feature))){
    assert.equal(f.android,null);
    assert.equal(f.status,'MANUAL_AFTER_ROUND_3');
  }
});
