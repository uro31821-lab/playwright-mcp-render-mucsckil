// The ordinary peer and the pure evaluator use the same input contract.
export function documentListSchema(z) {
  const value = z.string().min(1).max(64).refine(s =>
    s === s.trim() && !/[\p{C}\p{Zl}\p{Zp}〔〕]/u.test(s));
  const key = value.refine(k => !['constructor', '__proto__', 'prototype'].includes(k));
  const scalar = z.union([value, z.boolean(), z.number().int().safe()]);
  const options = z.record(key, scalar.nullable()).refine(o => Object.keys(o).length <= 12);
  const dateText = z.string().min(1).max(32).regex(/^[^\p{C}\p{Zl}\p{Zp}〔〕]+$/u);
  const requirement = z.object({
    id: value, document_type: value, subject_ref: value,
    source_ref: value.nullish(), confirmed: z.boolean().optional(),
    options: options.optional(), period: value.nullish(), recipient_ref: value.nullish(),
    issued_on_or_after: dateText.nullish()
  }).strict();
  const document = z.object({
    ref: value, document_type: value.nullish(), subject_ref: value.nullish(),
    read_status: z.enum(['verified', 'uncertain']).optional(),
    options: options.optional(), period: value.nullish(), recipient_ref: value.nullish(),
    issued_on: dateText.nullish(), valid_until: dateText.nullish()
  }).strict();
  return z.object({
    as_of: dateText.nullish(), inventory_complete: z.boolean().optional(),
    requirements_complete: z.boolean().optional(), requirements: z.array(requirement).max(12),
    documents: z.array(document).max(24)
  }).strict();
}
