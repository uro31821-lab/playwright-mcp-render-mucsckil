import {requireCondition,safePublicUrl,boundedText} from './policy.mjs';
/** Source-backed factual report only. No GPT generation or external sending. */
export function buildGeneralWorkReport({title,sources=[],findings=[],totals=null,now=Date.now()}={}){
 const heading=boundedText(title,{max:150});
 requireCondition(Array.isArray(sources)&&sources.length>0&&sources.length<=30,'SOURCES_REQUIRED');
 requireCondition(Array.isArray(findings)&&findings.length>0&&findings.length<=100,'FINDINGS_REQUIRED');
 const sourceById=new Map();
 const refs=sources.map(s=>{
  requireCondition(s&&typeof s.id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(s.id)&&!sourceById.has(s.id),'SOURCE_ID_INVALID');
  const url=safePublicUrl(s.url);const observedAt=Date.parse(s.observedAt);
  requireCondition(Number.isFinite(observedAt)&&observedAt<=now+5000,'SOURCE_TIME_INVALID');
  sourceById.set(s.id,{url,observedAt});
  return {id:s.id,url,observedAt:new Date(observedAt).toISOString(),stale:now-observedAt>24*3600000};
 });
 const factRows=findings.map(f=>{
  requireCondition(f&&typeof f.sourceId==='string'&&sourceById.has(f.sourceId),'FACT_SOURCE_NOT_FOUND');
  const value=boundedText(f.text,{max:500});
  requireCondition(['CONFIRMED','ESTIMATED','UNKNOWN'].includes(f.status),'FACT_STATUS_INVALID');
  return {sourceId:f.sourceId,text:value,status:f.status};
 });
 if(totals!==null){requireCondition(totals&&typeof totals==='object'&&['INCOMPLETE','ESTIMATED','QUOTED'].includes(totals.kind),'TOTALS_MUST_COME_FROM_EXISTING_JH');}
 const fmtStatus={CONFIRMED:'확인',ESTIMATED:'추정',UNKNOWN:'미확인'};
 const markdown=['# '+heading,'','## 확인 내용',...factRows.map(x=>'- ['+fmtStatus[x.status]+'] '+x.text+' (출처 '+x.sourceId+')'),'','## 출처',...refs.map(x=>'- '+x.id+': '+x.url+' (관찰 '+x.observedAt+(x.stale?', **오래된 정보**':'')+')')];
 if(totals)markdown.push('','## 총액',totals.headline||'JH 기존 총액 엔진의 계산 결과 참조',...(totals.unknown||[]).map(x=>'- 미확인 비용: '+x));
 markdown.push('','※ 페이지 조회는 신청·예약·구매의 완료 증거가 아닙니다.');
 return {ok:true,title:heading,markdown:markdown.join('\n'),sources:refs,findings:factRows,completionClaim:false};
}
