// Read only the named rule and explicit links between its supplied versions.
import {z} from 'zod';
import {orderedSources} from './notice-review.mjs';

const operation = 'resolve_supplied_trading_rule';

export function tradingRuleRevisionsSchema(zod) {
  const label = max => zod.string().min(1).max(max).refine(text =>
    text === text.trim() && !/[\p{C}\p{Zl}\p{Zp}〔〕「」]/u.test(text));
  const quote = zod.string().min(1).max(240).refine(text =>
    text === text.trim() && !/[\p{C}\p{Zl}\p{Zp}]/u.test(text));
  const document = zod.object({
    rule: label(64), ref: label(48), action: zod.enum(['original', 'revise', 'withdraw']),
    corrects: label(48).optional(), quote: quote.nullish()
  }).strict().refine(row => (row.action === 'original') === (row.corrects === undefined),
    'A revision or withdrawal must identify the source it changes.');
  return zod.object({ruleName: label(64), ruleRecords: zod.array(document).max(16)}).strict();
}

const schema = tradingRuleRevisionsSchema(z);

export function resolveSuppliedTradingRule(input) {
  const {ruleName, ruleRecords} = schema.parse(input);
  const title = '제공된 규칙 「' + ruleName + '」. ';
  const unknown = reason => ({operation, availability: 'unavailable', text: title + reason});
  const target = ruleName.normalize('NFC');
  const records = ruleRecords.filter(record => record.rule.normalize('NFC') === target);
  if (!records.length) return unknown('해당 원문 미기재.');
  const chain = orderedSources(records.map(record => ({
    ...record, ref: record.ref.normalize('NFC'), corrects: record.corrects?.normalize('NFC')
  })));
  if (!chain) return unknown('원본과 정정·철회 문서의 연결이 상충하거나 누락되어 현재 문구를 확인할 수 없습니다.');
  const latest = chain.at(-1);
  if (chain.slice(0, -1).some(record => record.action === 'withdraw'))
    return unknown('철회 후 후속 문서가 있어 재시행 여부를 확인해야 합니다.');
  if (latest.quote == null) return unknown('최신 문구 미기재〔' + latest.ref + '〕.');
  const citation = '〔' + latest.ref + '〕.';
  const quoted = JSON.stringify(latest.quote);
  const detail = latest.action === 'withdraw'
    ? '철회됨' + citation + ' 철회 원문 ' + quoted + '.'
    : '현재 문구 ' + quoted + citation;
  return {operation, text: title + detail};
}
