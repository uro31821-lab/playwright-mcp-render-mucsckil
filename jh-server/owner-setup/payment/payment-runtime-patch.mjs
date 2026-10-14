// A narrow integration with the existing owner-authenticated MCP host.
// Preserves its authentication, journal, HMAC and device-local authentication.
export const PAYMENT_IMPORT=`import {paymentResultPolicy as jhPaymentResultPolicy} from '../payment/payment-result-policy.mjs';\nimport {getPaymentHost as jhPaymentHost,registerPaymentTools as jhRegisterPaymentTools,handlePaymentHttp as jhHandlePaymentHttp} from '../payment/payment-host.mjs';\nimport {createPaymentBrowserDriver as jhPaymentDriver} from '../payment/payment-browser.mjs';\n`;
export const PAYMENT_ADAPTER=String.raw`
function jhPaymentError(code){throw Object.assign(new Error(code),{code});}
function jhPaymentPhone(t){
  const owner=process.env.JH_OPERATIONAL_ACCOUNT_DIGEST;
  if(t.device_id&&!devices.has(t.device_id))jhPaymentError('PAYMENT_EXACT_DEVICE_UNAVAILABLE');
  const candidates=[...devices.keys()].filter(d=>{const a=active56(d);return a&&a.ownerDigest===owner&&a.trustId&&devices.get(d)?.secureBridgeVersion===56&&devices.get(d)?.deviceDigest===a.deviceDigest;});
  if(!t.device_id&&candidates.length!==1)jhPaymentError('PAYMENT_SINGLE_TRUSTED_PHONE_REQUIRED');
  const device=t.device_id||candidates[0],a=active56(device);
  if(!a||!candidates.includes(device))jhPaymentError('PAYMENT_TRUSTED_PHONE_UNAVAILABLE');
  return {device,a};
}
async function jhPaymentOpen(t,target){
  if(target==='BROWSER'){
    const r=await browserTool('browser_navigate',{url:t.checkout_url},true);
    return {delivered:!!r&&typeof r==='object'&&r.isError!==true,transport:'EXISTING_BROWSER',screen_verified:false,payment_verified:false};
  }
  const {device,a}=jhPaymentPhone(t);
  const j=mk('open_url',{target:'chrome',url:t.checkout_url,paymentId:t.id},device);
  if(j.status!=='queued'||j.targetDeviceId!==device||j.secureSessionId!==a.sessionId)
    return {delivered:false,rejected:j.status==='error',code:'PAYMENT_SIGNED_DISPATCH_UNAVAILABLE'};
  const r=await waitJob(j,25000);
  return {delivered:r?.status==='complete'&&r?.result?.ok===true,transport:'EXISTING_SECURE56',job_id:j.id,screen_verified:false,payment_verified:false};
}
jhPaymentOpen.preflight=async(t,target)=>{if(target==='PHONE')jhPaymentPhone(t);};
function jhPaymentAssertBinding(t){
  const b=t.command_binding;
  if(!b||b.server_instance!==jhWorkflowRuntimeDigest56||jhBlockedCommands56.has(b.device)||jhCommandVersion56(b.device)!==b.command_id)jhPaymentError('PAYMENT_COMMAND_DISCARDED');
  const a=active56(b.device),meta=devices.get(b.device);
  if(!a||a.ownerDigest!==process.env.JH_OPERATIONAL_ACCOUNT_DIGEST||a.trustId!==b.trust_id||a.deviceDigest!==b.device_digest||meta?.processEpoch!==b.process_epoch)jhPaymentError('PAYMENT_DEVICE_OR_PROCESS_CHANGED');
}
const jhPaymentLifecycle={
  captureBinding(input){
    const c=jhCommandContext56.getStore(),device=c?.device,command_id=jhRequireCommand56(device);
    if(input.device_id&&input.device_id!==device)jhPaymentError('PAYMENT_EXACT_DEVICE_REQUIRED');
    const a=active56(device),m=devices.get(device);
    if(!a||a.ownerDigest!==process.env.JH_OPERATIONAL_ACCOUNT_DIGEST||!a.trustId||a.deviceDigest!==m?.deviceDigest)jhPaymentError('PAYMENT_TRUSTED_PHONE_UNAVAILABLE');
    if(!/^[A-Za-z0-9_-]{16,160}$/.test(m?.processEpoch||''))jhPaymentError('PAYMENT_PROCESS_EPOCH_REQUIRED');
    return {device,command_id,server_instance:jhWorkflowRuntimeDigest56,process_epoch:m.processEpoch,trust_id:a.trustId,device_digest:a.deviceDigest};
  },
  assertBinding:jhPaymentAssertBinding,
  assertActive(t){jhPaymentAssertBinding(t);const c=jhCommandContext56.getStore();if(c?.device!==t.command_binding.device||jhRequireCommand56(c.device)!==t.command_binding.command_id)jhPaymentError('PAYMENT_COMMAND_CONTEXT_MISMATCH');},
  assertReadOwner(t){if(t.lifecycle_cancelled)return;jhPaymentAssertBinding(t);},
  run(t,fn){jhPaymentAssertBinding(t);const b=t.command_binding;return jhCommandContext56.run({device:b.device,commandId:b.command_id,version:b.command_id,used:false},async()=>{jhPaymentLifecycle.assertActive(t);return fn();});}
};
const jhGetPaymentService=()=>jhPaymentHost({openCheckout:jhPaymentOpen,inspectCheckout:async()=>browserTool('browser_snapshot',{}),paymentDriver:jhPaymentDriver((name,args)=>browserTool(name,args,true)),lifecycle:jhPaymentLifecycle,choiceLookup:id=>jhDecisionStoreV2.get(id),resultVerifier:jhPaymentResultPolicy});
function jhDiscardPayments56(device,commandId,reason){if(process.env.JH_PAYMENT_ENABLED==='1')return jhGetPaymentService().discardWork({device,commandId,reason});}
if(process.env.JH_PAYMENT_ENABLED==='1')jhGetPaymentService();
`;
export const PAYMENT_REGISTER='  jhRegisterPaymentTools({register:registerOAuthTool,z,textResult,getService:jhGetPaymentService});\n';
export const PAYMENT_HTTP='  if(await jhHandlePaymentHttp(req,res,url,jhGetPaymentService))return;\n';
export const PAYMENT_BROWSER_OLD='async function browserTool(name,args={}){ const commandId=jhRequireCommand56(jhCommandContext56.getStore()?.device);const reply=await browserSession.rpc("tools/call",{name,arguments:args,_meta:{jhCommandId:commandId}});jhRequireCommand56(jhCommandContext56.getStore()?.device);return reply.result; }';
export const PAYMENT_BROWSER_NEW='async function browserTool(name,args={},paymentInternal=false){ if(!paymentInternal&&process.env.JH_PAYMENT_ENABLED==="1")jhGetPaymentService().final.guardBrowser(name,args);const commandId=jhRequireCommand56(jhCommandContext56.getStore()?.device);const reply=await browserSession.rpc("tools/call",{name,arguments:args,_meta:{jhCommandId:commandId}});jhRequireCommand56(jhCommandContext56.getStore()?.device);return reply.result; }';
export const PAYMENT_ROUTE=String.raw`    if(/자동결제|자동 결제|결제정보|결제 준비|결제 화면|송금할 내용|payment handoff/.test(s))return textResult({owner:'jh_payment',request:raw,rule:'Automatically search/select within the user request using existing JH tools, prepare real order details, open checkout, inspect options and select a method. Immediately before money moves use life_payment_request_approval and show its link to the user; never open or approve it on their behalf or bypass it with generic tools. After user approval, user handles device PIN/biometrics if needed. Verify receipt with life_payment_verify_result and report exact amount/evidence using life_payment_result. Unknown result must never trigger another payment.'});
`;
export function patchPaymentRuntime(source){
  const scope='function createMcp(){',tool='  registerOAuthTool("life_status",{',http='  const url=new URL(req.url||"/","http://localhost");\n',route='    const reservationHints=';
  if(typeof source!=='string'||!source.includes('jhMcpWorkflows56')||source.includes('jhGetPaymentService'))throw Error('PAYMENT_EXPECTED_DURABLE_RUNTIME_REQUIRED');
  for(const anchor of [scope,tool,http,route,PAYMENT_BROWSER_OLD])if(source.split(anchor).length!==2)throw Error('PAYMENT_RUNTIME_ANCHOR_CHANGED');
  const out=PAYMENT_IMPORT+source.replace(scope,PAYMENT_ADAPTER+'\n'+scope).replace(tool,PAYMENT_REGISTER+tool).replace(http,http+PAYMENT_HTTP).replace(route,PAYMENT_ROUTE+route).replace(PAYMENT_BROWSER_OLD,PAYMENT_BROWSER_NEW);
  if(out.slice(PAYMENT_IMPORT.length).replace(PAYMENT_ADAPTER+'\n'+scope,scope).replace(PAYMENT_REGISTER+tool,tool).replace(http+PAYMENT_HTTP,http).replace(PAYMENT_ROUTE+route,route).replace(PAYMENT_BROWSER_NEW,PAYMENT_BROWSER_OLD)!==source)throw Error('PAYMENT_PATCH_SCOPE_CHANGED');
  return out;
}
