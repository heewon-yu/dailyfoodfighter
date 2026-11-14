// Cloudflare Pages Function: /api/300-seconds/rankings
function kstDay(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
const H={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const out=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:H});
export const onRequestOptions=()=>new Response(null,{headers:H});
const cleanNick=n=>typeof n==='string'&&/^[가-힣A-Za-z0-9_]{2,12}$/.test(n.trim().normalize('NFKC'))?n.trim().normalize('NFKC'):null;
async function ensure(db){
 await db.prepare(`CREATE TABLE IF NOT EXISTS mystery_rankings(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 kst_day TEXT NOT NULL,
 nickname TEXT NOT NULL,
 score INTEGER NOT NULL,
 solved INTEGER NOT NULL,
 hints INTEGER NOT NULL DEFAULT 0,
 mode TEXT NOT NULL DEFAULT 'normal',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
 )`).run();
 await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mystery_day_nick ON mystery_rankings(kst_day,nickname)`).run();
 await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mystery_day_score ON mystery_rankings(kst_day,score DESC,solved DESC)`).run();
}
export async function onRequestGet({request,env}){
 const db=env.DB||env.SCALPING_DB;if(!db)return out({day:kstDay(),daily:[],mine:null,notice:'D1 binding unavailable'});
 try{
  await ensure(db); const day=kstDay();
  const daily=await db.prepare(`SELECT nickname,score,solved,hints FROM mystery_rankings WHERE kst_day=? ORDER BY score DESC,solved DESC,hints ASC,created_at ASC LIMIT 10`).bind(day).all();
  const nick=cleanNick(new URL(request.url).searchParams.get('nickname'));
  let mine=null;
  if(nick){
   mine=await db.prepare(`SELECT MAX(score) score, MAX(solved) solved FROM mystery_rankings WHERE nickname=?`).bind(nick).first();
   if(!mine||mine.score==null)mine=null;
  }
  return out({day,daily:(daily.results||[]).map((r,i)=>({...r,rank:i+1})),mine});
 }catch(e){return out({error:'database_error',details:e.message},500)}
}
export async function onRequestPost({request,env}){
 const db=env.DB||env.SCALPING_DB;if(!db)return out({error:'D1_binding_unavailable'},503);
 let b;try{b=await request.json()}catch{return out({error:'invalid_json'},400)}
 const nickname=cleanNick(b?.nickname),score=Number(b?.score),solved=Number(b?.solved),hints=Number(b?.hints??0),mode=b?.mode==='daily'?'daily':'normal';
 if(!nickname||!Number.isInteger(score)||score<0||score>1000000||!Number.isInteger(solved)||solved<0||solved>200||!Number.isInteger(hints)||hints<0||hints>600)return out({error:'invalid_score'},400);
 try{
  await ensure(db); const day=kstDay();
  await db.prepare(`INSERT INTO mystery_rankings(kst_day,nickname,score,solved,hints,mode)
   VALUES(?,?,?,?,?,?)
   ON CONFLICT(kst_day,nickname) DO UPDATE SET
   score=CASE WHEN excluded.score>score THEN excluded.score ELSE score END,
   solved=CASE WHEN excluded.score>score THEN excluded.solved ELSE solved END,
   hints=CASE WHEN excluded.score>score THEN excluded.hints ELSE hints END,
   mode=CASE WHEN excluded.score>score THEN excluded.mode ELSE mode END`)
   .bind(day,nickname,score,solved,hints,mode).run();
  return out({ok:true,day});
 }catch(e){return out({error:'database_error',details:e.message},500)}
}