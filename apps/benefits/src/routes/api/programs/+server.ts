import { env } from '$env/dynamic/private';
import { json, type RequestHandler } from '@sveltejs/kit';

// Same-origin read-only gateway. Never expose ingest credentials or public API keys.
export const GET: RequestHandler = async ({ url, fetch }) => {
  const base = env.WORKER_API_BASE_URL?.trim().replace(/\/$/, '');
  if (!base) return json({error:'public program database is not configured'}, {status:503, headers:{'Cache-Control':'no-store'}});
  let worker: URL;
  try {
    worker = new URL(base);
    if (worker.protocol !== 'https:' || worker.username || worker.password || worker.search || worker.hash)
      throw new Error('invalid worker endpoint');
  } catch {
    return json({error:'public API configuration invalid'}, {status:503});
  }
  const allowed=['category','q','region','topic','limit','offset','availability','subtopic','collection','cursor','agency'];
  const target=new URL('/api/programs', worker.origin);
  for(const key of allowed){
    const value=url.searchParams.get(key);
    if(value!==null)target.searchParams.set(key,value.slice(0,key==='cursor'?340:120));
  }
  try {
    const upstream=await fetch(target.toString(), {headers:{Accept:'application/json'}, signal:AbortSignal.timeout(8000)});
    if(!upstream.ok) return json({error:'public database unavailable'}, {status:503, headers:{'Cache-Control':'no-store'}});
    const data=await upstream.json();
    if(!data || !Array.isArray(data.items)) throw new Error('unexpected format');
    return json({items:data.items,limit:data.limit,offset:data.offset,nextCursor:data.nextCursor},{
      headers:{'Cache-Control':'public, max-age=30, s-maxage=60'}
    });
  } catch {
    return json({error:'public database unavailable'}, {status:503, headers:{'Cache-Control':'no-store'}});
  }
};
