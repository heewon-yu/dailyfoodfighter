// Cloudflare Pages Function: /api/300-seconds/rankings
function kstDay(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
const H={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const out=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:H});
export const onRequestOptions=()=>new Response(null,{headers:H});
const cleanNick=n=>typeof n==='string'&&/^[가-힣A-Za-z0-9_]{2,12}$/.test(n.trim().normalize('NFKC'))?n.trim().normalize('NFKC'):null;
export async function onRequestGet({env}){
 const db=env.DB||env.SCALPING_DB;if(!db)return out({day:kstDay(),daily:[],notice:'D1 binding unavailable'});
 try{
  const day=kstDay();
  const daily=await db.prepare(`SELECT nickname, MAX(score) score, MAX(solved) solved FROM mystery_rankings WHERE kst_day=? GROUP BY nickname ORDER BY score DESC, solved DESC LIMIT 10`).bind(day).all();
  return out({day,daily:(daily.results||[]).map((r,i)=>({...r,rank:i+1}))});
 }catch(e){return out({error:'database_error',details:e.message},500)}
}
export async function onRequestPost({request,env}){
 const db=env.DB||env.SCALPING_DB;if(!db)return out({error:'D1_binding_unavailable'},503);
 let b;try{b=await request.json()}catch{return out({error:'invalid_json'},400)}
 const nickname=cleanNick(b?.nickname),score=Number(b?.score),solved=Number(b?.solved),hints=Number(b?.hints??0),mode=b?.mode==='daily'?'daily':'normal';
 if(!nickname||!Number.isInteger(score)||score<0||score>1000000||!Number.isInteger(solved)||solved<0||solved>200||!Number.isInteger(hints)||hints<0||hints>600)return out({error:'invalid_score'},400);
 try{
  const day=kstDay();
  await db.prepare(`INSERT INTO mystery_rankings(kst_day,nickname,score,solved,hints,mode) VALUES(?,?,?,?,?,?)`).bind(day,nickname,score,solved,hints,mode).run();
  await db.prepare(`DELETE FROM mystery_rankings WHERE created_at < datetime('now','-90 days')`).run().catch(()=>{});
  return out({ok:true,day});
 }catch(e){return out({error:'database_error',details:e.message},500)}
}