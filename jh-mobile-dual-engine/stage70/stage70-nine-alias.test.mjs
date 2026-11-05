import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const m=read('./alias-matrix.json');
const p=read('./continuous-e2e-plan.json');
const e2e=read('./continuous-e2e-result.json');
const current=read('./current.json');
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
  assert.equal(s69.status,'COMPLETE');
});

test('Stage67 final matrix retains only three Android winner implementations',()=>{
  assert.deepEqual(s67.activeAutomaticRoutes.slice().sort(),['BACK','WAIT_CONDITION','SCREENSHOT'].sort());
  assert.ok(s67.features.every(x=>x.playwrightMobile===null));
});

test('continuous E2E requires same-id Stage44 focus before multi-step work',()=>{
  assert.equal(p.commandFocus.required,true);
  assert.equal(p.commandFocus.sequence.length,3);
  assert.match(p.commandFocus.sequence[0],/BEGIN_COMMAND/);
  assert.match(p.commandFocus.sequence[1],/BEGIN/);
  assert.match(p.commandFocus.sequence[1],/identical request_id/);
  assert.match(p.commandFocus.sequence[2],/exact command_id/);
});

test('focused continuous E2E excludes failed routes and covers approved handoff path',()=>{
  const excluded=new Set(p.excludedFromContinuousE2E);
  assert.ok(excluded.has('life_web_select'));
  assert.ok(excluded.has('life_web_press_key'));
  assert.ok(excluded.has('NESTED_VERTICAL_SCROLL'));
  assert.ok(excluded.has('HORIZONTAL_SCROLL'));
  assert.ok(excluded.has('RETURN_TO_CHROME_FROM_OTHER_APP'));
  assert.match(p.screenshot,/do not repeat/i);
  assert.equal(p.steps.length,8);
  assert.equal(e2e.status,'VERIFIED_PASS');
  assert.equal(e2e.crossEngineContinuity,'WEB -> ANDROID -> WEB verified within one focused command');
  assert.equal(e2e.playwrightMobileUsed,false);
  assert.equal(e2e.failedStage69RoutesReplayed,false);
  assert.equal(e2e.screenshotRepeated,false);
});

test('unfocused preflight failure was no-effect and focused run verifies wait click type and back',()=>{
  assert.equal(e2e.preflightFinding.withoutFocusedBegin,'FAILED_PRE_DISPATCH');
  assert.equal(e2e.preflightFinding.commandLifecycleCause,'NEW_BEGIN_COMMAND');
  assert.equal(e2e.preflightFinding.verifiedPhoneEffect,false);
  const results=new Map(e2e.focusedRun.map(x=>[x.step,x]));
  assert.equal(results.get('WAIT_CONDITION')?.conditionVerified,true);
  assert.equal(results.get('VISIBLE_SAFE_BUTTON_CLICK')?.readback,'click-count 0 -> 1');
  assert.equal(results.get('VISIBLE_TEXT_TYPE')?.valueVerified,true);
  assert.equal(results.get('WEB_READ_AFTER_ANDROID')?.result,'captured index page');
});

test('Stage70 final state is sealed and no Playwright Mobile route is active',()=>{
  assert.equal(current.status,'COMPLETE');
  assert.equal(current.stage69,'COMPLETE');
  assert.equal(current.nineAliasProfile,'LOCKED');
  assert.equal(current.focusedContinuousE2E,'VERIFIED_PASS');
  assert.equal(current.playwrightMobileActiveRoutes,0);
  assert.equal(current.next,'UNIFIED_ENGINE_BASELINE_READY');
});

test('no-replay outcomes include both effectful and unknown effects',()=>{
  for(const code of ['FAILED_AFTER_EFFECT','EFFECT_UNKNOWN','PENDING','UNKNOWN']){
    assert.ok(m.noReplayOn.includes(code));
  }
});
