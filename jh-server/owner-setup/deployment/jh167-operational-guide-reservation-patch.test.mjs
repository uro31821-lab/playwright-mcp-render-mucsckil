import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {buildDurableNativeRuntime} from './durable-native-runtime-candidate.mjs';
import {patchDurableMcpWorkflowCleanRestartPayment56} from './durable-payment-clean-restart-patch.mjs';
import {buildCleanRestartRelease56} from './durable-clean-restart-release.mjs';
import {applyJH167ReadOnlyRegistry56,patchJH167OperationalReadOnly56,JH167_READONLY_NAMES} from './jh167-operational-guide-reservation-patch.mjs';
import {registerJHGuide13Tools} from '../guide-13/host-tools.mjs';
import {registerReservationLinkTools,reviewDiscoveryLinks} from '../reservation-link/host-tools.mjs';
import {officialLiveSupplierStatus} from '../reservation-link/providers/official-live.mjs';

const root=path.resolve(import.meta.dirname,'..');
const shab=s=>createHash('sha256').update(s).digest('hex');
const gitblob=s=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+Buffer.byteLength(s)+'\0'),Buffer.from(s)])).digest('hex');
const originalHash={
 'durable-live-release.mjs':'c7e548b6d4e899463bf603587a2cd9f2172c282f',
 'durable-payment-clean-restart-patch.mjs':'c3475cf4eef55628d5e9a862853e0cc886086a4b',
 'jh155-all-modules-patch.mjs':'87e425597f8caaca255e903d32bfde754432127b',
 'jh155-split-integration-patch.mjs':'2940a936cb699155cd293cbe86bdd59b7a4327d0'
};
const raw=readFileSync(buildDurableNativeRuntime(root).file,'utf8');
const routeSource=readFileSync(path.join(root,'deployment/durable-live-release.mjs'),'utf8');
// Reuse the exact checked operational route implementation (no mutations or network IO).
const routeFragment=routeSource.slice(routeSource.indexOf('function patchExistingDurableReturnRoute56(input){'),routeSource.indexOf('\nexport const INITIAL_MODE'));
const route=vm.runInNewContext('function fail(code){throw Object.assign(Error(code),{code});}\n'+routeFragment+'\npatchExistingDurableReturnRoute56;');
const routed=route(raw);
const legacy=patchDurableMcpWorkflowCleanRestartPayment56(routed);
const enhanced=patchJH167OperationalReadOnly56(routed);
const zval={min(){return this},max(){return this},int(){return this},optional(){return this},strict(){return this}};
const z={string:()=>zval,number:()=>zval,array:()=>zval,enum:()=>zval,object:()=>zval};
const mockRegistry=(withCommand=true)=>{
 const entries=new Map(),m={registerOAuthTool:(name,definition,handler)=>{assert(!entries.has(name));entries.set(name,{definition,handler});},z,textResult:x=>x,
  getHostContext:()=>({command_id:withCommand?'test-command-123':null,generation:null,plan_revision:null}),
  readVerifiedRight:async()=>({verified:false,code:'RIGHT_PANE_UNVERIFIED'})};
 registerJHGuide13Tools(m);
 registerReservationLinkTools({...m,allowedBookingHosts:['booking.com'],liveProviders:[],liveProviderStatus:()=>officialLiveSupplierStatus({})});
 return entries;
};

test('G0 pins: original operational Durable/security modules exactly match live GitHub commit',()=>{
 for(const [f,pin] of Object.entries(originalHash))assert.equal(gitblob(readFileSync(path.join(root,'deployment',f))),pin,f);
});
test('G2 native Durable input is pinned and route transformation is valid',()=>{
 assert.equal(shab(raw),'918ce040d49fe5bc6e30fdfa0aa3ff572b1387105b198bfd8927d82d9857348d');
 assert(routed.includes('jhNativeReturnTarget56'));
});
test('G3 legacy+new composite equals append-only read-only registration',()=>{
 assert.equal(enhanced,applyJH167ReadOnlyRegistry56(legacy));
 assert(enhanced.length>legacy.length);
 assert.equal(enhanced.split('  jhRegisterGeneralWorkTools({registerOAuthTool,z,textResult});').length,2);
});
test('Existing payment, signed screen, command and approval guards survive verbatim',()=>{
 for(const term of ['jhOwnerAdmission155','jhRequireCommand56','jhInspectSplitEvidence155','jhScreenUnderstanding56','jhResultVerificationGuard56','jhDiscardPayments56','jhCheckWorkflowSplit56']){
  assert(legacy.includes(term), 'not already in legacy '+term);
  assert(enhanced.includes(term), 'lost '+term);
 }
});
test('New secure/read-only tool import and registrar are each unique',()=>{
 for(const term of ["import {registerReservationLinkTools as jhRegisterReservationLinkTools", "import {registerJHGuide13Tools as jhRegisterGuide13Tools}","  jhRegisterReservationLinkTools({registerOAuthTool,z,textResult,","  jhRegisterGuide13Tools({registerOAuthTool,z,textResult,"])
  assert.equal(enhanced.split(term).length,2,term);
 assert.equal(JH167_READONLY_NAMES.length,7);
});
test('Duplicate or out-of-date sources fail closed without editing base source',()=>{
 assert.throws(()=>applyJH167ReadOnlyRegistry56(enhanced),/COMPATIBILITY|ALREADY/);
 assert.throws(()=>applyJH167ReadOnlyRegistry56('function createMcp(){}'),/COMPATIBILITY/);
 assert.throws(()=>patchJH167OperationalReadOnly56(enhanced),/anchor|patch|changed/i);
});
test('Generated durable restart bootstrap points to new wrapper only',()=>{
 const generated=buildCleanRestartRelease56();const txt=readFileSync(generated.file,'utf8');
 assert(txt.includes("import {patchJH167OperationalReadOnly56} from './jh167-operational-guide-reservation-patch.mjs';"));
 assert(txt.includes('const output=patchJH167OperationalReadOnly56(patchExistingDurableReturnRoute56(input));'));
 assert(!txt.includes('patchDurableMcpWorkflowCleanRestartPayment56'));
 assert.equal(generated.selfReferencesRewritten,3);
});
test('13-guide and reservation tools register exactly seven read-only functions',()=>{
 const reg=mockRegistry();assert.deepEqual([...reg.keys()],JH167_READONLY_NAMES);
 for(const [name,{definition}] of reg)assert.equal(definition.annotations.readOnlyHint,true,name);
});
test('GUIDE never delegates even for click instruction; all claims are unverified',async()=>{
 const reg=mockRegistry();
 const explain=await reg.get('life_guide13_plan').handler({request:'이 버튼 어디 눌러?',previousMode:'GUIDE'});
 const delegate=await reg.get('life_guide13_plan').handler({request:'버튼 눌러줘',previousMode:'GUIDE'});
 for(const x of [explain,delegate]) {assert.equal(x.guide_only,true);assert.equal(x.perform_action,false);assert.equal(x.external_effect_status,'NOT_EXECUTED');assert.equal(x.availability_verified,false)}
 assert.equal(delegate.request_mode,'DELEGATION_REQUESTED');assert.equal(delegate.execution_authorized,false);
});
test('No server-host command means no guide or reservation output',async()=>{
 const reg=mockRegistry(false);
 const c=await reg.get('life_guide13_catalog').handler({});assert.equal(c.code,'HOST_COMMAND_REQUIRED');
 const r=await reg.get('life_reservation_regional_handoff').handler({kind:'hotel'});assert.equal(r.code,'HOST_COMMAND_REQUIRED');
});
test('Korean site/app handoff cannot masquerade as realtime inventory',async()=>{
 const reg=mockRegistry();const h=await reg.get('life_reservation_regional_handoff').handler({kind:'hotel'});
 assert.equal(h.live_inventory_status,'NOT_CONNECTED');assert.equal(h.booking_confirmed,false);assert.equal(h.external_effect_status,'NOT_EXECUTED');
 const f=await reg.get('life_reservation_regional_handoff').handler({kind:'flight'});
 assert.equal(f.live_inventory_status,'NOT_CONNECTED');
});
test('No approved partner credentials yields no hotel/flight inventory',async()=>{
 const reg=mockRegistry();
 for(const kind of ['hotel','flight']) {
  const r=await reg.get('life_reservation_live_search').handler({kind,requirements:{location:'Osaka'}});
  assert.equal(r.provider_connection,'NOT_CONNECTED');assert.deepEqual(r.available,[]);
  assert.equal(r.external_effect_status,'NOT_EXECUTED');
 }
});
test('Unverified URL cannot be promoted to availability or confirmed booking',()=>{
 const x=reviewDiscoveryLinks({kind:'hotel',requirements:{location:'Osaka',check_in:'2026-10-28',check_out:'2026-10-29',adults:2,rooms:1},links:[{title:'Booking entry',booking_url:'https://www.booking.com/hotel/jp/sample.html'}]},['booking.com']);
 assert.equal(x.ok,true);assert.equal(x.availability_verified,false);assert.equal(x.check_on_site[0]?.availability,'UNKNOWN');assert.equal(x.external_effect_status,'NOT_EXECUTED');
 const bad=reviewDiscoveryLinks({kind:'hotel',requirements:{location:'Osaka'},links:[{title:'phishing',booking_url:'https://booking.com.evil.org/path'}]},['booking.com']);
 assert.equal(bad.check_on_site.length,0);
});
test('Signed right pane missing yields no fabricated screen observations',async()=>{
 const reg=mockRegistry();const r=await reg.get('life_reservation_screen_guide').handler({question:'어디 입력해?'});
 assert.equal(r.source_verified,false);assert.equal(r.reason,'RIGHT_PANE_UNVERIFIED');
});
test('README-only live provider status never leaks credentials',async()=>{
 const reg=mockRegistry();const r=await reg.get('life_reservation_provider_status').handler({});
 assert.equal(r.external_effect_status,'NOT_EXECUTED');assert(r.providers.every(x=>x.state==='PARTNER_CREDENTIALS_REQUIRED'));
 assert(!JSON.stringify(r).includes('SECRET'));assert(!JSON.stringify(r).includes('api_key_value'));
});
