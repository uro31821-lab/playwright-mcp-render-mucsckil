/** Small strict UTF-8 JSON boundary. Reject duplicate decoded keys and malformed Unicode.
 * Used for provider transport only; it does not relax the canonical work-journal wire. */
export class ProviderError extends Error { constructor(code){super(code);this.code=code;} }
export function reject(code){throw new ProviderError(code);}
export function check(ok,code){if(!ok)reject(code);}
export const MAX_REPLY=524288;
export function strictJson(input,max=MAX_REPLY){
 const bytes=Buffer.isBuffer(input)?input:Buffer.from(input);
 check(bytes.length<=max,'provider_payload_limit');let s;
 try{s=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{reject('provider_invalid_utf8');}
 let i=0,nodes=0;
 const ws=()=>{while(i<s.length&&' \r\n\t'.includes(s[i]))i++;};
 function str(){
  check(s[i++]==='"','provider_json');let start=i-1,escaped=false;
  while(i<s.length){const c=s[i++];if(c==='"'&&!escaped){
   let v;try{v=JSON.parse(s.slice(start,i));}catch{reject('provider_json');}
   for(let p=0;p<v.length;p++){const u=v.charCodeAt(p);if(u>=0xd800&&u<=0xdbff){const l=v.charCodeAt(++p);check(l>=0xdc00&&l<=0xdfff,'provider_unicode');}else check(!(u>=0xdc00&&u<=0xdfff),'provider_unicode');}
   return v;
  } if(c==='\\'&&!escaped)escaped=true;else escaped=false;}
  reject('provider_json');
 }
 function value(depth=0){
  check(depth<=24&&++nodes<=20000,'provider_structure');ws();const c=s[i];
  if(c==='"')return str();
  if(c==='{'){i++;ws();const out=Object.create(null);if(s[i]==='}'){i++;return out;}
   while(true){ws();const k=str();check(!Object.hasOwn(out,k),'provider_duplicate_key');ws();check(s[i++]===':','provider_json');out[k]=value(depth+1);ws();if(s[i]==='}'){i++;return out;}check(s[i++]===',','provider_json');}}
  if(c==='['){i++;ws();const a=[];if(s[i]===']'){i++;return a;}while(true){a.push(value(depth+1));ws();if(s[i]===']'){i++;return a;}check(s[i++]===',','provider_json');}}
  const rest=s.slice(i),m=/^(true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
  check(!!m,'provider_json');i+=m[0].length;const v=JSON.parse(m[0]);if(typeof v==='number')check(Number.isFinite(v),'provider_number');return v;
 }
 const out=value();ws();check(i===s.length,'provider_trailing_json');return out;
}
export function stable(v){
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
}
export function exact(o,fields){check(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join('|')===[...fields].sort().join('|'),'provider_fields');}
export function checkedResult(raw){
 check(raw&&typeof raw==='object'&&!Array.isArray(raw),'provider_result');
 for(const [k,bad] of [['isError',true],['is_error',true],['ok',false],['success',false]])if(Object.hasOwn(raw,k))check(typeof raw[k]==='boolean'&&raw[k]!==bad,'provider_error');
 check(raw.error==null||raw.error==='','provider_error');
 for(const k of ['has_more','hasMore','media_has_more'])if(Object.hasOwn(raw,k))check(raw[k]===false,'provider_partial');
 if(Object.hasOwn(raw,'media_complete'))check(raw.media_complete===true,'provider_partial');
 for(const k of ['nextCursor','next_cursor','nextPageToken','next_page_token','media_next_page_token'])check(raw[k]==null||raw[k]==='','provider_partial');
 return raw;
}
export function unwrapTool(raw){
 checkedResult(raw);const variants=[];
 if(raw.structuredContent!==undefined)variants.push(raw.structuredContent);
 if(raw.content!==undefined){check(Array.isArray(raw.content)&&raw.content.length===1&&raw.content[0].type==='text'&&typeof raw.content[0].text==='string','provider_text_result');variants.push(strictJson(raw.content[0].text));}
 check(variants.length>0&&variants.every(v=>stable(v)===stable(variants[0])),'provider_result_conflict');
 return checkedResult(variants[0]);
}
