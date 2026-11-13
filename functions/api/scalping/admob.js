import {ApiError,dbFor,respond,storeReward} from '../../_shared/scalping.js';

const encoder = new TextEncoder();
const decode64 = text => Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
let keyCache;
async function keys(now) {
  if (keyCache?.until > now) return keyCache.keys;
  const response=await fetch('https://www.gstatic.com/admob/reward/verifier-keys.json');
  if(!response.ok) throw new ApiError('verifier_unavailable',503);
  const data=await response.json();
  keyCache={keys:data.keys,until:now+3600000};
  return data.keys;
}

function derSignature(bytes) {
  if(bytes[0]!==48 || bytes[1]!==bytes.length-2) return null;
  const raw=new Uint8Array(64);
  let index=2;
  for(const offset of [0,32]){
    if(bytes[index++]!==2) return null;
    const length=bytes[index++];
    if(length<1 || length>33 || index+length>bytes.length) return null;
    const start=length===33 ? index+1 : index;
    if(length===33 && bytes[index]!==0) return null;
    const integer=bytes.subarray(start,index+length);
    raw.set(integer,offset+32-integer.length);
    index+=length;
  }
  return index===bytes.length?raw:null;
}

export async function verifiedCallback(url, now = Date.now(), loadKeys=keys) {
  const raw=url.slice(url.indexOf('?')+1);
  const fields=raw.length<4096 && raw.match(/^(.+)&signature=([\w%=-]+)&key_id=(\d+)$/);
  if(!fields) return null;
  const [,message,sig,keyId]=fields;
  const args=new URLSearchParams(message);
  if(['ad_unit','custom_data','transaction_id','timestamp'].some(name=>args.getAll(name).length!==1) ||
     args.has('signature') || args.has('key_id')) return null;
  const unit=args.get('ad_unit'),nonce=args.get('custom_data'),transaction=args.get('transaction_id'),timestamp=args.get('timestamp');
  const test=unit==='1234567890'&&transaction==='123456789'&&nonce==='00000000-0000-4000-8000-000000000001';
  if((!test&&!/^[a-f0-9]{16,128}$/i.test(transaction)) || !/^\d{13}$/.test(timestamp)) return null;
  const entry=(await loadKeys(now)).find(item=>String(item.keyId)===keyId);
  if(!entry?.pem) return null;
  let signature;
  try { signature=derSignature(decode64(decodeURIComponent(sig))); } catch { return null; }
  if(!signature) return null;
  const spki=decode64(entry.pem.replace(/-----[^-]+-----|\s/g,''));
  const publicKey=await crypto.subtle.importKey('spki',spki,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const verify=text=>crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,signature,encoder.encode(text));
  let ok=await verify(message);
  if(!ok&&test){
    try { ok=await verify(decodeURIComponent(message.replaceAll('+','%20'))); } catch { return null; }
  }
  return ok?{unit,nonce,transaction,ms:Number(timestamp),test}:null;
}

export async function onRequestGet({request,env}) {
  try{
    const event=await verifiedCallback(request.url);
    if(!event) throw new ApiError('invalid_ad_callback',403);
    return respond(await storeReward(dbFor(env),event));
  }catch(error){
    return respond({error:error instanceof ApiError ? error.message : 'ad_verification_unavailable'},error instanceof ApiError?error.status:503);
  }
}
