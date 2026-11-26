// Compare only the work and price-scope terms transcribed from the two supplied quotes.
import {z} from 'zod';

const operation = 'compare_supplied_repair_scopes';
const descriptions = new Map([
  ['included', '포함'],
  ['excluded', '제외'],
  ['extra', '별도 비용'],
  ['unclear', '확인 필요']
]);

export function repairQuotesSchema(zod) {
  const text = maximum => zod.string().min(1).max(maximum).refine(value =>
    value.trim() === value && !/[\p{C}\p{Zl}\p{Zp}〔〕]/u.test(value));
  const item = text(64);
  const entry = zod.object({
    item,
    status: zod.enum(['included', 'excluded', 'extra', 'unclear']),
    note: text(120).optional()
  }).strict();
  const quote = zod.object({ref: text(64), entries: zod.array(entry).max(24)}).strict();
  return zod.object({scopeItems: zod.array(item).min(1).max(12), quotes: zod.array(quote).length(2)}).strict();
}

const schema = repairQuotesSchema(z);
const key = text => text.normalize('NFC');

function readScope(quote, item) {
  const terms = new Map();
  for (const row of quote.entries) {
    if (key(row.item) !== key(item)) continue;
    const signature = JSON.stringify([row.status, row.note ?? null]);
    terms.set(signature, row);
  }
  if (!terms.size) return {text: '제공분에 기재 없음', determined: false};
  const termsText = [...terms.values()].map(row =>
    descriptions.get(row.status) + (row.note ? '(' + row.note + ')' : ''));
  // With no amendment order, different notes may refer to different quantities or conditions.
  // Preserve each statement and leave the effective term unresolved.
  if (terms.size > 1) return {text: '기재가 달라 확인 필요(' + termsText.join(', ') + ')', determined: false};
  const [row] = terms.values();
  return {text: termsText[0], determined: row.status !== 'unclear'};
}

export function compareRepairQuotes(input) {
  const {scopeItems, quotes} = schema.parse(input);
  if (key(quotes[0].ref) === key(quotes[1].ref)) throw Error('SAME_QUOTE_REFERENCE');
  if (new Set(scopeItems.map(key)).size !== scopeItems.length) throw Error('DUPLICATE_SCOPE_ITEM');

  let determined = false;
  const rows = scopeItems.map(item => {
    const cells = quotes.map(quote => {
      const cell = readScope(quote, item);
      if (cell.determined) determined = true;
      return quote.ref + ' ' + cell.text;
    });
    return item + '〔' + cells.join(' / ') + '〕.';
  });
  const text = '제공된 두 견적의 작업 범위입니다. ' + rows.join(' ');
  return determined ? {operation, text} : {operation, availability: 'unavailable', text};
}
