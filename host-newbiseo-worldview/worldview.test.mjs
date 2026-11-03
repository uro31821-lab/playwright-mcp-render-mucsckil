import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorldview, renderKorean, SCHEMA, VERSION} from './worldview.mjs';

function sample() {
  return {
    request: {
      query: '제주 제2공항 지금 어떻게 됐어?',
      subject: '제주 제2공항',
      subjectKind: 'policy',
      asOf: '2026-11-03T11:30:00Z',
      aliases: ['제2공항'],
      requestRef: 'conversation:news-story-1',
    },
    sources: [
      {id: 'S1', kind: 'official', title: '기본계획 자료', publisher: '정부기관', publishedAt: '2025-01-01', url: 'https://example.org/a'},
      {id: 'S2', kind: 'news', title: '최근 절차 보도', publisher: '통신사', publishedAt: '2026-11-02', eventAt: '2026-11-01'},
      {id: 'S3', kind: 'official', title: '과거 유사 사업 기록', publisher: '공공기록', publishedAt: '2010-01-01'},
    ],
    claims: [
      {id: 'C1', text: '사업이 처음 발표됐다.', status: 'confirmed', sourceIds: ['S1'], date: '2015-11-10'},
      {id: 'C2', text: '환경과 지역 갈등을 둘러싼 절차가 이어졌다.', status: 'reported', sourceIds: ['S1', 'S2'], date: '2026-11-01'},
      {id: 'C3', text: '현재 최종 종결이 아니라 후속 행정 절차가 남아 있다.', status: 'confirmed', sourceIds: ['S2'], date: '2026-11-01'},
      {id: 'C4', text: '과거 유사 사업도 발표 뒤 긴 협의와 수정 과정을 거쳤다.', status: 'confirmed', sourceIds: ['S3'], date: '2010-01-01'},
    ],
    story: {
      title: '제주 제2공항',
      openingClaimIds: ['C1'],
      timeline: [
        {date: '2026-11-01', label: '최근 절차', claimIds: ['C2', 'C3']},
        {date: '2015-11-10', label: '사업 발표', claimIds: ['C1']},
      ],
      current: {status: 'ongoing', label: '사업은 진행 중이며 최종 결론 전이다.', claimIds: ['C3'], remaining: ['후속 행정 절차']},
      whyNow: {label: '최근 절차 변화가 보도됐다.', claimIds: ['C2']},
    },
    viewer: {
      profileRef: 'existing_jh:owner-profile',
      allowedLenses: ['economy', 'clinic_management', 'relationships', 'ai_ideas'],
      context: [
        {label: '제주 거주', source: 'existing_jh', value: '지역 이슈의 생활 영향이 큼'},
        {label: '병원 운영', source: 'existing_jh'},
      ],
    },
    analysis: {
      patterns: [
        {id: 'P1', kind: 'institutional', label: '큰 사업은 발표보다 절차가 길다', explanation: '사회적 합의가 필요한 사업은 조용한 기간에도 행정 절차가 누적된다.', basisClaimIds: ['C1', 'C2', 'C3']},
      ],
      analogies: [
        {id: 'A1', title: '과거 유사 공공사업', outcome: '수정과 협의를 거쳐 단계적으로 진행됐다.', similarities: ['발표 뒤 장기 협의'], differences: ['지역과 제도 조건이 다름'], basisClaimIds: ['C4']},
      ],
      inspirations: [
        {id: 'I1', lens: 'economy', title: '발표보다 확정 절차를 보자', idea: '경제 효과를 판단할 때 발표 시점보다 예산·허가·착공 같은 되돌리기 어려운 단계에 주목한다.', action: '관심 사업을 볼 때 다음 확정 절차 한 가지를 적는다.', relevance: 'direct', basisPatternIds: ['P1'], basisAnalogyIds: ['A1']},
        {id: 'I2', lens: 'clinic_management', title: '조용한 과정도 관리한다', idea: '성과가 보이지 않는 준비 기간에도 체크포인트를 남기면 조직의 진행 상태를 잃지 않는다.', action: '병원 개선 과제마다 다음 확인 조건을 한 줄로 둔다.', relevance: 'adjacent', basisPatternIds: ['P1']},
      ],
      uncertainties: ['향후 일정은 공식 결정에 따라 달라질 수 있다.'],
      takeaway: '큰 변화는 발표보다 되돌리기 어려운 다음 절차가 실제로 넘어갔는지를 보자.',
    },
  };
}

test('builds normalized source-backed worldview report', () => {
  const report = buildWorldview(sample());
  assert.equal(report.schema, SCHEMA);
  assert.equal(report.apiVersion, VERSION);
  assert.equal(report.story.timeline[0].date, '2015-11-10');
  assert.equal(report.story.timeline[1].date, '2026-11-01');
  assert.equal(report.story.current.status, 'ongoing');
  assert.equal(report.worldview.patterns[0].classification, 'interpretation');
  assert.equal(report.worldview.inspirations[0].classification, 'personal_inspiration');
  assert.equal(report.boundaries.monitoringEnabled, false);
  assert.equal(report.boundaries.autoSaveEnabled, false);
  assert.equal(report.viewer.rawContextValuesReturned, false);
  assert.deepEqual(report.viewer.contextLabelsUsed, [
    {label: '제주 거주', source: 'existing_jh'},
    {label: '병원 운영', source: 'existing_jh'},
  ]);
});

test('renders fixed News Story form', () => {
  const markdown = renderKorean(buildWorldview(sample()));
  for (const heading of ['🔥 그때 무슨 일이?', '⏳ 그 후 어떻게 됐나?', '📍 그래서 지금은?', '🧭 세상을 보는 관점', '🕰️ 과거에도 비슷한 일이?', '💡 이 뉴스에서 건질 것', '🎯 나에게 한 문장']) {
    assert.match(markdown, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(markdown, /〔S1〕/);
  assert.match(markdown, /보도상/);
});

test('separates interpretations from facts and reports source usage', () => {
  const report = buildWorldview(sample());
  assert.equal(report.evidence.factStatuses.confirmed, 3);
  assert.equal(report.evidence.factStatuses.reported, 1);
  assert.equal(report.evidence.sourceUsage.S1, 2);
  assert.equal(report.evidence.sourceUsage.S2, 2);
  assert.equal(report.boundaries.analogiesAreNotPredictions, true);
  assert.equal(report.boundaries.worldviewIsPrimary, true);
});

const invalid = [
  ['unknown claim source', value => { value.claims[0].sourceIds = ['NOPE']; }, 'NEWBISEO_CLAIM_SOURCE_INVALID'],
  ['unknown story claim', value => { value.story.current.claimIds = ['NOPE']; }, 'NEWBISEO_CURRENT_CLAIM_INVALID'],
  ['pattern without evidence', value => { value.analysis.patterns[0].basisClaimIds = []; }, 'NEWBISEO_PATTERN_BASIS_INVALID'],
  ['analogy without difference', value => { value.analysis.analogies[0].differences = []; }, 'NEWBISEO_ANALOGY_DIFFERENCE_INVALID'],
  ['unallowed lens', value => { value.analysis.inspirations[0].lens = 'investment'; }, 'NEWBISEO_LENS_NOT_ALLOWED'],
  ['unknown pattern link', value => { value.analysis.inspirations[0].basisPatternIds = ['NOPE']; }, 'NEWBISEO_INSPIRATION_PATTERN_INVALID'],
  ['duplicate source id', value => { value.sources.push({...value.sources[0]}); }, 'NEWBISEO_SOURCE_DUPLICATE'],
  ['duplicate inspiration lens', value => { value.analysis.inspirations[1].lens = 'economy'; }, 'NEWBISEO_INSPIRATION_LENS_DUPLICATE'],
  ['too many analogies', value => { value.analysis.analogies = Array.from({length: 4}, (_, i) => ({...value.analysis.analogies[0], id: `A${i + 1}`, title: `비교${i}`})); }, 'NEWBISEO_ANALOGY_INVALID'],
  ['too many inspirations', value => { value.analysis.inspirations = Array.from({length: 4}, (_, i) => ({...value.analysis.inspirations[0], id: `I${i + 1}`, lens: ['economy','clinic_management','relationships','ai_ideas'][i]})); }, 'NEWBISEO_INSPIRATION_INVALID'],
  ['tracking field rejected', value => { value.monitor = true; }, 'NEWBISEO_INPUT_INVALID'],
  ['autosave field rejected', value => { value.analysis.autoSave = true; }, 'NEWBISEO_INPUT_INVALID'],
  ['bad URL credentials', value => { value.sources[0].url = 'https://user:pass@example.org/a'; }, 'NEWBISEO_URL_INVALID'],
  ['bad current status', value => { value.story.current.status = 'finished'; }, 'NEWBISEO_CURRENT_STATUS_INVALID'],
];
for (const [name, mutate, code] of invalid) {
  test(`rejects ${name}`, () => {
    const value = sample();
    mutate(value);
    assert.throws(() => buildWorldview(value), error => error.code === code);
  });
}

test('allows no analogy when no honest structural match exists', () => {
  const value = sample();
  value.analysis.analogies = [];
  value.analysis.inspirations[0].basisAnalogyIds = [];
  const report = buildWorldview(value);
  assert.equal(report.worldview.analogies.length, 0);
});

test('allows minimal viewer context without persistence', () => {
  const value = sample();
  delete value.viewer;
  value.analysis.inspirations = [{
    id: 'I1', lens: 'other', title: '한 가지 생각', idea: '사건의 구조를 다른 결정에 대입해 본다.',
    action: '다음 결정에서 같은 패턴이 있는지 한 번 확인한다.', relevance: 'adjacent', basisPatternIds: ['P1'], basisAnalogyIds: ['A1'],
  }];
  const report = buildWorldview(value);
  assert.equal(report.viewer.profileRef, null);
  assert.equal(report.viewer.contextLabelsUsed.length, 0);
  assert.equal(report.boundaries.persistentStateChanged, false);
});

test('rejects prototype pollution and accessor inputs', () => {
  const value = sample();
  const malicious = Object.create(null);
  Object.assign(malicious, value);
  Object.defineProperty(malicious, 'viewer', {enumerable: true, get() { throw new Error('getter ran'); }});
  assert.throws(() => buildWorldview(malicious), error => error.code === 'NEWBISEO_INPUT_INVALID');
});
