import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateNostalgiaAges} from './nostalgia-ages.mjs';

const operation = 'korean_counting_age_at_record';
const row = (label, year) => ({label, year});
const calculate = (birthYear, ...records) => calculateNostalgiaAges({birthYear, records});

test('first broadcast and later viewing retain separate source years and ages', () => {
  const result = calculate(1971, row('잔물결 첫 방송', 1995), row('잔물결을 다시 본 해', 2002));
  assert.deepEqual(result, {operation, text:
    '1971년생 기준입니다. 「잔물결 첫 방송」(1995년) 당시 세는나이는 25살입니다. ' +
    '「잔물결을 다시 본 해」(2002년) 당시 세는나이는 32살입니다.'});
  assert.equal(calculate(1990, row('잔물결 첫 방송', 1995)).text,
    '1990년생 기준입니다. 「잔물결 첫 방송」(1995년) 당시 세는나이는 6살입니다.');
});

test('a year before birth and the birth year do not imply attendance or having been born already', () => {
  const result = calculate(1971, row('잔물결 첫 방송', 1970), row('바람 원곡 발매', 1971));
  assert.deepEqual(result, {operation, text:
    '1971년생 기준입니다. 「잔물결 첫 방송」(1970년)은 출생 전입니다. ' +
    '「바람 원곡 발매」(1971년)은 태어난 해입니다. 출생 후 세는나이는 1살입니다.'});
});

test('unknown source years and unknown birth years are explicit; known rows are preserved', () => {
  const partial = calculate(1971, row('첫 방영', null), row('다시 보기', 1988));
  assert.equal(partial.availability, undefined);
  assert.match(partial.text, /「첫 방영」의 연도는 미상/);
  assert.match(partial.text, /「다시 보기」\(1988년\) 당시 세는나이는 18살/);
  const noSource = calculate(1971, row('첫 방영', null));
  assert.equal(noSource.availability, 'unavailable');
  const noBirth = calculate(null, row('첫 방영', 1988));
  assert.deepEqual(noBirth, {operation, availability: 'unavailable',
    text: '출생연도가 확인되지 않았습니다. 「첫 방영」(1988년) 당시 세는나이는 미확인입니다.'});
  assert.equal(calculate(null, row('첫 방영', null)).availability, 'unavailable');
});

test('duplicate observations collapse, conflicts remain local, and their years are order-independent', () => {
  const title = '달문 재방송';
  const observations = [row(title.normalize('NFD'), 1993), row('  '+title+' ', 1993), row(title, null)];
  assert.deepEqual(calculate(1982, ...observations), calculate(1982, row(title, 1993)));
  observations.push(row(title, 1991));
  const conflict = calculate(1982, ...observations);
  assert.equal(conflict.availability, 'unavailable');
  assert.match(conflict.text, /1991년·1993년으로 엇갈려 확인이 필요/);
  assert.doesNotMatch(conflict.text, /살/);
  assert.deepEqual(calculate(1982, ...observations.toReversed()), conflict);
  const mixed = calculate(1982, ...observations, row('달문 첫 방송', 1987));
  assert.equal(mixed.availability, undefined);
  assert.match(mixed.text, /「달문 첫 방송」\(1987년\) 당시 세는나이는 6살/);
});

test('small year table checked against a counter which starts at one in the birth year', () => {
  let pairs = 0;
  for (let birth = 1969; birth <= 1985; birth++) {
    let age = 0;
    for (let year = 1965; year <= 2025; year++) {
      const result = calculate(birth, row('회상 기록', year));
      assert.equal(result.operation, operation);
      if (year < birth) {
        assert.match(result.text, /출생 전/);
        assert.doesNotMatch(result.text, /\d+살/);
      } else {
        age++;
        assert.equal(result.text.match(/(\d+)살/)?.[1], String(age));
        assert.equal(result.text.includes('태어난 해'), year === birth);
      }
      pairs++;
    }
  }
  assert.equal(pairs, 1037);
  assert.match(calculate(1, row('기록', 9999)).text, /9999살/);
  assert.match(calculate(9999, row('기록', 1)).text, /출생 전/);
});

test('only explicit years, bounded record lists and plain single-line labels are accepted', () => {
  const record = row('방영', 1988);
  for (const invalid of ['1980', 0, -1, 10000, 1990.5, true, Infinity, undefined]) {
    assert.throws(() => calculate(invalid, record));
    assert.throws(() => calculate(1971, row('첫 방영',invalid)));
  }
  const malformed = [
    null, {}, {birthYear:1971}, {records:[record]}, {birthYear:1971, records:[]},
    {birthYear:1971, records:[record], notes:'감상'}, {birthYear:1971, records:Array(7).fill(record)},
    {birthYear:1971, records:[{label:'방영'}]}, {birthYear:1971, records:[{year:1988}]},
    {birthYear:1971, records:[{...record, watched:true}]},
    ...[null, '', '  ', '새\n기록', '\t공연', '「첫 장」', '음\u202e악', '가'.repeat(49)].map(label =>
      ({birthYear:1971, records:[row(label,1988)]}))
  ];
  for (const input of malformed) assert.throws(() => calculateNostalgiaAges(input));
  assert.match(calculate(1971, row('가'.repeat(48), 2000)).text, /30살/);
  assert.ok(calculateNostalgiaAges({birthYear:1971,records:Array(6).fill(record)}).text);
});
