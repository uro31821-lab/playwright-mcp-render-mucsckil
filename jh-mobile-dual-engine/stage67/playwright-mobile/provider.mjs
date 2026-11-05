import net from 'node:net';import {unavailable} from '../shared.mjs';

const validPort=v=>Number.isSafeInteger(v)&&v>0&&v<=65535;
const envPort=()=>{
 const n=Number.parseInt(String(process.env.JH_PLAYWRIGHT_ADB_PORT||''),10);
 return validPort(n)?n:null;
};
async function adbReachable(host,port,timeout=1200){
 return await new Promise(resolve=>{const s=net.createConnection({host,port});
  const done=v=>{try{s.destroy()}catch{};resolve(v)};s.setTimeout(timeout);
  s.once('connect',()=>done(true));s.once('timeout',()=>done(false));s.once('error',()=>done(false));
 });
}
export class PlaywrightMobileProvider{
 constructor({
  android,
  adbHost=process.env.JH_PLAYWRIGHT_ADB_HOST||null,
  adbPort=envPort(),
  serial=process.env.JH_PLAYWRIGHT_ANDROID_SERIAL||null
 }={}){
  this.android=android;this.adbHost=adbHost;this.adbPort=adbPort;this.serial=serial;
  this._device=null;this._context=null;this._page=null;
 }
 async connect(){
  if(!this.android?.devices)return unavailable('PROVIDER','PLAYWRIGHT_MOBILE','PLAYWRIGHT_ANDROID_API_MISSING');
  if(typeof this.adbHost!=='string'||!this.adbHost.trim()||!validPort(this.adbPort))
   return unavailable('PROVIDER','PLAYWRIGHT_MOBILE','ADB_TRANSPORT_NOT_CONFIGURED');
  if(typeof this.serial!=='string'||!this.serial.trim())
   return unavailable('PROVIDER','PLAYWRIGHT_MOBILE','ADB_DEVICE_SERIAL_REQUIRED');
  if(!(await adbReachable(this.adbHost,this.adbPort)))
   return unavailable('PROVIDER','PLAYWRIGHT_MOBILE','ADB_TRANSPORT_UNAVAILABLE');
  let devices;try{devices=await this.android.devices({host:this.adbHost,port:this.adbPort})}
  catch{return unavailable('PROVIDER','PLAYWRIGHT_MOBILE','ADB_ANDROID_DEVICE_ENUMERATION_FAILED')}
  const device=devices.find(d=>d.serial()===this.serial);
  if(!device)return unavailable('PROVIDER','PLAYWRIGHT_MOBILE','ADB_BOUND_DEVICE_NOT_CONNECTED');
  this._device=device;
  try{
   this._context=await device.launchBrowser();
   this._page=this._context.pages()[0]||await this._context.newPage();
  }catch(e){
   try{await device.close()}catch{}
   this._device=null;this._context=null;this._page=null;
   return unavailable('PROVIDER','PLAYWRIGHT_MOBILE','PLAYWRIGHT_ANDROID_BROWSER_ATTACH_FAILED');
  }
  return {ok:true,provider:'PLAYWRIGHT_MOBILE',serial:device.serial(),model:device.model(),replayAllowed:false};
 }
 async page(){if(!this._page)throw Error('PLAYWRIGHT_MOBILE_NOT_CONNECTED');return this._page}
 async device(){if(!this._device)throw Error('PLAYWRIGHT_MOBILE_NOT_CONNECTED');return this._device}
 async close(){try{await this._context?.close()}finally{await this._device?.close();this._page=null;this._context=null;this._device=null}}
}
