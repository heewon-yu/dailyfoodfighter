// Cloudflare Pages Function: /api/300-seconds/rankings
// 바인딩 계약: production·preview 모두 DB -> D1 scalping-db (같은 폴더 README.md 참고)
function kstDay(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
const H={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const out=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:H});
export const onRequestOptions=()=>new Response(null,{headers:H});
const cleanNick=n=>typeof n==='string'&&/^[가-힣A-Za-z0-9_]{2,12}$/.test(n.trim().normalize('NFKC'))?n.trim().normalize('NFKC'):null;
const SCHEMA=[
 `CREATE TABLE IF NOT EXISTS mystery_rankings_v4(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 kst_day TEXT NOT NULL,
 nickname TEXT NOT NULL,
 score INTEGER NOT NULL,
 solved INTEGER NOT NULL,
 hints INTEGER NOT NULL DEFAULT 0,
 mode TEXT NOT NULL DEFAULT 'normal',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
 )`,
 `CREATE UNIQUE INDEX IF NOT EXISTS idx_mystery_v4_day_nick ON mystery_rankings_v4(kst_day,nickname)`,
 `CREATE INDEX IF NOT EXISTS idx_mystery_v4_day_score ON mystery_rankings_v4(kst_day,score DESC,solved DESC)`
];
const PURGE=`DELETE FROM mystery_rankings_v4 WHERE kst_day <> strftime('%Y-%m-%d','now','+9 hours')`;
// 스키마 보장은 batch 한 번(왕복 1회)으로 끝낸다. 전부 IF NOT EXISTS라 매 요청 실행해도 안전하고,
// DB를 새로 만들어도 다음 요청이 스스로 복구한다.
async function ensure(db){await db.batch(SCHEMA.map(sql=>db.prepare(sql)))}
async function purge(db){await db.prepare(PURGE).run()}
export async function onRequestGet({request,env}){
 const db=env.DB||env.SCALPING_DB;if(!db)return out({day:kstDay(),daily:[],mine:null,notice:'D1 binding unavailable'},503);
 try{
  await ensure(db); const day=kstDay();
  // 일일 purge와 순위 조회는 한 트랜잭션(batch)으로 묶어 왕복을 줄인다.
  const [,daily]=await db.batch([
   db.prepare(PURGE),
   db.prepare(`SELECT nickname,score,solved,hints FROM mystery_rankings_v4 WHERE kst_day=? ORDER BY score DESC,solved DESC,hints ASC,created_at ASC LIMIT 5`).bind(day)
  ]);
  const nick=cleanNick(new URL(request.url).searchParams.get('nickname'));
  let mine=null;
  if(nick){
   mine=await db.prepare(`SELECT MAX(score) score, MAX(solved) solved FROM mystery_rankings_v4 WHERE kst_day=? AND nickname=?`).bind(day,nick).first();
   if(!mine||mine.score==null)mine=null;
  }
  return out({day,daily:(daily.results||[]).map((r,i)=>({...r,rank:i+1})),mine});
 }catch(e){return out({error:'database_error',details:e.message},500)}
}
export async function onRequestPost({request,env}){
 const db=env.DB||env.SCALPING_DB;if(!db)return out({error:'D1_binding_unavailable'},503);
 let b;try{b=await request.json()}catch{return out({error:'invalid_json'},400)}
 const nickname=cleanNick(b?.nickname),score=Number(b?.score),solved=Number(b?.solved),hints=Number(b?.hints??0),mode=b?.mode==='daily'?'daily':'normal';
 if(!nickname||!Number.isInteger(score)||score<0||score>10000||!Number.isInteger(solved)||solved<0||solved>100||!Number.isInteger(hints)||hints<0||hints>3)return out({error:'invalid_score'},400);
 if(score!==solved*100)return out({error:'invalid_score'},400);
 try{
  await ensure(db); await purge(db); const day=kstDay();
  if(b?.day!==day)return out({error:"day_expired",day},409);
  await db.prepare(`INSERT INTO mystery_rankings_v4(kst_day,nickname,score,solved,hints,mode)
   SELECT ?,?,?,?,?,? WHERE ?=strftime('%Y-%m-%d','now','+9 hours')
   ON CONFLICT(kst_day,nickname) DO UPDATE SET
   score=CASE WHEN excluded.score>score THEN excluded.score ELSE score END,
   solved=CASE WHEN excluded.score>score THEN excluded.solved ELSE solved END,
   hints=CASE WHEN excluded.score>score THEN excluded.hints ELSE hints END,
   mode=CASE WHEN excluded.score>score THEN excluded.mode ELSE mode END`)
   .bind(day,nickname,score,solved,hints,mode,day).run();
  return out({ok:true,day});
 }catch(e){return out({error:'database_error',details:e.message},500)}
}
