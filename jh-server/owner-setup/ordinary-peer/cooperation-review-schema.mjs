import {roleIds} from './role-catalog.mjs';

export function cooperationReviewSchema(z) {
  const label = z.string().min(1).max(64).refine(text =>
    text.trim() === text && !/[\p{C}\p{Zl}\p{Zp}〔〕「」]/u.test(text));
  const role = z.enum(roleIds);
  const direction = {from: role, to: role, context: label};
  const directed = row => row.from !== row.to;
  const route = z.object(direction).strict().refine(directed);
  const record = z.object({
    ...direction,
    task: label,
    room: label.optional(),
    source: z.enum(['field','trial','unknown']),
    returned: z.boolean().nullable(),
    outcome: z.enum(['helpful','unhelpful','unconfirmed']).optional(),
    outcomeRef: label.optional(),
    outcomeNote: label.optional(),
  }).strict().refine(directed);
  return z.object({route, workRecords: z.array(record).max(24)}).strict();
}
