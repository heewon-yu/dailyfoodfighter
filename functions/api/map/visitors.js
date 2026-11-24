// Combined public visit counter for all three map tabs. Requires D1 binding MAP_VISITS_DB.
const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const dayKst=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
async function stats(db,day){
  const result=await db.prepare("SELECT period, visits FROM map_visit_counts WHERE period IN (?, 'all')").bind(day).all();
  const counts=Object.fromEntries((result.results||[]).map(x=>[x.period,x.visits]));
  return {day,today:counts[day]||0,total:counts.all||0};
}
export async function onRequestGet({env}){
  if(!env.MAP_VISITS_DB)return reply({error:"Visitor counter is not configured"},503);
  try{return reply(await stats(env.MAP_VISITS_DB,dayKst()));}catch{return reply({error:"Visitor counter unavailable"},503);}
}
export async function onRequestPost({request,env}){
  if(!env.MAP_VISITS_DB)return reply({error:"Visitor counter is not configured"},503);
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return reply({error:"Invalid origin"},403);
  let body;try{body=await request.json();}catch{return reply({error:"Invalid JSON"},400);}
  if(typeof body?.visitorId!=="string"||!/^[a-f0-9-]{36}$/.test(body.visitorId))return reply({error:"Invalid visitor"},400);
  const day=dayKst();
  try{
    const input=new TextEncoder().encode("dailyfoodfighter:maps:v1:"+body.visitorId);
    const digest=await crypto.subtle.digest("SHA-256",input);
    const key=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
    const inserted=await env.MAP_VISITS_DB.prepare("INSERT OR IGNORE INTO map_visit_sessions(day,visitor_key) VALUES(?,?)").bind(day,key).run();
    if(inserted.meta?.changes===1){
      await env.MAP_VISITS_DB.batch([
        env.MAP_VISITS_DB.prepare("INSERT INTO map_visit_counts(period,visits) VALUES(?,1) ON CONFLICT(period) DO UPDATE SET visits=visits+1").bind(day),
        env.MAP_VISITS_DB.prepare("INSERT INTO map_visit_counts(period,visits) VALUES('all',1) ON CONFLICT(period) DO UPDATE SET visits=visits+1")
      ]);
    }
    return reply(await stats(env.MAP_VISITS_DB,day));
  }catch{return reply({error:"Visitor counter unavailable"},503);}
}
