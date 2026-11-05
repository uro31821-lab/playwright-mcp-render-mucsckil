import {unavailable} from '../shared.mjs';
export class PlaywrightMobileProvider{
 constructor({android,adbHost='127.0.0.1',adbPort=5037,serial}={}){this.android=android;this.adbHost=adbHost;this.adbPort=adbPort;this.serial=serial;this._device=null;this._context=null;this._page=null;}
 async connect(){
  if(!this.android?.devices)return unavailable('PROVIDER','PLAYWRIGHT_MOBILE','PLAYWRIGHT_ANDROID_API_MISSING');
  const devices=await this.android.devices({host:this.adbHost,port:this.adbPort});
  const device=this.serial?devices.find(d=>d.serial()===this.serial):devices[0];
  if(!device)return unavailable('PROVIDER','PLAYWRIGHT_MOBILE','ADB_ANDROID_DEVICE_NOT_CONNECTED');
  this._device=device;
  this._context=await device.launchBrowser();
  this._page=this._context.pages()[0]||await this._context.newPage();
  return {ok:true,provider:'PLAYWRIGHT_MOBILE',serial:device.serial(),model:device.model(),replayAllowed:false};
 }
 async page(){if(!this._page)throw Error('PLAYWRIGHT_MOBILE_NOT_CONNECTED');return this._page}
 async device(){if(!this._device)throw Error('PLAYWRIGHT_MOBILE_NOT_CONNECTED');return this._device}
 async close(){try{await this._context?.close()}finally{await this._device?.close();this._page=null;this._context=null;this._device=null}}
}