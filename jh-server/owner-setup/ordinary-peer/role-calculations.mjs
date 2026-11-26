// Read-only operations on the minimum facts already present in the owner's current conversation.
import {z} from 'zod';
import {compareSuppliedMenus, menuComparisonSchema} from './menu-comparison.mjs';
import {compareReservationTimes, reservationTimesSchema} from './reservation-times.mjs';
import {compareRepairQuotes, repairQuotesSchema} from './repair-quotes.mjs';
import {reviewSuppliedCooperation} from './cooperation-review.mjs';
import {cooperationReviewSchema} from './cooperation-review-schema.mjs';
import {assessDocumentList} from './document-list.mjs';
import {documentListSchema} from './document-list-schema.mjs';
import {calculateNostalgiaAges} from './nostalgia-ages.mjs';
import {reviewNotice} from './notice-review.mjs';
import {calculateHistoryPeriod} from './history-periods.mjs';
import {classifyCheongbiseoFile} from '../../../host-cheongbiseo-cleanup/policy.mjs';

const whole = z.number().int().min(0).max(1_000_000_000_000);
const positive = whole.min(1);
const days = positive.max(366);
const label = z.string().trim().min(1).max(48).regex(/^[^\u0000-\u001F\u007F]+$/u);
const timestamp = z.string().datetime({offset:true}).refine(value=>Number.isFinite(Date.parse(value)));
const periodYear=z.number().int().min(1).max(9999).nullable();
const docLabel=z.string().min(1).max(64);
const schemas = {
  food: menuComparisonSchema(z),
  reservation: reservationTimesSchema(z),
  repair: repairQuotesSchema(z),
  suggestion: cooperationReviewSchema(z),
  government_services: documentListSchema(z),
  nostalgia: z.object({
    birthYear: periodYear,
    records: z.array(z.object({label,year:periodYear}).strict()).min(1).max(6)
  }).strict(),
  history:z.object({periods:z.array(z.object({label,start:periodYear,end:periodYear}).strict()).length(2)}).strict(),
  official_document:z.object({noticeId:docLabel,documents:z.array(z.object({
    ref:docLabel,noticeId:docLabel,text:z.string().min(1).max(1200),
    corrects:docLabel.optional(),mode:z.enum(['amend','replace']).optional()
  }).strict()).min(1).max(12)}).strict(),
  photo: z.object({observations:z.array(z.object({
    ref:label,
    match:z.enum(['seen','possible','absent','unread']),
    captureTimeMs:z.number().int().min(-8_640_000_000_000_000).max(8_640_000_000_000_000).nullish(),
    detail:z.string().trim().min(1).max(100).optional()
  }).strict()).min(1).max(16)}).strict(),
  pricing: z.object({offers:z.array(z.object({name:label,price:whole,quantity:positive}).strict()).min(2).max(6)}).strict(),
  shopping: z.object({dailyUse:whole,horizonDays:days,packSize:positive,stock:whole,unit:label}).strict(),
  revenue: z.object({cumulativeRevenue:whole,actualWorkdays:days,totalWorkdays:days}).strict(),
  billing: z.object({baselineCosts:whole,baselineRefunds:whole,alternativeCosts:whole,alternativeRefunds:whole}).strict(),
  cleanup: z.object({name:label,createdAt:timestamp,asOf:timestamp}).strict()
};
export const workInputSchema = z.union(Object.values(schemas));
const group = n=>n.toLocaleString('ko-KR',{maximumFractionDigits:2});
const operations = {
  photo({observations}) {
    const refs=observations.map(row=>row.ref);
    if(new Set(refs).size!==refs.length)throw Error('DUPLICATE_OBSERVATION');
    if(observations.some(row=>['seen','possible'].includes(row.match)&&!row.detail))throw Error('OBSERVATION_DETAIL_REQUIRED');
    const confirmed=observations.filter(row=>row.match==='seen');
    const dated=confirmed.filter(row=>row.captureTimeMs!=null);
    let latest='촬영 시각이 기록된 확인 사진은 없습니다.';
    if(dated.length) {
      const last=Math.max(...dated.map(row=>row.captureTimeMs));
      const labels=dated.filter(row=>row.captureTimeMs===last).map(row=>row.ref);
      latest='촬영 시각이 기록된 확인 사진 중 가장 최근은 '+labels.join(', ')+'입니다 ('+new Date(last).toISOString()+').';
    }
    const possible=observations.filter(row=>row.match==='possible').length;
    const unread=observations.filter(row=>row.match==='unread').length;
    return ['latest_confirmed_observation','제공된 관찰표 기준입니다. '+latest+
      ' 촬영 시각 미상 확인 '+(confirmed.length-dated.length)+'건, 불확실 '+possible+'건, 미열람 '+unread+'건입니다.'];
  },
  pricing(data) {
    const offers = data.offers;
    if(new Set(offers.map(o=>o.name)).size!==offers.length)throw Error('DUPLICATE_LABEL');
    const cmp=(a,b)=>BigInt(a.price)*BigInt(b.quantity)-BigInt(b.price)*BigInt(a.quantity);
    const lowest=offers.reduce((best,offer)=>cmp(offer,best)<0n?offer:best);
    const equal=offers.filter(offer=>cmp(offer,lowest)===0n);
    return ['unit_price_krw', '같은 상품·단위로 받은 견적의 최저 단가는 개당 약 '+group(lowest.price/lowest.quantity)+'원입니다. 해당 견적은 '+equal.map(x=>x.name).join(', ')+'입니다.'];
  },
  shopping({dailyUse,horizonDays,packSize,stock,unit}) {
    const shortage=Math.max(0,dailyUse*horizonDays-stock);
    return ['pack_quantity','재고를 뺀 필요량은 '+group(shortage)+unit+'이고, 한 묶음 '+group(packSize)+unit+' 기준 '+group(Math.ceil(shortage/packSize))+'묶음입니다.'];
  },
  revenue({cumulativeRevenue,actualWorkdays,totalWorkdays}) {
    if(totalWorkdays<actualWorkdays)throw Error('WORKDAYS_OUT_OF_RANGE');
    return ['monthly_projection','전일까지 일평균 '+group(Math.round(cumulativeRevenue/actualWorkdays))+'원입니다. 이 평균이 유지되면 월 예상 매출은 '+group(Math.round(cumulativeRevenue*totalWorkdays/actualWorkdays))+'원입니다.'];
  },
  billing({baselineCosts,baselineRefunds,alternativeCosts,alternativeRefunds}) {
    const current=baselineCosts-baselineRefunds, alternative=alternativeCosts-alternativeRefunds;
    return ['net_cashflow_krw','같은 기간의 원화 순지출은 현재 '+group(current)+'원, 대안 '+group(alternative)+'원입니다. 대안 선택 시 지출 감소액은 '+group(current-alternative)+'원입니다.'];
  },
  cleanup({name,createdAt,asOf}) {
    const result=classifyCheongbiseoFile({name,createdAt},Date.parse(asOf));
    if(result.reason==='future_timestamp')throw Error('FUTURE_CREATION');
    return ['file_retention_check','제공된 파일의 기본 보존 기준은 '+group(result.thresholdMs/3600000)+'시간입니다. 기준 시각에 '+(result.status==='expired'?'기본 보존기간이 지났습니다.':'기본 보존기간 이내입니다.')+' 삭제는 수행하지 않았습니다.'];
  }
};
export function calculate(role,input) {
  const schema=Object.hasOwn(schemas,role)?schemas[role]:null;
  if(!schema)throw Error('ROLE_HAS_NO_INLINE_CALCULATION');
  const data=schema.parse(input);
  if(role==='food')return compareSuppliedMenus(data);
  if(role==='reservation')return compareReservationTimes(data);
  if(role==='repair')return compareRepairQuotes(data);
  if(role==='suggestion')return reviewSuppliedCooperation(data);
  if(role==='government_services')return assessDocumentList(data);
  if(role==='nostalgia')return calculateNostalgiaAges(data);
  if(role==='history')return calculateHistoryPeriod(data);
  if(role==='official_document')return reviewNotice(data);
  const [operation,text]=operations[role](data);
  return {operation,text};
}
