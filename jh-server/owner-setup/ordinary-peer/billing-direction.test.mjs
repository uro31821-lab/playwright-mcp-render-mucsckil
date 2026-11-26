import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate} from './role-calculations.mjs';

for (const [name, input, expected] of [
  ['환급까지 반영하면 대안이 더 비쌈', [150000, 12000, 143000, 3000], '대안 선택 시 지출이 2,000원 늘어납니다.'],
  ['표시 가격은 달라도 순지출은 같음', [10000, 3000, 9000, 2000], '두 안의 순지출은 같습니다.'],
  ['대안의 순지출이 더 적음', [14000, 2000, 17000, 8000], '대안 선택 시 지출 감소액은 3,000원입니다.'],
  ['환급이 비용보다 많은 두 안', [1000, 4000, 1000, 3000], '대안 선택 시 지출이 1,000원 늘어납니다.'],
]) {
  test(name, () => {
    const [baselineCosts, baselineRefunds, alternativeCosts, alternativeRefunds] = input;
    const reply = calculate('billing', {baselineCosts, baselineRefunds, alternativeCosts, alternativeRefunds});
    assert.equal(reply.operation, 'net_cashflow_krw');
    assert.ok(reply.text.endsWith(expected), reply.text);
  });
}
