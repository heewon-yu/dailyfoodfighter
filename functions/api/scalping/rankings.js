import {ApiError, dayAt, dbFor, gameRequest, guardRate, originFor, playerFor, respond} from '../../_shared/scalping.js';
const metricColumns = ['rate','profit'];

function rankQuery(db, column, day, owner) {
  const filter = owner ? 'WHERE s.player_id=?' : 'ORDER BY s.rank LIMIT 5';
  const statement = db.prepare(`
    WITH best AS (
      SELECT player_id, ${column} AS value, finished_ms, round_id,
             row_number() OVER(PARTITION BY player_id ORDER BY ${column} DESC, finished_ms, round_id) AS own
      FROM verified_scores WHERE day=?
    ), ranked AS (
      SELECT player_id,value, row_number() OVER(ORDER BY value DESC,finished_ms,round_id) AS rank
      FROM best WHERE own=1
    )
    SELECT s.rank,s.value,p.nickname FROM ranked s JOIN players p ON p.id=s.player_id ${filter}
  `);
  return owner ? statement.bind(day,owner).all() : statement.bind(day).all();
}

export async function onRequest({request,env,waitUntil}) {
  let origin;
  try {
    origin=originFor(request);
    if(request.method==='OPTIONS') return respond(null,200,origin);
    const db=dbFor(env), now=Date.now(), day=dayAt(now);
    if(request.method==='POST') {
      const size = Number(request.headers.get('Content-Length'));
      if (size > 4096) throw new ApiError('request_too_large',413);
      const body=await request.clone().json().catch(()=>null);
      if(body?.action!=='finish' || 'rate' in body || 'profit' in body || 'nickname' in body)
        throw new ApiError('verified_session_required',400);
      return respond(await gameRequest(request,env,now),200,origin);
    }
    if(request.method!=='GET') throw new ApiError('method_not_allowed',405);
    const mine=new URL(request.url).searchParams.get('mine')==='1';
    guardRate('ranking:'+(request.headers.get('CF-Connecting-IP')||'local'),150,now);
    const player=mine ? await playerFor(db,request) : null;
    const cache=globalThis.caches?.default;
    const key = new Request(new URL('/api/scalping/rankings?day='+day,request.url));
    if(!mine && cache) {
      const hit=await cache.match(key);
      if(hit) return respond(await hit.json(),200,origin,'public, max-age=5');
    }
    const [rates,profits]=await Promise.all(metricColumns.map(column=>rankQuery(db,column,day,player?.id)));
    const data={day,rates:rates.results||[],profits:profits.results||[],updatedAt:new Date(now).toISOString()};
    if(!mine && cache && waitUntil) waitUntil(cache.put(key,respond(data,200,null,'public, max-age=5')));
    return respond(data,200,origin,mine?'no-store':'public, max-age=5');
  } catch(error) {
    if(error instanceof ApiError) return respond({error:error.message},error.status,origin);
    console.error('Scalping rankings request failed',error.name);
    return respond({error:'database_unavailable'},503,origin);
  }
}
