// Compare the two written shot plans. No live camera state enters this calculation.
import {z} from 'zod';

const fields = {
  orientation: {name: '사진 방향', values: {portrait: '세로', landscape: '가로'}},
  subjectPosition: {name: '화면 속 피사체 위치', values: {left: '왼쪽', center: '중앙', right: '오른쪽'}},
  framing: {name: '촬영 범위', values: {wide: '넓게', medium: '중간', close: '가까이'}}
};

export function cameraPlansSchema(zod) {
  const text = max => zod.string().min(1).max(max).refine(value =>
    value === value.trim() && !/[\p{C}\p{Zp}\p{Zl}〔〕]/u.test(value));
  function entries(isSource) {
    return zod.discriminatedUnion('field', Object.entries(fields).map(([field, definition]) => {
      const value = zod.enum(Object.keys(definition.values));
      const shape = isSource ? {value: value.nullable(), quote: text(96)} : {value};
      return zod.object({field: zod.literal(field), ...shape}).strict();
    }));
  }
  return zod.object({
    cameraCriteria: zod.array(entries(false)).min(1).max(Object.keys(fields).length),
    plans: zod.array(zod.object({ref: text(48), settings: zod.array(entries(true)).max(12)}).strict()).length(2)
  }).strict();
}

const schema = cameraPlansSchema(z);

function compareField(criterion, settings) {
  const entries = settings.filter(entry => entry.field === criterion.field);
  if (!entries.length) return {status: '확인 필요', detail: '미기재'};

  const explicit = new Set(entries.map(entry => entry.value).filter(value => value !== null));
  const quotes = [...new Set(entries.map(entry => JSON.stringify(entry.quote)))].join(' · ');
  if (explicit.size > 1) return {status: '확인 필요', detail: '상충 ' + quotes};
  if (entries.some(entry => entry.value === null)) return {status: '확인 필요', detail: '표기 불명 ' + quotes};
  const value = entries[0].value;
  return {status: value === criterion.value ? '일치' : '불일치', detail: fields[criterion.field].values[value] + ' ' + quotes};
}

export function compareCameraPlans(input) {
  const {cameraCriteria, plans} = schema.parse(input);
  if (plans[0].ref.normalize('NFC') === plans[1].ref.normalize('NFC')) throw Error('SAME_CAMERA_PLAN_REFERENCE');
  if (new Set(cameraCriteria.map(row => row.field)).size !== cameraCriteria.length) throw Error('DUPLICATE_CAMERA_CRITERION');

  let anyDecided = false;
  const summaries = plans.map(plan => {
    const statuses = [];
    const details = cameraCriteria.map(criterion => {
      const field = fields[criterion.field];
      const result = compareField(criterion, plan.settings);
      statuses.push(result.status);
      if (result.status !== '확인 필요') anyDecided = true;
      return `${field.name} ${field.values[criterion.value]} 요청: ${result.status} (${result.detail})`;
    });
    const overall = statuses.includes('불일치') ? '불일치' : statuses.includes('확인 필요') ? '확인 필요' : '일치';
    return `${plan.ref}〔종합 ${overall}. ${details.join(' / ')}〕.`;
  });
  const result = {operation: 'compare_supplied_camera_plans', text: '제공된 두 촬영안 기준입니다. ' + summaries.join(' ')};
  if (!anyDecided) result.availability = 'unavailable';
  return result;
}
