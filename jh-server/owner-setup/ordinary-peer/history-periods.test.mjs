import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateHistoryPeriod} from './history-periods.mjs';

const compare = (a,b) => calculateHistoryPeriod({periods:[
  {label:'솔 기록',start:a[0],end:a[1]}, {label:'별 기록',start:b[0],end:b[1]}
]});

test('두 연대표의 교집합과 양 끝을 포함한 연도 수를 현재 입력으로 계산한다',()=>{
  for(const [a,b,terms] of [
    [[1632,1651],[1647,1660],['1647년부터 1651년까지','5개 연도']],
    [[17,22],[17,22],['17년부터 22년까지','6개 연도']],
    [[4,4],[1,40],['4년 한 해']],
    [[2100,2200],[2200,2210],['2200년 한 해']],
    [[1,9999],[1,9999],['1년부터 9999년까지','9999개 연도']]
  ]) {
    for(const args of [[a,b],[b,a]]) {
      const result=compare(...args);assert.equal(result.operation,'compare_supplied_year_ranges');
      assert.notEqual(result.availability,'unavailable');
      for(const term of terms) assert.ok(result.text.includes(term));
    }
  }
});
test('자료 순서와 별개로 시기 순서를 표시하고 사이에 낀 연도만 센다',()=>{
  const adjacent=compare([1974,1985],[1986,2020]);
  assert.match(adjacent.text,/시기 순서는 「솔 기록」 다음 「별 기록」/);
  assert.match(adjacent.text,/바로 이웃한 연도/);
  const separated=compare([2001,2099],[1951,1997]);
  assert.match(separated.text,/시기 순서는 「별 기록」 다음 「솔 기록」/);
  assert.match(separated.text,/연도는 3개/);
});
test('미상 경계에서 검증되는 순서나 겹침만 보존하고 모호한 경우는 미확인으로 둔다',()=>{
  assert.match(compare([null,123],[127,null]).text,/겹치는 연도는 없습니다.*3개/);
  assert.match(compare([null,1804],[1804,null]).text,/겹치는 시기는 1804년 한 해/);
  assert.match(compare([1803,null],[1801,1805]).text,/1803년 한 해.*전체 겹침 범위는 확정할 수 없습니다/);
  assert.match(compare([1,9999],[null,null]).text,/겹치는 것은 확실하지만, 겹치는 연도는 특정할 수 없습니다/);
  for(const args of [[[null,1830],[1829,null]],[[null,null],[null,null]]]) {
    const result=compare(...args);assert.equal(result.availability,'unavailable');
    assert.match(result.text,/겹침이나 순서를 확정할 수 없습니다/);
  }
});
test('역전된 범위와 추정 연도, 서기 밖 숫자, 출처 이름 충돌을 받아들이지 않는다',()=>{
  const valid={label:'봉우리',start:1451,end:1465};
  for(const bad of [null,{},[],['봉우리',1,2],{...valid,start:0},{...valid,start:-1},
    {...valid,end:10000},{...valid,start:1451.5},{...valid,start:1466},{...valid,start:'약 1451'},
    {...valid,start:NaN},{...valid,end:Infinity},{...valid,start:undefined},{label:'x',end:2},
    {...valid,era:'단기'},{...valid,label:' '},{...valid,label:'공\n지'},{...valid,label:'x'.repeat(49)},
    {...valid,label:'x\u202ey'},{...valid,label:'봉우리 '}]) {
    assert.throws(()=>calculateHistoryPeriod({periods:[valid,bad]}));
  }
  for(const bad of [null,{}, {periods:[]},{periods:[valid]},{periods:[valid,valid,valid]},
       {periods:[valid,{...valid,label:'계곡'}],another:true}]) assert.throws(()=>calculateHistoryPeriod(bad));
});
test('누락 가능한 모든 경계 조합을 완전히 알려진 두 구간의 독립 열거와 대조한다',()=>{
  const known=[1,2,3,4,9999];
  // Add values inside the wide 4..9999 interval so completions can touch, strictly
  // overlap, or have a gap between the supplied boundary values.
  const samples=[1,2,3,4,5,6,998,9998,9999];
  const all=samples.flatMap(start=>samples.filter(end=>end>=start).map(end=>[start,end]));
  const variants=[null,...known].flatMap(start=>[null,...known]
    .filter(end=>start===null||end===null||start<=end).map(end=>[start,end]));
  const completions=range=>all.filter((interval)=>range.every((v,i)=>v===null||v===interval[i]));
  let count=0;
  for(const a of variants) for(const b of variants) {
    const relations=new Set(), intersections=new Set();
    let latestOverlapStart=0, earliestOverlapEnd=10000;
    for(const [x,y] of completions(a)) for(const [u,v] of completions(b)) {
      if (y<u) relations.add('A_before');
      else if (v<x) relations.add('B_before');
      else {
        relations.add('overlap');
        const lo=Math.max(x,u), hi=Math.min(y,v);
        intersections.add(lo+','+hi);
        latestOverlapStart=Math.max(latestOverlapStart,lo);
        earliestOverlapEnd=Math.min(earliestOverlapEnd,hi);
      }
    }
    const r=compare(a,b);
    if(relations.size>1) {
      assert.equal(r.availability,'unavailable');
    } else if(!relations.has('overlap')) {
      const ordered=relations.has('A_before')?'「솔 기록」 다음 「별 기록」':'「별 기록」 다음 「솔 기록」';
      assert.ok(r.text.includes(ordered) && r.text.includes('겹치는 연도는 없습니다'));
    } else if(intersections.size===1) {
      const [lo,hi]=[...intersections][0].split(',').map(Number);
      const required=lo===hi?lo+'년 한 해':lo+'년부터 '+hi+'년까지(양 끝 포함 '+(hi-lo+1)+'개 연도)';
      assert.ok(r.text.includes('겹치는 시기는 '+required));
    } else if(latestOverlapStart>earliestOverlapEnd) {
      assert.ok(r.text.includes('겹치는 것은 확실하지만'));
    } else {
      const lo=latestOverlapStart, hi=earliestOverlapEnd;
      const required=lo===hi?lo+'년 한 해':lo+'년부터 '+hi+'년까지';
      assert.ok(r.text.includes(required) && r.text.includes('전체 겹침 범위는 확정할 수 없습니다'));
    }
    count++;
  }
  assert.equal(count,676);
});
