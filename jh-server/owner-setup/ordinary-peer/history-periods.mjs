// Compare two supplied CE year ranges. An unknown bound is explicitly null.
const operation = 'compare_supplied_year_ranges';
const firstYear = 1;
const lastYear = 9999;

function hasFields(value, names) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}

function readPeriod(row) {
  if (!hasFields(row, ['label', 'start', 'end'])) throw Error('INVALID_PERIOD_FIELDS');
  if (typeof row.label !== 'string') throw Error('INVALID_PERIOD_LABEL');
  const label = row.label.trim();
  if (!label || [...label].length > 48 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(row.label)) {
    throw Error('INVALID_PERIOD_LABEL');
  }
  const {start, end} = row;
  for (const year of [start, end]) {
    if (year !== null && (!Number.isInteger(year) || year < firstYear || year > lastYear)) {
      throw Error('INVALID_PERIOD_YEAR');
    }
  }
  if (start !== null && end !== null && start > end) throw Error('REVERSED_PERIOD');
  return {label, start, end};
}

function sourceText(row) {
  const from = row.start === null ? '시작 미상' : '시작 ' + row.start + '년';
  const to = row.end === null ? '끝 미상' : '끝 ' + row.end + '년';
  return '「' + row.label + '」(' + from + ', ' + to + ')';
}

function rangeText(start, end) {
  if (start === end) return start + '년 한 해';
  return start + '년부터 ' + end + '년까지(양 끝 포함 ' + (end - start + 1) + '개 연도)';
}

export function calculateHistoryPeriod(input) {
  if (!hasFields(input, ['periods']) || !Array.isArray(input.periods) || input.periods.length !== 2) {
    throw Error('TWO_SUPPLIED_PERIODS_REQUIRED');
  }
  const [a, b] = input.periods.map(readPeriod);
  if (a.label.normalize('NFC') === b.label.normalize('NFC')) throw Error('DISTINCT_PERIOD_LABELS_REQUIRED');
  const source = '제공된 서기 연대표 ' + sourceText(a) + ', ' + sourceText(b) + ' 기준입니다. ';
  for (const [earlier, later] of [[a, b], [b, a]]) {
    if (earlier.end !== null && later.start !== null && earlier.end < later.start) {
      const gap = later.start - earlier.end - 1;
      const detail = gap === 0 ? '두 시기는 바로 이웃한 연도에 끝나고 시작합니다.' :
        '사이에 어느 쪽에도 포함되지 않는 연도는 ' + gap + '개입니다.';
      return {operation, text: source + '시기 순서는 「' + earlier.label + '」 다음 「' + later.label +
        '」입니다. 겹치는 연도는 없습니다. ' + detail};
    }
  }
  // A known endpoint is itself in the period. Unknown endpoints can vary independently
  // subject to start <= end. Intersect the certain and the possible spans separately.
  const latestStart = row => row.start ?? row.end ?? lastYear;
  const earliestEnd = row => row.end ?? row.start ?? firstYear;
  const certainStart = Math.max(latestStart(a), latestStart(b));
  const certainEnd = Math.min(earliestEnd(a), earliestEnd(b));
  if (certainStart > certainEnd) {
    if (earliestEnd(a) >= latestStart(b) && earliestEnd(b) >= latestStart(a)) {
      return {operation, text: source + '두 시기가 겹치는 것은 확실하지만, 겹치는 연도는 특정할 수 없습니다.'};
    }
    return {operation, availability: 'unavailable', text: source + '미상인 연도 때문에 두 시기의 겹침이나 순서를 확정할 수 없습니다.'};
  }
  const possibleStart = Math.max(a.start ?? firstYear, b.start ?? firstYear);
  const possibleEnd = Math.min(a.end ?? lastYear, b.end ?? lastYear);
  if (certainStart === possibleStart && certainEnd === possibleEnd) {
    return {operation, text: source + '겹치는 시기는 ' + rangeText(certainStart, certainEnd) + '입니다.'};
  }
  return {operation, text: source + rangeText(certainStart, certainEnd) +
    '는 두 기록에 모두 포함됩니다. 미상인 연도가 있어 전체 겹침 범위는 확정할 수 없습니다.'};
}
