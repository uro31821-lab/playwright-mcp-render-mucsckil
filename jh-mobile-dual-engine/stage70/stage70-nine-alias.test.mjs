import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const m=read('./alias-matrix.json');
const p=read('./continuous-e2e-plan.json');
const s69=read('../stage69/current.json');
const s67=read('../stage67/matrix.json');

test('exactly nine legacy web aliases are classified once',()=>{
  assert.equal(m.aliases.length,9);
  assert.equal(new Set(m.aliases.map(x=>x.alias)).size,9);
  assert.deepEqual(m.aliases.map(x=>x.alias).sort(),[
    'life_web_navigate','life_web_snapshot','life_web_click','life_web_type','life_web_select',
    'life_web_press_key','life_web_wait','life_web_back','life_web_screenshot'
  ].sort());
});

test('seven aliases are automatic and select/key are manual',()=>{
  const auto=m.aliases.filter(x=>x.mode.startsWith('AUTO_'));
  const manual=m.aliases.filter(x=>x.mode==='MANUAL_AFTER_ROUND_3');
  assert.equal(auto.length,7);
  assert.equal(manual.length,2);
  assert.deepEqual(manual.map(x=>x.alias).sort(),['life_web_select','life_web_press_key'].sort());
  assert.equal(m.automaticAliasCount,7);
  assert.equal(m.manualAliasCount,2);
});

test('automatic aliases never route to Playwright Mobile',()=>{
  assert.equal(m.playwrightMobileActiveRoutes,0);
  assert.ok(m.aliases.every(x=>!String(x.route||'').includes('PLAYWRIGHT_MOBILE')));
});

test('Stage70 manual decisions agree with Stage69 final phone decisions',()=>{
  const stage69Manual=new Set(s69.manual);
  const aliasManual=m.aliases.filter(x=>x.mode==='MANUAL_AFTER_ROUND_3').map(x=>x.feature);
  for(const f of aliasManual)assert.ok(stage69Manual.has(f));
  for(const f of m.nonAliasManualFeatures)assert.ok(stage69Manual.has(f));
  assert.equal(stage69Manual.size,5);
});

test('Stage67 final matrix retains only three Android winner implementations',()=>{
  assert.deepEqual(s67.activeAutomaticRoutes.slice().sort(),['BACK','WAIT_CONDITION','SCREENSHOT'].sort());
  assert.ok(s67.features.every(x=>x.playwrightMobile===null));
});

test('continuous E2E plan excludes all failed routes and does not repeat screenshot consent',()=>{
  const excluded=new Set(p.excludedFromContinuousE2E);
  assert.ok(excluded.has('life_web_select'));
  assert.ok(excluded.has('life_web_press_key'));
  assert.ok(excluded.has('NESTED_VERTICAL_SCROLL'));
  assert.ok(excluded.has('HORIZONTAL_SCROLL'));
  assert.ok(excluded.has('RETURN_TO_CHROME_FROM_OTHER_APP'));
  assert.match(p.screenshot,/do not repeat/i);
  assert.equal(p.steps.length,6);
});

test('no-replay outcomes include both effectful and unknown effects',()=>{
  for(const code of ['FAILED_AFTER_EFFECT','EFFECT_UNKNOWN','PENDING','UNKNOWN']){
    assert.ok(m.noReplayOn.includes(code));
  }
});
