import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { GlassPhotoMailbox, MAX_JPEG_BYTES } from './photo-mailbox.mjs';
import { createPhotoIngress } from './photo-ingress.mjs';

const OWNER = 'owner:testcase001';
const jpeg = Buffer.concat([Buffer.from([255,216,255,224]), Buffer.alloc(32,1), Buffer.from([255,217])]);
function fixture(opts={}) {
 const mailbox = new GlassPhotoMailbox();
 const {pairingToken} = mailbox.beginPairing({ownerId:OWNER});
 const response = {headersSent:false,writableEnded:false,writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;return this},end(body){this.writableEnded=true;this.body=JSON.parse(body);return this}};
 const request=Object.assign(Readable.from([Buffer.from(opts.body||jpeg)]),{method:opts.method||'POST',url:opts.url||'/jh-glass/v1/photo',headers:{'content-type':opts.mime||'image/jpeg',authorization:opts.auth||('Bearer '+pairingToken),...opts.headers}});
 const handler=createPhotoIngress({mailbox,trustedTransport:opts.trustedTransport??(()=>true),approveRequest:opts.approveRequest??(()=>true),validateJpeg:opts.validateJpeg??(()=>true)});
 return {mailbox,response,request,handler,pairingToken};
}
test('accepts one photo, returns receipt, then consumes under same owner',async()=>{
 const f=fixture();assert.equal(await f.handler(f.request,f.response),true);assert.equal(f.response.status,202);
 assert.equal(f.response.headers['cache-control'],'no-store');const v=f.mailbox.consumePhoto({ownerId:OWNER});assert.equal(v.ok,true);assert.deepEqual(v.imageBytes,jpeg);
});
test('unrelated URL not intercepted',async()=>{const f=fixture({url:'/mcp'});assert.equal(await f.handler(f.request,f.response),false);});
test('method denied before reading',async()=>{const f=fixture({method:'GET'});await f.handler(f.request,f.response);assert.equal(f.response.status,405);});
test('no injectable security gates -> always fail closed',async()=>{const box=new GlassPhotoMailbox();const f=fixture();const h=createPhotoIngress({mailbox:box});await h(f.request,f.response);assert.equal(f.response.status,503);});
test('untrusted transport denied',async()=>{const f=fixture({trustedTransport:()=>false});await f.handler(f.request,f.response);assert.equal(f.response.status,403);});
test('server rate/approval denied',async()=>{const f=fixture({approveRequest:()=>false});await f.handler(f.request,f.response);assert.equal(f.response.status,403);});
test('browser Origin denied',async()=>{const f=fixture({headers:{origin:'https://random.example'}});await f.handler(f.request,f.response);assert.equal(f.response.status,403);});
test('compression denied',async()=>{const f=fixture({headers:{'content-encoding':'gzip'}});await f.handler(f.request,f.response);assert.equal(f.response.status,415);});
test('wrong Content-Type denied',async()=>{const f=fixture({mime:'application/octet-stream'});await f.handler(f.request,f.response);assert.equal(f.response.status,415);});
test('bad pairing token denied',async()=>{const f=fixture({auth:'Bearer invalid'});await f.handler(f.request,f.response);assert.equal(f.response.status,401);});
test('claiming oversized Content-Length denied before stream',async()=>{const f=fixture({headers:{'content-length':String(MAX_JPEG_BYTES+1)}});await f.handler(f.request,f.response);assert.equal(f.response.status,413);});
test('chunked oversized upload rejected at streaming boundary',async()=>{const f=fixture({body:Buffer.alloc(MAX_JPEG_BYTES+1,55)});await f.handler(f.request,f.response);assert.equal(f.response.status,413);});
test('invalid real JPEG decode is rejected; no pending photo',async()=>{const f=fixture({validateJpeg:()=>false});await f.handler(f.request,f.response);assert.equal(f.response.status,422);assert.equal(f.mailbox.status({ownerId:OWNER}).photoPending,false);});
test('replay second request gets conflict',async()=>{
 const f=fixture();await f.handler(f.request,f.response);const second=fixture({auth:'Bearer '+f.pairingToken});
 const h=createPhotoIngress({mailbox:f.mailbox,trustedTransport:()=>true,approveRequest:()=>true,validateJpeg:()=>true});await h(second.request,second.response);assert.equal(second.response.status,409);
});
test('rejected JPEG decoder burns pairing (no retry with bad photo)',async()=>{
 const f=fixture({validateJpeg:()=>false});await f.handler(f.request,f.response);
 const next=fixture({auth:'Bearer '+f.pairingToken});const h=createPhotoIngress({mailbox:f.mailbox,trustedTransport:()=>true,approveRequest:()=>true,validateJpeg:()=>true});
 await h(next.request,next.response);assert.equal(next.response.status,409);
});
test('declared Content-Length mismatch is refused and burns pairing',async()=>{
 const f=fixture({headers:{'content-length':String(jpeg.length+1)}});await f.handler(f.request,f.response);
 assert.equal(f.response.status,400);assert.equal(f.mailbox.status({ownerId:OWNER}).pairingActive,false);
});
test('cancel pairing explicitly revokes token',()=>{
 const f=fixture();assert.equal(f.mailbox.cancelPairing({pairingToken:f.pairingToken}),true);
 assert.equal(f.mailbox.cancelPairing({pairingToken:f.pairingToken}),false);
});
