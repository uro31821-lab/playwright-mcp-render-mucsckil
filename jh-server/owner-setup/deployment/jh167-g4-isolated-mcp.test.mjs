/**
 * Isolated actual MCP protocol: uses seven PRODUCTION tool registrars, but NOT
 * the Secure56/Durable process, external services, Android, or production keys.
 * No HTTP booking actions or outbound network requests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {z} from 'zod';
import {registerJHGuide13Tools,GUIDE_13_TOOL_NAMES} from '../guide-13/host-tools.mjs';
import {registerReservationLinkTools} from '../reservation-link/host-tools.mjs';
import {officialLiveSupplierStatus} from '../reservation-link/providers/official-live.mjs';

const NAMES=[...GUIDE_13_TOOL_NAMES,'life_reservation_link_assistant',
 'life_reservation_screen_guide','life_reservation_regional_handoff',
 'life_reservation_provider_status','life_reservation_live_search'];
async function isolate(commandId='test-cmd-current'){
 const server=new McpServer({name:'jh167-g4-sandbox',version:'0.6.0'},{capabilities:{tools:{}}});
 let current=commandId,readCount=0;
 const registerOAuthTool=(name,meta,handler)=>{
  server.registerTool(name,{title:meta.title,description:meta.description,
   inputSchema:meta.inputSchema,annotations:meta.annotations},async args=>{
    const out=await handler(args);
    return {content:[{type:'text',text:JSON.stringify(out)}]};
  });
 };
 const ports={registerOAuthTool,z,textResult:x=>x,
  getHostContext:()=>({command_id:current,generation:null,plan_revision:null}),
  readVerifiedRight:async()=>{readCount++;return {verified:false,code:'RIGHT_PANE_UNVERIFIED'}},
  allowedBookingHosts:['booking.com'],liveProviders:[],
  liveProviderStatus:()=>officialLiveSupplierStatus({})};
 registerJHGuide13Tools(ports);
 registerReservationLinkTools(ports);
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 const client=new Client({name:'jh167-G4-client',version:'0.6.0'},{capabilities:{}});
 await server.connect(serverTransport);
 await client.connect(clientTransport);
 return {list:()=>client.listTools(),setCurrent:id=>{current=id},getReadCount:()=>readCount,
  async call(name,args={}){
   const result=await client.callTool({name,arguments:args});
   assert.notEqual(result.isError,true,'MCP tool failed '+name);
   const body=result.content?.find(x=>x.type==='text')?.text;
   assert.equal(typeof body,'string','MCP text result required '+name);
   return JSON.parse(body);
  },
  close:async()=>{await client.close();await server.close()}
 };
}
test('G4 MCP initialize/listTools returns seven read-only tools',async()=>{
 const x=await isolate();try{
  const list=await x.list();
  assert.deepEqual(list.tools.map(t=>t.name),NAMES);
  assert(list.tools.every(t=>t.annotations?.readOnlyHint===true));
  assert(list.tools.every(t=>t.annotations?.destructiveHint===false));
 }finally{await x.close()}
});
test('G4 MCP tools/call: guide and delegated request never execute',async()=>{
 const x=await isolate();try{
  const catalog=await x.call('life_guide13_catalog');
  assert.equal(catalog.scenarios.length,13);
  for(const request of ['이 버튼 어디 눌러?','이 버튼 눌러줘','예약해 줘','계속']){
   const v=await x.call('life_guide13_plan',{request});
   assert.equal(v.guide_only,true);assert.equal(v.perform_action,false);
   assert.equal(v.external_effect_status,'NOT_EXECUTED');
  }
 }finally{await x.close()}
});
test('G4 MCP tools/call: untrusted booking link cannot become available',async()=>{
 const x=await isolate();try{
  const v=await x.call('life_reservation_link_assistant',{kind:'hotel',
   requirements:{location:'Osaka',check_in:'2026-10-28',check_out:'2026-10-29',adults:2,rooms:1},
   links:[{title:'booking',booking_url:'https://www.booking.com/hotel/jp/example.html'},
    {title:'phishing',booking_url:'https://booking.com.evil.invalid/path'}]});
  assert.equal(v.availability_verified,false);assert.equal(v.available.length,0);
  assert.equal(v.check_on_site.length,1);assert.equal(v.check_on_site[0].availability,'UNKNOWN');
  assert.equal(v.rejected.length,1);assert.equal(v.external_effect_status,'NOT_EXECUTED');
 }finally{await x.close()}
});
test('G4 MCP tools/call: handoff, no inventory, missing right pane',async()=>{
 const x=await isolate();try{
  for(const kind of ['hotel','flight','taxi']){
   const h=await x.call('life_reservation_regional_handoff',{kind});
   assert.equal(h.live_inventory_status,'NOT_CONNECTED');
   assert.equal(h.booking_confirmed,false);assert(h.services.length>0);
  }
  const p=await x.call('life_reservation_provider_status');
  assert(p.providers.every(y=>y.credentials_present===false));
  for(const kind of ['hotel','flight']){
   const q=await x.call('life_reservation_live_search',{kind,requirements:{location:'Osaka'}});
   assert.equal(q.provider_connection,'NOT_CONNECTED');assert.deepEqual(q.available,[]);
  }
  const screen=await x.call('life_reservation_screen_guide',{question:'어디 눌러?'});
  assert.equal(screen.source_verified,false);assert.equal(screen.reason,'RIGHT_PANE_UNVERIFIED');
  assert.equal(x.getReadCount(),1);
 }finally{await x.close()}
});
test('G4 MCP tools/call: host command required and fresh command read',async()=>{
 const x=await isolate('first');try{
  const a=await x.call('life_guide13_catalog');assert.equal(a.command_id,'first');
  x.setCurrent('second');const b=await x.call('life_guide13_catalog');assert.equal(b.command_id,'second');
  x.setCurrent(null);const c=await x.call('life_guide13_catalog');
  assert.equal(c.code,'HOST_COMMAND_REQUIRED');assert.equal(c.external_effect_status,'NOT_EXECUTED');
 }finally{await x.close()}
});