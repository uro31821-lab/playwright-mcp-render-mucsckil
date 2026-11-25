// Two loopback origins. The only recognized proof is the synthetic page's nonce.
import http from 'node:http';
import {createOwnerChannel,rejectOwnerVerification} from '../owner-channel.mjs';

const stats={approved:0,received:0};
const loopback=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const callback=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname!=='/client/return'||u.searchParams.get('code')!=='synthetic'){res.writeHead(404).end();return;}
  stats.received++;
  res.writeHead(200,{'content-type':'text/plain'}).end('Synthetic callback received');
});
await loopback(callback);
const returnUrl='http://127.0.0.1:'+callback.address().port+'/client/return';
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  if(req.method==='GET'&&url.pathname==='/stats'){
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(stats));
    return;
  }
  if(req.method==='GET'&&['/previous','/candidate','/self-only','/redirect'].includes(url.pathname)){
    const params=Object.fromEntries(url.searchParams);
    if(url.pathname==='/self-only'||url.pathname==='/redirect'){
      params.redirect_uri=returnUrl;
      params.state='callback-trial';
    }
    if(url.pathname==='/previous'||url.pathname==='/self-only'){
      const original=res.writeHead.bind(res);
      res.writeHead=(status,headers)=>{
        const adjusted={...headers};
        if(url.pathname==='/previous')adjusted['referrer-policy']='no-referrer';
        else adjusted['content-security-policy']=adjusted['content-security-policy'].replace("'self' "+returnUrl+";","'self';");
        return original(status,adjusted);
      };
    }
    channel.page(res,params,value=>value===returnUrl);
    return;
  }
  if(req.method==='POST'&&url.pathname==='/oauth/authorize'){
    let form='';
    for await(const chunk of req){form+=chunk;if(form.length>8192){res.writeHead(413).end();return;}}
    const params=Object.fromEntries(new URLSearchParams(form));
    try{
      const result=await channel.verify(req,params);
      if(result?.owner!==config.accountDigest){res.writeHead(403).end();return;}
      if(params.state==='callback-trial'){
        if(params.redirect_uri!==returnUrl){res.writeHead(400).end();return;}
        stats.approved++;
        res.writeHead(302,{location:returnUrl+'?code=synthetic','cache-control':'no-store'}).end();
        return;
      }
      res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({
        originMatched:req.headers.origin===origin,cookiePresent:!!req.headers.cookie,
        referrerWasOriginOnly:req.headers.referer===origin+'/'
      }));
    }catch(error){rejectOwnerVerification(res,error);}
    return;
  }
  res.writeHead(404).end();
});
await loopback(server);
const origin='http://127.0.0.1:'+server.address().port;
const config={serverOrigin:origin,googleWebClientId:'local.apps.googleusercontent.com',accountDigest:'local-synthetic'};
const channel=createOwnerChannel(config,{peer:{},verifier:{async verify(value,expected){
  if(value!==expected)throw Object.assign(Error(),{code:'identity_nonce_mismatch'});
  return {accountDigest:config.accountDigest};
}}});
console.log(JSON.stringify({origin,returnUrl}));
