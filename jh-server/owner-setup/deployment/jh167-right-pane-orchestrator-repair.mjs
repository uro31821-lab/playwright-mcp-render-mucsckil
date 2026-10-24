/** JH167 bounded repair: site OPEN always uses existing signed RIGHT Chrome.
 * Phone RIGHT UI actions use the existing split-screen assistant / Computer Use.
 * Cloud Playwright never inherits RIGHT Chrome cookies and never claims same UI.
 * No security approvals, HMAC, APK, OCR or scrolling algorithms are changed here.
 */
const missing=code=>{throw Error(code)};
function scope(src,start,end,code){
 if(src.split(start).length!==2||src.split(end).length!==2)missing(code+'_SCOPE');
 const i=src.indexOf(start),j=src.indexOf(end,i);
 if(i<0||j<=i)missing(code+'_ORDER');
 return {i,j,value:src.slice(i,j)};
}
function splice(src,s,b){return src.slice(0,s.i)+b+src.slice(s.j);}
function exactly(src,a,b,code){
 if(src.split(a).length!==2||src.includes(b))missing(code);
 return src.replace(a,b);
}
export function patchJH167RightPaneOrchestrator56(input){
 if(typeof input!=='string'||!input.includes('jhRequireCommand56(device)')||
  !input.includes("registerOAuthTool('life_android_split_screen_assistant'")||
  !input.includes('registerOAuthTool("life_android_computer_prepare"'))
  missing('JH_RIGHT_ORCHESTRATOR_REQUIRED_GUARDS');
 let out=input;
 const service='  registerOAuthTool("life_open_service",{';
 const mail='  registerOAuthTool("life_naver_mail",{';
 const navigate='  registerOAuthTool("life_web_navigate",{';
 const snapshot='  registerOAuthTool("life_web_snapshot",{';
 const click='  registerOAuthTool("life_web_click",{';
 const type='  registerOAuthTool("life_web_type",{';
 const androidStart='  registerOAuthTool("life_android_open_and_snapshot",{';
 const androidStep='  registerOAuthTool("life_android_step_and_snapshot",{';
 const androidOpen='  registerOAuthTool("life_android_open",{';
 const computerSchema='  const cuSchema56={';
 // The original, fully reviewed service-open callback is reused, not reimplemented.
 const src=scope(out,service,mail,'JH_ORCH_SERVICE');
 let svc=exactly(src.value,'  },async({service})=>{',
  '  },(jhRightWebOpen56=async({service})=>{','JH_ORCH_CALLBACK');
 // Remove KakaoT automatic native takeover even for a service name including "앱".
 const nativeIf='    if(["카카오t","카카오티","kakao t","카카오 택시"].some(k=>s.includes(k)) && /(?:앱|native app)/.test(s)){';
 const mapped='    for(const [keys,url] of webMap){';
 const i=svc.indexOf(nativeIf),j=svc.indexOf(mapped,i);
 if(i<0||j<=i||svc.slice(i,j).split('target:"카카오T"').length!==2)
  missing('JH_ORCH_KAKAO_NATIVE_SCOPE');
 svc=svc.slice(0,i)+svc.slice(j);
 svc=exactly(svc,
  'return textResult({route:"unknown",service:raw,instruction:"Use life_web_navigate with a known web URL when browser-capable; use life_android_open only if the service is truly native-app-only."});',
  'return textResult({route:"manual",service:raw,code:"RIGHT_WEB_URL_NOT_MAPPED",opened:false,automaticAppFallback:false,automaticPlaywrightFallback:false,instruction:"Open the official website manually in RIGHT Chrome. No app switch or cloud browser fallback."});',
  'JH_ORCH_UNMAPPED');
 const svcEnd=svc.lastIndexOf('  });');
 if(svcEnd<0||svc.slice(svcEnd+5).trim()!=='')missing('JH_ORCH_CALL_END');
 svc=svc.slice(0,svcEnd)+'  }));'+svc.slice(svcEnd+5);
 if(svc.includes('browserTool("browser_navigate"')||!svc.includes('target:"right_web_link"'))
  missing('JH_ORCH_SERVICE_NOT_PHONE_ONLY');
 out=splice(out,src,'  let jhRightWebOpen56=null;\n'+svc);
 // All "open" wrappers must use the very same service resolver and Android RIGHT Chrome.
 const oldMail=scope(out,mail,navigate,'JH_ORCH_MAIL');
 const newMail=[
  '  registerOAuthTool("life_naver_mail",{',
  '    title:"Naver Mail — RIGHT Chrome",',
  '    description:"Open Naver Mail in the existing phone RIGHT Chrome, preserving phone login. For mail trash/delete actions use signed RIGHT-paned Android Computer Use and verify the result; this tool never opens server Playwright.",',
  '    inputSchema:{}',
  '  },async()=>jhRightWebOpen56({service:"네이버 메일"}));',
  ''
 ].join('\n');
 out=splice(out,oldMail,newMail);
 const oldStart=scope(out,androidStart,androidStep,'JH_ORCH_START');
 const newStart=[
  '  registerOAuthTool("life_android_open_and_snapshot",{',
  '    title:"Open website in RIGHT Chrome (compatible alias)",',
  '    description:"Website OPEN through the existing signed RIGHT Chrome, not a native app or cloud Playwright. Read the right split pane separately after opening.",',
  '    inputSchema:{target:z.string(),url:z.string().optional()}',
  '  },async({target,url})=>jhRightWebOpen56({service:String(url||target||"")}));',
  ''
 ].join('\n');
 out=splice(out,oldStart,newStart);
 const oldAndroid=scope(out,androidOpen,computerSchema,'JH_ORCH_ANDROID_ALIAS');
 const newAndroid=[
  '  registerOAuthTool("life_android_open",{',
  '    title:"Open website in RIGHT Chrome (compatible alias)",',
  '    description:"Site OPEN always reuses signed RIGHT Chrome. Unknown sites get MANUAL guidance. Only explicit original/previous-work screen restoration may change focus; no automatic native app or server Playwright fallback.",',
  '    inputSchema:{target:z.string(),url:z.string().optional()}',
  '  },async({target,url})=>{',
  '    const raw=String(url||target||"").trim();',
  '    const returnTarget=jhNativeReturnTarget56(raw);',
  '    if(returnTarget){const j=mk("open_url",{target:returnTarget,url:""});',
  '      return textResult({route:"android_return",queued:j.status==="queued",jobId:j.id,targetDeviceId:j.targetDeviceId});}',
  '    return jhRightWebOpen56({service:raw});',
  '  });',
  ''
 ].join('\n');
 out=splice(out,oldAndroid,newAndroid);

 // The classifier is advisory, but now explicitly selects PHONE RIGHT screen actions.
 out=exactly(out,
  'const nativeHints=["카카오톡","카카오t","카카오티","kakao t","카카오 택시","배달의민족","배민","앱 전용","native app","휴대폰 설정","전화 앱"];',
  'const nativeHints=[]; // Site-opening text cannot trigger automatic native app takeover',
  'JH_ORCH_CLASSIFIER');
 out=exactly(out,
  'Use Playwright as the primary web execution engine: navigate -> snapshot -> interact -> re-snapshot.',
  'OPEN: use life_open_service on signed phone RIGHT Chrome. CLICK/SAVE/TRASH in that SAME phone tab: use life_android_split_screen_assistant START then FOLLOW_UP with fresh itemRef/request_id and readback; alternatively signed Android Computer Use inspect/prepare/execute. Never substitute remote Playwright browser or its login state.',
  'JH_ORCH_CLASSIFIER_RULE');
 // Playwright remains an independent explicitly selected server browser for separate tasks.
 const web=scope(out,navigate,snapshot,'JH_ORCH_NAV');
 let nav=exactly(web.value,'title:"Open website"',
  'title:"Separate SERVER browser navigation (explicit only)"','JH_ORCH_NAV_TITLE');
 nav=exactly(nav,
  'PRIMARY web route. Navigate the persistent Playwright browser to a URL. Prefer this for hotel, booking, shopping, search, maps, YouTube, and other browser-capable services. Do NOT use t.kakao.com as a browser destination; Kakao T is treated as a native-app route.',
  'Only navigate SEPARATE server Playwright on explicit research/browser-automation intent. This is NOT the phone RIGHT Chrome and does not inherit login/cookies. Never use it for ordinary site OPEN or to claim a phone click.',
  'JH_ORCH_NAV_DESCRIPTION');
 const navNative=nav.indexOf('    if(/(^|');
 const navReturn=nav.indexOf('    return textResult(await browserTool("browser_navigate",{url:u}));',navNative);
 if(navNative<0||navReturn<=navNative||nav.slice(navNative,navReturn).split('target:"카카오T"').length!==2)
  missing('JH_ORCH_NAV_NATIVE_REDIRECT_SCOPE');
 nav=nav.slice(0,navNative)+[
  '    if(/(^|\\.)t\\.kakao\\.com/i.test((()=>{try{return new URL(u).hostname}catch{return ""}})()))',
  '      return textResult({route:"manual",code:"NO_NATIVE_FALLBACK",opened:false,url:u});',
  ''
 ].join('\n')+nav.slice(navReturn);
 out=splice(out,web,nav);
 const c=scope(out,click,type,'JH_ORCH_CLICK');
 let actualClick=exactly(c.value,
  'Click a web element in the persistent Playwright browser using a target/ref or unique selector from the snapshot.',
  'Explicit interaction with the SEPARATE server Playwright browser only; no phone RIGHT Chrome cookies or page shared. For phone RIGHT Chrome controls use life_android_split_screen_assistant START/FOLLOW_UP (or Android Computer Use).',
  'JH_ORCH_CLICK_DESCRIPTION');
 actualClick=exactly(actualClick,
  '},async(args)=>textResult(await browserTool("browser_click",args)));',
  '},async(args)=>{if(/^item_[a-f0-9]{16}$/.test(args.target))return textResult({ok:false,code:"RIGHT_PHONE_ITEM_REQUIRES_ANDROID_COMPUTER_USE",automaticReplay:false});return textResult(await browserTool("browser_click",args));});',
  'JH_ORCH_CLICK_PHONE_GUARD');
 out=splice(out,c,actualClick);
 const assistTag="  registerOAuthTool('life_android_split_screen_assistant',{";
 const tagIndex=out.indexOf(assistTag);
 if(tagIndex<0||out.indexOf(assistTag,tagIndex+1)>=0)missing('JH_ORCH_SPLIT_ANCHOR');
 const head=out.slice(0,tagIndex),tail=out.slice(tagIndex);
 const intro="description:'왼쪽 ChatGPT/JH와 오른쪽 외부 앱이 함께 보이는 분할 화면 전용 도구다.";
 const fixed="description:'오른쪽 Chrome 또는 앱을 실제로 직접 조작하는 기본 도구. 사이트 OPEN 이후 CLICK/저장/휴지통 이동 요청은 같은 휴대폰 RIGHT 창을 이 도구의 START로 읽고 FOLLOW_UP으로 정확히 한 단계만 수행한다. 다른 서버 Playwright로 조작을 갈아타지 않는다. 왼쪽 ChatGPT/JH와 오른쪽 외부 앱이 함께 보이는 분할 화면 전용 도구다.";
 if(tail.split(intro).length!==2)missing('JH_ORCH_SPLIT_DESCRIPTION');
 out=head+tail.replace(intro,fixed);
 if(out.split('jhRightWebOpen56({service:').length-1!==3||
    out.includes('route:"playwright",service:"네이버 메일"')||
    out.includes('target:"카카오T",url:"카카오T"')&&out.includes('registerOAuthTool("life_android_open"')||
    out.split('  registerOAuthTool("life_android_step_and_snapshot",{').length!==2)
  missing('JH_ORCH_FINAL_SCOPE');
 return out;
}
