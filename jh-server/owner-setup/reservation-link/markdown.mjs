/** A safe human-readable representation for ChatGPT/JH. No external actions. */
const escapeTitle = value => String(value).replace(/[\\`*_{}\[\]()#+!<>|]/g, '\\$&').replace(/\r?\n/g, ' ');
const markdownLink = (name, url) => `[${escapeTitle(name)}](${String(url).replace(/\(/g, '%28').replace(/\)/g,'%29')})`;

export function renderBookingLinks(view) {
  const req = view.requirements || {};
  const localized = {
    location:'지역',date:'날짜',time:'시간',time_window:'시간 범위',party_size:'인원',
    check_in:'체크인',check_out:'체크아웃',rooms:'객실',adults:'성인',
    origin:'출발',destination:'도착',departure_date:'출발일',return_date:'귀국일',
    passengers:'탑승 인원',specialty:'진료과',max_price_per_person:'1인 예산 상한',
    max_total_amount:'총예산 상한',currency:'통화'
  };
  const criteria = Object.entries(localized)
    .filter(([key]) => req[key] !== null && req[key] !== undefined && req[key] !== '')
    .map(([key,label]) => `${label} ${escapeTitle(req[key])}`);
  const lines = [`## 예약 안내 · ${escapeTitle(view.kind || '기타')}`, '',
    ...(criteria.length ? [`**조회 조건:** ${criteria.join(' · ')}`, ''] : []),
    `**${escapeTitle(view.headline || '예약 검색 결과')}**`, ''];
  const section = (header, items, note) => {
    if (!items?.length) return;
    lines.push(`### ${header}`, ...(note ? [note] : []), '');
    for (const c of items) {
      lines.push(`- ${markdownLink(c.title, c.booking_url)} — ${escapeTitle(c.status_label)}`,
        `  - ${escapeTitle(c.price_label)} · ${escapeTitle(c.cancellation)} · ${escapeTitle(c.deposit)}`,
        `  - 확인 시각: ${escapeTitle(c.observed_at || '미확인')}`);
    }
    lines.push('');
  };
  section('조건에 맞는 예약 가능 링크', view.available,
    '해당 날짜·인원 조건을 공급자에서 확인한 시점의 결과입니다. 지금도 가능한지는 예약처에서 다시 확인하세요.');
  section('직접 확인할 예약 페이지 (가능 여부 미확인)', view.check_on_site,
    '아래는 예약 가능하다고 확인된 곳이 아닙니다. 예약처에서 날짜·인원과 잔여석을 직접 확인하세요.');
  section('해당 조건은 불가 확인 · 다른 날짜 확인용 링크', view.other_dates,
    '요청한 날짜·시간·인원에는 자리가 없다고 확인된 후보입니다. 링크에서 조건을 변경할 수 있습니다.');
  if (!view.available?.length && !view.check_on_site?.length && !view.other_dates?.length) {
    lines.push('연결된 공급자에서 제공받은 예약 링크가 없습니다. 이를 전체 매진으로 해석할 수 없습니다.', '');
  }
  lines.push('**이후 진행:** 링크를 직접 열어 필요한 정보를 입력하고 예약·결제합니다.',
    '모르는 항목이나 오류 화면은 GPT에 물어보세요. 예약 확정과 결제는 이 프로그램이 수행하지 않습니다.');
  return lines.join('\n');
}
