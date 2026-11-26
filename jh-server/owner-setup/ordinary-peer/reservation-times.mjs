// Compare fixed sessions transcribed from a supplied timetable on the same local clock.
import {z} from 'zod';

const operation = 'compare_supplied_reservation_times';
const sameDay = 'same_day';

export function reservationTimesSchema(zod) {
  const day = zod.union([
    zod.literal(sameDay),
    zod.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
      const time = Date.parse(value + 'T00:00:00Z');
      return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
    })
  ]).nullable();
  const clock = zod.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable();
  const ref = zod.string().min(1).max(64).refine(value =>
    value.trim() === value && !/[\p{C}\p{Zl}\p{Zp}〔〕]/u.test(value));
  return zod.object({
    window: zod.object({day, earliestStart: clock, latestEnd: clock,
      includeEarliest: zod.boolean().optional(), includeLatest: zod.boolean().optional()
    }).strict(),
    slots: zod.array(zod.object({ref, day, start: clock, end: clock}).strict()).max(24)
  }).strict();
}

const schema = reservationTimesSchema(z);

function dayLabel(day) {
  return day === sameDay ? '같은 날' : (day ?? '날짜 미상');
}

function status(window, slot) {
  const {day, earliestStart, latestEnd, includeEarliest = true, includeLatest = true} = window;
  if (!day || !slot.day || ((day === sameDay) !== (slot.day === sameDay))) {
    return ['확인 필요', '날짜 관계 미확인'];
  }
  if (day !== slot.day) return ['불일치', '날짜 다름'];
  if (slot.start && slot.end && slot.end <= slot.start) return ['확인 필요', '회차 시작·종료의 날짜 또는 순서 확인'];

  const reasons = [];
  if (earliestStart && slot.start && (slot.start < earliestStart || (!includeEarliest && slot.start === earliestStart))) {
    reasons.push('시작 조건 벗어남');
  }
  if (latestEnd && slot.end && (slot.end > latestEnd || (!includeLatest && slot.end === latestEnd))) {
    reasons.push('종료 조건 벗어남');
  }
  if (reasons.length) return ['불일치', reasons.join(', ')];
  // Fixed sessions have a positive duration: a known endpoint can disqualify a session on its own.
  if (latestEnd && slot.start && slot.start >= latestEnd) return ['불일치', '시작이 종료 한계에 도달'];
  if (earliestStart && slot.end && slot.end <= earliestStart) return ['불일치', '종료가 시작 한계보다 늦지 않음'];
  if (earliestStart && !slot.start) return ['확인 필요', '회차 시작 미기재'];
  if (latestEnd && !slot.end) return ['확인 필요', '회차 종료 미기재'];
  return ['적합', '제공된 시간 조건 충족'];
}

export function compareReservationTimes(input) {
  const {window, slots} = schema.parse(input);
  if (new Set(slots.map(slot => slot.ref.normalize('NFC'))).size !== slots.length) throw Error('DUPLICATE_SLOT_REFERENCE');
  const unresolved = text => ({operation, availability: 'unavailable', text});
  if (!window.earliestStart && !window.latestEnd) return unresolved('시작 또는 종료에 대한 사용자 시간 조건이 필요합니다.');
  if (window.earliestStart && window.latestEnd && window.earliestStart >= window.latestEnd) {
    return unresolved('같은 날의 시작·종료 조건으로 양의 길이의 회차를 비교할 수 없습니다. 날짜와 시각을 확인해 주세요.');
  }
  if (!slots.length) return unresolved('제공된 회차표에 비교할 회차가 없습니다.');

  const limits = [dayLabel(window.day)];
  if (window.earliestStart) limits.push('시작 ' + window.earliestStart + (window.includeEarliest === false ? ' 초과' : ' 이상'));
  if (window.latestEnd) limits.push('종료 ' + window.latestEnd + (window.includeLatest === false ? ' 미만' : ' 이하'));
  let determined = false;
  const rows = slots.map(slot => {
    const [decision, reason] = status(window, slot);
    if (decision !== '확인 필요') determined = true;
    return `${slot.ref}〔${dayLabel(slot.day)}, ${slot.start ?? '시작 미기재'}~${slot.end ?? '종료 미기재'}, ${decision} (${reason})〕.`;
  });
  const text = '제공된 회차표 기준(' + limits.join(', ') + ')입니다. ' + rows.join(' ') + ' 잔여석 조회·예약 접수는 수행하지 않았습니다.';
  return determined ? {operation, text} : unresolved(text);
}
