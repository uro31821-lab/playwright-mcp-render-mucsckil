import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {compareCameraPlans, cameraPlansSchema} from './camera-plans.mjs';

const portrait = {field: 'orientation', value: 'portrait'};
const center = {field: 'subjectPosition', value: 'center'};
const wide = {field: 'framing', value: 'wide'};
const row = (field, value, quote) => ({field, value, quote});
function source(first, second, cameraCriteria = [portrait]) {
  return {cameraCriteria, plans: [{ref: '소나무', settings: first}, {ref: '유채', settings: second}]};
}

test('compares the requested composition, subject position and orientation against each named source', () => {
  const input = source([row('subjectPosition', 'center', '표지를 한가운데 두기'), row('orientation', 'portrait', '기기 세로'), row('framing','wide','진열대 전체')],
    [row('orientation','landscape','가로'),row('framing','medium','허리 위로')], [wide,portrait,center]);
  const result = compareCameraPlans(input);
  assert.deepEqual(result, {operation:'compare_supplied_camera_plans', text:
    '제공된 두 촬영안 기준입니다. 소나무〔종합 일치. 촬영 범위 넓게 요청: 일치 (넓게 "진열대 전체") / 사진 방향 세로 요청: 일치 (세로 "기기 세로") / 화면 속 피사체 위치 중앙 요청: 일치 (중앙 "표지를 한가운데 두기")〕. 유채〔종합 불일치. 촬영 범위 넓게 요청: 불일치 (중간 "허리 위로") / 사진 방향 세로 요청: 불일치 (가로 "가로") / 화면 속 피사체 위치 중앙 요청: 확인 필요 (미기재)〕.'});
});

test('one missing dimension keeps a partially documented plan undecided', () => {
  const actual = compareCameraPlans(source([row('orientation','portrait','세로로 고정')],
    [row('orientation','portrait','세로'),row('subjectPosition',null,'위치는 추후 결정')], [portrait,center]));
  assert.equal(actual.availability, undefined);
  assert.match(actual.text,/소나무〔종합 확인 필요\..+미기재/);
  assert.match(actual.text,/유채〔종합 확인 필요\..+표기 불명 "위치는 추후 결정"/);
});

test('contradictory source lines never select one value even when the matching line is repeated', () => {
  const a=row('orientation','portrait','세로'), b=row('orientation','landscape','가로');
  for (const entries of [[a,a,b],[b,a,a]]) {
    const result=compareCameraPlans(source(entries,[row('framing','close','얼굴만') ]));
    assert.equal(result.availability,'unavailable');
    assert.match(result.text,/종합 확인 필요\. 사진 방향 세로 요청: 확인 필요 \(상충/);
    assert.equal((result.text.match(/"세로"/g)??[]).length,1);
    assert.match(result.text,/유채〔종합 확인 필요\. 사진 방향 세로 요청: 확인 필요 \(미기재\)/);
  }
});

test('all unknown, empty or unrequested settings do not confirm a comparison', () => {
  for (const values of [[],[row('orientation',null,'방향은 현장에서 결정')],
      [row('orientation',null,'방향 미확정'),row('orientation','portrait','세로 모드 제안')], [row('subjectPosition','right','오른쪽')]]) {
    assert.equal(compareCameraPlans(source(values,[])).availability,'unavailable');
  }
});

test('a corrected note is reflected only in the current revision while the other plan is retained', () => {
  const a=row('orientation','portrait','세로 준비'), b=row('orientation','landscape','가로 전환');
  const before=source([a],[]); const saved=structuredClone(before);
  const oldAnswer=compareCameraPlans(before);
  const corrected=compareCameraPlans(source([a],[b]));
  assert.ok(oldAnswer.text.includes('유채〔종합 확인 필요'));
  assert.ok(corrected.text.includes('유채〔종합 불일치'));
  assert.equal(oldAnswer.text.split('유채〔')[0],corrected.text.split('유채〔')[0]);
  assert.deepEqual(before,saved);
  assert.deepEqual(compareCameraPlans(before),oldAnswer);
});

test('inputs are limited to written settings with valid cross-field values', () => {
  const schema=cameraPlansSchema(z); const good=source([row('orientation','portrait','요청: "세로"')],[]);
  assert.ok(schema.safeParse(good).success);
  const replaceFirstRow=overrides=>source([{...good.plans[0].settings[0],...overrides}],[]);
  const invalid=[{...good,deviceId:'phone'}, {...good,cameraCriteria:[]},{...good,plans:[good.plans[0]]}, {...good,cameraCriteria:[{...portrait,value:null}]},
    replaceFirstRow({field:'dubious'}),replaceFirstRow({value:'center'}),replaceFirstRow({quote:' '}) ,replaceFirstRow({quote:'한줄\n두줄'}),replaceFirstRow({quote:'〔근거〕'}),replaceFirstRow({quote:'x'.repeat(97)}),replaceFirstRow({apply:true}),
    {...good,plans:good.plans.map(p=>({...p,settings:Array(13).fill(good.plans[0].settings[0])}))}];
  for (const input of invalid) {assert.equal(schema.safeParse(input).success,false);assert.throws(()=>compareCameraPlans(input));}
  assert.throws(()=>compareCameraPlans({...good,plans:[good.plans[0],{ref:'소나무'.normalize('NFD'),settings:[]}]}),/SAME_CAMERA_PLAN_REFERENCE/);
  assert.throws(()=>compareCameraPlans({...good,cameraCriteria:[portrait,{...portrait,value:'landscape'}]}),/DUPLICATE_CAMERA_CRITERION/);
});

test('confirms 7,776 ordered alternatives against independent orientation and position decisions', () => {
  // For each target combine six kinds of evidence on each requested axis. Repeat with each plan in either order.
  const unresolved='확인 필요', mismatch='불일치', match='일치';
  function variants(criterion, other) {
    const make=(v,q)=>row(criterion.field,v,q);
    const a=make(criterion.value,'요청값'),b=make(other,'대조값');
    return [[[],unresolved],[[a],match],[[a,a],match],[[b],mismatch],[[b,a],unresolved],[[make(null,'불명')],unresolved]];
  }
  let count=0;
  for(const direction of ['portrait','landscape']) for(const side of ['left','center','right']) {
    const d={field:'orientation',value:direction},s={field:'subjectPosition',value:side};
    const dVariants=variants(d,direction==='portrait'?'landscape':'portrait');
    const sVariants=variants(s,side==='center'?'right':'center');
    const alternatives=[];
    for(const [dr,dd] of dVariants)for(const [sr,sd] of sVariants){
      const expected=dd===mismatch||sd===mismatch?mismatch:dd===match&&sd===match?match:unresolved;
      alternatives.push({entries:[...dr,...sr],expected,decided:dd!==unresolved||sd!==unresolved});
    }
    for(const first of alternatives)for(const second of alternatives){
      const result=compareCameraPlans(source(first.entries,second.entries,[d,s]));
      assert.ok(result.text.includes('소나무〔종합 '+first.expected+'.'));
      assert.ok(result.text.includes('유채〔종합 '+second.expected+'.'));
      assert.equal(result.availability===undefined,first.decided||second.decided);
      count++;
    }
  }
  assert.equal(count,7776);
});
