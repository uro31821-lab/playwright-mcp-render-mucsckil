// Calculate only from the named moments and years supplied by the caller.
const operation = 'korean_counting_age_at_record';

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validYear(value) {
  return value === null || (Number.isInteger(value) && value >= 1 && value <= 9999);
}

function collectRecords(records) {
  const yearsByLabel = new Map();
  for (const row of records) {
    if (!exactKeys(row, ['label', 'year']) || !validYear(row.year)) throw Error('INVALID_NOSTALGIA_RECORD');
    if (typeof row.label !== 'string' || /[\p{C}\p{Zl}\p{Zp}「」]/u.test(row.label)) {
      throw Error('INVALID_NOSTALGIA_LABEL');
    }
    const label = row.label.trim().normalize('NFC');
    if (!label || [...label].length > 48) throw Error('INVALID_NOSTALGIA_LABEL');
    if (!yearsByLabel.has(label)) yearsByLabel.set(label, new Set());
    if (row.year !== null) yearsByLabel.get(label).add(row.year);
  }
  return yearsByLabel;
}

export function calculateNostalgiaAges(input) {
  if (!exactKeys(input, ['birthYear', 'records']) || !validYear(input.birthYear) ||
      !Array.isArray(input.records) || input.records.length < 1 || input.records.length > 6) {
    throw Error('INVALID_NOSTALGIA_INPUT');
  }
  const {birthYear, records} = input;
  const lines = [birthYear === null ? '출생연도가 확인되지 않았습니다.' : birthYear + '년생 기준입니다.'];
  let resolved = false;
  for (const [label, years] of collectRecords(records)) {
    const title = '「' + label + '」';
    if (years.size === 0) {
      lines.push(title + '의 연도는 미상입니다.');
      continue;
    }
    if (years.size > 1) {
      const alternatives = [...years].sort((a, b) => a - b).map(year => year + '년');
      lines.push(title + '의 연도가 ' + alternatives.join('·') + '으로 엇갈려 확인이 필요합니다.');
      continue;
    }
    const [year] = years;
    const source = title + '(' + year + '년)';
    if (birthYear === null) {
      lines.push(source + ' 당시 세는나이는 미확인입니다.');
      continue;
    }
    resolved = true;
    if (year < birthYear) {
      lines.push(source + '은 출생 전입니다.');
    } else if (year === birthYear) {
      lines.push(source + '은 태어난 해입니다. 출생 후 세는나이는 1살입니다.');
    } else {
      lines.push(source + ' 당시 세는나이는 ' + (year - birthYear + 1) + '살입니다.');
    }
  }
  const text = lines.join(' ');
  return resolved ? {operation, text} : {operation, availability: 'unavailable', text};
}
