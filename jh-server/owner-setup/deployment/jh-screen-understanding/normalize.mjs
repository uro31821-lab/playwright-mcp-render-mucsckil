import {createHash} from 'node:crypto';

export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const trim = (value,max=1000) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const validPkg = value => /^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*){1,12}$/.test(value);
const geometry = value => {
  if(typeof value !== 'string') return null;
  const match=value.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
  if(!match) return null;
  const [x1,y1,x2,y2]=match.slice(1).map(Number);
  if(x2<=x1 || y2<=y1 || x2>16000 || y2>16000) return null;
  return {left:x1,top:y1,right:x2,bottom:y2};
};
const isTrue=v=>v===true||v==='true';

export function normalizeSnapshot(rows,{observedAt=Date.now(),maxRows=600,requireRightPane=true}={}) {
  if(!Array.isArray(rows)||rows.length<1||rows.length>maxRows) return {ok:false,code:'SNAPSHOT_ROWS_INVALID'};
  const scopeRows=rows.filter(x=>x && typeof x==='object' && x.kind==='screen_scope');
  if(scopeRows.length!==1) return {ok:false,code:'SCREEN_SCOPE_PROOF_REQUIRED',message:'Android 화면 범위 증거가 없거나 여러 개입니다.'};
  const s=scopeRows[0],pkg=trim(s.package,160),win=String(s.windowId ?? '');
  if(!validPkg(pkg)||pkg==='com.openai.chatgpt'||pkg.startsWith('com.koreanlifehub.bridge')||!/^-?\d+$/.test(win))
    return {ok:false,code:'WORK_PANE_IDENTITY_INVALID'};
  if(requireRightPane && !(isTrue(s.verifiedRightPane)&&s.placement==='RIGHT'))
    return {ok:false,code:'RIGHT_SPLIT_PANE_NOT_VERIFIED',observedPlacement:trim(s.placement,32)};
  const scopeBounds=geometry(s.workBounds);
  if(!scopeBounds) return {ok:false,code:'WORK_PANE_BOUNDS_INVALID'};
  const status=rows.filter(x=>x?.kind==='snapshot_status').slice(-1)[0] || null;
  const restricted=isTrue(status?.restricted);
  const evidence=[], formFields=[], uncertainty=[], tableRows=[];
  let hidden=0;
  for(const r of rows){
    if(!r || typeof r!=='object')continue;
    if(r.kind==='screen_scope'||r.kind==='snapshot_status')continue;
    if(r.kind==='table_status') {uncertainty.push('표 구조가 불명확해 값을 추정하지 않았습니다.');continue;}
    if(r.kind==='visual_analysis_status'){
      if(r.requiresExplicitRequest==='true'||r.requiresFreshConsent==='true')uncertainty.push('접근성으로 읽을 수 없는 이미지가 있을 수 있습니다. OCR에는 기존 JH의 별도 동의가 필요합니다.');
      continue;
    }
    // JH protocol hints are NOT page text. Guided Form metadata is separate, sanitized below.
    if(r.package==='com.koreanlifehub.bridge.protocol'){
      if(typeof r.guidedForm==='string'){
        try{
          const guide=JSON.parse(r.guidedForm);
          if(Array.isArray(guide.fields)) for(const f of guide.fields.slice(0,80)) {
            if(!f || typeof f!=='object')continue;
            const label=trim(f.label,140);
            if(!label)continue;
            formFields.push({label,required:trim(f.required,20),filled:isTrue(f.filled),enabled:isTrue(f.enabled),ambiguous:isTrue(f.ambiguous),kind:trim(f.kind,32),error:trim(f.error,180),sensitive:f.kind==='SENSITIVE'});
          }
          if(guide.hiddenFieldsMayExist===true)uncertainty.push('현재 화면 밖 또는 다음 단계에 다른 필수 항목이 있을 수 있습니다.');
        }catch{uncertainty.push('입력 항목 구조화 정보 판독에 실패했습니다.');}
      }
      continue;
    }
    if(r.kind==='table_header'||r.kind==='table_cell'){
      if(!/^\d{1,3}$/.test(String(r.row))||!/^\d{1,2}$/.test(String(r.column))||!/^\d{1,2}$/.test(String(r.table)))continue;
      const raw=trim(r.raw,320);
      if(!raw||r.sensitive==='true'){hidden++;continue;}
      tableRows.push({...r,raw});
      continue;
    }
    if(r.package!==pkg||String(r.windowId)!==win)continue;
    if(isTrue(r.sensitive)){hidden++;continue;}
    const quote=trim(r.text,600);
    if(!quote||/^\[secure page text hidden\]$/i.test(quote)) {hidden++;continue;}
    const bounds=geometry(r.bounds);
    if(bounds && (bounds.left<scopeBounds.left||bounds.top<scopeBounds.top||bounds.right>scopeBounds.right||bounds.bottom>scopeBounds.bottom))continue;
    const item={id:`e${evidence.length+1}`,quote,source:'ACCESSIBILITY',role:trim(r.controlRole,60)||'text',viewId:trim(r.viewId,160)||null,
      bounds,windowId:win,package:pkg,clickable:isTrue(r.clickable),editable:isTrue(r.editable),filled:isTrue(r.filled),
      focused:isTrue(r.focused),page:0,confidence:'HIGH'};
    evidence.push(item);
  }
  if(restricted)uncertainty.push('보안 입력 항목이 있어 민감한 값은 읽지 않았습니다.');
  if(status?.code==='accessibility_node_budget_reached'||status?.code==='guided_form_budget_partial') uncertainty.push('화면 노드 일부만 읽었습니다.');
  if(!status)uncertainty.push('기존 JH 화면 수집의 완료 상태를 확인할 수 없습니다.');
  if(hidden)uncertainty.push('보호된 화면 요소 일부를 제외했습니다.');
  if(!evidence.length&&!tableRows.length)uncertainty.push('현재 화면에서 확인 가능한 일반 텍스트가 없습니다.');
  const tableEvidence=[];
  for(const r of tableRows){
    const id=`e${evidence.length+tableEvidence.length+1}`;
    tableEvidence.push({id,quote:r.raw,source:'ACCESSIBILITY_TABLE',role:r.kind,table:Number(r.table),row:Number(r.row),column:Number(r.column),
      bounds:null,windowId:win,package:pkg,page:0,confidence:r.evidence==='android_collection_coordinates'?'HIGH':'UNVERIFIED',
      normalized:r.numberConfidence==='HIGH'&&typeof r.normalized==='string'?trim(r.normalized,80):null,
      numberWarning:trim(r.numberWarning,100)||null,unit:trim(r.unit,30)||null,currency:trim(r.currency,12)||null});
  }
  evidence.push(...tableEvidence);
  const dedup=[];const seen=new Set();
  for(const e of evidence){const key=[e.role,e.quote,e.bounds?.left,e.bounds?.top,e.table,e.row,e.column].join('|');
    if(seen.has(key))continue;seen.add(key);dedup.push({...e,id:`e${dedup.length+1}`});}
  const fingerprint=hash({pkg,win,bounds:scopeBounds,data:dedup.map(({quote,role,table,row,column})=>[quote,role,table,row,column])});
  return {ok:true,screen:{package:pkg,windowId:win,placement:s.placement,verifiedRightPane:isTrue(s.verifiedRightPane),
    bounds:scopeBounds,observedAt,fingerprint,partial:uncertainty.length>0},evidence:dedup,formFields,uncertainty:[...new Set(uncertainty)]};
}

export function validateExactNumberToken(text) {
  const v=trim(text,300);
  // Does not interpret percentages, currency, comma decimals, dates, fractions, or multipliers by guessing.
  const normalized=v.replace(/^[₩€£]/,'').replace(/\s*(원|만원|억원|%|USD|KRW|EUR)$/,'');
  if(!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(normalized))return {ok:false,code:'NUMERIC_FORMAT_AMBIGUOUS'};
  return {ok:true,raw:v,normalized:normalized.replaceAll(',','')};
}

export function quotedEvidence(ids,all){
  const set=new Set(ids);return all.filter(e=>set.has(e.id)).map(({id,quote,role,bounds,source,page,confidence,table,row,column})=>({id,quote,role,bounds,source,page,confidence,...(table!==undefined?{table,row,column}:{})}));
}
