// Resolve only the records supplied for this question. This module has no store or device interface.
import {z} from 'zod';

const operation = 'resolve_supplied_preference_revisions';

export function preferenceRevisionsSchema(zod) {
  const label = (max) => zod.string().min(1).max(max).refine(text =>
    text === text.trim() && !/[\p{C}\p{Zl}\p{Zp}〔〕]/u.test(text));
  const target = {context: label(64), item: label(64), occasion: label(64).nullish()};
  const record = zod.object({
    ...target, ref: label(48), order: zod.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullish(),
    scope: zod.enum(['standing', 'once']), action: zod.enum(['set', 'withdraw']), value: label(120).nullish()
  }).strict().refine(row => (row.scope === 'once') === (row.occasion != null),
    'A one-time record needs its occasion. A standing record applies across occasions.')
    .refine(row => row.action !== 'withdraw' || row.value == null, 'A withdrawal may not set a value.');
  return zod.object({
    preferenceQuery: zod.object(target).strict(), preferenceRecords: zod.array(record).max(32)
  }).strict();
}

const schema = preferenceRevisionsSchema(z);
const key = text => text.normalize('NFC');

function resolveScope(records) {
  if (!records.length) return {kind: 'absent', detail: '관련 기록 없음'};
  // Array order is immaterial. An undated record can be newer than every dated one.
  const latest = Math.max(-1, ...records.map(row => row.order ?? -1));
  const candidates = records.filter(row => row.order == null || row.order === latest);
  const refs = [...new Set(candidates.map(row => key(row.ref)))].sort();
  const sources = '〔' + refs.join(', ') + '〕';
  const outcomes = new Set(candidates.map(row => JSON.stringify([row.action, row.value == null ? null : key(row.value)])));
  if (outcomes.size > 1) {
    const reason = candidates.some(row => row.order == null) ? '선후 관계 확인 필요' : '같은 순서의 기록 상충';
    return {kind: 'uncertain', detail: reason + sources};
  }
  const record = candidates[0];
  if (record.action === 'withdraw') return {kind: 'withdrawn', detail: '철회됨' + sources};
  if (record.value == null) return {kind: 'uncertain', detail: '정정할 값 미기재' + sources};
  return {kind: 'set', detail: key(record.value) + sources};
}

export function resolveSuppliedPreferences(input) {
  const {preferenceQuery: query, preferenceRecords} = schema.parse(input);
  const rows = preferenceRecords.filter(row => key(row.context) === key(query.context) && key(row.item) === key(query.item));
  const standing = resolveScope(rows.filter(row => row.scope === 'standing'));
  const title = '제공 기록 기준 ' + query.context + '의 ' + query.item + '. ';
  const result = {operation};
  if (query.occasion == null) {
    result.text = title + '기본 선호 ' + standing.detail + '.';
    if (standing.kind === 'uncertain' || standing.kind === 'absent') result.availability = 'unavailable';
    return result;
  }

  const once = resolveScope(rows.filter(row => row.scope === 'once' && key(row.occasion) === key(query.occasion)));
  result.text = title + '기본 선호 ' + standing.detail + '. ' + query.occasion + ' 일회 지시 ' + once.detail + '. ';
  if (once.kind === 'set') {
    result.text += '이번 적용값 ' + once.detail + '.';
  } else if (once.kind === 'uncertain') {
    result.text += '이번 적용값 확인 필요.';
    result.availability = 'unavailable';
  } else if (standing.kind === 'set') {
    result.text += '이번 적용값 ' + standing.detail + '.';
  } else {
    result.text += standing.kind === 'withdrawn' ? '적용할 기본 선호가 철회됐습니다.' : '이번 적용값 확인 필요.';
    if (standing.kind !== 'withdrawn') result.availability = 'unavailable';
  }
  return result;
}
