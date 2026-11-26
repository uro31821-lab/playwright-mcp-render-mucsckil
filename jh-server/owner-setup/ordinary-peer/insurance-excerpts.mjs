import {z} from 'zod';
import {sourceExcerptsSchema, compareSourceExcerpts} from './source-excerpts.mjs';

export function insuranceExcerptsSchema(zod) {
  return sourceExcerptsSchema(zod, 'policyItems', 'excerpts');
}

const schema = insuranceExcerptsSchema(z);
const format = {
  operation: 'compare_supplied_insurance_excerpts',
  header: '제공된 두 보험 발췌문 기준입니다.',
  sameRef: 'SAME_INSURANCE_EXCERPT_REFERENCE',
  duplicateItem: 'DUPLICATE_INSURANCE_ITEM'
};

export function compareInsuranceExcerpts(input) {
  const {policyItems, excerpts} = schema.parse(input);
  return compareSourceExcerpts(policyItems, excerpts, format);
}
