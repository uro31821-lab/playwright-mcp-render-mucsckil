import {patchJH168Mobile13FixtureHttp56} from './mobile13-fixture-http.mjs';
import {signedMobileWaitConditionSource56} from './mobile13-wait-condition.mjs';
import {patchJH168Mobile13ActionPolicy56} from './mobile13-action-policy-patch.mjs';
/** JH168 review-only patch of legacy web command handlers over signed RIGHT Android Chrome. */
const JH168_MOBILE_WEB_REGISTER56="\n  // JH168: all nine historical web commands use the same signed RIGHT-phone executor.\n  // Never silently switch to the unrelated cloud Chromium profile.\n  let jhMobileWebCapture56=null;\n  function jhMobileWebReject56(code,extra={}){\n    return textResult({ok:false,route:\"android_right\",code,automaticReplay:false,...extra});\n  }\n  function jhMobileWebContext56(args,needsItem=false){\n    if(!jhSplitScreenContextId56(args?.context_id))return {error:\"MOBILE_CONTEXT_ID_REQUIRED\"};\n    const itemRef=String(args?.target_item_ref||args?.target||\"\");\n    if((needsItem||itemRef)&&!/^item_[a-f0-9]{16}$/.test(itemRef))\n      return {error:\"MOBILE_FRESH_ITEM_REF_REQUIRED\"};\n    return {contextId:args.context_id,itemRef};\n  }\n  async function jhMobileWebFollow56(args,action,command){\n    const bound=jhMobileWebContext56(args,action!==\"BACK\");\n    if(bound.error)return jhMobileWebReject56(bound.error,{\n      instruction:\"Use life_web_snapshot to obtain a fresh context_id and item_... reference from the same RIGHT Chrome window.\"});\n    if(typeof command!==\"string\"||!command.trim()||command.length>2000)\n      return jhMobileWebReject56(\"MOBILE_COMMAND_INVALID\");\n    // Original Secure56 one-shot step identity; never auto-generate or replay\n    // an uncertain effect against a different request ID.\n    const requestId=args?.request_id;\n    if(typeof requestId!==\"string\"||!/^[a-f0-9]{32}$/.test(requestId))\n      return jhMobileWebReject56(\"MOBILE_REQUEST_ID_REQUIRED\",{\n        instruction:\"Supply a unique 32-character lowercase hex request_id per intended action. Uncertain outcomes require readback, never another dispatch.\"});\n    const payload={contextId:bound.contextId,requestId,command,targetItemRef:bound.itemRef,action};\n    if(action===\"SET_TEXT\"){\n      const value=args?.text;\n      if(typeof value!==\"string\"||value.length>2000)return jhMobileWebReject56(\"MOBILE_TEXT_INVALID\");\n      payload.value=value;\n    }\n    if(jhSplitScreenPayloadHasLocalOnly56(payload))\n      return jhMobileWebReject56(\"MOBILE_LOCAL_INPUT_REQUIRED\",{localInputRequired:true});\n    if(action===\"SET_TEXT\"){\n      // Same phone input preflight/grant used by the original split-screen assistant.\n      const preflight=await jhSplitScreenJob56(\"split_screen_session_input_preflight\",{\n        contextId:bound.contextId,command,targetItemRef:bound.itemRef,action:\"SET_TEXT\"\n      },\"READ_ONLY\",\"life_android_capture_work_window\",26000);\n      if(preflight?.inputAllowed!==true||typeof preflight?.inputGrantToken!==\"string\")\n        return textResult({route:\"android_right\",automaticReplay:false,...preflight,\n          code:preflight?.code||\"MOBILE_INPUT_PREFLIGHT_NOT_GRANTED\"});\n      payload.inputGrantToken=preflight.inputGrantToken;\n    }\n    const result=await jhSplitScreenJob56(\"split_screen_session_followup\",payload,\n      \"REVERSIBLE_WRITE\",\"life_android_execute_computer_action\",43000);\n    return textResult({route:\"android_right\",automaticReplay:false,...result,\n      ...(action===\"BACK\"?{browserHistoryNavigationVerified:false}:{} )});\n  }\n  async function jhMobileWebRead56(args={}){\n    if(args.context_id!==undefined){\n      if(!jhSplitScreenContextId56(args.context_id))return jhMobileWebReject56(\"MOBILE_CONTEXT_ID_INVALID\");\n      const result=await jhSplitScreenJob56(\"split_screen_session_status\",\n        {contextId:args.context_id},\"READ_ONLY\",\"life_android_capture_work_window\");\n      return textResult({route:\"android_right\",automaticReplay:false,...result});\n    }\n    if(args.goal!==undefined&&(typeof args.goal!==\"string\"||args.goal.length>2000))\n      return jhMobileWebReject56(\"MOBILE_READ_GOAL_INVALID\");\n    const payload={splitSessionNonce:\"jh_split_\"+randomBytes(16).toString(\"hex\"),\n      ...(args.goal===undefined?{}:{goal:args.goal})};\n    if(jhSplitScreenPayloadHasLocalOnly56(payload))\n      return jhMobileWebReject56(\"MOBILE_LOCAL_INPUT_REQUIRED\",{localInputRequired:true});\n    const result=await jhSplitScreenJob56(\"split_screen_session_start\",payload,\n      \"READ_ONLY\",\"life_android_capture_work_window\");\n    return textResult({route:\"android_right\",automaticReplay:false,...result});\n  }\n\n  registerOAuthTool(\"life_web_navigate\",{\n    title:\"Open URL in phone RIGHT Chrome\",\n    description:\"Use the existing signed JH RIGHT Chrome URL opener. Never open cloud Playwright or substitute its login/profile.\",\n    inputSchema:{url:z.string()}\n  },async({url})=>{\n    let parsed;try{parsed=new URL(String(url||\"\"));}catch{}\n    if(!parsed||![\"https:\",\"http:\"].includes(parsed.protocol)||parsed.username||parsed.password)\n      return jhMobileWebReject56(\"MOBILE_URL_INVALID\");\n    if(parsed.hostname===\"t.kakao.com\"||parsed.hostname.endsWith(\".t.kakao.com\"))\n      return jhMobileWebReject56(\"MOBILE_NO_NATIVE_FALLBACK\");\n    return jhRightWebOpen56({service:parsed.href});\n  });\n\n  registerOAuthTool(\"life_web_snapshot\",{\n    title:\"Read phone RIGHT Chrome\",\n    description:\"Fresh signed RIGHT-pane START produces context_id and item references. With context_id read the same mobile session status. No cloud browser.\",\n    inputSchema:{context_id:z.string().optional(),goal:z.string().optional()}\n  },async(args)=>jhMobileWebRead56(args));\n\n  registerOAuthTool(\"life_web_click\",{\n    title:\"Click signed RIGHT-pane element\",\n    description:\"Requires a fresh item_ reference from the current phone context. CSS selectors and server-browser targets are rejected. One action; no replay.\",\n    inputSchema:{context_id:z.string(),request_id:z.string(),target_item_ref:z.string().optional(),\n      target:z.string().optional(),command:z.string().optional()}\n  },async(args)=>jhMobileWebFollow56(args,\"CLICK\",args.command||\"현재 오른쪽 화면의 지정 항목 클릭\"));\n\n  registerOAuthTool(\"life_web_type\",{\n    title:\"Type into signed RIGHT-pane element\",\n    description:\"Same phone context, fresh item ref and original SET_TEXT preflight. Credentials/OTP remain phone-local. Submit is a separate verified action.\",\n    inputSchema:{context_id:z.string(),request_id:z.string(),target_item_ref:z.string().optional(),target:z.string().optional(),\n      text:z.string(),submit:z.boolean().optional(),slowly:z.boolean().optional(),element:z.string().optional()}\n  },async(args)=>{\n    if(args.submit===true)return jhMobileWebReject56(\"MOBILE_SUBMIT_SEPARATE_ACTION_REQUIRED\");\n    if(args.element)return jhMobileWebReject56(\"MOBILE_CSS_SELECTOR_UNSUPPORTED\");\n    return jhMobileWebFollow56(args,\"SET_TEXT\",\"현재 오른쪽 화면의 지정 입력칸에 문자 입력\");\n  });\n\n  registerOAuthTool(\"life_web_select\",{\n    title:\"Select visible RIGHT-pane option\",\n    description:\"Two explicit verified steps: OPEN menu using its fresh item ref, read the updated options, PICK the fresh option item ref. Web internal values are not Android labels.\",\n    inputSchema:{context_id:z.string(),request_id:z.string(),phase:z.enum([\"OPEN\",\"PICK\"]),\n      target_item_ref:z.string().optional(),target:z.string().optional(),\n      values:z.array(z.string()).optional()}\n  },async(args)=>{\n    if(args.values!==undefined)return jhMobileWebReject56(\"MOBILE_SELECT_VISIBLE_ITEM_REQUIRED\");\n    return jhMobileWebFollow56(args,\"CLICK\",args.phase===\"OPEN\"?\n      \"오른쪽 화면에서 지정 선택 메뉴 열기\":\"오른쪽 화면에서 새로 확인한 옵션 선택\");\n  });\n\n  registerOAuthTool(\"life_web_press_key\",{\n    title:\"Supported RIGHT-pane navigation key\",\n    description:\"Only explicit Android BACK is currently bridged. Enter, Tab, Escape, Arrow keys require verified native action contracts and never silently use server Playwright.\",\n    inputSchema:{key:z.string(),context_id:z.string().optional(),request_id:z.string().optional()}\n  },async(args)=>{\n    if(![\"BACK\",\"AndroidBack\"].includes(args.key))\n      return jhMobileWebReject56(\"MOBILE_KEY_NOT_VERIFIED\",{requestedKey:args.key});\n    return jhMobileWebFollow56(args,\"BACK\",\"오른쪽 화면에서 Android 뒤로 가기 1회\");\n  });\n\n  registerOAuthTool(\"life_web_wait\",{\n    title:\"Read RIGHT-pane wait status\",\n    description:\"One signed read-only status check. Does not treat elapsed time as proof or auto-repeat. Condition-based native waiting requires separate device support.\",\n    inputSchema:{context_id:z.string(),time:z.number().optional(),expected_text:z.string().optional()}\n  },async(args)=>{\n    const bound=jhMobileWebContext56(args);\n    if(bound.error)return jhMobileWebReject56(bound.error);\n    if(args.time!==undefined&&(!Number.isFinite(args.time)||args.time<0||args.time>30))\n      return jhMobileWebReject56(\"MOBILE_WAIT_BUDGET_INVALID\");\n    const requestStartedAtMs=Date.now();\n    const observation=await jhSplitScreenJob56(\"split_screen_session_status\",\n      {contextId:bound.contextId},\"READ_ONLY\",\"life_android_capture_work_window\");\n    // Pure verification of ONE already authenticated status, never another\n    // phone job, web request or timed polling. No success without signed\n    // same-window/same-context proof and exact observed text.\n    const verdict=jhMobile13EvaluateCondition56({\n      contextId:bound.contextId,expectedText:args.expected_text,observation,requestStartedAtMs});\n    if(verdict.conditionVerified===true){\n      return textResult({ok:true,route:\"android_right\",code:verdict.code,\n        conditionVerified:true,observedAtMs:verdict.observedAtMs,\n        workWindowId:verdict.workWindowId,automaticReplay:false});\n    }\n    return jhMobileWebReject56(\"MOBILE_WAIT_CONDITION_UNVERIFIED\",{\n      conditionVerified:false,conditionDiagnostic:verdict.code,\n      statusReadback:observation,\n      instruction:\"Use a fresh life_web_snapshot readback to determine the actual phone result.\"});\n  });\n\n  registerOAuthTool(\"life_web_back\",{\n    title:\"Android BACK on RIGHT pane\",\n    description:\"One BACK action against the current signed phone context. Browser history navigation is not assumed: verify whether a popup, keyboard or page changed.\",\n    inputSchema:{context_id:z.string(),request_id:z.string()}\n  },async(args)=>jhMobileWebFollow56(args,\"BACK\",\"오른쪽 Chrome 뒤로 가기 1회\"));\n\n  registerOAuthTool(\"life_web_screenshot\",{\n    title:\"Consent-gated phone RIGHT-pane screenshot\",\n    description:\"Reuse EXACT original life_android_capture_work_window handler with phone-local screen consent, signed task and one-shot capture lease. Never capture cloud browser.\",\n    inputSchema:{device_id:z.string().optional(),task_digest:z.string(),\n      run_digest:z.string(),screen_grant_token:z.string(),\n      screen_consent_digest:z.string(),lease_token:z.string()}\n  },async(args)=>{\n    if(!jhMobileWebCapture56)return jhMobileWebReject56(\"MOBILE_NATIVE_CAPTURE_NOT_BOUND\");\n    if(!args.screen_grant_token||!args.screen_consent_digest||!args.lease_token)\n      return jhMobileWebReject56(\"MOBILE_CAPTURE_REQUIRES_PHONE_CONSENT\",{pixelsCaptured:false});\n    return jhMobileWebCapture56({...args,action:\"SCREENSHOT\"});\n  });\n";
export function patchJH168MobileWebCommands56(source){
  if(typeof source!=="string"||
      !source.includes("  let jhRightWebOpen56=null;")||
      !source.includes("jhSplitScreenJob56(")||
      !source.includes("jhSplitScreenContextId56(")||
      !source.includes("jhSplitScreenPayloadHasLocalOnly56(")||
      !source.includes("jhRequireCommand56(device)")||
      !source.includes("registerOAuthTool('life_android_split_screen_assistant'"))
    throw Error("JH168_MOBILE_EXECUTOR_PREREQUISITES_MISSING");
  const beginMarker='  registerOAuthTool("life_web_navigate",{';
  const endMarker='  registerOAuthTool("life_android_devices",{';
  if(source.split(beginMarker).length!==2||source.split(endMarker).length!==2)
    throw Error("JH168_MOBILE_REGISTRY_BOUNDARY_CHANGED");
  const a=source.indexOf(beginMarker),b=source.indexOf(endMarker,a);
  if(a<0||b<=a)throw Error("JH168_MOBILE_REGISTRY_ORDER_CHANGED");
  const old=source.slice(a,b);
  const names=["navigate","snapshot","click","type","select","press_key","wait","back","screenshot"];
  const upstream=["browser_navigate","browser_snapshot","browser_click","browser_type",
    "browser_select_option","browser_press_key","browser_wait","browser_navigate_back",
    "browser_take_screenshot"];
  for(let i=0;i<names.length;i++){
    if(old.split('registerOAuthTool("life_web_'+names[i]+'",{').length!==2||
      !old.includes('browserTool("'+upstream[i]+'"'))
      throw Error("JH168_MOBILE_LEGACY_ROUTE_DRIFT_"+names[i].toUpperCase());
  }
  if(old.split('registerOAuthTool("life_web_').length!==10)
    throw Error("JH168_MOBILE_LEGACY_ROUTE_COUNT_CHANGED");
  if(!JH168_MOBILE_WEB_REGISTER56.includes("jhSplitScreenJob56(")||
     JH168_MOBILE_WEB_REGISTER56.includes("browserTool("))
     throw Error("JH168_MOBILE_PATCH_CONTENT_INVALID");
  // Embed the exact independently tested pure predicate AFTER alias handlers.
  // It is in the same lexical owner scope and cannot grant an action/approval.
  const registered56=JH168_MOBILE_WEB_REGISTER56+signedMobileWaitConditionSource56();
  const out=source.slice(0,a)+registered56+source.slice(b);
  const section=out.slice(a,out.indexOf(endMarker,a));
  for(const name of names)if(section.split('registerOAuthTool("life_web_'+name+'",{').length!==2)
    throw Error("JH168_MOBILE_PATCH_ROUTE_MISSING_"+name.toUpperCase());
  if(section.includes('browserTool(')||section.includes('browser_navigate('))
    throw Error("JH168_MOBILE_REMOTE_BROWSER_REMAINS");
  if(out.slice(0,a)!==source.slice(0,a)||out.slice(a+section.length)!==source.slice(b))
    throw Error("JH168_MOBILE_OUTSIDE_SCOPE_CHANGED");
  // Share the original consent-gated, one-shot Android frame handler: no
  // duplicate capture authority, alternate screenshot pipeline, or new grants.
  const capStart='  registerOAuthTool("life_android_capture_work_window",{';
  const capEnd='  registerOAuthTool("life_android_snapshot",{';
  if(out.split(capStart).length!==2||out.split(capEnd).length!==2)
    throw Error("JH168_MOBILE_CAPTURE_SCOPE_CHANGED");
  const i=out.indexOf(capStart),j=out.indexOf(capEnd,i);
  if(i<0||j<=i)throw Error("JH168_MOBILE_CAPTURE_ORDER_CHANGED");
  const cap=out.slice(i,j);
  // Other Secure56 tools may be inserted AFTER capture and BEFORE snapshot.
  // Wrap ONLY the original capture registration, never another handler.
  const following=cap.indexOf('  registerOAuthTool("',capStart.length);
  const first=following<0?cap:cap.slice(0,following);
  const rest=following<0?"":cap.slice(following);
  const callback='  },async(args)=>{';
  if(first.split(callback).length!==2||first.split('  registerOAuthTool("').length!==2||
     !first.includes('title:"Capture the approved Android work window"'))
    throw Error("JH168_MOBILE_CAPTURE_CALLBACK_CHANGED");
  let wrapped=first.replace(callback,'  },(jhMobileWebCapture56=async(args)=>{');
  const close=wrapped.lastIndexOf('  });');
  if(close<0||wrapped.slice(close+5).trim()!=="")
    throw Error("JH168_MOBILE_CAPTURE_CLOSING_CHANGED");
  wrapped=wrapped.slice(0,close)+'  }));'+wrapped.slice(close+5);
  const replacement=wrapped+rest;
  const updated=out.slice(0,i)+replacement+out.slice(j);
  if(updated.slice(0,i)!==out.slice(0,i)||updated.slice(i+replacement.length)!==out.slice(j))
    throw Error("JH168_MOBILE_CAPTURE_OUTSIDE_SCOPE_CHANGED");
  return updated;
}


/** Temporary, reversible verification selector. The final JH system removes
 * this switch along with ALL legacy Playwright/server-browser paths after
 * parity is proven. Disabled/blank MUST preserve every byte of original
 * Secure56 route registration and catalog. Never treat a CI simulation
 * as production authorization.
 */
export const JH168_MOBILE_13_VERIFY_MODE56='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1';
export function selectJH168MobileWeb13Mode56(env=process.env){
 const flag=env?.JH_MOBILE_WEB_13_MODE;
 if(flag===undefined||flag==='')return 'ORIGINAL';
 if(flag!==JH168_MOBILE_13_VERIFY_MODE56)throw Error('JH168_MOBILE_13_MODE_INVALID');
 const synthetic=env.CI==='true'&&env.NODE_ENV==='test'&&
   env.JH_OWNER_DEFER_LISTEN==='1'&&env.RENDER_SERVICE_ID===undefined&&
   env.JH_DURABLE_RELEASE===undefined;
 const approvedLiveBoundary=env.CI!=='true'&&
   env.RENDER_SERVICE_ID==='srv-db0fjl2d0e5s73be114g'&&
   env.JH_DURABLE_RELEASE==='SERVE_READY_V1'&&
   env.JH_PENDING_APPROVAL_OPERATOR_ENABLE==='EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1'&&
   env.JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE==='EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1';
 if(!synthetic&&!approvedLiveBoundary)throw Error('JH168_MOBILE_13_MODE_RELEASE_SCOPE_BLOCKED');
 return 'PHONE_RIGHT';
}
export function patchJH168MobileWeb13VerifiedMode56(source,env=process.env){
 const mode=selectJH168MobileWeb13Mode56(env);
 return mode==='ORIGINAL'?source:
   patchJH168Mobile13ActionPolicy56(
     patchJH168Mobile13FixtureHttp56(patchJH168MobileNativeClassifier56(
       patchJH168MobileNativeAppEntry56(
         patchJH168MobileStatusOnly56(patchJH168MobileWebCommands56(source))))));
}

/** Advisory intent only. An explicitly named app or an app open/launch phrase
 * do not grant an action, choose a device, or dispatch a native job. URL and
 * web requests retain the original RIGHT web route; ambiguous names stay web.
 * Self-contained because the exact predicate is embedded in life_route.
 */
function jhMobileExplicitNativeOpen56(request){
 if(typeof request!=='string'||request.length>160||/[\r\n]/.test(request))return false;
 const s=request.trim();
 if(/https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}(?:[/?#]|\b)/i.test(s))return false;
 if(/웹앱|web\s+app|(?:^|\s)(?:웹(?:으로|에서)?|사이트(?:로|에서)?|홈페이지(?:로|에서)?|브라우저(?:로|에서)?|크롬(?:으로|에서)?|web|website|browser|url)(?:\s|$)/i.test(s))return false;
 const match=s.match(/^([가-힣A-Za-z0-9 ._-]{1,80}?)\s*앱(?:을)?(?:\s*(?:열기|열어(?:\s*(?:줘|주세요))?|실행(?:해(?:\s*(?:줘|주세요))?)?|켜(?:\s*(?:줘|주세요))?))?$/i)||
   s.match(/^(?:(?:open|launch)\s+)?([A-Za-z0-9][A-Za-z0-9 ._-]{0,79})\s+(?:native|android)\s+app$/i);
 if(!match)return false;
 const name=match[1].trim();
 return name.length>0&&!/^(?:휴대폰|안드로이드|네이티브|native|android)$/i.test(name)&&
   !/(?:^|\s)(?:앱(?:을)?|말고|대신|또는|혹은|그리고)(?:\s|$)/.test(name);
}

export function patchJH168MobileNativeClassifier56(source){
 const start='  registerOAuthTool("life_route",{';
 const end='  registerOAuthTool("life_open_service",{';
 if(typeof source!=='string'||source.split(start).length!==2||source.split(end).length!==2)
   throw Error('JH168_MOBILE_NATIVE_CLASSIFIER_SCOPE_CHANGED');
 const a=source.indexOf(start),b=source.indexOf(end,a);
 if(a<0||b<=a)throw Error('JH168_MOBILE_NATIVE_CLASSIFIER_ORDER_CHANGED');
 const block=source.slice(a,b);
 const hints='    const nativeHints=[]; // Site-opening text cannot trigger automatic native app takeover';
 const branch='nativeHints.some(k=>s.includes(k))||jhNativeReturnTarget56(s)';
 const added=hints+'\n    const explicitNativeOpen=('+jhMobileExplicitNativeOpen56.toString()+')(raw);';
 const changedBranch='explicitNativeOpen||'+branch;
 if(block.split(hints).length!==2||block.split(branch).length!==2||block.includes('explicitNativeOpen'))
   throw Error('JH168_MOBILE_NATIVE_CLASSIFIER_GUARD_DRIFT');
 const changed=block.replace(hints,added).replace(branch,changedBranch);
 if(changed.replace(added,hints).replace(changedBranch,branch)!==block)
   throw Error('JH168_MOBILE_NATIVE_CLASSIFIER_REVERSAL_FAILED');
 return source.slice(0,a)+changed+source.slice(b);
}

/** Mobile diagnostic ONLY: do not initialize or call the separate Playwright
 * server from life_status when 13-route PHONE_RIGHT mode is explicitly enabled.
 * Obtain ONLY the already verified Secure56 signed-poll evidence from the
 * original connection V2 observer. Neither signed poll nor status is proof
 * that a screenshot or UI action succeeded.
 *
 * Original/default status remains byte-for-byte unchanged; reversible patch.
 */
export function patchJH168MobileStatusOnly56(source){
 const start='  registerOAuthTool("life_status",{';
 const end='  registerOAuthTool("life_route",{';
 if(typeof source!=='string'||source.split(start).length!==2||source.split(end).length!==2)
   throw Error('JH168_MOBILE_STATUS_BOUNDARY_CHANGED');
 const a=source.indexOf(start),b=source.indexOf(end,a);
 if(a<0||b<=a)throw Error('JH168_MOBILE_STATUS_ORDER_CHANGED');
 const old=source.slice(a,b);
 const legacy='    let browser="unknown";\n'+
   '    try{ await ensureBrowser(); browser="ready"; }catch(e){ browser="error: "+e.message; }';
 const mobile='    const browser="not_applicable_mobile_right";\n'+
   '    const signedPollVerified=typeof jhV2SignedPollEvidence56==="function"&&\n'+
   '      jhV2SignedPollEvidence56()?.verified===true;\n'+
   '    const mobileRightStatus56={signedPollVerified,uiVerified:false,\n'+
   '      phoneActionVerified:false,automaticReplay:false,cloudBrowserProbed:false};';
 const marker='registeredAndroidDevices:devices.size,secureBridgeVersion:56';
 if(old.split(legacy).length!==2||old.split(marker).length!==2||old.includes('mobileRightStatus56'))
   throw Error('JH168_MOBILE_STATUS_SOURCE_DRIFT');
 const changed=old.replace(legacy,mobile).replace(marker,marker+',mobileRightStatus56');
 if(changed.replace(marker+',mobileRightStatus56',marker).replace(mobile,legacy)!==old)
   throw Error('JH168_MOBILE_STATUS_NOT_REVERSIBLE');
 if(changed.includes('await ensureBrowser()')||changed.includes('browserTool(')||
   changed.includes('browserRpc('))throw Error('JH168_MOBILE_STATUS_CLOUD_PROBE_REMAINS');
 return source.slice(0,a)+changed+source.slice(b);
}


/** Explicit native Android app launch through the SAME Secure56 signed device
 * queue as RIGHT Chrome. The historical right-pane patch preserved sites and
 * previous-screen return but accidentally narrowed this compatibility alias
 * to URLs only. Do not route app intent to server Playwright or guess an app
 * from an ambiguous service name.
 *
 * A queued native open is NEVER an observed phone success. Caller MUST use a
 * fresh right window readback and existing job receipt before the next action.
 */
export function patchJH168MobileNativeAppEntry56(source){
 const start='  registerOAuthTool("life_android_open",{';
 const end='  const cuSchema56={';
 if(typeof source!=='string'||source.split(start).length!==2||source.split(end).length!==2)
   throw Error('JH168_MOBILE_NATIVE_ENTRY_SCOPE_CHANGED');
 const a=source.indexOf(start),b=source.indexOf(end,a);
 if(a<0||b<=a)throw Error('JH168_MOBILE_NATIVE_ENTRY_ORDER_CHANGED');
 const block=source.slice(a,b);
 const old='    return jhRightWebOpen56({service:raw});';
 const added=[
  '    // Only an explicitly named Android app is eligible; websites and',
  '    // ambiguous brands continue to the original signed RIGHT URL opener.',
  '    if(!url && /^[가-힣A-Za-z0-9 ._-]{1,80}(?:앱|\\s+native\\s+app)$/i.test(raw)){',
  '      const device=chooseDevice(),session=device&&active56(device);',
  '      const meta=device?devices.get(device):null;',
  '      if(!session||meta?.secureBridgeVersion!==56||meta?.secureActive!==true||',
  '         !Number.isFinite(meta.lastSeen)||Date.now()-meta.lastSeen>30000)',
  '        return textResult({ok:false,route:"android_right",',
  '          code:"MOBILE_NATIVE_SIGNED_DEVICE_REQUIRED",automaticReplay:false});',
  '      // Fail closed before mk(): never schedule without the original owner command.',
  '      const commandId=jhRequireCommand56(device);',
  '      if(typeof commandId!=="string"||!/^[a-f0-9]{32}$/.test(commandId))',
  '        return textResult({ok:false,route:"android_right",',
  '          code:"MOBILE_NATIVE_ORIGINAL_COMMAND_REQUIRED",automaticReplay:false});',
  '      const job=mk("open_url",{target:raw,url:""},device);',
  '      return textResult({route:"android_right",operation:"native_app_open",',
  '        queued:job?.status==="queued",jobId:job?.id||null,',
  '        requiresFreshWindowReadback:true,screenVerified:false,',
  '        automaticReplay:false});',
  '    }',
  old
 ].join('\n');
 if(block.split(old).length!==2||
    !block.includes('jhNativeReturnTarget56(raw)')||
    !block.includes('returnTarget')||
    block.includes('operation:"native_app_open"'))
   throw Error('JH168_MOBILE_NATIVE_ENTRY_GUARD_DRIFT');
 const changed=block.replace(old,added);
 if(changed.replace(added,old)!==block)throw Error('JH168_MOBILE_NATIVE_ENTRY_REVERSAL_FAILED');
 if(changed.includes('browserTool('))throw Error('JH168_MOBILE_NATIVE_REMOTE_BROWSER_DISALLOWED');
 return source.slice(0,a)+changed+source.slice(b);
}
