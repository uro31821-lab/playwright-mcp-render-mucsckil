import {z} from 'zod';
import {sourceExcerptsSchema, compareSourceExcerpts} from './source-excerpts.mjs';

export function medicationLeafletsSchema(zod) {
  return sourceExcerptsSchema(zod, 'leafletItems', 'leaflets');
}

const schema = medicationLeafletsSchema(z);
const format = {
  operation: 'compare_supplied_medication_leaflets',
  header: '제공된 두 복약 안내문 기준입니다.',
  sameRef: 'SAME_MEDICATION_LEAFLET_REFERENCE',
  duplicateItem: 'DUPLICATE_MEDICATION_ITEM'
};

export function compareMedicationLeaflets(input) {
  const {leafletItems, leaflets} = schema.parse(input);
  return compareSourceExcerpts(leafletItems, leaflets, format);
}
