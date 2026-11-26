// Read only the terms explicitly labelled in the supplied notice excerpts.
// The caller supplies document identity and correction links from those excerpts.
const operation = 'notice_current_terms';
const fields = ['대상', '제출기한', '제출처'];
const names = new Map([
  ['대상', '대상'], ['제출대상', '대상'], ['적용대상', '대상'],
  ['기한', '제출기한'], ['제출기한', '제출기한'], ['제출마감', '제출기한'],
  ['제출처', '제출처'], ['제출장소', '제출처'], ['안내상태', '안내상태'], ['문서상태', '안내상태']
]);
const clearOrUnknown = /^(?:삭제|철회|취소|미정|미확인|미기재|미표기|확인\s*필요|별도\s*안내|추후\s*(?:공[지시]|안내|확정)|[?？—-]+)$/u;
const neutralLabels = new Set(['제목','안내명','행사명','발행일','작성일','행사일','문의처']);
const label = text => typeof text === 'string' && text.trim() === text && text.length > 0 &&
  [...text].length <= 64 && !/[\p{C}〔〕「」“”]/u.test(text);
const unavailable = text => ({operation, availability: 'unavailable', text});

export function orderedSources(docs) {
  const byRef = new Map(), next = new Map();
  let original;
  for (const doc of docs) {
    if (byRef.has(doc.ref)) return null;
    byRef.set(doc.ref, doc);
    if (doc.corrects === undefined) {
      if (original) return null;
      original = doc;
    } else {
      if (next.has(doc.corrects)) return null;
      next.set(doc.corrects, doc);
    }
  }
  const chain = [];
  for (let doc = original; doc; doc = next.get(doc.ref)) chain.push(doc);
  // A disconnected root, fork, missing predecessor or cycle has no single supported revision.
  return chain.length === docs.length ? chain : null;
}

function readTerms(source) {
  const terms = new Map();
  for (const line of source.text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const pair = /^\s*([^:：]{1,30})[:：](.*)$/u.exec(line);
    if (!pair) return null; // A free-form clause could qualify an otherwise labelled term.
    const key = pair[1].replace(/\s+/gu, '');
    const value = pair[2].trim();
    if (key === '문서번호' || key === '정정대상문서번호') {
      if (value !== (key === '문서번호' ? source.ref : source.corrects)) return null;
      continue;
    }
    if (neutralLabels.has(key)) continue;
    const field = names.get(key);
    if (!field) return null; // An unknown exception or amendment may change a labelled fact.
    // Joined fields may have been wrapped incorrectly. Never assign the whole line to one field.
    if (/(?:대상|기한|마감|제출\s*처|제출\s*장소|안내\s*상태|문서\s*상태)\s*[:：]/u.test(value)) return null;
    if (terms.has(field) && terms.get(field).value !== value) {
      terms.set(field, {ref:source.ref, ambiguous:true});
    } else {
      terms.set(field, {ref:source.ref, value});
    }
  }
  return terms;
}

export function reviewNotice(input) {
  if (!input || !label(input.noticeId) || !Array.isArray(input.documents) ||
      input.documents.length < 1 || input.documents.length > 12) throw Error('INVALID_NOTICE_INPUT');
  for (const doc of input.documents) {
    if (!doc || !label(doc.ref) || !label(doc.noticeId) || typeof doc.text !== 'string' ||
        !doc.text.trim() || [...doc.text].length > 1200 ||
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(doc.text) ||
        (doc.corrects === undefined ? doc.mode !== undefined : !label(doc.corrects) ||
         !['amend','replace'].includes(doc.mode))) throw Error('INVALID_NOTICE_DOCUMENT');
  }
  const title = '제공된 「'+input.noticeId+'」 안내';
  const docs = input.documents.filter(doc => doc.noticeId === input.noticeId);
  if (!docs.length) return unavailable(title+'에 해당하는 원문을 확인할 수 없습니다.');
  const chain = orderedSources(docs);
  if (!chain) return unavailable(title+'의 원본과 정정본 연결을 하나로 정할 수 없습니다. 문서번호와 정정 대상을 확인해 주세요.');

  let current = new Map(), withdrawn;
  for (const doc of chain) {
    const parsed = readTerms(doc);
    if (!parsed) return unavailable(title+'의 「'+doc.ref+'」에서 그대로 적용할 수 없는 문구가 있어 현재 조건을 확인할 수 없습니다.');
    if (doc.mode === 'replace') { current.clear(); withdrawn = undefined; }
    const status = parsed.get('안내상태');
    if (status) {
      if (!['취소','철회','폐지'].includes(status.value)) {
        return unavailable(title+'의 「'+doc.ref+'」에서 안내 효력을 확인할 수 없습니다.');
      }
      withdrawn = doc.ref;
      current.clear();
      continue;
    }
    if (withdrawn) return unavailable(title+'의 철회 후 부분 정정만 확인됩니다. 유효한 대체 안내를 확인해 주세요.');
    if (doc.mode === 'amend' && parsed.size === 0)
      return unavailable(title+'의 「'+doc.ref+'」에서 정정한 항목을 확인할 수 없습니다.');
    for (const [field, term] of parsed) current.set(field, term);
  }
  if (withdrawn) return {operation, availability:'available', text:title+'는 철회됐습니다〔'+withdrawn+'〕. 적용할 대상·제출기한·제출처는 확인되지 않습니다.'};
  const latest = chain.at(-1).ref;
  if (current.size === 0) return unavailable(title+'의 대상·제출기한·제출처를 확인할 수 없습니다〔'+latest+'〕.');
  const pieces = fields.map(field => {
    const term = current.get(field);
    if (!term) return field+' 미확인';
    if (term.ambiguous) return field+' 미확인〔'+term.ref+' 내 항목 충돌〕';
    if (!term.value || clearOrUnknown.test(term.value))
      return field+' 미확인〔'+term.ref+(term.value?' 원문 “'+term.value+'”':'에 값 없음')+'〕';
    return field+' “'+term.value+'”〔'+term.ref+'〕';
  });
  return {operation, availability:'available', text:title+' 기준입니다. '+pieces.join(', ')+'.'};
}
