import {readFileSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fail,safeHttps} from './payment-core.mjs';

export function loadProfiles(file=process.env.JH_PAYMENT_SITE_PROFILES_FILE){
  if(!file)return [];
  if(!path.isAbsolute(file)||lstatSync(file).isSymbolicLink()||!lstatSync(file).isFile()||lstatSync(file).size>1000000)fail('PAYMENT_PROFILE_FILE_INVALID');
  const profiles=JSON.parse(readFileSync(file,'utf8'));
  if(!Array.isArray(profiles)||profiles.length>50)fail('PAYMENT_PROFILES_INVALID');
  for(const p of profiles){
    if(!p||p.reviewed!==true||!/^[-\w]{1,80}$/.test(p.id)||new URL(safeHttps(p.origin)).origin!==p.origin||!Array.isArray(p.methods)||!p.methods.length||p.methods.length>20)fail('PAYMENT_PROFILE_REVIEW_REQUIRED');
    for(const name of ['checkout_path','receipt_path'])if(typeof p[name]!=='string'||!p[name].startsWith('/')||p[name].length<2||p[name].includes('?'))fail('PAYMENT_PROFILE_PATH_REQUIRED');
    if(!p.checkout||!p.checkout.billing_type||!p.one_time_text||!p.receipt||!p.final_button||!p.final_text||!p.receipt.success_text)fail('PAYMENT_PROFILE_SELECTORS_REQUIRED');
    for(const m of p.methods){
      if(!/^[-\w]{1,80}$/.test(m.id)||!['CARD','KAKAOPAY','SAMSUNGPAY','BANK_TRANSFER'].includes(m.kind)||!['NONE','USER_REQUIRED'].includes(m.authentication)||typeof m.saved!=='boolean'||!m.available||!m.selected||!m.label||!m.instrument||m.select===p.final_button)fail('PAYMENT_METHOD_PROFILE_INVALID');
    }
    if(new Set(p.methods.map(m=>m.id)).size!==p.methods.length)fail('PAYMENT_METHOD_PROFILE_INVALID');
  }
  return profiles;
}

// Runs inside the already connected merchant page. Only reviewed, server-side
// selectors are accepted. No selectors/scripts/amounts supplied by an MCP caller.
export function checkoutPageOperation(p,operation,payload){
  const stop=code=>{throw Error(code);};
  const visible=e=>!!e&&e.isConnected&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
  const one=selector=>{if(typeof selector!=='string'||!selector||selector.length>500)stop('PAYMENT_SELECTOR_INVALID');const nodes=[...document.querySelectorAll(selector)].filter(visible);if(nodes.length!==1)stop('PAYMENT_FIELD_NOT_UNIQUE');return nodes[0];};
  const value=selector=>{const e=one(selector),v=e.textContent.trim();if(!v||v.length>1500||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v))stop('PAYMENT_FIELD_UNREADABLE');return v;};
  const amount=selector=>{const v=value(selector).replace(/\s/g,'');if(!/^(?:₩)?(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:원)?$/.test(v))stop('PAYMENT_TOTAL_UNREADABLE');const n=Number(v.replace(/[₩,원]/g,''));if(!Number.isSafeInteger(n)||n<=0)stop('PAYMENT_TOTAL_UNREADABLE');return n;};
  const allowed=(receipt=false)=>{const u=new URL(location.href);if(u.origin!==p.origin||u.username||u.password||u.hash||u.pathname!==(receipt?p.receipt_path:p.checkout_path))stop('PAYMENT_PAGE_OUTSIDE_PROFILE');};
  const available=()=>p.methods.filter(m=>{try{const e=one(m.available);return !e.disabled&&e.getAttribute('aria-disabled')!=='true';}catch{return false;}});
  const selected=()=>{const matches=available().filter(m=>{try{return !!one(m.selected);}catch{return false;}});if(matches.length!==1)stop('PAYMENT_SELECTION_UNREADABLE');return matches[0];};
  const quote=()=>{
    allowed();const m=selected(),c=p.checkout,button=one(p.final_button);
    if(value(c.billing_type)!==p.one_time_text)stop('PAYMENT_RECURRING_OR_UNKNOWN_TYPE');
    if(button.disabled||button.getAttribute('aria-disabled')==='true'||button.textContent.trim()!==p.final_text)stop('PAYMENT_FINAL_CONTROL_CHANGED');
    const q={adapter_id:p.id,checkout_url:location.href,merchant:value(c.merchant),purpose:value(c.purpose),order_id:value(c.order_id),amount:amount(c.amount),currency:value(c.currency),method:m.kind,option_id:m.id,method_label:m.label,instrument_label:value(m.instrument),terms:value(c.terms),final_label:button.textContent.trim(),authentication:m.authentication,payment_type:'ONE_TIME'};
    if(m.kind==='BANK_TRANSFER'){q.bank=value(c.bank);q.account=value(c.account).replace(/[ -]/g,'');q.holder=value(c.holder);}
    if(/(?:\d[ -]?){12,19}/.test(q.instrument_label))stop('PAYMENT_UNMASKED_INSTRUMENT_NOT_ALLOWED');
    return {q,button};
  };
  if(operation==='receipt'){
    allowed(true);const r=p.receipt;if(value(r.status)!==r.success_text)return {status:'UNCONFIRMED'};
    const method=p.methods.find(m=>m.receipt_text===value(r.method));if(!method)stop('PAYMENT_RECEIPT_METHOD_UNKNOWN');
    let url=location.href;
    if(r.url){const link=one(r.url);url=link.href;const u=new URL(url);if(u.origin!==p.origin||u.protocol!=='https:'||u.username||u.password)stop('PAYMENT_RECEIPT_URL_INVALID');}
    return {status:'SUCCESS',merchant:value(r.merchant),order_id:value(r.order_id),amount:amount(r.amount),currency:value(r.currency),method:method.kind,transaction_id:value(r.transaction_id),paid_at:value(r.paid_at),receipt_url:url};
  }
  allowed();
  if(operation==='options')return {options:available().map(m=>({id:m.id,method:m.kind,label:m.label,saved:m.saved,instrument_label:value(m.instrument),authentication:m.authentication})).map(m=>{if(/(?:\d[ -]?){12,19}/.test(m.instrument_label))stop('PAYMENT_UNMASKED_INSTRUMENT_NOT_ALLOWED');return m;}),evidence_level:'MERCHANT_SCREEN'};
  if(operation==='select'){
    const m=available().find(m=>m.id===payload.option_id);if(!m||!m.select)stop('PAYMENT_OPTION_UNAVAILABLE');
    const e=one(m.select);if(e===one(p.final_button)||e.disabled||e.getAttribute('aria-disabled')==='true')stop('PAYMENT_OPTION_CONTROL_UNSAFE');
    e.click();return {selection_requested:true,method:m.kind,option_id:m.id};
  }
  const {q,button}=quote();
  if(operation==='observe')return q;
  if(operation==='submit'){
    if(!payload||Object.keys(payload).some(k=>q[k]!==payload[k])||Object.keys(q).some(k=>q[k]!==payload[k]))stop('PAYMENT_CHECKOUT_CHANGED_BEFORE_CLICK');
    // Synchronous compare-and-click: another page task cannot swap the displayed
    // order/method/total between the check and this invocation.
    button.click();return {submitted:true};
  }
  stop('PAYMENT_BROWSER_OPERATION_INVALID');
}

export function decodeEvaluation(result,marker){
  if(!result||result.isError===true)fail('PAYMENT_BROWSER_RESULT_UNKNOWN');
  const values=[];
  if(typeof result.structuredContent?.result==='string')values.push(result.structuredContent.result);
  for(const block of result.content||[]){
    if(block.type!=='text')continue;
    const raw=block.text.trim();
    if(raw.startsWith(marker))values.push(raw);
    else{
      const section=raw.match(/^### Result\s*\n([\s\S]*?)(?=\n### |$)/);
      try{const parsed=JSON.parse(section?section[1].trim():raw);if(typeof parsed==='string')values.push(parsed);}catch{}
    }
  }
  const found=[...new Set(values.filter(v=>v.startsWith(marker)))];
  if(found.length!==1)fail('PAYMENT_BROWSER_EVIDENCE_UNREADABLE');
  let data;try{data=JSON.parse(found[0].slice(marker.length));}catch{fail('PAYMENT_BROWSER_EVIDENCE_UNREADABLE');}
  if(!data||typeof data!=='object'||Array.isArray(data))fail('PAYMENT_BROWSER_EVIDENCE_UNREADABLE');
  return data;
}
export function createPaymentBrowserDriver(browserTool,{profiles,profileFile}={}){
  let cached=profiles;
  const catalog=()=>cached??(cached=loadProfiles(profileFile));
  const profile=t=>{
    if(!t.checkout_url)fail('PAYMENT_BANK_HANDOFF_ONLY');
    const u=new URL(t.checkout_url),matches=catalog().filter(p=>p.origin===u.origin&&p.checkout_path===u.pathname);
    if(matches.length!==1)fail('PAYMENT_SITE_ADAPTER_REQUIRED');return matches[0];
  };
  async function call(t,operation,payload={}){
    const p=profile(t),marker='JH_PAYMENT_'+randomBytes(12).toString('hex')+':';
    const fn=`() => ${JSON.stringify(marker)} + JSON.stringify((${checkoutPageOperation.toString()})(${JSON.stringify(p)},${JSON.stringify(operation)},${JSON.stringify(payload)}))`;
    return decodeEvaluation(await browserTool('browser_evaluate',{function:fn}),marker);
  }
  return {options:t=>call(t,'options'),select:(t,id)=>call(t,'select',{option_id:id}),observe:t=>call(t,'observe'),submit:(t,q)=>call(t,'submit',q),receipt:t=>call(t,'receipt')};
}
