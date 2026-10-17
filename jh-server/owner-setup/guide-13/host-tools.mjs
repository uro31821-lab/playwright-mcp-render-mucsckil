/**
 * READ-ONLY MCP registration for 13 real-life guide scenarios.
 * No provider credentials, no Android execution, no payment/booking/sending.
 * Only current command_id is demanded from the existing signed host fence.
 * generation and plan_revision are *null* if the host doesn't expose them to this read-only tool.
 */
import {SCENARIOS,prepareGuide13} from './core.mjs';
export const GUIDE_13_TOOL_NAMES=Object.freeze(['life_guide13_catalog','life_guide13_plan']);
export function registerJHGuide13Tools({registerOAuthTool,z,textResult,getHostContext}={}){
 if(typeof registerOAuthTool!=='function'||typeof textResult!=='function'||typeof getHostContext!=='function'||!z)
   throw new Error('JH_GUIDE13_HOST_PORTS_REQUIRED');
 const ctx=()=>{
  const current=getHostContext();
  if(typeof current?.command_id!=='string'||!current.command_id)return null;
  return {protocol_version:'1.0',command_id:current.command_id,
   generation:current.generation??null,plan_revision:current.plan_revision??null,
   document_id:current.document_id??null};
 };
 const protect=e=>textResult({ok:false,code:e?.code||'GUIDE_13_READONLY_REJECTED',external_effect_status:'NOT_EXECUTED'});
 registerOAuthTool('life_guide13_catalog',{
  title:'JH 실생활 13개 가이드 기능 목록 — 읽기 전용',
  description:'기사·식당·상품·메모리아·책툰·식품·영상·예약·음악·메일·오류·송금문구·화면설명의 기능과 기존 제공자 도구만 안내합니다. 앱 조작이나 전송은 수행하지 않습니다.',
  inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
 },async()=>{
  try{const current=ctx();if(!current)return protect({code:'HOST_COMMAND_REQUIRED'});
   return textResult({ok:true,protocol_version:'1.0',command_id:current.command_id,
    scenarios:SCENARIOS.map(x=>({id:x.id,key:x.key,title:x.title,existing_tool:x.port})),
    manual_default:true,execution_authorized:false,external_effect_status:'NOT_EXECUTED'});
  }catch(e){return protect(e)}
 });
 registerOAuthTool('life_guide13_plan',{
  title:'JH 실생활 13개 공통 가이드 계획 — 실행 없음',
  description:'말씀하신 요청을 13가지 실생활 작업 중 하나로 분류하고 기존 검색·비교·화면·예약 도구와 사용자 직접 다음 행동을 제안합니다. “어디 눌러?” “계속”은 설명만 하며, 실행 요청도 기존 JH의 별도 승인과 현재 작업번호 검증 없이는 절대 실행하지 않습니다. 해당 도구는 실제 현재 화면·가격·재고를 읽지 않으므로 확인했다고 주장하지 않습니다.',
  inputSchema:{request:z.string().min(1).max(2000),hint:z.enum(SCENARIOS.map(x=>x.key)).optional(),previousMode:z.enum(['GUIDE','DELEGATION_REQUESTED']).optional()},
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
 },async ({request,hint,previousMode})=>{
  try{
   const current=ctx();if(!current)return protect({code:'HOST_COMMAND_REQUIRED'});
   return textResult(prepareGuide13({request,hint,previousMode:previousMode||'GUIDE',hostContext:current}));
  }catch(e){return protect(e)}
 });
 return {toolNames:[...GUIDE_13_TOOL_NAMES],effects:'READ_ONLY',externalActionsEnabled:false};
}
