import test from 'node:test';
import assert from 'node:assert/strict';
import {planProviderCapabilities,BOOKING_PROVIDER_CAPABILITY_MAP} from '../provider-capabilities.mjs';
const types=Object.keys(BOOKING_PROVIDER_CAPABILITY_MAP);
for(const bookingType of types) test(bookingType+': no connector does not fake availability',()=>{
  const x=planProviderCapabilities({bookingType,connectedActions:[]});
  assert.equal(x.status,'NO_CONNECTED_SOURCE');
  assert.equal(x.selectedAction,null);
  assert.equal(x.bookingConfirmed,false);
  assert.equal(x.liveAvailabilityVerified,false);
  assert.equal(x.providerCheckoutSupported,false);
  assert.equal(x.effect,'NOT_EXECUTED');
});
test('flights require an actually listed connector',()=>{
 const x=planProviderCapabilities({bookingType:'FLIGHT',connectedActions:['mcp__Trip_com__search_flights']});
 assert.equal(x.selectedAction,'mcp__Trip_com__search_flights');
 assert.equal(x.sourceScope,'FLIGHT_FARES');
 assert.equal(x.providerCheckoutSupported,false);
});
test('restaurant info never masquerades as live availability',()=>{
 const x=planProviderCapabilities({bookingType:'RESTAURANT',connectedActions:['web.businesses_query']});
 assert.equal(x.sourceScope,'BUSINESS_INFO_ONLY');
 assert.equal(x.liveAvailabilityVerified,false);
 const y=planProviderCapabilities({bookingType:'RESTAURANT',connectedActions:['web.businesses_query','web.availability_query']});
 assert.equal(y.selectedAction,'web.availability_query');
 assert.equal(y.liveAvailabilityVerified,false);
});
test('hospital search refuses personal clinical fields',()=>{
 for(const field of ['patientName','symptoms','residentId','diagnosis'])
   assert.throws(()=>planProviderCapabilities({bookingType:'HOSPITAL',connectedActions:[],constraints:{[field]:'test'}}),{code:'SENSITIVE_SEARCH_FIELDS_FORBIDDEN'});
});
test('unlisted capability cannot be selected',()=>{
 for(const bookingType of types)
   assert.equal(planProviderCapabilities({bookingType,connectedActions:['FAKE_ACTION']}).selectedAction,null);
});
test('invalid inputs fail closed',()=>{
 assert.throws(()=>planProviderCapabilities({bookingType:'NONE',connectedActions:[]}),{code:'BOOKING_TYPE_UNSUPPORTED'});
 assert.throws(()=>planProviderCapabilities({bookingType:'HOTEL',connectedActions:'mcp__Booking_com__accommodations_search_v2'}),{code:'AVAILABLE_ACTIONS_REQUIRED'});
});
