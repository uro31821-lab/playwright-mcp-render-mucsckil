/** Optional JH tool registration for the trusted owner-setup host. */
export function registerJHMultiStepTools({registerOAuthTool,z,textResult,coordinator}){
  if(typeof registerOAuthTool!=='function'||!z||typeof textResult!=='function'||!coordinator)throw Error('JH155_MCP_INJECTION_REQUIRED');
  const pass=fn=>async args=>{try{return textResult(await fn(args));}catch(e){return textResult({ok:false,code:e?.code||e?.message||'JH5_FAILURE',automaticReplay:false});}};
  const add=(name,title,description,schema,fn,readOnly=false)=>registerOAuthTool(name,{
    title,description,inputSchema:schema,annotations:{readOnlyHint:readOnly,destructiveHint:false,openWorldHint:false}
  },pass(fn));
  const workflowId=z.string().min(1).max(100);
  add('life_multistep_start','⑤ 다단계 작업 시작',
    '사용자가 직접 요청한 현재 JH 명령에만 새 작업을 만듭니다. 새 명령이면 기존 미완료 작업을 먼저 폐기하고 기존 외부 실행 기록은 보존합니다. 사용자 의도 외 확대/다른 사이트 자동 진행 금지.',
    {goal:z.string().min(1).max(2000),mode:z.enum(['COMPARE','PURCHASE']),scope:z.object({
      apps:z.array(z.string().min(1).max(180)).min(1).max(4),
      origins:z.array(z.string().url()).min(1).max(16),maxPaymentKRW:z.number().int().nonnegative(),
      mayCheckout:z.boolean().optional(),mayRequestApproval:z.boolean().optional()
    }).strict()},a=>coordinator.start(a));
  add('life_multistep_next','⑤ 현재 한 단계 실행',
    '한 번에 승인된 현재 단계 하나만 실행합니다. 추천 입력 후보는 오른쪽 화면에서 실제 확인한 구조화 정보여야 하며 원문에 없는 가격은 unknown입니다. 결제 승인 단계는 반드시 사용자 승인 링크로 넘기고 GPT는 누르지 않습니다. 사용자 승인 대기는 백그라운드 실행 금지.',
    {workflowId,input:z.object({recommendRequest:z.any().optional(),totalItems:z.any().optional(),payment:z.any().optional(),target:z.enum(['PHONE','BROWSER']).optional()}).optional()},
    a=>coordinator.advance(a));
  add('life_multistep_progress','⑤ 진행 상태 조회',
    '실행 중 단계·검증됨/미검증·총액·승인 대기·외부 결과 확인 수준을 읽기만 합니다. 오래된 명령은 자동 재개하지 않습니다.',{},()=>coordinator.checkedStatus(),true);
  add('life_multistep_replan','⑤ 같은 명령 안에서 조건 변경',
    '현재 사용자 명령의 가격·우선순위·조건 변경만 반영하고 선택/총액부터 다시 계획합니다. 결제 준비 이후에는 재계획하지 말고 이전 작업을 취소합니다.',
    {workflowId,conditions:z.object({budget:z.number().int().nonnegative().optional(),weights:z.any().optional(),requiredConditions:z.array(z.string()).optional(),preferredConditions:z.array(z.string()).optional(),query:z.string().optional()}).strict()},a=>coordinator.revise(a));
  add('life_multistep_cancel','⑤ 현재 작업 취소',
    '새 명령·직접 사이트 전환·강제 종료 시 미완료 작업을 영구 폐기하고 자동 재개하지 않습니다. 외부 거래/중복방지 증거는 기존 JH ledger에 남깁니다.',
    {workflowId},a=>coordinator.cancelWorkflow(a.workflowId));
  add('life_multistep_report','⑤ GPT 중간/최종 결과',
    '완료·미완료를 정확히 구분합니다. 결제 요청 전송과 판매처 영수증 확인, 은행 API 검증을 서로 혼동하지 않습니다.',
    {workflowId},a=>coordinator.checkedPreviewReport(a.workflowId),true);
}
