import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorldview, renderKorean} from './worldview.mjs';

function noAnalogySample() {
  return {
    request: {
      query: '사건 어떻게 됐어?',
      subject: '사건',
      subjectKind: 'event',
      asOf: '2026-11-03T12:40:00Z',
    },
    sources: [
      {id: 'S1', kind: 'official', title: '공식자료', publisher: '기관', publishedAt: '2026-11-03'},
    ],
    claims: [
      {id: 'C1', text: '확인된 사실이다.', status: 'confirmed', sourceIds: ['S1'], date: '2026-11-03'},
    ],
    story: {
      title: '사건',
      openingClaimIds: ['C1'],
      timeline: [{date: '2026-11-03', label: '확인', claimIds: ['C1']}],
      current: {status: 'ongoing', label: '진행 중이다.', claimIds: ['C1']},
    },
    analysis: {
      patterns: [
        {id: 'P1', kind: 'institutional', label: '절차가 중요하다', explanation: '발표와 실제 진행은 다르다.', basisClaimIds: ['C1']},
      ],
      analogies: [],
      inspirations: [
        {
          id: 'I1', lens: 'other', title: '확정 단계를 본다',
          idea: '말보다 실제로 되돌리기 어려운 단계를 확인한다.',
          action: '다음 확인 조건 한 가지를 적는다.', relevance: 'adjacent',
          basisPatternIds: ['P1'], basisAnalogyIds: [],
        },
      ],
      takeaway: '발표보다 실제 진행 단계를 보자.',
    },
  };
}

test('basic form always renders past-case and personal-idea sections', () => {
  const report = buildWorldview(noAnalogySample());
  const markdown = renderKorean(report);

  assert.match(markdown, /### 🕰️ 과거에도 비슷한 일이\?/);
  assert.match(markdown, /직접 비교할 만한 과거 유사사례는 찾지 못했다/);
  assert.match(markdown, /## 💡 이 뉴스에서 건질 것/);
  assert.match(markdown, /말보다 실제로 되돌리기 어려운 단계를 확인한다/);
  assert.match(markdown, /작게 적용하면/);
  assert.equal(report.worldview.inspirations.length, 1);
});
