import {verify} from 'node:crypto';
import {Buffer} from 'node:buffer';

const publicKeys = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
let cache;
async function keys(refresh = false) {
  if (!refresh && cache?.expires > Date.now()) return cache.data;
  const response = await fetch(publicKeys, {signal: AbortSignal.timeout(5000)});
  if (!response.ok) throw new Error('AdMob verifier keys unavailable');
  const {keys: data} = await response.json();
  if (!Array.isArray(data)) throw new Error('Invalid AdMob verifier keys');
  cache = {data, expires: Date.now() + 3600000};
  return data;
}

export async function verifyAdMob(url, units, loadKeys = keys) {
  const query = url.slice(url.indexOf('?') + 1);
  if (!url.includes('?') || query.length > 4096) return null;
  const fields = query.match(/^(.+)&signature=([\w%=-]+)&key_id=(\d+)$/);
  if (!fields) return null;
  const [, message, signature, keyId] = fields;
  const args = new URLSearchParams(message);
  const relevant = ['ad_unit', 'custom_data', 'transaction_id', 'timestamp'];
  if (relevant.some(key => args.getAll(key).length !== 1) || args.has('signature') || args.has('key_id')) return null;
  const feature = Object.keys(units).find(name => units[name] && units[name] === args.get('ad_unit'));
  const nonce = args.get('custom_data');
  const transaction = args.get('transaction_id');
  const at = args.get('timestamp');
  const test = args.get('ad_unit') === '1234567890' && transaction === '123456789' &&
    nonce === '00000000-0000-4000-8000-000000000001';
  if ((!test && (!feature || !/^[0-9a-f]{16,128}$/i.test(transaction || ''))) || !nonce || !/^\d{13}$/.test(at || '')) return null;
  const matching = data => data.find(entry => String(entry.keyId) === keyId)?.pem;
  let pem = matching(await loadKeys());
  if (!pem && loadKeys === keys && (!cache?.refreshed || Date.now() - cache.refreshed > 60000)) {
    cache.refreshed = Date.now();
    pem = matching(await loadKeys(true));
    cache.refreshed = Date.now();
  }
  let bytes;
  try { bytes = Buffer.from(decodeURIComponent(signature), 'base64url'); } catch { return null; }
  if (!pem) return null;
  let verified = verify('sha256', Buffer.from(message), pem, bytes);
  // The AdMob console test tool signs form-decoded text for its synthetic ad unit.
  // The test still requires Google's signature and never grants a game entitlement.
  if (!verified && test) {
    try {
      const decoded = decodeURIComponent(message.replaceAll('+', '%20'));
      verified = verify('sha256', Buffer.from(decoded), pem, bytes);
    } catch { return null; }
  }
  if (!verified) return null;
  return {feature, nonce, transaction, test, rewardedAt: new Date(Number(at)).toISOString()};
}
