/**
 * Read-only right-pane helper. Screen capture/accessibility is HOST-owned.
 * This file never clicks, scrolls, types, navigates or requests a capture permission.
 */
const text = v => typeof v === 'string' ? v.trim() : '';
const shrink = (v, n = 140) => text(v).slice(0, n);
const dateMs = v => {
  if (!text(v) || !/(?:Z|[+-]\d\d:\d\d)$/.test(v)) return null;
  const d = Date.parse(v); return Number.isFinite(d) ? d : null;
};

export function buildReadOnlyScreenGuide({question, observation = null, now = () => Date.now(), maxAgeMs = 180_000}) {
  const shared = {
    mode: 'ANSWER_ONLY', requested_action: 'EXPLAIN_ONLY',
    allowed_effects: [], external_effect_status: 'NOT_EXECUTED',
    question: shrink(question, 1000),
    instructions: [
      '오른쪽에 실제로 확인된 글자/컨트롤만 근거로 설명한다.',
      '질문의 의미를 설명하며 클릭/입력/스크롤/사이트 이동을 실행하지 않는다.',
      '보이지 않는 버튼·다음 화면·예약 성공 여부를 추측하지 않는다.',
      '신분확인·카드·비밀번호 정보는 예약처에서 사용자가 직접 입력한다.'
    ]
  };
  const observed = dateMs(observation?.observed_at);
  const age = observed === null ? null : now() - observed;
  if (!observation || !Array.isArray(observation.visible_elements) ||
      age === null || age < -30_000 || age > maxAgeMs) {
    return {
      ...shared, screen_verified: false, screen: null,
      user_message: '현재 오른쪽 화면을 확인하지 못했습니다. 화면에서 보이는 글자나 캡처를 알려주시면 해당 항목을 설명하겠습니다.'
    };
  }
  // Host readback is needed. Do not guess hidden layout or position from element names.
  const controls = observation.visible_elements.filter(e => e && e.visible === true && text(e.label)).slice(0, 60);
  return {
    ...shared, screen_verified: true,
    screen: {
      app: shrink(observation.app, 100) || null,
      window_id: shrink(observation.window_id, 100) || null,
      observed_at: observation.observed_at,
      partial: observation.partial !== false,
      visible_elements: controls.map(e => ({
        label: shrink(e.label, 160),
        role: shrink(e.role, 50) || null,
        enabled: typeof e.enabled === 'boolean' ? e.enabled : null
      }))
    },
    user_message: controls.length ?
      '확인된 화면 항목을 바탕으로 질문에 답합니다. 다른 화면으로 바뀌었다면 새 화면 확인이 필요합니다.' :
      '현재 화면에서 읽을 수 있는 버튼/글자 자료가 없습니다. 화면 캡처나 보이는 글자를 알려주세요.'
  };
}
