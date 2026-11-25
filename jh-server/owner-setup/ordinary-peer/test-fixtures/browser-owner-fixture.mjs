// Local browser contract fixture. The only proof recognized is the synthetic page's nonce.
import http from 'node:http';
import {createOwnerChannel,rejectOwnerVerification} from '../owner-channel.mjs';

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  if(req.method==='GET'&&['/previous','/candidate'].includes(url.pathname)){
    const params=Object.fromEntries(url.searchParams);
    if(url.pathname==='/previous'){
      const original=res.writeHead.bind(res);
      res.writeHead=(status,headers)=>original(status,{...headers,'referrer-policy':'no-referrer'});
    }
    channel.page(res,params);
    return;
  }
  if(req.method==='POST'&&url.pathname==='/oauth/authorize'){
    let form='';
    for await(const chunk of req){form+=chunk;if(form.length>8192){res.writeHead(413).end();return;}}
    const params=Object.fromEntries(new URLSearchParams(form));
    try{
      const result=await channel.verify(req,params);
      if(result?.owner!==config.accountDigest){res.writeHead(403).end();return;}
      res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({
        originMatched:req.headers.origin===origin,cookiePresent:!!req.headers.cookie,
        referrerWasOriginOnly:req.headers.referer===origin+'/'
      }));
    }catch(error){rejectOwnerVerification(res,error);}
    return;
  }
  res.writeHead(404).end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const config={serverOrigin:origin,googleWebClientId:'local.apps.googleusercontent.com',accountDigest:'local-synthetic'};
const channel=createOwnerChannel(config,{peer:{},verifier:{async verify(value,expected){
  if(value!==expected)throw Object.assign(Error(),{code:'identity_nonce_mismatch'});
  return {accountDigest:config.accountDigest};
}}});
console.log(origin);
