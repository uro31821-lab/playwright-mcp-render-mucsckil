// Evaluate only the records supplied for this particular direction and use case.
import {z} from 'zod';
import {cooperationReviewSchema} from './cooperation-review-schema.mjs';

const schema = cooperationReviewSchema(z);
const operation = 'review_supplied_cooperation';

function assessments(records) {
  const claims = new Map();
  for (const record of records) {
    if (!['helpful','unhelpful'].includes(record.outcome) || !record.outcomeRef || !record.outcomeNote) continue;
    const key = JSON.stringify([record.task, record.outcomeRef]);
    if (!claims.has(key)) claims.set(key, new Map());
    const byVerdict = claims.get(key);
    if (!byVerdict.has(record.outcome)) byVerdict.set(record.outcome, new Set());
    byVerdict.get(record.outcome).add(record.outcomeNote);
  }
  const helpful = new Map();
  const unhelpful = new Map();
  let conflicts = 0;
  for (const [key, byVerdict] of claims) {
    if (byVerdict.size !== 1) {
      conflicts++;
      continue;
    }
    const [task, ref] = JSON.parse(key);
    const [verdict, notes] = byVerdict.entries().next().value;
    const tasks = verdict === 'helpful' ? helpful : unhelpful;
    if (!tasks.has(task)) tasks.set(task, new Map());
    tasks.get(task).set(ref, [...notes].sort().join(' · '));
  }
  return {helpful, unhelpful, conflicts};
}

function examples(byTask) {
  const result = [];
  for (const [task, refs] of byTask) {
    for (const [ref, note] of refs) result.push(task + '〔' + ref + '〕 ' + note);
  }
  return result.sort().join(' / ');
}

export function reviewSuppliedCooperation(input) {
  const {route, workRecords} = schema.parse(input);
  const matching = workRecords.filter(row =>
    row.from === route.from && row.to === route.to && row.context === route.context);
  const trials = matching.filter(row => row.source === 'trial');
  const completed = matching.filter(row => row.source === 'field' && row.returned === true);
  const unresolved = matching.length - trials.length - completed.length;
  const tasks = [...new Set(completed.map(row => row.task))].sort();
  const {helpful, unhelpful, conflicts} = assessments(completed);
  const text = ['제공 기록 기준 「' + route.context + '」(' + route.from + ' → ' + route.to + ').'];
  const identities = tasks.length ? '(' + tasks.join(', ') + ')' : '';
  text.push('실제 업무로 표시된 기록에서 독립 업무 ' + tasks.length + '건' + identities +
    ', 동일 업무 중복 기록 ' + (completed.length - tasks.length) + '건, 확인된 이득 ' + helpful.size + '건.');
  if (helpful.size) text.push('이득 근거 ' + examples(helpful) + '.');
  if (unhelpful.size) text.push('반례 ' + unhelpful.size + '건. 반례 근거 ' + examples(unhelpful) + '.');
  if (conflicts) text.push('같은 업무와 근거에서 효과가 엇갈린 기록 ' + conflicts + '건은 효과 집계에서 제외했습니다.');
  if (trials.length) text.push('시험 기록 ' + trials.length + '건 제외.');
  if (unresolved) text.push('실제 여부나 회신 완료가 확인되지 않은 기록 ' + unresolved + '건 제외.');
  if (workRecords.length !== matching.length) text.push('다른 방향·상황 ' + (workRecords.length - matching.length) + '건 제외.');
  if (!matching.length || (!completed.length && unresolved)) {
    text.push('이 범위의 보강 검토 여부를 정할 실제 회신 자료가 부족합니다.');
    return {operation, availability:'unavailable', text:text.join(' ')};
  }
  const qualifies = tasks.length >= 2 || helpful.size > 0;
  text.push(qualifies ? '아이디어비서·제안비서 공동 검토 기준에 해당합니다.' :
    '현재 기록으로는 공동 검토 기준에 이르지 않았습니다.');
  if (qualifies) text.push('특정 경로 보강은 주인님 승인 후 진행합니다.');
  return {operation, text:text.join(' ')};
}
