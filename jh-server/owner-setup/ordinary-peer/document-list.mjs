import {z} from 'zod';
import {documentListSchema} from './document-list-schema.mjs';

const inputSchema = documentListSchema(z);
const operation = 'compare_supplied_documents';
const rank = {'준비됨': 0, '확인 필요': 1, '조건 불충족': 2};

function validDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const instant = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

function compareDocument(req, doc, asOf) {
  const unknown = [];
  const mismatch = [];
  if (doc.read_status !== 'verified') unknown.push('보유 원문 확인 필요');
  if (!doc.document_type || !doc.subject_ref) unknown.push('보유 서류의 종류·대상 확인 필요');
  if (unknown.length) return {status: '확인 필요', ref: doc.ref, reasons: unknown};
  function compare(field, expected, actual) {
    if (expected == null) unknown.push(field + ' 요구값 미확인');
    else if (actual == null) unknown.push(field + ' 보유값 미확인');
    else if (actual !== expected) mismatch.push(field + ' 요구 ' + expected + ' / 보유 ' + actual);
  }
  for (const [key, expected] of Object.entries(req.options ?? {})) {
    compare(key, expected, Object.hasOwn(doc.options ?? {}, key) ? doc.options[key] : undefined);
  }
  if (Object.hasOwn(req, 'period')) compare('기간', req.period, doc.period);
  if (Object.hasOwn(req, 'recipient_ref')) compare('제출처', req.recipient_ref, doc.recipient_ref);
  const issued = doc.issued_on;
  const cutoff = req.issued_on_or_after;
  const expiry = doc.valid_until;
  if (issued != null && (!validDate(issued) || !asOf || issued > asOf)) unknown.push('발급일·기준일 확인 필요');
  if (Object.hasOwn(req, 'issued_on_or_after')) {
    if (!validDate(cutoff) || !asOf || cutoff > asOf) unknown.push('요구 발급일 기준 확인 필요');
    else if (!validDate(issued)) unknown.push('보유 발급일 미확인');
    else if (issued < cutoff) mismatch.push('발급일 ' + issued + ' / 요구 하한 ' + cutoff);
  }
  if (Object.hasOwn(doc, 'valid_until')) {
    if (!validDate(expiry) || !asOf || (validDate(issued) && expiry < issued)) unknown.push('유효기한·기준일 확인 필요');
    else if (expiry < asOf) mismatch.push('명시 유효기한 ' + expiry + ' 경과');
  }
  const status = unknown.length ? '확인 필요' : mismatch.length ? '조건 불충족' : '준비됨';
  return {status, ref: doc.ref, reasons: [...unknown, ...mismatch]};
}

function evaluate(req, docs, asOf, complete) {
  if (req.confirmed !== true || !req.source_ref) {
    return {status: '확인 필요', reasons: ['요구 원문 확인 필요']};
  }
  const candidates = docs.filter(d => d.read_status !== 'verified' ||
    ((!d.document_type || d.document_type === req.document_type) && (!d.subject_ref || d.subject_ref === req.subject_ref)));
  if (!candidates.length) {
    return complete ? {status: '누락', reasons: ['전체 보유 목록에 일치 자료 없음']} :
      {status: '확인 필요', reasons: ['제공된 보유 목록에 일치 자료 없음']};
  }
  // Prefer a verified matching copy to an uncertain or unsuitable one even if it appears last.
  // Break ties on the source ref so permuting the same papers cannot change the cited evidence.
  const evaluations = candidates.map(doc => compareDocument(req, doc, asOf));
  evaluations.sort((a, b) => rank[a.status] - rank[b.status] || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  return evaluations[0];
}

export function assessDocumentList(input) {
  const data = inputSchema.parse(input);
  const {requirements, documents, as_of: asOf} = data;
  if (asOf != null && !validDate(asOf)) throw Error('INVALID_AS_OF_DATE');
  if (new Set(requirements.map(r => r.id)).size !== requirements.length ||
      new Set(documents.map(d => d.ref)).size !== documents.length) throw Error('DUPLICATE_DOCUMENT_REFERENCE');
  if (!requirements.length) return {operation, availability: 'unavailable', text: '대조할 요구 서류 원문을 확인해 주세요.'};
  let determined = false;
  const rows = requirements.map(req => {
    const result = evaluate(req, documents, asOf, data.inventory_complete === true);
    if (result.status !== '확인 필요') determined = true;
    const source = '요구 ' + (req.source_ref ?? '미확인') + (result.ref ? ' / 보유 ' + result.ref : '');
    const reasons = result.reasons.length ? '(' + result.reasons.join(', ') + ')' : '';
    return req.document_type + '(' + req.subject_ref + ')〔' + source + '〕 ' + result.status + reasons + '.';
  });
  const partialRequirements = data.requirements_complete === false ? ' 제공된 요구 목록은 일부이며, 추가 요구 항목은 확인이 필요합니다.' : '';
  const text = '제공된 요구·보유 목록 기준입니다. ' + rows.join(' ') + partialRequirements;
  return determined ? {operation, text} : {operation, availability: 'unavailable', text};
}
