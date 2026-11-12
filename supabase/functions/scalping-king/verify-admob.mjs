import {verify} from 'node:crypto';

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
  if (!feature || !nonce || !/^[0-9a-f]{16,128}$/i.test(transaction || '') || !/^\d{13}$/.test(at || '')) return null;
  const matching = data => data.find(entry => String(entry.keyId) === keyId)?.pem;
  let pem = matching(await loadKeys());
  if (!pem && loadKeys === keys && (!cache?.refreshed || Date.now() - cache.refreshed > 60000)) {
    cache.refreshed = Date.now();
    pem = matching(await loadKeys(true));
    cache.refreshed = Date.now();
  }
  let bytes;
  try { bytes = Buffer.from(decodeURIComponent(signature), 'base64url'); } catch { return null; }
  if (!pem || !verify('sha256', Buffer.from(message), pem, bytes)) return null;
  return {feature, nonce, transaction, rewardedAt: new Date(Number(at)).toISOString()};
}
