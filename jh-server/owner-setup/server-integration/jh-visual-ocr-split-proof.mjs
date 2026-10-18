/** Pure read-only split proof, adapted from existing JH evidence validator.
 * Does not capture, approve, replay, or expose account data.
 */
export function inspectSplitEvidenceForOcr(result,rows=null,expectedPackage=null,now=Date.now()){
  const bad=reason=>({ok:false,reason});
  if(result?.splitScreenRequired!==true)return bad('SPLIT_PROOF_REQUIRED');
  const p=result.splitScreen;
  if(!p || p.kind!=='split_screen_evidence' || p.version!=='1' || p.verified!=='true' || p.layout!=='LEFT_RIGHT')return bad('SPLIT_PROOF_INVALID');
  const native=p.chatPackage==='com.openai.chatgpt' && p.chatKind==='NATIVE';
  const web=p.chatPackage==='com.android.chrome' && p.chatKind==='BROWSER_VERIFIED';
  if(!native&&!web)return bad('CHAT_PANE_UNVERIFIED');
  const id=x=>typeof x==='string'&&/^\d{1,10}$/.test(x)&&Number.isSafeInteger(Number(x));
  const pkg=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(x)&&x.length<200;
  if(!id(p.chatWindowId)||!id(p.workWindowId)||p.chatWindowId===p.workWindowId||!pkg(p.workPackage)||
    ['com.openai.chatgpt','com.android.systemui','com.sec.android.app.launcher'].includes(p.workPackage)||p.workPackage.startsWith('com.koreanlifehub.bridge'))return bad('SPLIT_TARGET_INVALID');
  const rect=x=>{
    if(typeof x!=='string'||!/^\d+,\d+,\d+,\d+$/.test(x))return null;
    const n=x.split(',').map(Number);
    return n.every(v=>Number.isSafeInteger(v)&&v<=100000)&&n[2]-n[0]>=100&&n[3]-n[1]>=100?n:null;
  };
  const a=rect(p.chatBounds),b=rect(p.workBounds);
  if(!a||!b||b[0]<a[2]||Math.min(a[3],b[3])-Math.max(a[1],b[1])<100)return bad('SPLIT_LAYOUT_INVALID');
  const at=Number(p.observedAtMs);
  if(!/^\d{10,16}$/.test(p.observedAtMs||'')||!Number.isSafeInteger(at)||at>now+5000||now-at>45000)return bad('SPLIT_PROOF_STALE');
  if(expectedPackage&&p.workPackage!==expectedPackage)return bad('SPLIT_TARGET_MISMATCH');
  if(rows!==null){
    if(!Array.isArray(rows))return bad('SPLIT_ROWS_INVALID');
    const evidence=rows.filter(x=>x?.kind==='split_screen_evidence');
    if(evidence.length!==1)return bad('SPLIT_ROW_PROOF_REQUIRED');
    const row=evidence[0];
    for(const key of ['version','verified','layout','chatPackage','chatKind','chatWindowId','chatBounds','workPackage','workWindowId','workBounds'])
      if(row[key]!==p[key])return bad('SPLIT_ROW_PAIR_CHANGED');
    const rowAt=Number(row.observedAtMs);
    if(!Number.isSafeInteger(rowAt)||rowAt>at||at-rowAt>5000)return bad('SPLIT_ROW_STALE');
    for(const n of rows){
      if(!n||typeof n!=='object')return bad('SPLIT_ROWS_INVALID');
      if(!n.package || n.package==='com.koreanlifehub.bridge.protocol')continue;
      if(n.package!==p.workPackage||String(n.windowId)!==p.workWindowId)return bad('SPLIT_ROW_WRONG_TARGET');
    }
  }
  return {ok:true,reason:'SPLIT_PAIR_VERIFIED',chatWindowId:p.chatWindowId,chatPackage:p.chatPackage,
    workWindowId:p.workWindowId,workPackage:p.workPackage,observedAtMs:at};
}
