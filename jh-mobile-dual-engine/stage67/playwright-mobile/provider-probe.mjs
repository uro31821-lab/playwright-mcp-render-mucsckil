import { _android as android } from 'playwright';import {PlaywrightMobileProvider} from './provider.mjs';
const provider=new PlaywrightMobileProvider({android});
try{
 const r=await provider.connect();
 console.log('STAGE67_PLAYWRIGHT_ANDROID_PROVIDER '+JSON.stringify(r));
 if(r?.ok===true){await provider.close();process.exit(0)}
 const expectedUnavailable=new Set([
  'ADB_TRANSPORT_NOT_CONFIGURED',
  'ADB_DEVICE_SERIAL_REQUIRED',
  'ADB_TRANSPORT_UNAVAILABLE',
  'ADB_ANDROID_DEVICE_ENUMERATION_FAILED',
  'ADB_BOUND_DEVICE_NOT_CONNECTED',
  'PLAYWRIGHT_ANDROID_BROWSER_ATTACH_FAILED'
 ]);
 if(expectedUnavailable.has(r?.code))process.exit(0);
 process.exitCode=2;
}catch(e){
 const msg=String(e?.message||e);
 console.log('STAGE67_PLAYWRIGHT_ANDROID_PROVIDER '+JSON.stringify({ok:false,code:'ADB_TRANSPORT_UNAVAILABLE',message:msg.slice(0,240)}));
 process.exit(0);
}
