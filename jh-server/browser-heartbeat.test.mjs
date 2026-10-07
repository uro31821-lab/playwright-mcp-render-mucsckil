import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrowserHeartbeat} from './browser-heartbeat.mjs';
const URL='https://playwright-mcp-yzcy.onrender.com/mcp';
function fixture(options={}){
  let stream,abort=false,ended=[];const calls=[];const replies=[];
  const fetchImpl=async(u,o)=>{calls.push({u,o});o.signal.addEventListener('abort',()=>{abort=true});
    return new Response(new ReadableStream({start(c){stream=c}}),{headers:{'content-type':'text/event-stream','mcp-session-id':'fixture-session'}});};
  const transport={request:async o=>{replies.push(JSON.parse(o.body));assert.equal(o.headers['mcp-session-id'],'fixture-session');return new Response(null,{status:202})}};
  const factory=createBrowserHeartbeat({endpoint:URL,token:'x'.repeat(32),fetchImpl,transport,...options});
  const h=factory({sessionId:'fixture-session',version:'2025-03-26',onEnd:c=>ended.push(c)});
  return {h,calls,replies,ended,send:text=>stream.enqueue(new TextEncoder().encode(text)),eof:()=>stream.close(),aborted:()=>abort};
}
async function tick(){await delay(8);}
test('authenticated session GET and ping reply; never executes a tool',async()=>{const f=fixture();try{
 await tick();f.send('event: message\ndata: {"jsonrpc":"2.0","method":"ping","id":7}\n\n');await tick();
 assert.deepEqual(f.replies,[{jsonrpc:'2.0',id:7,result:{}}]);assert.equal(f.calls[0].u,URL);
 assert.equal(f.calls[0].o.headers.authorization,'Bearer '+'x'.repeat(32));assert.equal(f.calls[0].o.redirect,'error');
 assert.equal(f.calls[0].o.headers['mcp-session-id'],'fixture-session');assert(f.h.active());
 }finally{f.h.close();}assert(f.aborted());assert.equal(f.ended.length,0);});
test('split SSE frames and comments do not lose a ping',async()=>{const f=fixture();try{await tick();f.send(': test\n\ndata: {"jsonrpc":"2.0","method":');await tick();f.send('"ping","id":"p"}\r\n\r\n');await tick();assert.equal(f.replies.length,1);}finally{f.h.close();}});
test('server request cannot authorize arbitrary tools or sampling',async()=>{const f=fixture();try{await tick();f.send('data: {"jsonrpc":"2.0","method":"tools/call","id":8,"params":{"name":"delete"}}\n\n');await tick();assert.equal(f.replies[0].error.code,-32601);assert.equal(f.replies[0].method,undefined);}finally{f.h.close();}});
test('notifications receive no reply and authorize nothing',async()=>{const f=fixture();try{await tick();f.send('data: {"jsonrpc":"2.0","method":"notifications/message","params":{"authorized":true}}\n\n');await tick();assert.equal(f.replies.length,0);}finally{f.h.close();}});
test('malformed server message closes once without reply',async()=>{const f=fixture();await tick();f.send('data: not-json\n\n');await tick();assert(!f.h.active());assert.equal(f.ended.length,1);assert.equal(f.replies.length,0);});
test('unsolicited result is not a ping',async()=>{const f=fixture();await tick();f.send('data: {"jsonrpc":"2.0","id":9,"result":{}}\n\n');await tick();assert(!f.h.active());assert.equal(f.replies.length,0);});
test('remote EOF invalidates stream; no automatic GET retry',async()=>{const f=fixture();await tick();f.eof();await tick();assert.equal(f.ended.length,1);assert.equal(f.calls.length,1);assert(!f.h.active());});
test('oversized unterminated event is bounded',async()=>{const f=fixture();await tick();f.send('x'.repeat(66000));await tick();assert(!f.h.active());assert.equal(f.replies.length,0);});
test('wrong session response is rejected',async()=>{const f=fixture({fetchImpl:async()=>new Response(new ReadableStream(),{headers:{'content-type':'text/event-stream','mcp-session-id':'different'}})});await tick();assert.equal(f.ended.length,1);assert(!f.h.active());});
test('non-SSE or auth error closes without retries',async()=>{const f=fixture({fetchImpl:async()=>new Response(null,{status:401})});await tick();assert.equal(f.ended.length,1);assert(!f.h.active());});
test('missing heartbeat hits bounded idle timeout',async()=>{const f=fixture({idleMs:20,lifetimeMs:100});await delay(40);assert.deepEqual(f.ended,['browser_heartbeat_idle']);assert(f.aborted());});
test('explicit close does not report a new failure',async()=>{const f=fixture();f.h.close();f.h.close();await tick();assert.equal(f.ended.length,0);assert(f.aborted());});
test('credentials, endpoint and session are validated before request',()=>{let requests=0;for(const options of [{endpoint:'https://elsewhere.invalid'},{token:'short'},{token:'x'.repeat(24)+'\n'}]){
 const factory=createBrowserHeartbeat({endpoint:URL,token:'x'.repeat(32),transport:{request(){}},fetchImpl:()=>requests++,...options});assert.throws(()=>factory({sessionId:'fixture',version:'2025-03-26',onEnd(){}}),/configuration/);
 }assert.equal(requests,0);});
