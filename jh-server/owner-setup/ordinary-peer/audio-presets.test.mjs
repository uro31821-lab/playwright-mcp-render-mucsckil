import assert from 'node:assert/strict';
import test from 'node:test';
import {z} from 'zod';
import {audioPresetsSchema, compareAudioPresets} from './audio-presets.mjs';

const entry = (item, value, unit) => ({item, value, unit});
const source = (items, first, second) => ({
  audioItems: items,
  presets: [{ref: '솔', entries: first}, {ref: '돌', entries: second}]
});
const run = (items, first, second) => compareAudioPresets(source(items, first, second));

test('compares entries from the requested band only and reports a missing reading separately', () => {
  const out = run(['음량','125 Hz'], [entry('음량',40,'%'), entry('125 Hz',3,'dB')], [entry('125 Hz',0,'dB')]);
  assert.deepEqual(out, {operation:'compare_supplied_audio_presets',
    text:'제공된 두 음향 설정 기록의 요청 항목입니다. 음량〔솔 40% / 돌 미기재 / 대조 보류〕. 125 Hz〔솔 3 dB / 돌 0 dB / 표기값 다름〕.'});
  const missing = run(['음량'], [entry('125 Hz',-6,'dB')], []);
  assert.equal(missing.availability, 'unavailable');
  assert.match(missing.text, /솔 미기재 \/ 돌 미기재 \/ 대조 보류/u);
});

test('equal frequencies across Hz and kHz are compared without rounding; channel and filter labels stay separate', () => {
  for (const [first,second] of [['1 kHz','1000 Hz'],['0.0125kHz','12.50hz'],['000.0010 KHZ','1HZ'],['0.0000000000001kHz','0.0000000001 Hz']]) {
    const out = run([first],[entry(first,-2.5,'dB')],[entry(second,-2.5,'dB')]);
    assert.match(out.text,/솔 -2\.5 dB \/ 돌 -2\.5 dB \/ 표기값 동일/u);
  }
  const different = run(['1 kHz'], [entry('1 kHz',-1,'dB')], [
    entry('1.0000000000001 kHz',-1,'dB'),entry('1 kHz 오른쪽',-1,'dB'),entry('중음',-1,'dB'),
    entry('1 kHz Q=2',-1,'dB'),entry('1~2 kHz',-1,'dB')]);
  assert.match(different.text,/돌 미기재/u);
  assert.throws(()=>run(['1 kHz','1000Hz'],[],[]),/DUPLICATE_REQUESTED_AUDIO_ITEM/);
});

test('incomparable units and undocumented ordinal scales never imply equal gain', () => {
  const mixed = run(['음량','1kHz','강도'],
    [entry('음량',2,'%'),entry('1 kHz',0,'dB'),entry('강도',5,'단계')],
    [entry('음량',2,'단계'),entry('1 kHz',0,'dBFS'),entry('강도',5,'단계')]);
  assert.match(mixed.text,/2% \/ 돌 2단계 \/ 단위 다름 · 대조 보류/u);
  assert.match(mixed.text,/0 dB \/ 돌 0 dBFS \/ 단위 다름 · 대조 보류/u);
  assert.match(mixed.text,/5단계 \/ 돌 5단계 \/ 단계 척도 미확인 · 대조 보류/u);
  assert.doesNotMatch(mixed.text,/표기값 동일/u);
});

test('duplicate identical observations coalesce while conflicting, mixed or incomplete entries retain their content', () => {
  const same = entry('1kHz',3,'dB');
  assert.match(run(['1 kHz'],[same,entry('1000Hz',3,'dB')],[same]).text,/솔 3 dB \/ 돌 3 dB \/ 표기값 동일/u);
  const conflict = run(['1 kHz'], [same,entry('1000Hz',6,'dB')],[same]);
  assert.match(conflict.text,/솔 상충\(3 dB, 6 dB\) \/ 돌 3 dB \/ 대조 보류/u);
  const uncertain = run(['1 kHz'], [same,entry('1000Hz',6,null)],[entry('1 KHz',null,'dB')]);
  assert.match(uncertain.text,/복수 표기 확인 필요\(3 dB, 6 \(단위 미기재\)\) \/ 돌 값 미기재\(dB\) \/ 대조 보류/u);
  assert.doesNotMatch(uncertain.text,/상충/u);
  assert.equal(uncertain.availability,'unavailable');
});

test('a zero reading is observed, a null value and a missing unit are distinct', () => {
  const out = run(['음량','고음','저음'],[entry('음량',0,'%'),entry('고음',null,null),entry('저음',3,null)],[]);
  assert.equal(out.availability,undefined);
  assert.match(out.text,/음량〔솔 0%/u);
  assert.match(out.text,/고음〔솔 값·단위 미기재/u);
  assert.match(out.text,/저음〔솔 3 \(단위 미기재\)/u);
});

test('validates the public schema and rejects action fields, invalid levels and duplicate sources', () => {
  const schema = audioPresetsSchema(z);
  const good = source(['음량'],[entry('음량',35.5,'%')],[]);
  assert.ok(schema.safeParse(good).success);
  for (const bad of [
    {...good, deviceId:'test'}, {...good, start:true}, {...good, audioItems:[]}, {...good, presets:[good.presets[0]]},
    {...good, presets:[{...good.presets[0], action:'set'},good.presets[1]]},
    source(['음량'], [entry('음량',-1,'%')],[]),source(['음량'],[entry('음량',101,'%')],[]),
    source(['음량'], [entry('음량',NaN,'dB')],[]),source(['음량'],[entry('음량',Infinity,'dB')],[]),
    source(['음량'], [entry('음량',4,'bogus')],[]),source(['음량'],[entry('음량',4,undefined)],[])
  ]) assert.equal(schema.safeParse(bad).success,false);
  good.presets[1].ref = good.presets[0].ref;
  assert.throws(()=>compareAudioPresets(good),/SAME_PRESET_REFERENCE/);
});

test('all 441 single-setting record pairs distinguish scores, units and missing observations', () => {
  // Expected labels derive from the fixture domain, separately from key lookup and display.
  const possible = [null,...['dB','dBFS','%','단계',null].flatMap(unit=>[0,2,3,null].map(value=>({unit,value})))];
  assert.equal(possible.length**2,441);
  for (const left of possible) for (const right of possible) {
    const first = left ? [{item:'기준',...left}] : [];
    const second = right ? [{item:'기준',...right}] : [];
    const result = run(['기준'],first,second);
    const complete = [left,right].every(r=>r && r.value !== null && r.unit !== null);
    let expected = '대조 보류';
    if (complete) {
      if (left.unit !== right.unit) expected = '단위 다름 · 대조 보류';
      else if (left.unit === '단계') expected = '단계 척도 미확인 · 대조 보류';
      else expected = left.value === right.value ? '표기값 동일' : '표기값 다름';
    }
    assert.ok(result.text.endsWith('/ '+expected+'〕.'), result.text);
    const hasReading = [left,right].some(r=>r && r.value !== null && r.unit !== null);
    assert.equal(result.availability, hasReading ? undefined : 'unavailable');
  }
});
