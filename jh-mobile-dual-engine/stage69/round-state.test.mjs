import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const r1=JSON.parse(fs.readFileSync(new URL('./round1-result.json',import.meta.url),'utf8'));
const r2=JSON.parse(fs.readFileSync(new URL('./round2-result.json',import.meta.url),'utf8'));
const r3=JSON.parse(fs.readFileSync(new URL('./round3-current.json',import.meta.url),'utf8'));
test('round progression preserves three resolved Android winners',()=>{
 assert.deepEqual(r1.round1Resolved,[
  {feature:'BACK',winner:'ANDROID'},
  {feature:'WAIT_CONDITION',winner:'ANDROID'},
  {feature:'SCREENSHOT',winner:'ANDROID'}
 ]);
});
test('only five features reach round 3',()=>{
 assert.deepEqual(r2.round3Features,r3.remaining);
 assert.equal(r3.remaining.length,5);
});
