/** Source-only JH168 candidate. Same-command RIGHT Chrome open -> read-only START.
 * Execution permissions and any CLICK remain with the original Secure56 phone.
 */
const hex32=/^[a-f0-9]{32}$/,hex64=/^[a-f0-9]{64}$/;
const same=(a,b)=>!!a&&!!b&&a.deviceId===b.deviceId&&a.sessionId===b.sessionId&&
 hex32.test(a.commandId||'')&&a.commandId===b.commandId;
const deny=(code,opened=null)=>({ok:false,code,opened,automaticReplay:false,phoneClickAttempted:false});
const unwrap=r=>{
 if(r&&Array.isArray(r.content)){
  try{return JSON.parse(r.content.find(x=>x.type==='text')?.text||'null')}catch{return null}
 }
 return r;
};
const goodScreen=(r,now)=>r?.ok===true&&r.state==='ACTIVE'&&
 /^ssc_[a-f0-9]{32}$/.test(r.contextId||'')&&hex64.test(r.screenDigest||'')&&
 r.packageName==='com.android.chrome'&&Number.isSafeInteger(r.windowId)&&
 r.layout?.arrangement==='LEFT_RIGHT'&&r.layout?.chatPackage==='com.openai.chatgpt'&&
 r.layout?.workPackage==='com.android.chrome'&&r.layout?.workWindowId===r.windowId&&
 Number.isSafeInteger(r.capturedAt)&&now>=r.capturedAt&&now-r.capturedAt<=15000&&
 Number.isSafeInteger(r.expiresAt)&&r.expiresAt>now&&Array.isArray(r.items)&&
 r.items.length<=500&&r.items.every(n=>/^item_[a-f0-9]{16}$/.test(n?.itemRef||''));
export async function openAndObserveRightChrome56({service,open,start,readBinding,now=Date.now}={}){
 if(typeof service!=='string'||!service.trim()||
   ![open,start,readBinding,now].every(f=>typeof f==='function'))
  return deny('RIGHT_OPEN_READ_PORTS_REQUIRED');
 let before;try{before=readBinding()}catch{return deny('COMMAND_BINDING_UNAVAILABLE')}
 if(!same(before,before))return deny('COMMAND_BINDING_UNAVAILABLE');
 let opened;
 try{opened=unwrap(await open(service))}catch{return deny('OPEN_UNKNOWN_NO_REPLAY')}
 if(opened?.route!=='android_right'||opened?.rightAddressConfirmed!==true||
    opened?.actionSucceeded!==true)
  return {...(opened||{ok:false}),postOpenRead:{ok:false,attempted:false,
    code:'ORIGINAL_OPEN_UNCONFIRMED'},automaticReplay:false};
 let after;try{after=readBinding()}catch{return deny('COMMAND_CHANGED_AFTER_OPEN',opened)}
 if(!same(before,after))return deny('COMMAND_CHANGED_AFTER_OPEN',opened);
 let screen;try{screen=unwrap(await start())}catch{return deny('READ_UNKNOWN_NO_REPLAY',opened)}
 try{after=readBinding()}catch{return deny('COMMAND_CHANGED_DURING_READ',opened)}
 if(!same(before,after))return deny('COMMAND_CHANGED_DURING_READ',opened);
 if(!goodScreen(screen,now()))return deny('RIGHT_SCREEN_UNVERIFIED',opened);
 return {...opened,postOpenRead:{ok:true,contextId:screen.contextId,
   screenDigest:screen.screenDigest,workWindowId:screen.windowId,
   items:screen.items,capturedAt:screen.capturedAt,expiresAt:screen.expiresAt,
   clickExecuted:false,resultVerified:false,phoneOwnedRefs:true},automaticReplay:false};
}
