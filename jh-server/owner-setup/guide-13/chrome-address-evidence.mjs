/** Exact address provenance from a Secure56 MAC-accepted RIGHT Chrome snapshot.
 * Treat document links, tab titles, domain badges and focused omnibox editing as
 * untrusted. This extraction alone does not prove a publisher's article text.
 */
export const CHROME_URL_SOURCE='CHROME_NATIVE_ADDRESS_BAR_SIGNED';
export function extractVerifiedChromeAddressUrl(rows,{workPackage,workWindowId,observedAtMs}={}){
 if(workPackage!=='com.android.chrome'||typeof workWindowId!=='string'||
   !/^\d{1,10}$/.test(workWindowId)||!Number.isSafeInteger(Number(observedAtMs))||
   !Array.isArray(rows)||rows.length>3000)return null;
 const native=rows.filter(n=>n&&typeof n==='object'&&!Array.isArray(n)&&
   n.package==='com.android.chrome' && String(n.windowId)===workWindowId &&
   n.viewId==='com.android.chrome:id/url_bar' && n.className==='android.widget.EditText');
 if(native.length!==1)return null;
 const n=native[0];
 // Focused omnibox text may be a typed, not-yet-navigated address.
 if(n.focused!==false&&n.focused!=='false')return null;
 if(n.sensitive===true||n.sensitive==='true')return null;
 const value=typeof n.text==='string'?n.text.trim():'';
 if(value.length<20||value.length>2048||!/^https:\/\//i.test(value) || /\s/.test(value))return null;
 let u;try{u=new URL(value);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.hash||
   (u.port&&u.port!=='443')||u.hostname.endsWith('.')||u.hostname.includes('..')||
   !u.pathname||u.pathname==='/'||u.pathname.startsWith('//')||u.hostname==='localhost'||
   u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||
   /^\d+(?:\.\d+){3}$/.test(u.hostname))return null;
 return Object.freeze({source:CHROME_URL_SOURCE,url:u.href,native_view_id:n.viewId,
   window_id:workWindowId,observed_at:new Date(Number(observedAtMs)).toISOString(),
   focused:false,scope:'SIGNED_NATIVE_CHROME_ADDRESS_BAR_ONLY'});
}
