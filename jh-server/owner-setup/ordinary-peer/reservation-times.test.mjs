import assert from 'node:assert/strict';
import test from 'node:test';
import {z} from 'zod';
import {compareReservationTimes, reservationTimesSchema} from './reservation-times.mjs';

const day = '2026-11-28';
const standard = {day, earliestStart:'14:00', latestEnd:'15:00'};
const slot = (ref, start, end, date = day) => ({ref, day: date, start, end});
const compare = (slots, window = standard) => compareReservationTimes({window, slots});
function decision(result, ref) {
  const content = result.text.split(ref + '〔')[1]?.split('〕')[0];
  assert.ok(content, 'missing entry ' + ref);
  const state = content.match(/, (적합|불일치|확인 필요) \(/);
  assert.ok(state, 'missing decision for ' + ref);
  return state[1];
}

test('compares whole supplied sessions and retains names and times on one shared clock', () => {
  const rows = [slot('달빛', '14:00','15:00'), slot('노을','13:59','14:30'), slot('파도','14:30','15:01'), slot('별빛','14:15',null)];
  const result = compare(rows);
  assert.equal(result.operation, 'compare_supplied_reservation_times');
  assert.equal(result.availability, undefined);
  assert.deepEqual(rows.map(row => decision(result, row.ref)), ['적합','불일치','불일치','확인 필요']);
  assert.match(result.text, /별빛〔2026-11-28, 14:15~종료 미기재/);
  assert.match(result.text, /잔여석 조회·예약 접수는 수행하지 않았습니다/);
  assert.deepEqual(compare([...rows].reverse()).text.split('〔').length, rows.length + 1);
});

test('cross-checks four boundary policies against every pair of positive intervals on seven minutes', () => {
  const clock = minute => `14:${String(minute).padStart(2, '0')}`;
  let compared = 0;
  for (const includeEarliest of [true, false]) for (const includeLatest of [true, false]) {
    for (let lower = 0; lower < 6; lower++) for (let upper = lower + 1; upper < 7; upper++) {
      const window = {day, earliestStart: clock(lower), latestEnd: clock(upper), includeEarliest, includeLatest};
      const expected = new Map();
      const rows = [];
      for (let start = 0; start < 6; start++) for (let end = start + 1; end < 7; end++) {
        const ref = `회차${start}-${end}`;
        rows.push(slot(ref, clock(start), clock(end)));
        // Independent discrete model: first and last minute must belong to the allowed endpoint sets.
        const starts = Array.from({length: 7}, (_, i) => i).slice(lower + Number(!includeEarliest));
        const ends = Array.from({length: 7}, (_, i) => i).slice(0, upper + Number(includeLatest));
        expected.set(ref, starts.includes(start) && ends.includes(end) ? '적합' : '불일치');
      }
      const result = compare(rows, window);
      for (const [ref, answer] of expected) { assert.equal(decision(result, ref), answer); compared++; }
    }
  }
  assert.equal(compared, 1764);
});

test('one-sided conditions need only the supplied endpoint they constrain', () => {
  const early = {day, earliestStart:'14:00', latestEnd:null};
  const late = {day, earliestStart:null, latestEnd:'15:00'};
  assert.equal(decision(compare([slot('A','14:00',null)], early), 'A'), '적합');
  assert.equal(decision(compare([slot('A',null,'15:00')], late), 'A'), '적합');
  assert.equal(decision(compare([slot('A',null,'14:45')], early), 'A'), '확인 필요');
  assert.equal(decision(compare([slot('A','14:10',null)], late), 'A'), '확인 필요');
  assert.equal(decision(compare([slot('A','13:59',null)]), 'A'), '불일치');
  assert.equal(decision(compare([slot('A',null,'15:01')]), 'A'), '불일치');
  assert.equal(decision(compare([slot('A',null,'14:00')]), 'A'), '불일치');
  assert.equal(decision(compare([slot('A','15:00',null)]), 'A'), '불일치');
});

test('preserves date mismatch and uncertain day, cross-midnight and contradictory source rows', () => {
  const rows = [slot('다른날','14:00','15:00','2026-11-29'), slot('미상','14:00','15:00',null),
    slot('익일여부','23:00','01:00'), slot('동시','14:05','14:05'), slot('심벌','14:00','15:00','same_day')];
  const result = compare(rows);
  assert.deepEqual(rows.map(r=>decision(result,r.ref)), ['불일치','확인 필요','확인 필요','확인 필요','확인 필요']);
  const shared = {...standard, day:'same_day'};
  assert.equal(decision(compare([rows[4]], shared), '심벌'), '적합');
  assert.equal(compare([slot('A','14:00','15:00')], {...standard,day:null}).availability, 'unavailable');
  assert.equal(compare([slot('A','14:00','15:00')], shared).availability, 'unavailable');
});

test('does not infer fitted sessions from empty, reversed or absent source conditions', () => {
  for (const window of [{day,earliestStart:null,latestEnd:null}, {day,earliestStart:'23:00',latestEnd:'01:00'},
    {day,earliestStart:'15:00',latestEnd:'15:00'}]) {
    assert.equal(compare([slot('A','14:00','14:30')],window).availability,'unavailable');
  }
  assert.equal(compare([]).availability, 'unavailable');
  assert.equal(compare([slot('A',null,null)]).availability, 'unavailable');
  assert.equal(compare([slot('A',null,null),slot('B','14:20','15:01')]).availability, undefined);
});

test('schema rejects invalid dates, invalid clocks, ambiguous duplicate identifiers and executable extras', () => {
  const schema = reservationTimesSchema(z);
  const run = (a, w = standard) => schema.safeParse({window:w,slots:[a]}).success;
  for (const t of ['24:00','23:60','14:3','14:00Z','x14:00',900]) assert.equal(run(slot('A',t,'15:01')),false);
  for (const d of ['2026-02-29','2026-00-02','2024-12-32','2026-1-01']) assert.equal(run(slot('A','14:20','14:30',d)),false);
  assert.ok(run(slot('A','14:20','14:30','2024-02-29')));
  assert.equal(run({...slot('A','14:20','15:01'), confirmBooking:true}),false);
  assert.equal(run(slot('A','14:20','15:01'), {...standard, timezone:'mixed'}),false);
  assert.equal(run(slot('A','14:20','15:01'), {...standard, includeLatest:'true'}),false);
  for (const ref of ['', ' A', 'A\nB', 'A〔적합〕']) assert.equal(run(slot(ref,'14:00','14:30')),false);
  assert.throws(()=>compare([slot('솜','14:00','14:30'),slot('솜'.normalize('NFD'),'14:00','14:30')]), /DUPLICATE_SLOT_REFERENCE/);
});
