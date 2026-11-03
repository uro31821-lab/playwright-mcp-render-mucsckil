import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDeepWorldview, renderDeepKorean, SCHEMA, VERSION} from './deep-worldview.mjs';

function baseReport({withAnalogy = true, withContext = true} = {}) {
  const analogies = withAnalogy ? [{
    id: 'A1', title: '과거 유사 사업', outcome: '절차 지연 뒤 조건부로 진행됐다.',
    similarities: ['행정 절차와 지역 갈등이 길었다.'], differences: ['사업 규모와 규제 환경이 다르다.'],
    basisClaimIds: ['C4'], classification: 'comparison',
  }] : [];
  return {
    schema: 'jh.newbiseo-worldview.v1', apiVersion: '1.0.0',
    request: {
      query: '제주 제2공항 지금 어떻게 됐어?', subject: '제주 제2공항', subjectKind: 'policy',
      asOf: '2026-11-03T11:30:00.000Z', aliases: ['제2공항'], language: 'ko', requestRef: 'conversation:news-story-1',
    },
    story: {current: {status: 'ongoing'}},
    worldview: {
      patterns: [
        {id: 'P1', kind: 'institutional', label: '발표보다 절차가 길다', explanation: '이해관계가 큰 사업은 발표 뒤 검토가 길어진다.', basisClaimIds: ['C1', 'C2', 'C3'], classification: 'interpretation'},
        {id: 'P2', kind: 'risk', label: '비용과 편익이 다르게 배분된다', explanation: '수혜와 부담이 같은 집단에 가지 않는다.', basisClaimIds: ['C2', 'C4'], classification: 'interpretation'},
      ],
      analogies,
      inspirations: [
        {id: 'I1', lens: 'economy', title: '발표보다 진행 증거를 보자', idea: '투자 판단은 발표보다 허가와 자금 집행을 본다.', action: '다음 판단에서 집행 증거를 확인한다.', relevance: 'direct', basisPatternIds: ['P1'], basisAnalogyIds: withAnalogy ? ['A1'] : [], classification: 'personal_inspiration'},
        {id: 'I2', lens: 'clinic_management', title: '절차 병목을 분리하자', idea: '병원 운영에서도 발표된 개선안보다 병목 단계가 실제 변화를 결정한다.', action: '한 단계의 대기 병목을 측정한다.', relevance: 'adjacent', basisPatternIds: ['P1', 'P2'], basisAnalogyIds: [], classification: 'personal_inspiration'},
      ],
      takeaway: '뉴스의 소음보다 절차와 이해관계의 이동을 보자.',
      uncertainties: ['최종 일정은 바뀔 수 있다.'],
    },
    evidence: {
      sources: [{id: 'S1'}, {id: 'S2'}, {id: 'S3'}],
      claims: [
        {id: 'C1', text: '사업이 발표됐다.', status: 'confirmed', sourceIds: ['S1'], date: '2015-11-10', note: null},
        {id: 'C2', text: '환경 검토와 지역 갈등이 이어졌다.', status: 'reported', sourceIds: ['S1', 'S2'], date: '2025-01-01', note: null},
        {id: 'C3', text: '현재 최종 종결은 아니다.', status: 'confirmed', sourceIds: ['S2'], date: '2026-11-01', note: null},
        {id: 'C4', text: '과거 유사 사업도 장기간 절차를 거쳤다.', status: 'confirmed', sourceIds: ['S3'], date: '2010-01-01', note: null},
        {id: 'C5', text: '일부 이해관계자는 편익을 기대한다.', status: 'reported', sourceIds: ['S2'], date: '2026-11-01', note: null},
        {id: 'C6', text: '다른 이해관계자는 비용과 환경 위험을 우려한다.', status: 'reported', sourceIds: ['S2'], date: '2026-11-01', note: null},
      ],
      sourceUsage: {S1: 2, S2: 4, S3: 1},
      factStatuses: {confirmed: 4, reported: 2, alleged: 0, disputed: 0, unknown: 0},
    },
    viewer: {
      profileRef: withContext ? 'existing_jh:owner-profile' : null,
      allowedLenses: ['economy', 'clinic_management'],
      contextLabelsUsed: withContext ? [
        {label: '제주 거주', source: 'existing_jh'},
        {label: '병원 운영', source: 'existing_jh'},
      ] : [],
      rawContextValuesReturned: false,
    },
    boundaries: {
      factsAndInterpretationSeparated: true, analogiesAreNotPredictions: true,
      factCheckingIsSupportLayer: true, worldviewIsPrimary: true,
      monitoringEnabled: false, backgroundTrackingEnabled: false, autoSaveEnabled: false,
      persistentStateChanged: false, authorizesExecution: false,
      existingSecondBrainMayBeUsedOnlyOnExplicitRequest: true,
    },
  };
}

function deepInput({withAnalogy = true, withContext = true} = {}) {
  const strength1 = withContext ? 'direct' : 'general';
  const strength2 = withContext ? 'adjacent' : 'general';
  return {
    mode: 'deep',
    causalMap: [
      {id: 'K1', causeClaimIds: ['C1', 'C2'], mechanism: '발표 뒤 환경·행정 절차가 실제 진행 속도를 제한했다.', effectClaimIds: ['C3'], confidence: 'high', counterClaimIds: []},
      {id: 'K2', causeClaimIds: ['C5', 'C6'], mechanism: '편익과 비용이 다른 집단에 배분돼 갈등이 장기화됐다.', effectClaimIds: ['C2'], confidence: 'medium', counterClaimIds: []},
    ],
    stakeholders: [
      {id: 'H1', name: '사업 추진 주체', role: 'decision_maker', objective: '사업 절차를 완료한다.', leverage: 'high', gains: '정책 목표 달성', losses: '지연 비용과 정치적 부담', risk: '절차 하자와 신뢰 저하', basisClaimIds: ['C1', 'C3']},
      {id: 'H2', name: '지역 이해관계자', role: 'cost_bearer', objective: '편익은 확보하고 환경·생활 비용은 줄인다.', leverage: 'medium', gains: '교통 편익과 사업 기회', losses: '환경·생활 변화 비용', risk: '갈등 장기화와 지역 분열', basisClaimIds: ['C5', 'C6']},
    ],
    tradeoffs: [
      {id: 'T1', title: '개발 속도와 절차 신뢰', sideA: '사업을 빠르게 진행한다.', sideB: '환경·지역 검토를 충분히 한다.', whyHard: '속도를 높이면 절차 신뢰가 약해질 수 있고 검토를 늘리면 비용과 지연이 커진다.', stakeholderIds: ['H1', 'H2'], basisClaimIds: ['C2', 'C3', 'C6']},
    ],
    clocks: {
      media: {state: 'quiet', explanation: '초기 발표 때보다 기사량은 줄었지만 후속 절차는 남아 있다.', basisClaimIds: ['C2', 'C3']},
      institution: {state: 'review', explanation: '제도상 검토와 결정 절차가 아직 진행 중이다.', basisClaimIds: ['C2', 'C3']},
      realWorld: {state: 'not_started', explanation: '최종 종결이나 완전한 현실 변화는 확인되지 않았다.', basisClaimIds: ['C3']},
    },
    alternatives: [
      {id: 'E1', label: '갈등보다 행정 절차 자체가 지연의 핵심이라는 해석', explanation: '대형 사업은 갈등이 없어도 법정 절차와 검토 때문에 오래 걸릴 수 있다.', supportClaimIds: ['C2', 'C3'], challengeClaimIds: ['C5', 'C6'], whatWouldChangeMind: '갈등 해소 뒤에도 같은 속도로 지연되거나 공식 절차표가 지연 대부분을 설명하면 이 해석이 강해진다.', confidence: 'medium'},
    ],
    counterfactuals: [
      {id: 'F1', changedCondition: '초기 발표 전에 지역·환경 검토가 더 진행됐다면', expectedEffect: '발표 뒤 갈등과 재검토 비용이 일부 줄었을 가능성이 있다.', explanation: '정보 비대칭과 절차 순서가 갈등을 키웠을 수 있기 때문이다.', basisClaimIds: ['C1', 'C2'], confidence: 'low'},
    ],
    signposts: [
      {id: 'G1', signal: '공식 허가·예산·집행 일정의 확정', meaningIfObserved: '제도 단계가 현실 집행 단계로 이동한다.', meaningIfAbsent: '사업은 계속 검토·정체 상태에 머물 가능성이 크다.', horizon: 'near', sourceTypeNeeded: 'official', basisClaimIds: ['C3']},
      {id: 'G2', signal: '실제 현장 착수 또는 계약 집행', meaningIfObserved: '현실 변화의 시계가 움직이기 시작한다.', meaningIfAbsent: '공식 발표와 실제 변화 사이의 간격이 계속된다.', horizon: 'medium', sourceTypeNeeded: 'mixed', basisClaimIds: ['C3']},
    ],
    analogyReviews: withAnalogy ? [
      {analogyId: 'A1', structuralMatch: 'high', contextMatch: 'medium', outcomeTransferRisk: 'high', explanation: '절차 지연 구조는 닮았지만 시대·규제·규모가 달라 같은 결말을 예상하면 위험하다.'},
    ] : [],
    applicationReviews: [
      {inspirationId: 'I1', accepted: true, strength: strength1, contextLabelRefs: withContext ? ['제주 거주'] : [], rationale: '지역 정책과 투자 판단 모두 발표보다 허가·집행 증거를 보는 습관이 직접 도움이 된다.', burden: 'low', risk: 'low', smallAction: '다음 관련 판단에서 발표·허가·예산·집행을 네 칸으로 나눠 확인한다.', checkAfter: '다음 판단에서 집행 증거를 실제로 확인했는지 본다.'},
      {inspirationId: 'I2', accepted: false, strength: strength2, contextLabelRefs: withContext ? ['병원 운영'] : [], rationale: '병원 병목과 정책 사업 지연은 구조적으로 일부 닮지만 이번 사건만으로 새 운영안을 만들 근거는 부족하다.', burden: 'medium', risk: 'medium', smallAction: null, checkAfter: null},
    ],
    synthesis: {
      mainDriver: '발표 이후에도 이어지는 제도 절차와 서로 다르게 배분되는 편익·비용',
      strongestAlternativeId: 'E1',
      biggestUncertainty: '공식 절차가 언제 실제 집행으로 넘어갈지 확정되지 않았다.',
      whatWouldChangeView: '공식 허가·예산·현장 집행이 연속해서 확인되면 정체보다 진행 해석을 강화한다.',
      bottomLine: '뉴스가 조용한지보다 제도와 현실의 시계가 실제로 움직이는지를 봐야 한다.',
    },
  };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code);
}

test('builds a bounded deep worldview report', () => {
  const report = buildDeepWorldview(baseReport(), deepInput());
  assert.equal(report.schema, SCHEMA);
  assert.equal(report.apiVersion, VERSION);
  assert.equal(report.base.currentStatus, 'ongoing');
  assert.equal(report.anatomy.causalMap.length, 2);
  assert.equal(report.anatomy.stakeholders.length, 2);
  assert.deepEqual(report.quality.acceptedApplicationIds, ['I1']);
  assert.deepEqual(report.quality.rejectedApplicationIds, ['I2']);
  assert.equal(report.boundaries.monitoringEnabled, false);
  assert.equal(report.boundaries.autoSaveEnabled, false);
  assert.equal(report.boundaries.authorizesExecution, false);
});

test('renders the deep News Story headings', () => {
  const markdown = renderDeepKorean(buildDeepWorldview(baseReport(), deepInput()));
  for (const heading of ['심층 뉴스토리 — 사건 해부', '인과사슬', '이해관계 지도', '세 개의 시계', '가장 강한 반대 해석', '앞으로 볼 신호', '개인 영감 품질검사', '심층 결론']) {
    assert.match(markdown, new RegExp(heading));
  }
});

test('supports an honest no-analogy case', () => {
  const report = buildDeepWorldview(baseReport({withAnalogy: false}), deepInput({withAnalogy: false}));
  assert.equal(report.quality.analogyReviews.length, 0);
});

test('supports general inspiration when no personal context is present', () => {
  const report = buildDeepWorldview(baseReport({withContext: false}), deepInput({withContext: false}));
  assert.equal(report.quality.applicationReviews[0].strength, 'general');
  assert.deepEqual(report.quality.personalizationBasisLabels, []);
});

test('rejects a causal link that reuses the same fact as cause and effect', () => {
  const input = deepInput();
  input.causalMap[0].effectClaimIds = ['C1'];
  expectCode(() => buildDeepWorldview(baseReport(), input), 'NEWBISEO_DEEP_CAUSAL_OVERLAP');
});

test('rejects an unknown stakeholder claim reference', () => {
  const input = deepInput();
  input.stakeholders[0].basisClaimIds = ['NOPE'];
  expectCode(() => buildDeepWorldview(baseReport(), input), 'NEWBISEO_DEEP_STAKEHOLDER_BASIS_INVALID');
});

test('rejects an incomplete analogy quality review', () => {
  const input = deepInput();
  input.analogyReviews = [];
  expectCode(() => buildDeepWorldview(baseReport(), input), 'NEWBISEO_DEEP_ANALOGY_REVIEW_COVERAGE_INVALID');
});

test('rejects direct personalization without a real context label', () => {
  const input = deepInput({withContext: false});
  input.applicationReviews[0].strength = 'direct';
  expectCode(() => buildDeepWorldview(baseReport({withContext: false}), input), 'NEWBISEO_DEEP_PERSONAL_CONTEXT_REQUIRED');
});

test('rejects an accepted application without a small action', () => {
  const input = deepInput();
  input.applicationReviews[0].smallAction = null;
  expectCode(() => buildDeepWorldview(baseReport(), input), 'NEWBISEO_DEEP_ACCEPTED_ACTION_REQUIRED');
});

test('rejects an action attached to an excluded application', () => {
  const input = deepInput();
  input.applicationReviews[1].smallAction = '억지 행동';
  expectCode(() => buildDeepWorldview(baseReport(), input), 'NEWBISEO_DEEP_REJECTED_ACTION_FORBIDDEN');
});

test('rejects a review set with no accepted application', () => {
  const input = deepInput();
  input.applicationReviews[0].accepted = false;
  input.applicationReviews[0].smallAction = null;
  input.applicationReviews[0].checkAfter = null;
  expectCode(() => buildDeepWorldview(baseReport(), input), 'NEWBISEO_DEEP_NO_ACCEPTED_APPLICATION');
});

test('rejects a synthesis that names an unknown alternative', () => {
  const input = deepInput();
  input.synthesis.strongestAlternativeId = 'NOPE';
  expectCode(() => buildDeepWorldview(baseReport(), input), 'NEWBISEO_DEEP_SYNTHESIS_ALTERNATIVE_INVALID');
});

test('rejects tracking or other undeclared top-level fields', () => {
  const input = deepInput();
  input.monitor = true;
  expectCode(() => buildDeepWorldview(baseReport(), input), 'NEWBISEO_DEEP_INPUT_INVALID');
});

test('rejects accessor input without invoking the accessor', () => {
  const input = deepInput();
  let invoked = false;
  Object.defineProperty(input, 'mode', {enumerable: true, get() { invoked = true; return 'deep'; }});
  expectCode(() => buildDeepWorldview(baseReport(), input), 'NEWBISEO_DEEP_INPUT_INVALID');
  assert.equal(invoked, false);
});
