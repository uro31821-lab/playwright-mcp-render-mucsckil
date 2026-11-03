/**
 * JH Newbiseo World View Engine
 *
 * Pure, dependency-free normalization and validation for a source-backed
 * news-to-worldview report. The model/host performs research and reasoning;
 * this module enforces boundaries between facts, interpretation, analogies,
 * and personal inspiration. It performs no search, persistence, monitoring,
 * scheduling, or device action.
 */
export const VERSION = '1.0.0';
export const SCHEMA = 'jh.newbiseo-worldview.v1';

const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
const SUBJECT_KINDS = new Set(['event', 'person', 'organization', 'policy', 'sports', 'entertainment', 'social', 'economy', 'technology', 'other']);
const SOURCE_KINDS = new Set(['official', 'court', 'regulator', 'research', 'news', 'interview', 'filing', 'other']);
const CLAIM_STATUS = new Set(['confirmed', 'reported', 'alleged', 'disputed', 'unknown']);
const CURRENT_STATUS = new Set(['resolved', 'ongoing', 'dormant', 'unclear']);
const PATTERN_KINDS = new Set(['economic', 'institutional', 'behavioral', 'technological', 'relational', 'risk', 'media', 'other']);
const LENSES = new Set(['economy', 'investment', 'clinic_management', 'work_management', 'relationships', 'mind_life', 'ai_ideas', 'other']);
const RELEVANCE = new Set(['direct', 'adjacent']);
const CONTEXT_SOURCES = new Set(['current_user', 'current_task', 'existing_jh']);

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}
function check(condition, code = 'NEWBISEO_INPUT_INVALID', detail = '') {
  if (!condition) fail(code, detail);
}
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function exactObject(value, required, optional = [], code = 'NEWBISEO_INPUT_INVALID') {
  check(value && typeof value === 'object' && !Array.isArray(value), code);
  const keys = Object.keys(value);
  check(required.every(key => own(value, key)), code);
  check(keys.every(key => required.includes(key) || optional.includes(key)), code);
}

function clone(value, depth = 0, budget = {nodes: 0, chars: 0}) {
  check(depth <= 24 && ++budget.nodes <= 100000, 'NEWBISEO_CAPACITY');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    check(Number.isFinite(value), 'NEWBISEO_INPUT_INVALID');
    return value;
  }
  if (typeof value === 'string') {
    check(value.isWellFormed(), 'NEWBISEO_INPUT_INVALID');
    budget.chars += value.length;
    check(budget.chars <= 2 * 1024 * 1024, 'NEWBISEO_CAPACITY');
    return value;
  }
  check(value && typeof value === 'object', 'NEWBISEO_INPUT_INVALID');
  const isArray = Array.isArray(value);
  const proto = Object.getPrototypeOf(value);
  check(isArray ? proto === Array.prototype : [Object.prototype, null].includes(proto), 'NEWBISEO_INPUT_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  check(Reflect.ownKeys(descriptors).every(key => typeof key === 'string'), 'NEWBISEO_INPUT_INVALID');
  if (isArray) {
    check(value.length <= 10000 && Object.keys(descriptors).length === value.length + 1, 'NEWBISEO_CAPACITY');
    const result = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = descriptors[String(index)];
      check(descriptor && own(descriptor, 'value') && descriptor.enumerable, 'NEWBISEO_INPUT_INVALID');
      result.push(clone(descriptor.value, depth + 1, budget));
    }
    return result;
  }
  const result = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    check(!RESERVED.has(key) && own(descriptor, 'value') && descriptor.enumerable, 'NEWBISEO_INPUT_INVALID');
    result[key] = clone(descriptor.value, depth + 1, budget);
  }
  return result;
}

function text(value, max, code = 'NEWBISEO_TEXT_INVALID', min = 1) {
  check(typeof value === 'string', code);
  const normalized = value.normalize('NFKC').trim();
  check(normalized.length >= min && normalized.length <= max, code);
  return normalized;
}
function token(value, code = 'NEWBISEO_ID_INVALID') {
  const normalized = text(value, 120, code);
  check(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized) && !RESERVED.has(normalized), code);
  return normalized;
}
function iso(value, code = 'NEWBISEO_DATE_INVALID') {
  check(typeof value === 'string', code);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    check(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value, code);
    return value;
  }
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), code);
  const date = new Date(value);
  check(Number.isFinite(date.getTime()), code);
  const canonical = date.toISOString();
  check(canonical === value || canonical.replace('.000Z', 'Z') === value, code);
  return canonical;
}
function url(value) {
  if (value === null || value === undefined) return null;
  const normalized = text(value, 2048, 'NEWBISEO_URL_INVALID');
  let parsed;
  try { parsed = new URL(normalized); } catch { fail('NEWBISEO_URL_INVALID'); }
  check(['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password, 'NEWBISEO_URL_INVALID');
  return parsed.toString();
}
function enumValue(value, allowed, code) {
  check(typeof value === 'string' && allowed.has(value), code);
  return value;
}
function unique(items, key, code) {
  const seen = new Set();
  for (const item of items) {
    const value = key(item);
    check(!seen.has(value), code, value);
    seen.add(value);
  }
  return items;
}
function idRefs(values, known, min, max, code) {
  check(Array.isArray(values) && values.length >= min && values.length <= max, code);
  const result = values.map(value => token(value, code));
  unique(result, value => value, code);
  for (const value of result) check(known.has(value), code, value);
  return result;
}
function stringList(values, min, max, maxChars, code) {
  check(Array.isArray(values) && values.length >= min && values.length <= max, code);
  const result = values.map(value => text(value, maxChars, code));
  unique(result, value => value, code);
  return result;
}

function normalizeRequest(raw) {
  exactObject(raw, ['query', 'subject', 'subjectKind', 'asOf'], ['aliases', 'language', 'requestRef']);
  const aliases = raw.aliases === undefined ? [] : stringList(raw.aliases, 0, 12, 120, 'NEWBISEO_ALIAS_INVALID');
  return {
    query: text(raw.query, 300, 'NEWBISEO_QUERY_INVALID'),
    subject: text(raw.subject, 160, 'NEWBISEO_SUBJECT_INVALID'),
    subjectKind: enumValue(raw.subjectKind, SUBJECT_KINDS, 'NEWBISEO_SUBJECT_KIND_INVALID'),
    asOf: iso(raw.asOf),
    aliases,
    language: raw.language === undefined ? 'ko' : enumValue(raw.language, new Set(['ko']), 'NEWBISEO_LANGUAGE_INVALID'),
    requestRef: raw.requestRef === undefined || raw.requestRef === null ? null : text(raw.requestRef, 240, 'NEWBISEO_REFERENCE_INVALID'),
  };
}

function normalizeSources(raw) {
  check(Array.isArray(raw) && raw.length >= 1 && raw.length <= 60, 'NEWBISEO_SOURCE_INVALID');
  const sources = raw.map(item => {
    exactObject(item, ['id', 'kind', 'title', 'publisher', 'publishedAt'], ['eventAt', 'url', 'authorityNote']);
    return {
      id: token(item.id, 'NEWBISEO_SOURCE_ID_INVALID'),
      kind: enumValue(item.kind, SOURCE_KINDS, 'NEWBISEO_SOURCE_KIND_INVALID'),
      title: text(item.title, 300, 'NEWBISEO_SOURCE_TITLE_INVALID'),
      publisher: text(item.publisher, 160, 'NEWBISEO_SOURCE_PUBLISHER_INVALID'),
      publishedAt: iso(item.publishedAt),
      eventAt: item.eventAt === undefined || item.eventAt === null ? null : iso(item.eventAt),
      url: url(item.url),
      authorityNote: item.authorityNote === undefined || item.authorityNote === null ? null : text(item.authorityNote, 300, 'NEWBISEO_SOURCE_NOTE_INVALID'),
    };
  });
  return unique(sources, item => item.id, 'NEWBISEO_SOURCE_DUPLICATE');
}

function normalizeClaims(raw, sourceIds) {
  check(Array.isArray(raw) && raw.length >= 1 && raw.length <= 160, 'NEWBISEO_CLAIM_INVALID');
  const claims = raw.map(item => {
    exactObject(item, ['id', 'text', 'status', 'sourceIds'], ['date', 'note']);
    return {
      id: token(item.id, 'NEWBISEO_CLAIM_ID_INVALID'),
      text: text(item.text, 800, 'NEWBISEO_CLAIM_TEXT_INVALID'),
      status: enumValue(item.status, CLAIM_STATUS, 'NEWBISEO_CLAIM_STATUS_INVALID'),
      sourceIds: idRefs(item.sourceIds, sourceIds, 1, 8, 'NEWBISEO_CLAIM_SOURCE_INVALID'),
      date: item.date === undefined || item.date === null ? null : iso(item.date),
      note: item.note === undefined || item.note === null ? null : text(item.note, 400, 'NEWBISEO_CLAIM_NOTE_INVALID'),
    };
  });
  return unique(claims, item => item.id, 'NEWBISEO_CLAIM_DUPLICATE');
}

function normalizeStory(raw, claimIds) {
  exactObject(raw, ['title', 'openingClaimIds', 'timeline', 'current'], ['whyNow']);
  check(Array.isArray(raw.timeline) && raw.timeline.length >= 1 && raw.timeline.length <= 12, 'NEWBISEO_TIMELINE_INVALID');
  const timeline = raw.timeline.map(item => {
    exactObject(item, ['date', 'label', 'claimIds']);
    return {
      date: iso(item.date),
      label: text(item.label, 180, 'NEWBISEO_TIMELINE_LABEL_INVALID'),
      claimIds: idRefs(item.claimIds, claimIds, 1, 8, 'NEWBISEO_TIMELINE_CLAIM_INVALID'),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
  unique(timeline, item => `${item.date}\u0000${item.label}`, 'NEWBISEO_TIMELINE_DUPLICATE');

  exactObject(raw.current, ['status', 'label', 'claimIds'], ['remaining']);
  const current = {
    status: enumValue(raw.current.status, CURRENT_STATUS, 'NEWBISEO_CURRENT_STATUS_INVALID'),
    label: text(raw.current.label, 500, 'NEWBISEO_CURRENT_LABEL_INVALID'),
    claimIds: idRefs(raw.current.claimIds, claimIds, 1, 10, 'NEWBISEO_CURRENT_CLAIM_INVALID'),
    remaining: raw.current.remaining === undefined ? [] : stringList(raw.current.remaining, 0, 5, 240, 'NEWBISEO_REMAINING_INVALID'),
  };

  let whyNow = null;
  if (raw.whyNow !== undefined && raw.whyNow !== null) {
    exactObject(raw.whyNow, ['label', 'claimIds']);
    whyNow = {
      label: text(raw.whyNow.label, 400, 'NEWBISEO_WHY_NOW_INVALID'),
      claimIds: idRefs(raw.whyNow.claimIds, claimIds, 1, 8, 'NEWBISEO_WHY_NOW_CLAIM_INVALID'),
    };
  }
  return {
    title: text(raw.title, 180, 'NEWBISEO_TITLE_INVALID'),
    openingClaimIds: idRefs(raw.openingClaimIds, claimIds, 1, 8, 'NEWBISEO_OPENING_CLAIM_INVALID'),
    timeline,
    current,
    whyNow,
  };
}

function normalizeViewer(raw) {
  if (raw === undefined || raw === null) return {profileRef: null, allowedLenses: [...LENSES], context: []};
  exactObject(raw, [], ['profileRef', 'allowedLenses', 'context']);
  const allowedLenses = raw.allowedLenses === undefined ? [...LENSES] : raw.allowedLenses.map(value => enumValue(value, LENSES, 'NEWBISEO_LENS_INVALID'));
  check(allowedLenses.length >= 1 && allowedLenses.length <= LENSES.size, 'NEWBISEO_LENS_INVALID');
  unique(allowedLenses, value => value, 'NEWBISEO_LENS_DUPLICATE');
  const context = raw.context === undefined ? [] : raw.context.map(item => {
    exactObject(item, ['label', 'source'], ['value']);
    return {
      label: text(item.label, 120, 'NEWBISEO_CONTEXT_INVALID'),
      source: enumValue(item.source, CONTEXT_SOURCES, 'NEWBISEO_CONTEXT_SOURCE_INVALID'),
      value: item.value === undefined || item.value === null ? null : text(item.value, 300, 'NEWBISEO_CONTEXT_INVALID'),
    };
  });
  check(context.length <= 12, 'NEWBISEO_CONTEXT_INVALID');
  unique(context, item => `${item.source}\u0000${item.label}`, 'NEWBISEO_CONTEXT_DUPLICATE');
  return {
    profileRef: raw.profileRef === undefined || raw.profileRef === null ? null : text(raw.profileRef, 240, 'NEWBISEO_REFERENCE_INVALID'),
    allowedLenses,
    context,
  };
}

function normalizeAnalysis(raw, claimIds, viewer) {
  exactObject(raw, ['patterns', 'analogies', 'inspirations', 'takeaway'], ['uncertainties']);
  check(Array.isArray(raw.patterns) && raw.patterns.length >= 1 && raw.patterns.length <= 3, 'NEWBISEO_PATTERN_INVALID');
  const patterns = raw.patterns.map(item => {
    exactObject(item, ['id', 'kind', 'label', 'explanation', 'basisClaimIds']);
    return {
      id: token(item.id, 'NEWBISEO_PATTERN_ID_INVALID'),
      kind: enumValue(item.kind, PATTERN_KINDS, 'NEWBISEO_PATTERN_KIND_INVALID'),
      label: text(item.label, 160, 'NEWBISEO_PATTERN_LABEL_INVALID'),
      explanation: text(item.explanation, 800, 'NEWBISEO_PATTERN_EXPLANATION_INVALID'),
      basisClaimIds: idRefs(item.basisClaimIds, claimIds, 1, 12, 'NEWBISEO_PATTERN_BASIS_INVALID'),
      classification: 'interpretation',
    };
  });
  unique(patterns, item => item.id, 'NEWBISEO_PATTERN_DUPLICATE');
  const patternIds = new Set(patterns.map(item => item.id));

  check(Array.isArray(raw.analogies) && raw.analogies.length <= 3, 'NEWBISEO_ANALOGY_INVALID');
  const analogies = raw.analogies.map(item => {
    exactObject(item, ['id', 'title', 'outcome', 'similarities', 'differences', 'basisClaimIds']);
    return {
      id: token(item.id, 'NEWBISEO_ANALOGY_ID_INVALID'),
      title: text(item.title, 180, 'NEWBISEO_ANALOGY_TITLE_INVALID'),
      outcome: text(item.outcome, 600, 'NEWBISEO_ANALOGY_OUTCOME_INVALID'),
      similarities: stringList(item.similarities, 1, 4, 300, 'NEWBISEO_ANALOGY_SIMILARITY_INVALID'),
      differences: stringList(item.differences, 1, 4, 300, 'NEWBISEO_ANALOGY_DIFFERENCE_INVALID'),
      basisClaimIds: idRefs(item.basisClaimIds, claimIds, 1, 12, 'NEWBISEO_ANALOGY_BASIS_INVALID'),
      classification: 'comparison',
    };
  });
  unique(analogies, item => item.id, 'NEWBISEO_ANALOGY_DUPLICATE');
  const analogyIds = new Set(analogies.map(item => item.id));

  check(Array.isArray(raw.inspirations) && raw.inspirations.length >= 1 && raw.inspirations.length <= 3, 'NEWBISEO_INSPIRATION_INVALID');
  const inspirations = raw.inspirations.map(item => {
    exactObject(item, ['id', 'lens', 'title', 'idea', 'action', 'relevance', 'basisPatternIds'], ['basisAnalogyIds']);
    const lens = enumValue(item.lens, LENSES, 'NEWBISEO_LENS_INVALID');
    check(viewer.allowedLenses.includes(lens), 'NEWBISEO_LENS_NOT_ALLOWED', lens);
    const basisPatternIds = idRefs(item.basisPatternIds, patternIds, 1, 3, 'NEWBISEO_INSPIRATION_PATTERN_INVALID');
    const basisAnalogyIds = item.basisAnalogyIds === undefined ? [] : idRefs(item.basisAnalogyIds, analogyIds, 0, 3, 'NEWBISEO_INSPIRATION_ANALOGY_INVALID');
    return {
      id: token(item.id, 'NEWBISEO_INSPIRATION_ID_INVALID'),
      lens,
      title: text(item.title, 160, 'NEWBISEO_INSPIRATION_TITLE_INVALID'),
      idea: text(item.idea, 700, 'NEWBISEO_INSPIRATION_IDEA_INVALID'),
      action: text(item.action, 400, 'NEWBISEO_INSPIRATION_ACTION_INVALID'),
      relevance: enumValue(item.relevance, RELEVANCE, 'NEWBISEO_RELEVANCE_INVALID'),
      basisPatternIds,
      basisAnalogyIds,
      classification: 'personal_inspiration',
    };
  });
  unique(inspirations, item => item.id, 'NEWBISEO_INSPIRATION_DUPLICATE');
  unique(inspirations, item => item.lens, 'NEWBISEO_INSPIRATION_LENS_DUPLICATE');

  return {
    patterns,
    analogies,
    inspirations,
    takeaway: text(raw.takeaway, 240, 'NEWBISEO_TAKEAWAY_INVALID'),
    uncertainties: raw.uncertainties === undefined ? [] : stringList(raw.uncertainties, 0, 8, 400, 'NEWBISEO_UNCERTAINTY_INVALID'),
  };
}

function claimMap(claims) { return new Map(claims.map(item => [item.id, item])); }
function projectClaims(ids, byId) { return ids.map(id => byId.get(id)); }
function sourceUsage(claims) {
  const counts = new Map();
  for (const claim of claims) for (const id of claim.sourceIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
function bounded(value) {
  check(Buffer.byteLength(JSON.stringify(value), 'utf8') <= 1024 * 1024, 'NEWBISEO_OUTPUT_CAPACITY');
  return value;
}

/**
 * Validate and normalize a host-produced Newbiseo report.
 * Facts must already be researched and cited by the host.
 */
export function buildWorldview(input) {
  const raw = clone(input);
  exactObject(raw, ['request', 'sources', 'claims', 'story', 'analysis'], ['viewer']);
  const request = normalizeRequest(raw.request);
  const sources = normalizeSources(raw.sources);
  const sourceIds = new Set(sources.map(item => item.id));
  const claims = normalizeClaims(raw.claims, sourceIds);
  const claimIds = new Set(claims.map(item => item.id));
  const story = normalizeStory(raw.story, claimIds);
  const viewer = normalizeViewer(raw.viewer);
  const analysis = normalizeAnalysis(raw.analysis, claimIds, viewer);
  const byClaim = claimMap(claims);

  const result = {
    schema: SCHEMA,
    apiVersion: VERSION,
    request,
    story: {
      title: story.title,
      opening: projectClaims(story.openingClaimIds, byClaim),
      timeline: story.timeline.map(item => ({...item, claims: projectClaims(item.claimIds, byClaim)})),
      current: {...story.current, claims: projectClaims(story.current.claimIds, byClaim)},
      whyNow: story.whyNow === null ? null : {...story.whyNow, claims: projectClaims(story.whyNow.claimIds, byClaim)},
    },
    worldview: analysis,
    evidence: {
      sources,
      claims,
      sourceUsage: sourceUsage(claims),
      factStatuses: Object.fromEntries([...CLAIM_STATUS].map(status => [status, claims.filter(item => item.status === status).length])),
    },
    viewer: {
      profileRef: viewer.profileRef,
      allowedLenses: viewer.allowedLenses,
      contextLabelsUsed: viewer.context.map(item => ({label: item.label, source: item.source})),
      rawContextValuesReturned: false,
    },
    boundaries: {
      factsAndInterpretationSeparated: true,
      analogiesAreNotPredictions: true,
      factCheckingIsSupportLayer: true,
      worldviewIsPrimary: true,
      monitoringEnabled: false,
      backgroundTrackingEnabled: false,
      autoSaveEnabled: false,
      persistentStateChanged: false,
      authorizesExecution: false,
      existingSecondBrainMayBeUsedOnlyOnExplicitRequest: true,
    },
  };
  return bounded(result);
}

const LENS_LABELS = Object.freeze({
  economy: '💰 경제·돈', investment: '📈 투자', clinic_management: '🏥 병원·경영',
  work_management: '🧭 일·경영', relationships: '🤝 인간관계', mind_life: '🧠 정신·삶',
  ai_ideas: '🚀 AI·새 아이디어', other: '💡 다른 관점',
});

function cite(claim) { return `〔${claim.sourceIds.join('·')}〕`; }
function claimText(claim) {
  const prefix = claim.status === 'confirmed' ? '' : claim.status === 'reported' ? '보도상 ' :
    claim.status === 'alleged' ? '의혹·주장 단계: ' : claim.status === 'disputed' ? '다툼 있음: ' : '미확인: ';
  return `${prefix}${claim.text} ${cite(claim)}`;
}

/** Render a deterministic Korean draft. The host should replace source IDs with live citations. */
export function renderKorean(report) {
  check(report?.schema === SCHEMA && report?.apiVersion === VERSION, 'NEWBISEO_REPORT_INVALID');
  const lines = [`## 📰 뉴비서 | ${report.story.title}`, '', '### 🔥 그때 무슨 일이?', ''];
  for (const claim of report.story.opening) lines.push(claimText(claim));
  lines.push('', '### ⏳ 그 후 어떻게 됐나?', '');
  for (const item of report.story.timeline) {
    lines.push(`**${item.date} — ${item.label}**`);
    for (const claim of item.claims) lines.push(`- ${claimText(claim)}`);
  }
  lines.push('', '### 📍 그래서 지금은?', '', `**${report.story.current.label}**`);
  for (const claim of report.story.current.claims) lines.push(`- ${claimText(claim)}`);
  if (report.story.current.remaining.length) lines.push(`- 남은 절차·쟁점: ${report.story.current.remaining.join(' / ')}`);
  if (report.story.whyNow) {
    lines.push('', '### 🔄 왜 지금 다시 뉴스가 됐나?', '', report.story.whyNow.label);
    for (const claim of report.story.whyNow.claims) lines.push(`- ${claimText(claim)}`);
  }
  lines.push('', '## 🧭 세상을 보는 관점', '', '### 🔁 반복되는 패턴', '');
  for (const pattern of report.worldview.patterns) lines.push(`**${pattern.label}**  \n${pattern.explanation}`);
  lines.push('', '### 🕰️ 과거에도 비슷한 일이?', '');
  if (report.worldview.analogies.length) {
    for (const analogy of report.worldview.analogies) {
      lines.push(`**${analogy.title}**`, `- 닮은 점: ${analogy.similarities.join(' / ')}`, `- 다른 점: ${analogy.differences.join(' / ')}`, `- 당시 결말: ${analogy.outcome}`);
    }
  } else {
    lines.push('직접 비교할 만한 과거 유사사례는 찾지 못했다. 억지로 사례를 끼워 맞추지 않는다.');
  }
  lines.push('', '## 💡 이 뉴스에서 건질 것', '');
  for (const inspiration of report.worldview.inspirations) {
    lines.push(`### ${LENS_LABELS[inspiration.lens]}`, inspiration.idea, '', `**작게 적용하면:** ${inspiration.action}`, '');
  }
  if (report.worldview.uncertainties.length) {
    lines.push('### ⚠️ 아직 조심해서 볼 점', ...report.worldview.uncertainties.map(item => `- ${item}`), '');
  }
  lines.push('### 🎯 나에게 한 문장', '', `> **${report.worldview.takeaway}**`);
  return `${lines.join('\n').trim()}\n`;
}
