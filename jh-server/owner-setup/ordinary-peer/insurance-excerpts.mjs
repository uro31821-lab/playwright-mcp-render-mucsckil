import {z} from 'zod';

const labels = {stated: '명시', exception: '조건·예외', unclear: '표기 불명', conflict: '상충 표기'};
const kinds = ['stated', 'exception', 'unclear', 'conflict'];
const normalize = value => value.normalize('NFC');

export function insuranceExcerptsSchema(zod) {
  const text = max => zod.string().min(1).max(max).refine(value =>
    value === value.trim() && !/[\p{C}\p{Zp}\p{Zl}〔〕]/u.test(value));
  const entry = zod.object({item: text(48), kind: zod.enum(kinds), quote: text(128)}).strict();
  const excerpt = zod.object({ref: text(48), entries: zod.array(entry).max(8)}).strict();
  return zod.object({
    policyItems: zod.array(text(48)).min(1).max(4),
    excerpts: zod.array(excerpt).length(2)
  }).strict();
}

const schema = insuranceExcerptsSchema(z);

function describeEntries(entries) {
  if (!entries.length) return {detail: '미기재', available: false};

  const grouped = new Map(kinds.map(kind => [kind, new Set()]));
  for (const entry of entries) grouped.get(entry.kind).add(entry.quote);
  const parts = [];
  for (const [kind, quotes] of grouped) {
    if (quotes.size) parts.push(labels[kind] + ' ' + [...quotes].map(q => JSON.stringify(q)).join(' · '));
  }
  const available = !grouped.get('conflict').size &&
    Boolean(grouped.get('stated').size || grouped.get('exception').size);
  return {detail: parts.join(', '), available};
}

export function compareInsuranceExcerpts(input) {
  const {policyItems, excerpts} = schema.parse(input);
  if (normalize(excerpts[0].ref) === normalize(excerpts[1].ref)) throw Error('SAME_INSURANCE_EXCERPT_REFERENCE');
  if (new Set(policyItems.map(normalize)).size !== policyItems.length) throw Error('DUPLICATE_INSURANCE_ITEM');

  let anyAvailable = false;
  const rows = policyItems.map(item => {
    const cells = excerpts.map(excerpt => {
      const entries = excerpt.entries.filter(entry => normalize(entry.item) === normalize(item));
      const {detail, available} = describeEntries(entries);
      if (available) anyAvailable = true;
      return excerpt.ref + ' ' + detail;
    });
    return item + '〔' + cells.join(' / ') + '〕.';
  });
  const result = {operation: 'compare_supplied_insurance_excerpts', text: '제공된 두 보험 발췌문 기준입니다. ' + rows.join(' ')};
  if (!anyAvailable) result.availability = 'unavailable';
  return result;
}
