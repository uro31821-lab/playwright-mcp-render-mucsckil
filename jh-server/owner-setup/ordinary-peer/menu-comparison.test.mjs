import assert from 'node:assert/strict';
import test from 'node:test';
import {z} from 'zod';
import {compareSuppliedMenus, menuComparisonSchema} from './menu-comparison.mjs';

const operation = 'compare_supplied_menu_terms';
const prefix = '제공된 메뉴 두 건의 표기입니다. ';
const row = (item, status, quote) => ({item, status, quote});
const make = (a = [], b = [], menuItems = ['곁들임']) => ({
  menuItems, menus: [{ref: '바다표', entries: a}, {ref: '모래표', entries: b}]
});

test('기본 제공·택일·추가금·제외를 근거 문구와 함께 대조하고 미기재를 보존한다', () => {
  const a = [
    row('밥', 'included', '보리밥 한 공기 포함'), row('곁들임', 'optional', '유자무와 돌김 중 하나 선택'),
    row('차', 'extra', '차 추가 1,500원')
  ];
  const b = [row('밥', 'excluded', '밥은 구성에서 제외'), row('차', 'conditional', '매장 식사 시 차 한 잔 제공')];
  assert.deepEqual(compareSuppliedMenus(make(a, b, ['밥', '곁들임', '차'])), {operation, text: prefix +
    '밥〔바다표 기본 포함 "보리밥 한 공기 포함" / 모래표 제외 명시 "밥은 구성에서 제외"〕. ' +
    '곁들임〔바다표 선택 가능 "유자무와 돌김 중 하나 선택" / 모래표 제공된 메뉴에 기재 없음〕. ' +
    '차〔바다표 별도 비용 "차 추가 1,500원" / 모래표 조건부 "매장 식사 시 차 한 잔 제공"〕.'});
});

test('미기재·불명·한쪽 근거의 조합과 원문에 없는 재료 이름', () => {
  const unread = row('곁들임', 'unclear', '곁들임 안내 아래쪽 판독 불가');
  const different = row('곁들임 소스', 'excluded', '소스 제외');
  const res = compareSuppliedMenus(make([unread], [different]));
  assert.equal(res.availability, 'unavailable');
  assert.ok(res.text.includes('확인 필요 "곁들임 안내 아래쪽 판독 불가" / 모래표 제공된 메뉴에 기재 없음'));
  assert.doesNotMatch(res.text, /소스 제외|무료|안전|알레르기|예약/);
  assert.equal(compareSuppliedMenus(make([unread], [row('곁들임', 'excluded', '곁들임 없음')])).availability, undefined);
  assert.equal(compareSuppliedMenus(make()).availability, 'unavailable');
});

test('같은 문구의 재전사는 한 번으로, 상충·수량 불일치는 확인 필요로 남긴다', () => {
  const rowA = row('곁들임', 'included', '돌김 1장 기본 포함');
  const rowB = row('곁들임', 'excluded', '돌김 미제공');
  const rowC = row('곁들임', 'included', '돌김 2장 기본 포함');
  const answer = compareSuppliedMenus(make([rowA, rowA, rowB], [rowA, rowC]));
  assert.equal(answer.availability, 'unavailable');
  assert.match(answer.text, /바다표 서로 다른 표기 · 적용 조건 확인 필요\(기본 포함 "돌김 1장 기본 포함" \/ 제외 명시 "돌김 미제공"\)/);
  assert.match(answer.text, /모래표 서로 다른 표기 · 적용 조건 확인 필요\(기본 포함 "돌김 1장 기본 포함" \/ 기본 포함 "돌김 2장 기본 포함"\)/);
});

test('선택이라고 적힌 항목의 비용은 별도 원문에서만 읽고 가격 범위를 보존한다', () => {
  const option = row('곁들임', 'optional', '돌김 추가 선택');
  const fee = row('곁들임', 'extra', '돌김 2장 추가 시 500원');
  const answer = compareSuppliedMenus(make([option, fee], [option]));
  assert.equal(answer.availability, undefined);
  assert.equal(answer.text, prefix + '곁들임〔바다표 선택 가능 "돌김 추가 선택" · 별도 비용 "돌김 2장 추가 시 500원" / 모래표 선택 가능 "돌김 추가 선택"〕.');
});

test('정정된 원문으로 다시 계산할 때 해당 칸만 바뀌고 처음 전달된 메뉴는 보존된다', () => {
  const initial = make([row('곁들임', 'extra', '1가지 추가 300원')]);
  const before = structuredClone(initial);
  const corrected = structuredClone(initial);
  corrected.menus[1].entries.push(row('곁들임', 'included', '무 피클 기본'));
  const updated = compareSuppliedMenus(corrected);
  assert.equal(updated.text, compareSuppliedMenus(initial).text.replace('모래표 제공된 메뉴에 기재 없음', '모래표 기본 포함 "무 피클 기본"'));
  assert.deepEqual(before, initial);
});

test('유니코드 조합은 같은 이름으로 인식하며 원문과 메뉴 순서를 보존한다', () => {
  const item = '곁들임';
  const quote = '말린 귤';
  const answer = compareSuppliedMenus(make([row(item.normalize('NFD'), 'included', quote), row(item, 'included', quote.normalize('NFD'))]));
  assert.equal(answer.text, prefix + '곁들임〔바다표 기본 포함 "말린 귤" / 모래표 제공된 메뉴에 기재 없음〕.');
  const menus = make().menus.reverse();
  assert.equal(compareSuppliedMenus({menuItems:[item],menus}).text, prefix + '곁들임〔모래표 제공된 메뉴에 기재 없음 / 바다표 제공된 메뉴에 기재 없음〕.');
  const duplicate = make();
  duplicate.menus[1].ref = duplicate.menus[0].ref.normalize('NFD');
  assert.throws(() => compareSuppliedMenus(duplicate), /SAME_MENU_REFERENCE/);
  assert.throws(() => compareSuppliedMenus(make([], [], [item, item.normalize('NFD')])), /DUPLICATE_MENU_ITEM/);
});

test('빈 인용·불명확한 형식·초과 입력을 거절하고 등록 스키마와 함수의 구조 검사를 대조한다', () => {
  const entry = row('곁들임','included','귤 한 조각');
  const invalid = [
    make([row('곁들임','invented','귤 한 조각')]), make([row('곁들임','included','')]),
    make([row('곁들임','included','  ')]), make([row('곁들임','included','한 줄\n다른 줄')]),
    make([{item:'곁들임',status:'included'}]), make([Object.assign({price:0},entry)]),
    make([], [], []), make(Array(25).fill(entry)), {menus:make().menus.slice(1),menuItems:['곁들임']},
    make([], [], ['a'.repeat(49)]), {...make(),book: true}
  ];
  const publicSchema = menuComparisonSchema(z);
  for (const value of invalid) {
    assert.equal(publicSchema.safeParse(value).success, false);
    assert.throws(() => compareSuppliedMenus(value));
  }
});

test('양쪽에 없거나 1~2개 표기가 있을 때의 1,849조합을 독립 판정과 대조한다', () => {
  const rows = [
    row('곁들임','included','귤 한 조각 포함'), row('곁들임','excluded','귤 미제공'), row('곁들임','optional','귤 선택'),
    row('곁들임','extra','귤 추가 500원'), row('곁들임','conditional','매장 이용 시 귤 제공'), row('곁들임','unclear','귤 여부 판독 곤란')
  ];
  const cases = [[]];
  // 1 + 6 + 6x6 = 43 expressions, including all repeated and ordered pairs.
  for (const entry of rows) {
    cases.push([entry]);
    for (const other of rows) cases.push([entry, other]);
  }
  const hasFact = classes => {
    if (!classes.length) return false;
    if (classes.length === 1 || classes[0] === classes[1]) return classes[0].status !== 'unclear';
    return ['extra','optional'].every(code => classes.some(record => record.status === code));
  };
  let count = 0;
  for (const a of cases) {
    for (const b of cases) {
      const answer = compareSuppliedMenus(make(a, b));
      assert.equal(answer.availability !== 'unavailable', hasFact(a) || hasFact(b));
      for (const line of [...a,...b]) assert.ok(answer.text.includes(line.quote));
      count += 1;
    }
  }
  assert.equal(count, 1849);
});
