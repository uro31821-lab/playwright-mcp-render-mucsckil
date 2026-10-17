/**
 * JH guided reservation module (standalone/host-independent).
 * This code DOES NOT book/pay/click/enter data, mint JH IDs, or call the JH Secure Bridge.
 * Only a separately connected and verified provider can supply LIVE inventory.
 * protocol_version remains 1.0; JH v2.0 is an operating document, not a wire-version.
 */

import { isDeepStrictEqual } from 'node:util';

export const PROTOCOL_VERSION = '1.0';
export const BOOKING_KINDS = Object.freeze([
  'restaurant', 'hotel', 'flight', 'cinema', 'performance', 'sports', 'hospital', 'other'
]);
export const AVAILABILITY = Object.freeze({
  AVAILABLE: 'AVAILABLE', UNAVAILABLE: 'UNAVAILABLE', UNKNOWN: 'UNKNOWN'
});
export const EFFECT = Object.freeze({
  NOT_EXECUTED: 'NOT_EXECUTED', PENDING: 'PENDING',
  EFFECT_CONFIRMED: 'EFFECT_CONFIRMED', FAILED: 'FAILED', EFFECT_UNKNOWN: 'EFFECT_UNKNOWN'
});
export const DEFAULT_MAX_AGE_MS = 120_000;

const own = (object, property) => Object.prototype.hasOwnProperty.call(object, property);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const txt = value => typeof value === 'string' && value.trim() !== '';
const clone = value => structuredClone(value);

export class ReservationGuideError extends Error {
  constructor(code, message) {
    super(message); this.name = 'ReservationGuideError'; this.code = code;
  }
}

function assert(condition, code, message) {
  if (!condition) throw new ReservationGuideError(code, message);
}

function checkEnvelope(envelope) {
  assert(plain(envelope), 'INVALID_ENVELOPE', 'JH 공통 봉투가 필요합니다.');
  assert(envelope.protocol_version === PROTOCOL_VERSION, 'PROTOCOL_MISMATCH', 'protocol_version 1.0만 허용합니다.');
  assert(txt(envelope.command_id), 'MISSING_HOST_COMMAND', 'command_id는 실제 JH 본체에서 발급해야 합니다.');
  assert(Number.isInteger(envelope.generation) && envelope.generation >= 0,
    'INVALID_GENERATION', '기존 JH generation이 필요합니다.');
  assert(Number.isInteger(envelope.plan_revision) && envelope.plan_revision >= 0,
    'INVALID_REVISION', 'plan_revision이 필요합니다.');
  assert(txt(envelope.intent), 'INVALID_INTENT', '실제 JH 호스트 intent가 필요합니다.');
  assert(txt(envelope.document_id), 'INVALID_DOCUMENT', '호스트 document_id가 필요합니다.');
  assert(Array.isArray(envelope.sources), 'INVALID_SOURCES', 'sources는 배열이어야 합니다.');
  assert(plain(envelope.fields) && plain(envelope.constraints), 'INVALID_DATA', 'fields/constraints가 필요합니다.');
  assert(plain(envelope.result) && envelope.result.status === EFFECT.NOT_EXECUTED,
    'UNSAFE_EFFECT', '가이드 진입은 NOT_EXECUTED 상태여야 합니다.');
}

/** Required for meaningful search. A host/LLM must obtain the user's stated values; don't invent them. */
export const MINIMUM_FIELDS = Object.freeze({
  restaurant: ['location', 'date', 'party_size'],
  hotel: ['location', 'check_in', 'check_out', 'adults'],
  flight: ['origin', 'destination', 'departure_date', 'passengers'],
  cinema: ['location', 'date', 'party_size'],
  performance: ['location', 'date', 'party_size'],
  sports: ['location', 'date', 'party_size'],
  hospital: ['location', 'date', 'specialty'],
  other: ['location', 'date']
});

function blank(value) {
  return value === null || value === undefined ||
    (typeof value === 'string' && value.trim() === '');
}

export function getMissingFields(request) {
  if (!plain(request) || !BOOKING_KINDS.includes(request.kind)) return ['kind'];
  const fields = plain(request.requirements) ? request.requirements : {};
  const missing = MINIMUM_FIELDS[request.kind].filter(key => blank(fields[key]));
  if (request.kind === 'restaurant' && blank(fields.time) && blank(fields.time_window)) missing.push('time_or_time_window');
  if (request.kind === 'hotel' && blank(fields.rooms)) missing.push('rooms');
  if (request.kind === 'hospital' && blank(fields.time) && blank(fields.time_window)) missing.push('time_or_time_window');
  return missing;
}

function validateRequest(request) {
  assert(plain(request) && BOOKING_KINDS.includes(request.kind), 'INVALID_KIND', '지원하는 예약 유형이 아닙니다.');
  assert(plain(request.requirements), 'INVALID_REQUIREMENTS', 'requirements 객체가 필요합니다.');
  const r = request.requirements;
  for (const field of ['party_size','adults','passengers','rooms']) {
    if (!blank(r[field])) assert(Number.isSafeInteger(r[field]) && r[field] >= 1 && r[field] <= 100,
      'INVALID_PARTY_SIZE', `${field}은 1~100 범위의 정수여야 합니다.`);
  }
  for (const field of ['date','check_in','check_out','departure_date','return_date']) {
    if (blank(r[field])) continue;
    const value = r[field];
    const valid = typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) &&
      Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
      new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
    assert(valid, 'INVALID_DATE', `${field}은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.`);
  }
  if (!blank(r.check_in) && !blank(r.check_out)) assert(r.check_out > r.check_in,
    'INVALID_DATE_RANGE', '체크아웃은 체크인 다음 날짜여야 합니다.');
  if (!blank(r.time)) assert(typeof r.time === 'string' &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(r.time),
    'INVALID_TIME', '시간은 HH:MM(24시간제) 형식이어야 합니다.');
  for (const field of ['max_total_amount','max_price_per_person']) {
    if (blank(r[field])) continue;
    assert((typeof r[field] === 'string' || (typeof r[field] === 'number' && Number.isSafeInteger(r[field]))) &&
      /^\d+(?:\.\d{1,2})?$/.test(String(r[field])),
      'INVALID_BUDGET', '예산은 유효한 숫자 금액이어야 합니다.');
    assert(typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency),
      'INVALID_BUDGET_CURRENCY', '예산 비교에는 3글자 통화코드가 필요합니다.');
  }
  // Personal medical information is not needed for availability discovery.
  if (request.kind === 'hospital') {
    for (const key of ['patient_name', 'resident_id', 'diagnosis', 'phone_number', 'medical_record']) {
      assert(!own(request.requirements, key), 'SENSITIVE_DISCOVERY_FIELD',
        `예약 탐색 단계에서 민감한 ${key} 정보를 저장하지 않습니다.`);
    }
  }
}

/** Reject supplied destinations outside the integration-approved booking domains. */
export function safeHttpsUrl(value, allowedHosts = []) {
  if (!txt(value) || !Array.isArray(allowedHosts) || !allowedHosts.length) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
        (url.port && url.port !== '443') || url.href.length > 2048) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const allowed = allowedHosts.some(entry => {
      const domain = entry.toLowerCase().replace(/\.$/, '');
      return host === domain || host.endsWith(`.${domain}`);
    });
    if (!allowed) return null;
    // Reject obvious open-redirect payloads to unapproved domains. This is not a substitute
    // for verifying the destination after navigation; only provider-known pages are accepted.
    const redirectKeys = new Set(['next','url','redirect','redirect_url','redirect_uri',
      'return','return_url','return_to','target','continue','continue_url']);
    for (const [key, value] of url.searchParams) {
      if (!redirectKeys.has(key.toLowerCase())) continue;
      if (/^https?:\/\//i.test(value) && !safeHttpsUrl(value, allowedHosts)) return null;
    }
    // The program never follows redirects. The browser must still show final site identity.
    return url.href;
  } catch { return null; }
}

function validTimestamp(value) {
  if (!txt(value) || !/(?:Z|[+\-]\d\d:\d\d)$/.test(value)) return null;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : null;
}

function providerDefinition(provider) {
  assert(plain(provider) && txt(provider.id) && typeof provider.search === 'function',
    'INVALID_PROVIDER', '공급자는 id, search 함수를 제공해야 합니다.');
  assert(Array.isArray(provider.kinds) && provider.kinds.every(k => BOOKING_KINDS.includes(k)),
    'INVALID_PROVIDER_KIND', '공급자 예약 종류가 잘못되었습니다.');
  // trusted_live is an explicit INTEGRATION TRUST DECISION, never inferred from the provider's response.
  assert(typeof provider.trusted_live === 'boolean', 'MISSING_TRUST_CONFIG',
    '실제 API/예약처 확인 경로가 검증되었는지 설정해야 합니다.');
  assert(Array.isArray(provider.allowed_booking_hosts) && provider.allowed_booking_hosts.length > 0 &&
    provider.allowed_booking_hosts.every(h => typeof h === 'string' &&
      /^(?=.{4,253}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(h)),
    'UNTRUSTED_BOOKING_DOMAINS', '예약 링크의 검증된 허용 도메인 목록이 필요합니다.');
  return provider;
}

function normalizeQuote(quote) {
  if (!plain(quote)) return null;
  const amount = quote.total_amount;
  const currency = quote.currency;
  const valid = typeof amount === 'string' && /^\d+(?:\.\d+)?$/.test(amount) &&
    typeof currency === 'string' && /^[A-Z]{3}$/.test(currency);
  if (!valid) return null;
  return {
    total_amount: amount, currency,
    // UNKNOWN fee coverage is not equivalent to "0 additional fees".
    includes_all_fees: quote.includes_all_fees === true ? true : quote.includes_all_fees === false ? false : null,
    price_basis: txt(quote.price_basis) ? quote.price_basis : null,
    deposit: txt(quote.deposit) ? quote.deposit : null
  };
}

// Comparison is only sound for a complete party/stay quote in the same currency.
// If a budget exists and the price is partial/unknown, never claim a verified match.
function budgetStatus(requirements, quote) {
  const totalCap = requirements.max_total_amount;
  const perCap = requirements.max_price_per_person;
  if (blank(totalCap) && blank(perCap)) return 'NOT_APPLICABLE';
  const budgetCurrency = requirements.currency;
  const numberText = v => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) ? String(v) : v;
  const decimalCents = v => {
    const value = numberText(v);
    if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0,2));
  };
  if (!quote || quote.includes_all_fees !== true ||
      quote.price_basis !== 'requested_stay_or_party' || quote.currency !== budgetCurrency) {
    return 'PRICE_UNVERIFIED';
  }
  const quoted = decimalCents(quote.total_amount);
  if (quoted === null) return 'PRICE_UNVERIFIED';
  let cap = null;
  if (!blank(totalCap)) cap = decimalCents(totalCap);
  if (!blank(perCap)) {
    const people = requirements.party_size ?? requirements.adults ?? requirements.passengers;
    const per = decimalCents(perCap);
    if (!Number.isSafeInteger(people) || people < 1 || per === null) return 'PRICE_UNVERIFIED';
    const perTotal = per * BigInt(people);
    cap = cap === null ? perTotal : cap < perTotal ? cap : perTotal;
  }
  if (cap === null) return 'PRICE_UNVERIFIED';
  return quoted <= cap ? 'WITHIN_BUDGET' : 'OVER_BUDGET';
}

function normalizeCandidate(provider, raw, request, nowMs, maxAgeMs) {
  assert(plain(raw) && txt(raw.offer_id) && txt(raw.title), 'INVALID_CANDIDATE', '공급자 후보 식별자/이름 누락');
  const stamp = validTimestamp(raw.observed_at);
  const fresh = stamp !== null && nowMs - stamp >= -30_000 && nowMs - stamp <= maxAgeMs;
  const hasEvidence = txt(raw.source_ref);
  const matchingRequest = raw.kind === request.kind &&
    plain(raw.checked_requirements) && isDeepStrictEqual(raw.checked_requirements, request.requirements);
  const trusted = provider.trusted_live === true && fresh && hasEvidence && matchingRequest;
  const stated = Object.values(AVAILABILITY).includes(raw.availability) ? raw.availability : AVAILABILITY.UNKNOWN;
  // In particular, a "no inventory" verdict is also only valid for a trusted fresh query.
  const availability = trusted ? stated : AVAILABILITY.UNKNOWN;
  const quote = normalizeQuote(raw.quote);
  const hasBudget = !blank(request.requirements.max_total_amount) ||
    !blank(request.requirements.max_price_per_person);
  const budget_status = trusted ? budgetStatus(request.requirements, quote) :
    hasBudget ? 'PRICE_UNVERIFIED' : 'NOT_APPLICABLE';
  const url = safeHttpsUrl(raw.booking_url, provider.allowed_booking_hosts);
  const sourceId = `${provider.id}:${raw.offer_id}`;
  return {
    candidate_id: sourceId,
    provider_id: provider.id,
    offer_id: raw.offer_id,
    kind: raw.kind ?? null,
    title: raw.title,
    subtitle: txt(raw.subtitle) ? raw.subtitle : null,
    availability,
    proof: {
      provider_trusted_live: provider.trusted_live,
      checked_requested_conditions: Boolean(matchingRequest),
      source_ref: hasEvidence ? raw.source_ref : null,
      observed_at: stamp === null ? null : new Date(stamp).toISOString(),
      verified_now: trusted,
      booking_domain_approved: url !== null,
      freshness_ms: stamp === null ? null : nowMs - stamp
    },
    quote, budget_status, booking_url: url,
    cancellation: txt(raw.cancellation) ? raw.cancellation : null,
    terms: txt(raw.terms) ? raw.terms : null,
    // This does NOT mean "reservation confirmed"; selection and handoff are separate.
    outcome: 'NOT_BOOKED'
  };
}

function availableProviders(providers, kind) { return providers.filter(p => p.kinds.includes(kind)); }

function readWithTimeout(action, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('READ_PROVIDER_TIMEOUT'));
    }, timeoutMs);
    Promise.resolve().then(action).then(
      value => { if (!settled) {clearTimeout(timer); resolve(value);} },
      err => { if (!settled) {clearTimeout(timer); reject(err);} }
    );
  });
}

function compareOptions(a, b) {
  const order = {AVAILABLE: 0, UNKNOWN: 1, UNAVAILABLE: 2};
  const availability = order[a.availability] - order[b.availability];
  if (availability) return availability;
  // Do not compare prices with different currencies, fee scopes, or units.
  const qa = a.quote, qb = b.quote;
  if (qa && qb && qa.includes_all_fees && qb.includes_all_fees &&
      qa.currency === qb.currency && qa.price_basis === 'requested_stay_or_party' &&
      qb.price_basis === 'requested_stay_or_party') {
    const da = Number(qa.total_amount), db = Number(qb.total_amount);
    if (Number.isSafeInteger(da) && Number.isSafeInteger(db)) return da - db;
  }
  return a.provider_id.localeCompare(b.provider_id) || a.title.localeCompare(b.title);
}

/**
 * No HTTP calls here. A provider connector must fetch real, date/people-specific inventory itself.
 * This module NEVER calls provider.book(), POST, pay(), click(), or reserve().
 */
export class ReservationGuide {
  constructor({ providers = [], now = () => Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS,
    providerTimeoutMs = 8_000 } = {}) {
    this.providers = providers.map(providerDefinition);
    assert(new Set(this.providers.map(p => p.id)).size === this.providers.length,
      'DUPLICATE_PROVIDER', '공급자 id가 중복됩니다.');
    assert(typeof now === 'function' && Number.isFinite(maxAgeMs) && maxAgeMs > 0,
      'INVALID_OPTIONS', '시간 확인 설정을 점검하세요.');
    assert(Number.isInteger(providerTimeoutMs) && providerTimeoutMs >= 50 && providerTimeoutMs <= 60_000,
      'INVALID_TIMEOUT', '공급자 조회 제한시간은 50~60000ms여야 합니다.');
    this.now = now;
    this.maxAgeMs = maxAgeMs;
    this.providerTimeoutMs = providerTimeoutMs;
  }

  start(envelope, request) {
    checkEnvelope(envelope); validateRequest(request);
    return {
      envelope: clone(envelope), request: clone(request), phase: 'DRAFT',
      missing_fields: getMissingFields(request), searched_at: null,
      candidates: [], provider_errors: [], selected_candidate_id: null,
      // Never persist a user's approval in this module.
      approval: null, external_effect: EFFECT.NOT_EXECUTED
    };
  }

  revise(session, requirementPatch) {
    this.#active(session);
    assert(plain(requirementPatch), 'INVALID_PATCH', '새로 정한 예약 조건이 필요합니다.');
    const updatedRequest = {...session.request, requirements: {...session.request.requirements, ...clone(requirementPatch)}};
    validateRequest(updatedRequest);
    return {
      ...clone(session),
      envelope: {...clone(session.envelope), plan_revision: session.envelope.plan_revision + 1,
        result: {status: EFFECT.NOT_EXECUTED, evidence: null}},
      request: updatedRequest, phase: 'DRAFT', missing_fields: getMissingFields(updatedRequest),
      searched_at: null, candidates: [], provider_errors: [], selected_candidate_id: null,
      approval: null, external_effect: EFFECT.NOT_EXECUTED
    };
  }

  cancel(session) {
    this.#active(session);
    return {...clone(session), phase: 'CANCELED', selected_candidate_id: null, approval: null};
  }

  async search(session) {
    this.#active(session);
    const missing = getMissingFields(session.request);
    if (missing.length) {
      return {...clone(session), phase: 'NEED_CONDITIONS', missing_fields: missing,
        candidates: [], provider_errors: [], selected_candidate_id: null};
    }
    const matches = availableProviders(this.providers, session.request.kind);
    if (!matches.length) {
      return {...clone(session), phase: 'NOT_CONNECTED', missing_fields: [],
        candidates: [], provider_errors: [{code: 'NO_CONNECTED_LIVE_PROVIDER',
          message: '해당 종류의 실제 가용성 공급자 연결이 없습니다.'}], selected_candidate_id: null};
    }
    // Provider failures are kept separate from genuine "UNAVAILABLE" responses.
    const settled = await Promise.allSettled(matches.map(p => readWithTimeout(() =>
      p.search(clone(session.request), {
        command_id: session.envelope.command_id,
        generation: session.envelope.generation,
        plan_revision: session.envelope.plan_revision,
        // Availability reads only; connectors must NEVER interpret this as booking authority.
        mode: 'READ_AVAILABILITY_ONLY'
      }), this.providerTimeoutMs)));
    const nowMs = this.now();
    const candidates = [], errors = [], sources = [];
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i], provider = matches[i];
      if (result.status === 'rejected' || !Array.isArray(result.value)) {
        errors.push({provider_id: provider.id, code: 'PROVIDER_QUERY_FAILED'});
        continue;
      }
      for (const raw of result.value) {
        try {
          const candidate = normalizeCandidate(provider, raw, session.request, nowMs, this.maxAgeMs);
          if (candidate.kind !== null && candidate.kind !== session.request.kind) {
            errors.push({provider_id: provider.id, code: 'WRONG_KIND'}); continue;
          }
          if (candidates.some(c => c.candidate_id === candidate.candidate_id)) {
            errors.push({provider_id: provider.id, code: 'DUPLICATE_OFFER'}); continue;
          }
          candidates.push(candidate);
          if (candidate.proof.source_ref) sources.push({
            source_id: candidate.candidate_id, type: 'reservation_provider_observation',
            observed_at: candidate.proof.observed_at,
            received_at: new Date(nowMs).toISOString(),
            source_ref: candidate.proof.source_ref
          });
        } catch {
          errors.push({provider_id: provider.id, code: 'INVALID_PROVIDER_DATA'});
        }
      }
    }
    candidates.sort(compareOptions);
    const cloned = clone(session);
    return {
      ...cloned, phase: 'SEARCHED', missing_fields: [],
      searched_at: new Date(nowMs).toISOString(), candidates, provider_errors: errors,
      selected_candidate_id: null, approval: null,
      envelope: {
        ...cloned.envelope,
        sources: [...cloned.envelope.sources, ...sources],
        result: {status: EFFECT.NOT_EXECUTED, evidence: null}
      }
    };
  }

  /**
   * User selected an option in ChatGPT/JH; returns only a booking-page handoff PLAN.
   * If availability is stale or unknown, handoff labels it "confirm at booking provider".
   * NEVER claims a completed reservation or triggers navigation by itself.
   */
  select(session, candidateId) {
    this.#active(session);
    assert(session.phase === 'SEARCHED' || session.phase === 'SELECTED',
      'SEARCH_REQUIRED', '현재 조건으로 후보 검색을 먼저 해야 합니다.');
    const candidate = session.candidates.find(c => c.candidate_id === candidateId);
    assert(candidate, 'NOT_IN_CURRENT_RESULTS', '현재 계획의 후보가 아닙니다.');
    assert(candidate.availability !== AVAILABILITY.UNAVAILABLE,
      'UNAVAILABLE_CHOICE', '예약 불가로 확인된 후보는 선택할 수 없습니다.');
    assert(candidate.budget_status !== 'OVER_BUDGET',
      'OUTSIDE_BUDGET', '선택한 후보가 사용자의 예산을 초과합니다.');
    assert(candidate.booking_url, 'NO_VERIFIED_BOOKING_LINK',
      '확인된 예약 페이지 링크가 없습니다.');
    const proofMs = validTimestamp(candidate.proof.observed_at);
    const nowMs = this.now();
    const stillFresh = proofMs !== null && nowMs - proofMs >= -30_000 &&
      nowMs - proofMs <= this.maxAgeMs;
    const canDescribeAsAvailable = candidate.availability === AVAILABILITY.AVAILABLE && stillFresh &&
      (candidate.budget_status === 'WITHIN_BUDGET' || candidate.budget_status === 'NOT_APPLICABLE');
    const cloned = clone(session);
    return {
      session: {...cloned, phase: 'SELECTED', selected_candidate_id: candidate.candidate_id},
      handoff: {
        action: 'GUIDED_OPEN_BOOKING_PAGE',
        // The JH UI needs the user's real click/choice to open this; no auto action.
        initiated: false,
        provider_id: candidate.provider_id,
        title: candidate.title,
        booking_url: candidate.booking_url,
        availability_label: canDescribeAsAvailable ? 'PROVIDER_CHECKED_AVAILABLE' : 'RECHECK_REQUIRED',
        check_again_before_final_commit: true,
        user_steps: [
          '예약처에서 날짜·시간·인원·상품·객실·좌석·진료시간을 다시 확인',
          '예약자 정보 및 필요한 인증 입력은 사용자가 수행',
          '예약금·추가 수수료·취소/변경 조건 확인',
          '결제 또는 예약 확정은 사용자가 최종 승인',
          '공급자 발행 예약번호·확정 내역이 확인되기 전에는 예약 완료로 보고하지 않음'
        ],
        external_effect_status: EFFECT.NOT_EXECUTED
      }
    };
  }

  /**
   * Link-first presentation. "available" never includes a stale, inferred or unavailable slot.
   * If none can be verified, show separately labeled booking pages for manual checking.
   * Do not convert missing live provider coverage into "sold out".
   */
  bookingLinks(session, { limit = 6, showAlternatives = true } = {}) {
    this.#active(session);
    assert(Number.isInteger(limit) && limit >= 1 && limit <= 50,
      'INVALID_LIMIT', '후보 표시 개수를 확인하세요.');
    const nowMs = this.now();
    const candidates = (session.candidates || []).filter(c => c.booking_url && c.budget_status !== 'OVER_BUDGET');
    const usable = candidates.map(c => {
      const stamp = validTimestamp(c.proof.observed_at);
      const fresh = stamp !== null && nowMs - stamp >= -30_000 && nowMs - stamp <= this.maxAgeMs;
      const verified = fresh && c.availability === AVAILABILITY.AVAILABLE &&
        (c.budget_status === 'NOT_APPLICABLE' || c.budget_status === 'WITHIN_BUDGET');
      const unavailable = fresh && c.availability === AVAILABILITY.UNAVAILABLE;
      const knownFullPrice = c.proof.verified_now === true && fresh &&
        c.quote?.includes_all_fees === true &&
        c.quote?.price_basis === 'requested_stay_or_party';
      return {
        candidate_id: c.candidate_id, title: c.title,
        provider_id: c.provider_id, booking_url: c.booking_url,
        availability: verified ? 'AVAILABLE' : unavailable ? 'UNAVAILABLE' : 'UNKNOWN',
        status_label: verified ? '요청 조건의 예약 가능 여부 확인(조회 시점)' :
          unavailable ? '해당 조건 예약 불가 확인' :
          c.budget_status === 'PRICE_UNVERIFIED' ? '가격 한도 충족 미확인 — 예약처에서 직접 확인' :
          '가능 여부 미확인 — 예약처에서 직접 확인',
        observed_at: c.proof.observed_at, source_ref: c.proof.source_ref,
        budget_status: c.budget_status,
        price_label: knownFullPrice ? `${c.quote.total_amount} ${c.quote.currency} (조회 시점 총액 확인)` :
          c.quote ? `${c.quote.total_amount} ${c.quote.currency} (표시 금액, 총액/수수료 검증 필요)` : '가격 미확인',
        cancellation: c.proof.verified_now === true && fresh && c.cancellation ?
          c.cancellation : '취소 조건 예약처 확인 필요',
        deposit: c.proof.verified_now === true && fresh && c.quote?.deposit ?
          c.quote.deposit : '예약금 예약처 확인 필요',
        confirmed_booking: false, external_effect_status: EFFECT.NOT_EXECUTED
      };
    });
    const available = usable.filter(c => c.availability === 'AVAILABLE').slice(0, limit);
    // Unconfirmed links are not blended into the available list.
    const check_on_site = showAlternatives && available.length === 0 ?
      usable.filter(c => c.availability === 'UNKNOWN').slice(0, limit) : [];
    const other_dates = showAlternatives && available.length === 0 ?
      usable.filter(c => c.availability === 'UNAVAILABLE').slice(0, limit) : [];
    return {
      kind: session.request.kind,
      requirements: clone(session.request.requirements),
      available, check_on_site, other_dates,
      availability_verified: available.length > 0,
      headline: session.missing_fields?.length ? '예약 검색 조건 확인 필요' :
        session.phase === 'NOT_CONNECTED' ? '실시간 조회 공급자 미연결 — 예약 가능 확인 불가' :
        available.length ? '요청 조건의 예약 가능 후보(조회 시점)' :
        '현재 확인된 예약 가능 후보 없음 — 전체 매진이라는 뜻은 아님',
      provider_errors: clone(session.provider_errors || []),
      next_action: '사용자가 예약처 링크를 직접 열고 이름·연락처·인증·최종 예약 및 결제를 진행',
      note: '재고·가격은 변동 가능하며, 예약처 최종 화면에서 다시 확인. 링크 안내는 예약 확정이 아님.',
      external_effect_status: EFFECT.NOT_EXECUTED
    };
  }

  summarize(session, { limit = 5 } = {}) {
    if (session.phase === 'CANCELED') return {headline: '이전 예약 안내 작업 취소됨', options: [], external_effect_status: EFFECT.NOT_EXECUTED};
    if (session.missing_fields?.length) return {
      headline: '예약 검색 조건 확인 필요', missing_fields: session.missing_fields,
      options: [], external_effect_status: EFFECT.NOT_EXECUTED
    };
    if (session.phase === 'NOT_CONNECTED') return {
      headline: '해당 예약 종류의 실제 재고 조회 경로 미연결', options: [],
      external_effect_status: EFFECT.NOT_EXECUTED
    };
    const nowMs = this.now();
    const options = (session.candidates || []).slice(0, limit).map(c => {
      const stamp = validTimestamp(c.proof.observed_at);
      const fresh = stamp !== null && nowMs - stamp >= -30_000 && nowMs - stamp <= this.maxAgeMs;
      const state = c.availability === AVAILABILITY.UNAVAILABLE && fresh ? '예약 불가 확인' :
        c.availability === AVAILABILITY.AVAILABLE && fresh && c.budget_status !== 'PRICE_UNVERIFIED' && c.budget_status !== 'OVER_BUDGET' ? '요청 조건의 예약 가능 확인(조회 시점)' : c.budget_status === 'OVER_BUDGET' ? '예산 초과' : c.budget_status === 'PRICE_UNVERIFIED' ? '가격 조건 재확인 필요' : '예약 가능 여부 재확인 필요';
      return {
        candidate_id: c.candidate_id, title: c.title, provider_id: c.provider_id,
        budget_status: c.budget_status, state,
        total_price: c.quote && c.quote.includes_all_fees === true &&
          c.quote.price_basis === 'requested_stay_or_party'
          ? `${c.quote.total_amount} ${c.quote.currency}` : '총액 미확인',
        quote_amount: c.quote?.total_amount ?? null,
        quote_currency: c.quote?.currency ?? null,
        additional_fees: c.quote?.includes_all_fees === true ? '포함 확인' : '추가 수수료 미확인',
        deposit: c.quote?.deposit ?? '예약금 미확인',
        terms: c.terms ?? '기타 조건 미확인',
        checked_at: c.proof.observed_at,
        evidence_ref: c.proof.source_ref,
        cancellation: c.cancellation ?? '취소 조건 미확인',
        booking_url: c.booking_url,
        confirmed_booking: false
      };
    });
    return {
      headline: options.length ? '공급자별 실제 조회 결과(예약 확정 아님)' : '확인된 예약 후보 없음(전체 매진을 뜻하지 않음)',
      options, provider_errors: session.provider_errors,
      external_effect_status: EFFECT.NOT_EXECUTED
    };
  }

  #active(session) {
    assert(plain(session) && plain(session.envelope) && session.envelope.protocol_version === '1.0',
      'INVALID_SESSION', '유효한 예약 작업이 아닙니다.');
    assert(session.phase !== 'CANCELED', 'CANCELED_TASK', '취소한 예약 작업은 재실행하지 않습니다.');
    assert(session.external_effect === EFFECT.NOT_EXECUTED, 'UNSAFE_EFFECT',
      '실제 예약 효과 장부는 중앙 JH 호스트가 관리합니다.');
  }
}

/**
 * Host-only handoff utility: reject async search results for the wrong command,
 * generation or plan revision. The active JH host, not this module, owns state.
 */
export function adoptSearchResult(activeSession, completedSearch) {
  if (!plain(activeSession) || !plain(completedSearch) ||
      !plain(activeSession.envelope) || !plain(completedSearch.envelope)) {
    return {adopted: false, reason: 'INVALID_SESSION', session: activeSession};
  }
  const x = activeSession.envelope, y = completedSearch.envelope;
  if (activeSession.phase === 'CANCELED' ||
      x.command_id !== y.command_id || x.generation !== y.generation ||
      x.plan_revision !== y.plan_revision || completedSearch.phase !== 'SEARCHED' ||
      !isDeepStrictEqual(activeSession.request, completedSearch.request)) {
    return {adopted: false, reason: 'STALE_OR_CANCELED', session: activeSession};
  }
  return {adopted: true, reason: null, session: completedSearch};
}
