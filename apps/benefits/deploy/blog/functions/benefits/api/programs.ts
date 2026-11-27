// Copy into dailyfoodfighter/functions/benefits/api/programs.ts when P0 data
// storage is READY. Cloudflare Pages Functions serves this route same-origin.
interface Env {
  BENEFITS_WORKER_ORIGIN: string;
}
type Context = {
  request: Request;
  env: Env;
};
const noStore = { 'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function onRequestGet(context: Context): Promise<Response> {
  const raw = context.env.BENEFITS_WORKER_ORIGIN?.trim();
  if (!raw) {
    return new Response(JSON.stringify({error:'benefit service not yet connected'}),
      {status:503,headers:noStore});
  }
  let origin: URL;
  try {
    origin = new URL(raw);
    if(origin.protocol!=='https:' || origin.username || origin.password ||
       origin.search || origin.hash || origin.pathname!=='/')
      throw new Error('invalid origin');
  } catch {
    return new Response(JSON.stringify({error:'invalid service configuration'}),
      {status:503,headers:noStore});
  }
  const source=new URL(context.request.url);
  const target=new URL('/api/programs',origin);
  for(const key of ['category','region','q','topic','limit','offset','availability','subtopic','collection','cursor','agency']){
    const value=source.searchParams.get(key);
    if(value!==null)target.searchParams.set(key,value.slice(0,key==='cursor'?340:120));
  }
  try {
    const response=await fetch(target.toString(),{
      headers:{Accept:'application/json'},
      signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)return new Response(JSON.stringify({error:'benefit database unavailable'}),
      {status:503,headers:noStore});
    const payload:unknown=await response.json();
    if(!payload || typeof payload!=='object' || !('items' in payload) ||
       !Array.isArray((payload as {items:unknown}).items))
      throw new Error('bad response');
    return new Response(JSON.stringify(payload),{
      headers:{'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'public, max-age=30, s-maxage=60',
        'X-Content-Type-Options':'nosniff'}
    });
  }catch{
    return new Response(JSON.stringify({error:'benefit database unavailable'}),
      {status:503,headers:noStore});
  }
}
