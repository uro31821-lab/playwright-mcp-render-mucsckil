/**
 * JH167 split-screen fold candidate: left browser, right native ChatGPT.
 * Pure readback guard only. The Secure56 host MUST authenticate the Android
 * job completion before calling this function. No window or approval is forged.
 * Uses the existing v1 split_screen_evidence snapshot wire schema.
 */
import { inspectSplitEvidence } from '../deployment/split-screen-evidence.mjs';

export const FOLD_LAYOUTS=Object.freeze({
  LEFT_WEB_RIGHT_GPT:'LEFT_WEB_RIGHT_GPT',
  LEGACY_LEFT_GPT_RIGHT_WORK:'LEGACY_LEFT_GPT_RIGHT_WORK'
});
const browsers=new Set(['com.android.chrome','com.sec.android.app.sbrowser','org.mozilla.firefox']);
const id=x=>typeof x==='string' && /^\d{1,10}$/.test(x);
const pkg=x=>typeof x==='string' && /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(x) && x.length<=200;
const bad=(code)=>Object.freeze({ok:false,code,sideVerified:false});
function rect(raw,minSize=100) {
  if(typeof raw!=='string'||!/^\d+,\d+,\d+,\d+$/.test(raw))return null;
  const v=raw.split(',').map(Number);
  if(!v.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100000)||
     v[2]-v[0]<minSize||v[3]-v[1]<minSize)return null;
  return Object.freeze({left:v[0],top:v[1],right:v[2],bottom:v[3]});
}
const verticalOverlap=(a,b)=>Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
function rowsMatch(rows,p,workRect) {
  if(!Array.isArray(rows)||rows.length<1||rows.length>3000)return false;
  const proofRows=rows.filter(x=>x?.kind==='split_screen_evidence');
  if(proofRows.length!==1)return false;
  const proof=proofRows[0];
  for(const k of ['version','verified','layout','chatPackage','chatKind',
      'chatWindowId','chatBounds','workPackage','workWindowId','workBounds'])
    if(proof[k]!==p[k])return false;
  const when=Number(proof.observedAtMs),at=Number(p.observedAtMs);
  if(!Number.isSafeInteger(when)||when>at||at-when>5000)return false;
  for(const n of rows) {
    if(!n||typeof n!=='object'||Array.isArray(n))return false;
    if(!n.package||n.package==='com.koreanlifehub.bridge.protocol')continue;
    if(n.package!==p.workPackage||String(n.windowId)!==p.workWindowId)return false;
    // An observed actionable element with a screen rectangle must belong to
    // the work browser, never overlap ChatGPT. Missing bounds are not fabricated.
    if(n.clickable===true||n.editable===true) {
      if(n.bounds!==undefined&&n.bounds!==null&&n.bounds!=='') {
        const r=rect(n.bounds,1);
        if(!r||r.left<workRect.left||r.right>workRect.right||
           r.top<workRect.top||r.bottom>workRect.bottom)return false;
      }
    }
  }
  return true;
}
export function inspectFoldPair(result,rows=null,mode=FOLD_LAYOUTS.LEFT_WEB_RIGHT_GPT,now=Date.now()) {
  if(!Object.values(FOLD_LAYOUTS).includes(mode))return bad('FOLD_MODE_UNKNOWN');
  if(result?.splitScreenRequired!==true)return bad('FOLD_SPLIT_PROOF_REQUIRED');
  const p=result?.splitScreen;
  if(!p||p.kind!=='split_screen_evidence'||p.version!=='1'||
     p.verified!=='true'||p.layout!=='LEFT_RIGHT')return bad('FOLD_PROOF_INVALID');
  const chat=rect(p.chatBounds),work=rect(p.workBounds);
  if(!chat||!work||!id(p.chatWindowId)||!id(p.workWindowId)||
     p.chatWindowId===p.workWindowId||!pkg(p.workPackage)||
     p.workPackage===p.chatPackage||verticalOverlap(chat,work)<100)
    return bad('FOLD_WINDOW_GEOMETRY_INVALID');
  const at=Number(p.observedAtMs);
  if(typeof p.observedAtMs!=='string'||!/^\d{10,16}$/.test(p.observedAtMs)||
     !Number.isSafeInteger(at)||at>now+5000||now-at>45000)
    return bad('FOLD_SCREEN_STALE');
  if(mode===FOLD_LAYOUTS.LEGACY_LEFT_GPT_RIGHT_WORK) {
    const legacy=inspectSplitEvidence(result,rows,null,now);
    if(!legacy.ok)return bad(legacy.reason);
    return Object.freeze({
      ok:true,code:'LEGACY_LEFT_GPT_RIGHT_WORK_VERIFIED',
      workSide:'RIGHT',chatSide:'LEFT',
      workPackage:p.workPackage,chatPackage:p.chatPackage,
      workWindowId:p.workWindowId,chatWindowId:p.chatWindowId,
      workBounds:work,chatBounds:chat,
      observedAtMs:at,workInputFocused:false,
      displayFoldPosture:'UNKNOWN',physicalUnfoldVerified:false
    });
  }
  if(p.chatPackage!=='com.openai.chatgpt'||p.chatKind!=='NATIVE')
    return bad('FOLD_RIGHT_GPT_NOT_VERIFIED');
  if(!browsers.has(p.workPackage))
    return bad('FOLD_LEFT_WEB_BROWSER_NOT_VERIFIED');
  if(work.right>chat.left)return bad('FOLD_WEB_NOT_LEFT_OF_GPT');
  if(rows===null||!rowsMatch(rows,p,work))return bad('FOLD_WEB_ROWS_NOT_VERIFIED');
  const inputRows=rows.filter(n=>n?.package===p.workPackage &&
    String(n.windowId)===p.workWindowId && n.editable===true && n.focused===true);
  // A focused editable Android accessibility node is a *necessary*, but not
  // by itself sufficient, condition for typing. Host must also require the
  // existing local phone action lease and prepared approval.
  const inputFocused=inputRows.length===1;
  const reportedPosture=p.foldPosture==='FLAT' && p.foldPostureSource==='ANDROIDX_WINDOW_MANAGER'
    ? 'PHONE_REPORTED_FLAT':'UNVERIFIED';
  return Object.freeze({
    ok:true,code:'SIGNED_LEFT_WEB_RIGHT_GPT_GEOMETRY_VERIFIED',
    workSide:'LEFT',chatSide:'RIGHT',sideVerified:true,
    workPackage:p.workPackage,chatPackage:p.chatPackage,
    workWindowId:p.workWindowId,chatWindowId:p.chatWindowId,
    workBounds:work,chatBounds:chat,
    observedAtMs:at,workInputFocused:inputFocused,
    displayFoldPosture:reportedPosture,
    physicalUnfoldVerified:reportedPosture==='PHONE_REPORTED_FLAT'
  });
}
/** Coordinates are GLOBAL display pixels, not local viewport offsets. */
export function guardFoldAction(proof,args) {
  if(!proof?.ok||proof.workSide!=='LEFT')return bad('FOLD_TARGET_NOT_VERIFIED');
  if(!args||typeof args!=='object')return bad('FOLD_ACTION_INVALID');
  const work=proof.workBounds,chat=proof.chatBounds;
  if(!Number.isSafeInteger(args.viewport_width)||
     !Number.isSafeInteger(args.viewport_height)||
     args.viewport_width<Math.max(work.right,chat.right)||
     args.viewport_height<Math.max(work.bottom,chat.bottom))
    return bad('FOLD_GLOBAL_VIEWPORT_REQUIRED');
  if(args.action==='CLICK'||args.action==='SCROLL') {
    if(!Number.isSafeInteger(args.x)||!Number.isSafeInteger(args.y)||
       args.x<work.left+2||args.x>=work.right-2||
       args.y<work.top+2||args.y>=work.bottom-2)
      return bad('FOLD_ACTION_OUTSIDE_LEFT_BROWSER');
    return Object.freeze({ok:true,code:'FOLD_LEFT_BROWSER_COORDINATE_VERIFIED'});
  }
  if(args.action==='TYPE'||args.action==='KEYPRESS')
    return proof.workInputFocused===true
      ?Object.freeze({ok:true,code:'FOLD_WORK_EDITABLE_FOCUS_VERIFIED'})
      :bad('FOLD_LEFT_WEB_INPUT_FOCUS_REQUIRED');
  return bad('FOLD_ACTION_UNSUPPORTED');
}
