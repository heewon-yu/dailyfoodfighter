import '../../games/scalping-king/risk-v2.js';
import '../../games/scalping-king/microstructure-v2.js';
import '../../games/scalping-king/ledger-v2.js';
import '../../games/scalping-king/engine-v2.js';
import '../../games/scalping-king/market.js';
import {advance, applyCommand, commandFrom, eligibleForEmergency, finalScore, FULL_MS, GAME_VERSION, replay, tickAt} from '../../games/scalping-king/official-engine.mjs';

export const dayAt = (ms = Date.now()) => new Date(ms + 32400000).toISOString().slice(0, 10);
const utf = new TextEncoder();
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const tokenPattern = /^[a-f0-9]{64}$/;
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const hashToken = async token => hex(await crypto.subtle.digest('SHA-256', utf.encode(token)));
const marketCache = new Map();
const roundCache = new Map();
const limits = new Map();
const AD_UNITS = Object.freeze({credit:'6576357419', emergency:'5263275745', stop:'3638689534', extra:'7071482751'});

export class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function respond(data, status = 200, origin = null, cache = 'no-store') {
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':cache, Vary:'Origin'};
  if (origin) Object.assign(headers, {'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS'});
  return new Response(JSON.stringify(data), {status, headers});
}

export function originFor(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (origin === 'https://dailyfoodfighter.com' || origin === 'https://www.dailyfoodfighter.com' ||
      origin === 'https://localhost' || /^https:\/\/(?:[a-z0-9-]+\.)?dailyfoodfighter\.pages\.dev$/.test(origin) ||
      new URL(request.url).origin === origin) return origin;
  throw new ApiError('origin_denied',403);
}

export function guardRate(key, limit, now = Date.now()) {
  const minute = Math.floor(now / 60000);
  if (limits.size > 4096) limits.clear();
  const prior = limits.get(key);
  const hits = prior?.minute === minute ? prior.hits + 1 : 1;
  limits.set(key, {minute,hits});
  if (hits > limit) throw new ApiError('rate_limited',429);
}

export function dbFor(env) {
  if (!env.DB) throw new ApiError('database_unavailable',503);
  return env.DB;
}

export async function playerFor(db, request, required = true) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) {
    if (required) throw new ApiError('identity_required',401);
    return null;
  }
  const hash = await hashToken(token);
  const player = await db.prepare('SELECT id,nickname FROM players WHERE token_hash=?').bind(hash).first();
  if (!player && required) throw new ApiError('identity_required',401);
  return player;
}

async function bodyFor(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError('invalid_json');
  const chunks = [];
  let size = 0;
  for (;;) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new ApiError('request_too_large',413); }
    chunks.push(value);
  }
  const input = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const data = JSON.parse(new TextDecoder().decode(input));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* Use a generic JSON error. */ }
  throw new ApiError('invalid_json');
}

async function sign(key, label) {
  return new DataView(await crypto.subtle.sign('HMAC',key,utf.encode(label)));
}

async function feedFor(row, through, after = 0) {
  let entry = marketCache.get(row.id);
  if (!entry) {
    const key = await crypto.subtle.importKey('raw',utf.encode(row.market_key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const schedule = (await sign(key,'events')).getUint32(0) || 1;
    entry = {key, events: globalThis.ScalpMarket.createMarket(row.seed,schedule).events, blocks:new Map()};
    if (marketCache.size >= 64) marketCache.delete(marketCache.keys().next().value);
    marketCache.set(row.id,entry);
  }
  const first = Math.floor(after / 8);
  const last = Math.floor((through - 1) / 8);
  if (through > after) await Promise.all(Array.from({length:last-first+1},(_,offset) => {
    const block = first + offset;
    if (!entry.blocks.has(block)) entry.blocks.set(block,sign(entry.key,'ticks:'+block));
    return entry.blocks.get(block);
  }));
  const seeds = [];
  for (let index=after;index<through;index++) {
    const block = await entry.blocks.get(Math.floor(index/8));
    seeds.push(block.getUint32((index%8)*4) || 1);
  }
  return {seeds,events:entry.events.filter(event => event.tick > after && event.tick <= through)};
}

function stateAt(row, tick, feed) {
  const existing = roundCache.get(row.id);
  if (existing?.revision === row.revision && existing.state.market.tick <= tick) {
    existing.state.seeds = feed.seeds;
    existing.state.market.events = feed.events;
    advance(existing.state,tick);
    return existing.state;
  }
  const state = replay(row.seed,JSON.parse(row.commands),tick,feed);
  if (roundCache.size >= 32) roundCache.delete(roundCache.keys().next().value);
  roundCache.set(row.id,{revision:row.revision,state});
  return state;
}
const elapsedFor = (row, now) => Math.min(FULL_MS,row.elapsed_ms + (row.paused ? 0 : Math.max(0,now-row.anchor_ms)));

async function publicRound(row, now, feedAfter = 0, feedOnly = false) {
  if (!row) return null;
  const elapsed = elapsedFor(row,now), through = tickAt(elapsed);
  const after = Number.isInteger(feedAfter) ? Math.min(through,Math.max(0,feedAfter)) : 0;
  const common = {elapsed, revision:row.revision, paused:Boolean(row.paused), feedAfter:after,
    feed:await feedFor(row,through,after)};
  return feedOnly ? common : {...common,session_id:row.id, kst_day:row.day, status:row.status,
    server_seed:row.seed, commands:JSON.parse(row.commands), game_version:row.version,
    score:row.final_equity === null ? null : {final_equity:row.final_equity}};
}

async function profile(db, player, now) {
  const day = dayAt(now);
  const quota = await db.prepare('SELECT used,bonus FROM quotas WHERE player_id=? AND day=?').bind(player.id,day).first();
  return {nickname:player.nickname,day,free:5-(quota?.used || 0),bonus:quota?.bonus || 0};
}

const roundById = (db, player, id) => db.prepare('SELECT * FROM rounds WHERE player_id=? AND id=?').bind(player.id,id).first();
const latestRound = (db, player) => db.prepare('SELECT * FROM rounds WHERE player_id=? ORDER BY started_ms DESC LIMIT 1').bind(player.id).first();
function cleanNickname(value) {
  const nick = typeof value === 'string' ? value.trim().normalize('NFKC') : '';
  if (!/^[가-힣A-Za-z0-9_]{2,12}$/.test(nick) || /관리자|운영자|admin|moderator|fuck|shit/i.test(nick)) throw new ApiError('invalid_nickname');
  return nick;
}

async function register(db, input, request, now) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token || !tokenPattern.test(token)) throw new ApiError('identity_required',401);
  const nick = cleanNickname(input.nickname);
  const tokenHash = await hashToken(token);
  const known = await db.prepare('SELECT id,nickname FROM players WHERE token_hash=?').bind(tokenHash).first();
  if (known && known.nickname === nick) return profile(db,known,now);
  guardRate('register:'+(request.headers.get('CF-Connecting-IP') || 'local'),12,now);
  await db.prepare('INSERT INTO players(id,token_hash,nickname,created_ms) VALUES(?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET nickname=excluded.nickname')
    .bind(crypto.randomUUID(),tokenHash,nick,now).run();
  return profile(db,await db.prepare('SELECT id,nickname FROM players WHERE token_hash=?').bind(tokenHash).first(),now);
}

async function start(db, player, input, now) {
  if (!uuid(input.requestId) || input.version !== GAME_VERSION || typeof input.restart !== 'boolean' ||
      (input.restart && !uuid(input.current))) throw new ApiError('invalid_start');
  const same = await db.prepare('SELECT * FROM rounds WHERE player_id=? AND request_id=?').bind(player.id,input.requestId).first();
  if (same) return publicRound(same,now);
  const prior = await latestRound(db,player);
  // A new KST trading day must not inherit yesterday's unfinished session.
  const active = prior?.status === 'active' && prior.day === dayAt(now) &&
    prior.version === GAME_VERSION && now-prior.started_ms < 86400000;
  if (!input.restart && active) return publicRound(prior,now);
  if (input.restart && prior?.id !== input.current) {
    if (active) return publicRound(prior,now);
    throw new ApiError('inactive_session',409);
  }
  const id = crypto.randomUUID();
  const day = dayAt(now), key = randomToken(), seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  const insert = db.prepare('INSERT INTO rounds(id,player_id,request_id,day,version,seed,market_key,started_ms,anchor_ms) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(id,player.id,input.requestId,day,GAME_VERSION,seed,key,now,now);
  try {
    if (prior?.status === 'active') {
      const replace = db.prepare("UPDATE rounds SET status='abandoned',end_ms=?,end_day=?,revision=revision+1 WHERE id=? AND player_id=? AND status='active' AND revision=?")
        .bind(now,day,prior.id,player.id,prior.revision);
      await db.batch([replace,insert]);
    } else await insert.run();
  } catch (error) {
    if (String(error.message).includes('quota_exhausted')) throw new ApiError('quota_exhausted',409);
    const retry = await db.prepare('SELECT * FROM rounds WHERE player_id=? AND request_id=?').bind(player.id,input.requestId).first();
    if (retry) return publicRound(retry,now);
    const next = await latestRound(db,player);
    if (next?.status === 'active') return publicRound(next,now);
    throw error;
  }
  return publicRound(await roundById(db,player,id),now);
}

async function intentFor(db, player, input, now, round = null) {
  const feature = input.feature;
  if (!Object.hasOwn(AD_UNITS,feature)) throw new ApiError('ad_unavailable',409);
  const day = dayAt(now);
  if (feature === 'extra') {
    const current = await profile(db,player,now);
    if (current.free || current.bonus) throw new ApiError('ad_unavailable',409);
  } else {
    if (!round) throw new ApiError('ad_unavailable',409);
    const tick = tickAt(elapsedFor(round,now));
    const {account} = stateAt(round,tick,await feedFor(round,tick));
    if (account.unlocks[feature] || (feature === 'emergency' && !eligibleForEmergency(account))) throw new ApiError('ad_unavailable',409);
  }
  const recent = await db.prepare('SELECT count(*) as n FROM ad_intents WHERE player_id=? AND created_ms>=?')
    .bind(player.id,now-300000).first();
  if (recent.n >= 12) throw new ApiError('rate_limited',429);
  const nonce = crypto.randomUUID();
  await db.prepare('INSERT INTO ad_intents(nonce,player_id,round_id,day,feature,created_ms) VALUES(?,?,?,?,?,?)')
    .bind(nonce,player.id,round?.id || null,day,feature,now).run();
  return {nonce};
}

async function updateRound(db, player, input, row, now) {
  const elapsed = elapsedFor(row,now), tick = tickAt(elapsed);
  let paused = row.paused, status = row.status, total = null;
  const commands = JSON.parse(row.commands);
  let nextState;
  if (input.action === 'finish') {
    if (elapsed !== FULL_MS) throw new ApiError('round_in_progress',409);
    nextState = stateAt(row,tick,await feedFor(row,tick));
    roundCache.delete(row.id);
    total = finalScore(nextState);
    if (!Number.isSafeInteger(total)) throw new ApiError('invalid_score',422);
    status = 'completed';
  } else if (input.action === 'pause' || input.action === 'resume') {
    if (elapsed === FULL_MS) throw new ApiError('round_finished',409);
    paused = Number(input.action === 'pause');
    if (paused === row.paused) return publicRound(row,now,input.feedAfter);
  } else if (input.action === 'command') {
    if (!uuid(input.requestId)) throw new ApiError('invalid_command');
    if (commands.some(command=>command.requestId===input.requestId)) return publicRound(row,now,input.feedAfter);
    const command = commandFrom(input.command);
    if (!command || elapsed === FULL_MS || (row.paused && command.kind !== 'activate')) throw new ApiError('invalid_command',409);
    if (commands.length >= 450 || commands.filter(command=>command.tick===tick).length >= 4) throw new ApiError('order_rate_limit',429);
    if (command.kind === 'activate') {
      if (!uuid(command.nonce)) throw new ApiError('ad_not_verified',409);
      const verified = await db.prepare('SELECT feature FROM ad_intents WHERE nonce=? AND player_id=? AND round_id=? AND verified_ms IS NOT NULL')
        .bind(command.nonce,player.id,row.id).first();
      if (verified?.feature !== command.feature || commands.some(item=>item.nonce===command.nonce)) throw new ApiError('ad_not_verified',409);
    }
    nextState = stateAt(row,tick,await feedFor(row,tick));
    roundCache.delete(row.id);
    const result = applyCommand(nextState,command);
    if (result?.error) throw new ApiError(result.error,409);
    commands.push({...command,requestId:input.requestId,tick});
  } else throw new ApiError('unknown_action');
  const updated = await db.prepare("UPDATE rounds SET elapsed_ms=?,anchor_ms=?,paused=?,status=?,commands=?,final_equity=?,end_ms=?,end_day=?,revision=revision+1 WHERE id=? AND player_id=? AND revision=? AND status='active'")
    .bind(elapsed,now,paused,status,JSON.stringify(commands),total,total===null?null:now,total===null?null:dayAt(now),row.id,player.id,row.revision).run();
  if (!updated.meta.changes) throw new ApiError('retry_session',409);
  if (nextState && status==='active') roundCache.set(row.id,{revision:row.revision+1,state:nextState});
  return publicRound(await roundById(db,player,row.id),now,input.feedAfter);
}

export async function gameRequest(request, env, now = Date.now()) {
  const db = dbFor(env);
  guardRate('ip:'+(request.headers.get('CF-Connecting-IP') || 'local'),600,now);
  const input = await bodyFor(request);
  if (input.action === 'register') return register(db,input,request,now);
  const player = await playerFor(db,request);
  guardRate('player:'+player.id,180,now);
  if (input.action === 'profile') return profile(db,player,now);
  if (input.action === 'recover') {
    const recent = await latestRound(db,player);
    return {round: recent?.day === dayAt(now) && recent.version === GAME_VERSION &&
      recent.status !== 'abandoned' ? await publicRound(recent,now) : null};
  }
  if (input.action === 'deleteAccount') {
    if (input.confirm !== true) throw new ApiError('confirmation_required',400);
    // Delete dependent records explicitly: works even when FK enforcement differs
    // between test SQLite and deployed D1. Receipts contain no player identifier
    // and expire automatically as replay-protection records.
    await db.batch([
      db.prepare('DELETE FROM ad_intents WHERE player_id=?').bind(player.id),
      db.prepare('DELETE FROM verified_scores WHERE player_id=?').bind(player.id),
      db.prepare('DELETE FROM rounds WHERE player_id=?').bind(player.id),
      db.prepare('DELETE FROM quotas WHERE player_id=?').bind(player.id),
      db.prepare('DELETE FROM players WHERE id=?').bind(player.id),
    ]);
    roundCache.clear();
    return {deleted:true};
  }
  if (input.action === 'start') return start(db,player,input,now);
  if (input.action === 'adStatus') {
    if (!uuid(input.nonce)) throw new ApiError('invalid_ad_intent');
    return db.prepare('SELECT verified_ms AS verified_at FROM ad_intents WHERE player_id=? AND nonce=?').bind(player.id,input.nonce).first();
  }
  if (input.action === 'adIntent' && input.feature === 'extra') return intentFor(db,player,input,now);
  if (!uuid(input.sessionId)) throw new ApiError('invalid_session');
  const row = await roundById(db,player,input.sessionId);
  if (!row) throw new ApiError('inactive_session',404);
  if (input.action === 'session' || (input.action === 'finish' && row.status === 'completed')) return publicRound(row,now,input.feedAfter);
  if (row.status !== 'active' || row.version !== GAME_VERSION || now-row.started_ms >= 86400000) throw new ApiError('inactive_session',409);
  if (input.action === 'feed') {
    const tick = tickAt(elapsedFor(row,now));
    const existing = roundCache.get(row.id);
    // Warm the ledger on small live advances. Cold feeds only disclose the elapsed market seeds.
    if (tick <= 16 || (existing?.revision === row.revision && tick-existing.state.market.tick <= 16))
      stateAt(row,tick,await feedFor(row,tick));
    return publicRound(row,now,input.feedAfter,true);
  }
  if (input.action === 'adIntent') return intentFor(db,player,input,now,row);
  return updateRound(db,player,input,row,now);
}

export async function storeReward(db, ad, now = Date.now()) {
  if (ad.test) return {ok:true,verificationTest:true};
  const feature = Object.keys(AD_UNITS).find(name=>AD_UNITS[name]===ad.unit);
  if (!feature || !uuid(ad.nonce)) throw new ApiError('invalid_ad_callback',403);
  const row = await db.prepare('SELECT * FROM ad_intents WHERE nonce=? AND feature=?').bind(ad.nonce,feature).first();
  if (!row || ad.ms < row.created_ms-60000 || ad.ms > row.created_ms+900000 || ad.ms > now+60000 ||
      now-row.created_ms > 86400000) throw new ApiError('invalid_ad_intent',409);
  if (row.verified_ms !== null) return {ok:true};
  try {
    await db.batch([
      db.prepare('INSERT INTO ad_receipts(id,received_ms) VALUES(?,?)').bind(ad.transaction,now),
      db.prepare('UPDATE ad_intents SET verified_ms=?,transaction_id=? WHERE nonce=? AND verified_ms IS NULL').bind(now,ad.transaction,ad.nonce),
    ]);
  } catch (error) {
    if (!String(error.message).includes('UNIQUE constraint failed')) throw error;
  }
  return {ok:true};
}
