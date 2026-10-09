/** Bounded JSON interface for an explicitly installed owner enrollment service.
 * The host must terminate TLS at its configured origin. No cookies, redirects,
 * CORS reflection, API keys in URLs, or decoded-token-only authentication.
 */
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function parseOwnerJson(bytes) {
  if(!Buffer.isBuffer(bytes)||bytes.length>16384)fail('BODY_TOO_LARGE');
  let s;try{s=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('INVALID_UTF8');}
  let p=0,nodes=0;const ws=()=>{while(p<s.length&&/[\t\n\r ]/.test(s[p]))p++;};
  function string(){const a=p++;while(p<s.length){const c=s[p++];if(c==='"'){try{return JSON.parse(s.slice(a,p));}catch{fail('INVALID_JSON');}}if(c==='\\')p++;}fail('INVALID_JSON');}
  function value(depth){
    if(depth>8||++nodes>100)fail('JSON_LIMIT');ws();const c=s[p];
    if(c==='{'){p++;ws();const keys=new Set();if(s[p]==='}'){p++;return;}
      for(;;){ws();if(s[p]!=='"')fail('INVALID_JSON');const key=string();if(keys.has(key)||['__proto__','prototype','constructor'].includes(key))fail('DUPLICATE_OR_UNSAFE_KEY');keys.add(key);ws();if(s[p++]!==':')fail('INVALID_JSON');value(depth+1);ws();if(s[p]==='}'){p++;return;}if(s[p++]!==',')fail('INVALID_JSON');}
    }
    if(c==='['){p++;ws();if(s[p]===']'){p++;return;}for(;;){value(depth+1);ws();if(s[p]===']'){p++;return;}if(s[p++]!==',')fail('INVALID_JSON');}}
    if(c==='"'){string();return;}
    const m=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(s.slice(p));if(!m)fail('INVALID_JSON');p+=m[0].length;
  }
  value(0);ws();if(p!==s.length)fail('INVALID_JSON');
  try{const o=JSON.parse(s);if(!o||Object.getPrototypeOf(o)!==Object.prototype)fail('JSON_OBJECT_REQUIRED');return o;}catch(e){if(e.code)throw e;fail('INVALID_JSON');}
}
export function createOwnerEnrollmentHttpHandler({service,serverOrigin,clock=Date.now}) {
  const origin=new URL(serverOrigin);if(origin.protocol!=='https:'||origin.origin!==serverOrigin)fail('HTTPS_ORIGIN_REQUIRED');
  for(const k of ['begin','finish','outcomeChallenge','status','cancel'])if(typeof service?.[k]!=='function')fail('OWNER_SERVICE_REQUIRED');
  const paths=new Map([['begin','begin'],['finish','finish'],['challenge','outcomeChallenge'],['status','status'],['cancel','cancel']].map(([path,method])=>['/device/owner-enrollment/'+path,method]));
  let since=clock(),requests=0,inFlight=0;
  return async function handleOwnerEnrollment(req,res,url) {
    const send=(status,value)=>{if(!res.headersSent&&!res.destroyed){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(JSON.stringify(value));}};
    if(req.method!=='POST'||url.search||!paths.has(url.pathname)){send(404,{ok:false,code:'NOT_FOUND'});return;}
    if(req.headers.origin!==undefined&&req.headers.origin!==serverOrigin){send(403,{ok:false,code:'ORIGIN_REJECTED'});return;}
    if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']||''))||req.headers['content-encoding']){send(415,{ok:false,code:'JSON_REQUIRED'});return;}
    const now=clock();if(!Number.isSafeInteger(now)){send(503,{ok:false,code:'CLOCK_INVALID'});return;}
    if(now<since||now-since>=60000){since=now;requests=0;}
    if(++requests>60||inFlight>=4){send(429,{ok:false,code:'RATE_LIMIT'});return;}
    const declared=req.headers['content-length'];
    if(declared!==undefined&&(!/^[0-9]+$/.test(declared)||Number(declared)>16384)){send(413,{ok:false,code:'BODY_TOO_LARGE'});return;}
    inFlight++;let timer;
    try {
      timer=setTimeout(()=>req.destroy(),8000);timer.unref();
      const chunks=[];let length=0;for await(const bytes of req){length+=bytes.length;if(length>16384)fail('BODY_TOO_LARGE');chunks.push(bytes);}
      clearTimeout(timer);
      if(!req.complete||(declared!==undefined&&Number(declared)!==length))fail('INCOMPLETE_BODY');
      const input=parseOwnerJson(Buffer.concat(chunks)),result=await service[paths.get(url.pathname)](input);
      send(200,result);
    }catch(e){const code=/^[a-zA-Z0-9_]{1,80}$/.test(e.code||'')?e.code:'ENROLLMENT_REQUEST_FAILED';send(code==='BODY_TOO_LARGE'?413:400,{ok:false,code});}
    finally{clearTimeout(timer);inFlight--;}
  };
}
