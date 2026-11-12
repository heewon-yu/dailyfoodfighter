import '../../../games/scalping-king/risk-v2.js';
import '../../../games/scalping-king/microstructure-v2.js';
import '../../../games/scalping-king/ledger-v2.js';
import '../../../games/scalping-king/engine-v2.js';
import '../../../games/scalping-king/market.js';
import {applyCommand, commandFrom, elapsedMs, eligibleForEmergency, FEATURES, finalScore, FULL_MS, GAME_VERSION, replay, tickAt} from '../../../games/scalping-king/official-engine.mjs';
import {verifyAdMob} from './verify-admob.mjs';
import {marketFeed, safeSecret} from './market-feed.mjs';

const base = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const origins = new Set((Deno.env.get('SCALPING_ALLOWED_ORIGINS') ||
  'https://dailyfoodfighter.com,https://localhost').split(','));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
const productionUnits: Record<string, string> = {
  credit: Deno.env.get('SCALPING_AD_CREDIT') || '',
  emergency: Deno.env.get('SCALPING_AD_EMERGENCY') || '',
  stop: Deno.env.get('SCALPING_AD_STOP') || '',
  extra: Deno.env.get('SCALPING_AD_EXTRA') || '',
};

class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const response = await fetch(base + '/rest/v1/rpc/scalping_' + name, {
    method: 'POST', headers: {apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json'},
    body: JSON.stringify(args), signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) throw new RequestError(data.code === '23505' ? 'nickname_taken' : 'database_unavailable', data.code === '23505' ? 409 : 503);
  return data;
}
async function authenticated(request: Request) {
  const token = request.headers.get('Authorization');
  if (!token?.startsWith('Bearer ')) throw new RequestError('sign_in_required', 401);
  const response = await fetch(base + '/auth/v1/user', {
    headers: {apikey: publicKey, Authorization: token}, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new RequestError('sign_in_required', 401);
  const user = await response.json();
  if (user.is_anonymous || !uuid(user.id)) throw new RequestError('persistent_account_required', 403);
  return user.id;
}
function clientSession(session: Record<string, unknown>, after = 0) {
  if (!session) return null;
  const {session_id, kst_day, status, server_seed, commands, game_version, revision, paused, score} = session;
  const elapsed = elapsedMs(session);
  const tick = tickAt(elapsed);
  const feedAfter = Number.isInteger(after) ? Math.max(0, Math.min(after, tick)) : 0;
  return {session_id, kst_day, status, server_seed, commands, game_version, revision, paused, score, elapsed,
    feedAfter, feed: marketFeed(session, tick, feedAfter)};
}
function nickname(input: unknown) {
  if (typeof input !== 'string') throw new RequestError('invalid_nickname');
  const name = input.trim().normalize('NFKC');
  if (!/^[가-힣A-Za-z0-9_]{2,12}$/.test(name) || /관리자|운영자|관리팀|씨발|시발|개새끼|병신|admin|moderator|fuck|shit/i.test(name))
    throw new RequestError('invalid_nickname');
  return name;
}
async function run(request: Request, url: URL) {
  if (request.method === 'GET' && url.pathname.endsWith('/admob')) {
    const ad = await verifyAdMob(request.url, productionUnits);
    if (!ad || !uuid(ad.nonce)) throw new RequestError('invalid_ad_callback', 403);
    const saved = await rpc('verify_ad', {p_nonce: ad.nonce, p_feature: ad.feature,
      p_transaction: ad.transaction, p_rewarded_at: ad.rewardedAt});
    if (!saved) throw new RequestError('invalid_ad_intent', 409);
    return {ok: true};
  }
  if (request.method === 'GET' && url.pathname.endsWith('/rankings')) return rpc('rankings');
  if (request.method === 'POST' && url.pathname.endsWith('/maintenance')) {
    if (!safeSecret(request.headers.get('Authorization'), 'Bearer ' + (Deno.env.get('SCALPING_MAINTENANCE_TOKEN') || '')) || !Deno.env.get('SCALPING_MAINTENANCE_TOKEN'))
      throw new RequestError('maintenance_unauthorized', 401);
    const job = url.searchParams.get('job');
    if (job !== 'keepalive' && job !== 'cleanup') throw new RequestError('unknown_job');
    return rpc('maintenance', {p_job: job});
  }
  if (request.method !== 'POST') throw new RequestError('method_not_allowed', 405);
  const user = await authenticated(request);
  if (Number(request.headers.get('Content-Length')) > 4096) throw new RequestError('request_too_large', 413);
  const raw = await request.text();
  if (raw.length > 4096) throw new RequestError('request_too_large', 413);
  let input;
  try { input = JSON.parse(raw); } catch { throw new RequestError('invalid_json'); }
  if (!input || typeof input !== 'object') throw new RequestError('invalid_json');
  const args = {p_user: user};
  if (input.action === 'deleteAccount') {
    if (input.confirm !== true) throw new RequestError('invalid_request');
    const response = await fetch(base + '/auth/v1/admin/users/' + user, {
      method: 'DELETE', headers: {apikey: service, Authorization: 'Bearer ' + service}, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new RequestError('service_unavailable', 503);
    return {ok: true};
  }
  if (input.action === 'profile') return rpc('profile', input.nickname === undefined ? args : {...args, p_name: nickname(input.nickname)});
  if (input.action === 'start') {
    if (!uuid(input.requestId) || typeof input.restart !== 'boolean' || input.version !== GAME_VERSION) throw new RequestError('invalid_start');
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    const row = await rpc('start', {...args, p_request: input.requestId, p_restart: input.restart, p_version: GAME_VERSION, p_seed: seed});
    if (row.error) throw new RequestError(row.error, 409);
    return clientSession(await rpc('session', {...args, p_id: row.session_id}));
  }
  if (input.action === 'adStatus') {
    if (!uuid(input.nonce)) throw new RequestError('invalid_nonce');
    return rpc('ad_status', {...args, p_nonce: input.nonce});
  }
  const sessionId = uuid(input.sessionId) ? input.sessionId : null;
  if (input.action === 'adIntent' && input.feature === 'extra') {
    if (!productionUnits.extra) throw new RequestError('ad_unavailable', 409);
    const nonce = await rpc('ad_intent', {...args, p_id: null, p_feature: 'extra'});
    if (!nonce) throw new RequestError('ad_unavailable', 409);
    return {nonce};
  }
  if (input.sessionId != null && !sessionId) throw new RequestError('invalid_session');
  if (input.action === 'session') return clientSession(await rpc('session', {...args, p_id: sessionId}), input.feedAfter);
  if (!sessionId) throw new RequestError('invalid_session');
  const session = await rpc('session', {...args, p_id: sessionId});
  if (!session) throw new RequestError('unknown_session', 404);
  if (session.status === 'completed' && input.action === 'finish') return clientSession(session, input.feedAfter);
  if (session.status !== 'active' || session.game_version !== GAME_VERSION) throw new RequestError('inactive_session', 409);
  const elapsed = elapsedMs(session);
  const tick = tickAt(elapsed);
  if (input.action === 'feed') {
    const feedAfter = Number.isInteger(input.feedAfter) ? Math.max(0, Math.min(input.feedAfter, tick)) : 0;
    return {elapsed, revision: session.revision, paused: session.paused, feedAfter, feed: marketFeed(session, tick, feedAfter)};
  }
  if (input.action === 'adIntent') {
    if (elapsed === FULL_MS || !FEATURES.has(input.feature) || !productionUnits[input.feature]) throw new RequestError('ad_unavailable', 409);
    const {account} = replay(session.server_seed, session.commands, tick, marketFeed(session, tick));
    if (account.unlocks[input.feature] || (input.feature === 'emergency' && !eligibleForEmergency(account)))
      throw new RequestError('not_eligible', 409);
    const nonce = await rpc('ad_intent', {...args, p_id: sessionId, p_feature: input.feature});
    if (!nonce) throw new RequestError('ad_unavailable', 409);
    return {nonce};
  }
  const at = new Date(session.server_ms).toISOString();
  const commit = { ...args, p_id: sessionId, p_revision: session.revision, p_command: null as unknown,
    p_elapsed: elapsed, p_paused: session.paused, p_at: at, p_score: null as number | null };
  if (input.action === 'finish') {
    if (elapsed !== FULL_MS) throw new RequestError('round_in_progress', 409);
    commit.p_score = finalScore(replay(session.server_seed, session.commands, tick));
  } else if (input.action === 'pause' || input.action === 'resume') {
    if (elapsed === FULL_MS) throw new RequestError('round_finished', 409);
    commit.p_paused = input.action === 'pause';
    if (session.paused === commit.p_paused) return clientSession(session);
  } else if (input.action === 'command') {
    if (!uuid(input.requestId)) throw new RequestError('invalid_command');
    if (session.commands.some((command: {requestId: string}) => command.requestId === input.requestId)) return clientSession(session);
    if (elapsed === FULL_MS || (session.paused && input.command?.kind !== 'activate')) throw new RequestError('round_not_trading', 409);
    if (session.commands.length >= 450 || session.commands.filter((command: {tick: number}) => command.tick === tick).length >= 4)
      throw new RequestError('order_rate_limit', 429);
    const action = commandFrom(input.command);
    if (!action) throw new RequestError('invalid_command');
    if (action.kind === 'activate') {
      if (!uuid(action.nonce)) throw new RequestError('invalid_ad_intent');
      const intent = await rpc('ad_status', {...args, p_nonce: action.nonce});
      if (intent?.session_id !== sessionId || intent?.feature !== action.feature || !intent?.verified_at)
        throw new RequestError('ad_not_verified', 409);
    }
    const state = replay(session.server_seed, session.commands, tick);
    const outcome = applyCommand(state, action);
    if (outcome?.error) throw new RequestError(outcome.error, 409);
    commit.p_command = {...action, requestId: input.requestId, tick};
  } else throw new RequestError('unknown_action');
  if (!await rpc('commit', commit)) throw new RequestError('retry_session', 409);
  return clientSession(await rpc('session', {...args, p_id: sessionId}), input.feedAfter);
}
Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const headers = new Headers({'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin', 'Cache-Control': 'no-store'});
  if (origin && !origins.has(origin)) return new Response(null, {status: 403, headers});
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  try { return Response.json(await run(request, url), {headers}); }
  catch (error) {
    if (error instanceof RequestError) return Response.json({error: error.message}, {status: error.status, headers});
    console.error('Official game endpoint failure', error instanceof Error ? error.name : 'unknown');
    return Response.json({error: 'service_unavailable'}, {status: 503, headers});
  }
});
