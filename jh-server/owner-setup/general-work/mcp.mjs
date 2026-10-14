/** Optional JH OAuth tool registration. It ONLY exposes planning, catalog and evidence gates.
 * To execute, route resulting plan to existing JH B5 executor + approved tools.
 */
import {planGeneralWork} from './planner.mjs';
import {FEATURE_CATALOG,EXISTING_JH_PORTS,INTENTS} from './catalog.mjs';
import {guardGeneralStep} from './policy.mjs';
import {buildGeneralWorkReport} from './report.mjs';
export function registerGeneralWorkTools({registerOAuthTool,z,textResult}){
 if(typeof registerOAuthTool!=='function'||!z||typeof textResult!=='function')throw Error('EXISTING_MCP_REGISTRATION_REQUIRED');
 const call=fn=>async args=>{try{return textResult(fn(args));}catch(e){return textResult({ok:false,code:/^[A-Z0-9_]{3,80}$/.test(e?.code)?e.code:'INVALID_GENERAL_WORK_INPUT'});}};
 registerOAuthTool('life_general_work_catalog',{title:'JH 일반 업무 기능 목록',description:'기존 도구의 일반 업무 기능과 명시적 제외 범위를 확인합니다. 서버·휴대폰 명령 실행이나 예약·결제는 하지 않습니다.',inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},call(()=>({ok:true,features:FEATURE_CATALOG,ports:EXISTING_JH_PORTS,exclusions:['병원 운영·진료 전용 프로그램','주식·열대어매매 전용 프로그램']})));
 registerOAuthTool('life_general_work_plan',{title:'JH 일반 업무 실행 계획',description:'검색·뉴스·번역·쇼핑·여행·예약·결제·책툰·식사·메모리아·앱간업무·보고를 기존 JH 포트에 계획만 연결합니다. 사용자가 명시적으로 현재 작업을 시작한 경우만 실행기로 인계하세요. 새 실행 엔진·자동 결제·자동 재개는 없습니다.',inputSchema:{request:z.string().min(1).max(2000),intent:z.enum(INTENTS).optional(),workflow_id:z.string().optional(),generation:z.number().int().nonnegative().optional(),payment_id:z.string().optional(),url:z.string().optional(),user_started:z.boolean().optional()},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},call(a=>planGeneralWork({request:a.request,intent:a.intent,workflowId:a.workflow_id,generation:a.generation,userStarted:a.user_started===true,options:{paymentId:a.payment_id,url:a.url}})));
 registerOAuthTool('life_general_work_check',{title:'JH 실행 직전 승인·분할화면 점검',description:'사용자가 선택한 현재 일반 업무의 단계가 실행 가능한지 현재 JH의 검증된 세션·좌우 화면·승인/결과 펜스를 기준으로 검토합니다. 직접 승인·결제·외부 확정은 수행하지 않습니다.',inputSchema:{plan:z.any(),step_id:z.string(),context:z.any(),observed_action:z.any().optional()},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},call(a=>guardGeneralStep({plan:a.plan,stepId:a.step_id,context:a.context,observedAction:a.observed_action})));
 registerOAuthTool('life_general_work_report',{title:'근거 기반 일반 자료 보고서',description:'현재 사용자 업무의 출처·관찰 날짜·확인/추정/미확인을 명시한 텍스트 보고서 작성. 원격 발송·저장 없이 결과만 반환합니다.',inputSchema:{title:z.string(),sources:z.array(z.any()),findings:z.array(z.any())},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},call(buildGeneralWorkReport));
}
