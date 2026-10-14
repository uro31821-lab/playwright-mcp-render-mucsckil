/** JH154 split-comfort extension; reuses existing Secure56 device job helper. */
export const splitComfort10Insertion56 = String.raw`
  registerOAuthTool('life_android_split_comfort',{
    title:'JH 분할 화면 편의 10종',
    description:'기존 JH Secure Bridge를 통해 현재 실제 분할 화면의 앱·창·비율을 확인하고, 사용자가 저장한 보기 정보만 조회한다. 좌우·상하 또는 폴더블 상태를 재식별한다. 입력칸 가림 안내와 필요시 정확히 한 번만 스크롤한다. 사용자가 명령한 글자 확대·해제는 Android 화면 확대 기능이 허용된 경우에만 수행한다. 대상 잠금은 JH 앱 설정에서 켜고 끈다. 취소된 실행 작업은 어떤 모드에서도 자동 재개하지 않는다.',
    inputSchema:{
      mode:z.enum(['STATUS','MANUAL_HANDOFF','KEYBOARD_ADVICE','SCROLL_ONCE','ZOOM','ZOOM_RESET','RESTORE_INFO']),
      scale:z.number().min(1.2).max(3.0).optional(),
      target_text:z.string().max(100).optional()
    },annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
  },async(args)=>{
    const jobs={STATUS:['split_comfort_status','READ_ONLY','life_android_capture_work_window'],
      MANUAL_HANDOFF:['split_comfort_manual_handoff','READ_ONLY','life_android_capture_work_window'],
      KEYBOARD_ADVICE:['split_comfort_keyboard_advice','READ_ONLY','life_android_capture_work_window'],
      SCROLL_ONCE:['split_comfort_scroll_once','REVERSIBLE_WRITE','life_android_execute_computer_action'],
      ZOOM:['split_comfort_zoom','REVERSIBLE_WRITE','life_android_execute_computer_action'],
      ZOOM_RESET:['split_comfort_zoom_reset','REVERSIBLE_WRITE','life_android_execute_computer_action'],
      RESTORE_INFO:['split_comfort_restore_info','READ_ONLY','life_android_capture_work_window']};
    const rule=jobs[args.mode];
    if(!rule)return textResult({ok:false,code:'split_comfort_mode_invalid'});
    if(args.mode!=='ZOOM'&&(args.scale!==undefined||args.target_text!==undefined))
      return textResult({ok:false,code:'split_comfort_extra_parameter_forbidden'});
    if(args.mode==='ZOOM'&&typeof args.scale!=='number')
      return textResult({ok:false,code:'zoom_scale_required'});
    const payload=args.mode==='ZOOM'?{scale:args.scale,...(args.target_text?{targetText:args.target_text}:{})}:{};
    return textResult(await jhSplitScreenJob56(rule[0],payload,rule[1],rule[2],28000));
  });
`;
export function patchSplitComfort10(source){
  if(typeof source!=='string')throw Error('existing_server_source_required');
  const anchor="  registerOAuthTool('life_android_split_screen_assistant',{"
  if(source.split(anchor).length!==2 || !source.includes('jhSplitScreenJob56') ||
      source.includes("registerOAuthTool('life_android_split_comfort'"))
    throw Error('verified_split_screen_assistant_v2_anchor_required');
  const next=source.replace(anchor,splitComfort10Insertion56+anchor);
  if(next.replace(splitComfort10Insertion56+anchor,anchor)!==source)
    throw Error('split_comfort_patch_scope_mismatch');
  return next;
}
