// Compare numeric settings copied from two records; this module has no device interface.
import {z} from 'zod';

const operation = 'compare_supplied_audio_presets';

export function audioPresetsSchema(zod) {
  const label = zod.string().min(1).max(48).refine(s =>
    s === s.trim() && !/[\p{C}\p{Zl}\p{Zp}〔〕]/u.test(s));
  const entry = zod.object({
    item: label,
    value: zod.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullable(),
    unit: zod.enum(['%', 'dB', 'dBFS', '단계']).nullable()
  }).strict().refine(row => row.unit !== '%' || row.value === null || (row.value >= 0 && row.value <= 100));
  return zod.object({
    audioItems: zod.array(label).min(1).max(12),
    presets: zod.array(zod.object({ref: label, entries: zod.array(entry).max(24)}).strict()).length(2)
  }).strict();
}

const schema = audioPresetsSchema(z);

function itemKey(label) {
  const normalized = label.normalize('NFC');
  const frequency = /^(\d+)(?:\.(\d+))? *(k?hz)$/iu.exec(normalized);
  if (!frequency) return 'label:' + normalized;
  const [,whole,fraction = '',unit] = frequency;
  const digits = (whole + fraction).replace(/^0+/u, '');
  if (!digits) return 'hz:0';
  // Compare decimal frequencies exactly, including fractional Hz. Keep descriptive
  // labels (filter type, channel, or a named band) distinct from bare frequencies.
  const coefficient = digits.replace(/0+$/u, '');
  const exponent = digits.length - coefficient.length - fraction.length + (unit.toLowerCase() === 'khz' ? 3 : 0);
  return 'hz:' + coefficient + 'e' + exponent;
}

function describe({value, unit}) {
  if (value === null) return unit ? '값 미기재(' + unit + ')' : '값·단위 미기재';
  if (unit === null) return value + ' (단위 미기재)';
  return value + (unit === '%' || unit === '단계' ? '' : ' ') + unit;
}

function readSetting(preset, key) {
  const matches = new Map();
  for (const row of preset.entries) {
    if (itemKey(row.item) === key) matches.set(JSON.stringify([row.value, row.unit]), row);
  }
  const rows = [...matches.values()];
  if (rows.length === 0) return {text: '미기재'};
  if (rows.length === 1) return {...rows[0], text: describe(rows[0])};
  // Different explicit readings for one setting in the same unit conflict. Mixing
  // units or a missing field does not by itself establish contradictory values.
  const values = new Map();
  for (const {value, unit} of rows) {
    if (value === null || unit === null) continue;
    if (!values.has(unit)) values.set(unit, new Set());
    values.get(unit).add(value);
  }
  const conflict = [...values.values()].some(set => set.size > 1);
  return {text: (conflict ? '상충' : '복수 표기 확인 필요') + '(' + rows.map(describe).join(', ') + ')'};
}

function compare(a, b) {
  if (a.value == null || b.value == null || !a.unit || !b.unit) return '대조 보류';
  if (a.unit !== b.unit) return '단위 다름 · 대조 보류';
  if (a.unit === '단계') return '단계 척도 미확인 · 대조 보류';
  return a.value === b.value ? '표기값 동일' : '표기값 다름';
}

export function compareAudioPresets(input) {
  const {audioItems, presets} = schema.parse(input);
  if (presets[0].ref.normalize('NFC') === presets[1].ref.normalize('NFC')) throw Error('SAME_PRESET_REFERENCE');
  const keys = audioItems.map(itemKey);
  if (new Set(keys).size !== keys.length) throw Error('DUPLICATE_REQUESTED_AUDIO_ITEM');

  let anyExplicitReading = false;
  const lines = audioItems.map((item,index) => {
    const cells = presets.map(preset => readSetting(preset, keys[index]));
    if (cells.some(cell => cell.value != null && cell.unit)) anyExplicitReading = true;
    const sides = cells.map((cell,i) => presets[i].ref + ' ' + cell.text);
    return item + '〔' + sides.join(' / ') + ' / ' + compare(...cells) + '〕.';
  });
  const result = {operation, text: '제공된 두 음향 설정 기록의 요청 항목입니다. ' + lines.join(' ')};
  if (!anyExplicitReading) result.availability = 'unavailable';
  return result;
}
