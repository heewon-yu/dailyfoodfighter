import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createSign, generateKeyPairSync, createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {dayAt, gameRequest, storeReward, originFor} from '../../functions/_shared/scalping.js';
import {onRequest as rankings} from '../../functions/api/scalping/rankings.js';
import {onRequest as session} from '../../functions/api/scalping/session.js';
import {verifiedCallback} from '../../functions/api/scalping/admob.js';
import {onRequestPost as retention} from '../../functions/api/scalping/retention.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../../functions/api/scalping/schema.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('../../functions/api/scalping/migrations/0002_verified_rounds.sql',import.meta.url),'utf8'));
function statement(sql, params=[]) {
  return {
    bind:(...values)=>statement(sql,values),
    first:async()=>sqlite.prepare(sql).get(...params) || null,
    all:async()=>({results:sqlite.prepare(sql).all(...params)}),
    run:async()=>({meta:{changes:sqlite.prepare(sql).run(...params).changes}}),
  };
}
const DB={
  prepare:sql=>statement(sql),
  async batch(statements){
    sqlite.exec('BEGIN');
    try { const results=[]; for(const item of statements) results.push(await item.run()); sqlite.exec('COMMIT'); return results; }
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  },
};
const base='https://dailyfoodfighter.com/api/scalping';
const tokenA='a'.repeat(64),tokenB='b'.repeat(64),now=Date.UTC(2026,10,12,14,40);
const make=(body,token,url='/session')=>new Request(base+url,{method:body?'POST':'GET',
  headers:token?{Authorization:'Bearer '+token}:{},body:body?JSON.stringify(body):undefined});
const call=(body,token=tokenA,at=now)=>gameRequest(make(body,token),{DB},at);
const rejects=(value,code)=>assert.rejects(value,error=>error.message===code);
const start=(requestId=crypto.randomUUID(),extra={})=>({action:'start',requestId,restart:false,version:'20261112.1',...extra});
assert.equal(dayAt(Date.UTC(2026,10,12,14,59,59)),'2026-11-12');
assert.equal(dayAt(Date.UTC(2026,10,12,15)),'2026-11-13');
assert.equal((await rankings({request:make(null,null,'/rankings'),env:{}})).status,503);
assert.equal((await rankings({request:make({nickname:'위조',rate:999,profit:999999},tokenA,'/rankings'),env:{DB}})).status,400);
// Reject untrusted browser origins and refuse oversized/untrusted session payloads.
assert.equal(originFor(new Request(base+'/session',{headers:{Origin:'https://dailyfoodfighter.com'}})),
  'https://dailyfoodfighter.com');
assert.throws(()=>originFor(new Request(base+'/session',{headers:{Origin:'https://evil.example'}})),
  error=>error.message==='origin_denied');
assert.equal((await session({request:new Request(base+'/session',{method:'POST',headers:{
  Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({action:'register',nickname:'악성사용자'})}),env:{DB}})).status,403);
assert.equal((await session({request:new Request(base+'/session',{method:'POST',
  headers:{Authorization:'Bearer '+tokenA,'Content-Type':'application/json'},
  body:JSON.stringify({action:'register',nickname:'가'.repeat(5000)})}),env:{DB}})).status,413);
assert.equal((await rankings({request:make({action:'finish',rate:500,profit:100000000},tokenA,'/rankings'),
  env:{DB}})).status,400);
await rejects(call(start()),'identity_required');
assert.equal((await call({action:'register',nickname:'동일닉네임'})).free,5);
assert.equal((await call({action:'register',nickname:'동일닉네임'},tokenB)).free,5);
const command = start();
const round = await call(command);
assert.equal((await call({action:'recover'})).round.session_id,round.session_id);
assert.equal((await call({action:'recover'},tokenB)).round,null);
assert.equal((await call(command)).session_id,round.session_id);
assert.equal((await call(start())).session_id,round.session_id);
assert.equal((await call({action:'profile'})).free,4);
assert.equal(round.feed.seeds.length,0);
assert.equal((await call({action:'feed',sessionId:round.session_id,feedAfter:999},tokenA,now+2500)).feed.seeds.length,0);
assert.equal((await call({action:'feed',sessionId:round.session_id},tokenA,now+2500)).feed.seeds.length,5);
assert.ok(!JSON.stringify(round).includes('market_key'));
await rejects(call({action:'feed',sessionId:round.session_id},tokenB),'inactive_session');
await rejects(call({action:'finish',sessionId:round.session_id},tokenA,now+299999),'round_in_progress');
const trade={action:'command',sessionId:round.session_id,requestId:crypto.randomUUID(),command:{kind:'order',stock:0,side:'buy',qty:2,price:null,tick:500}};
const sent=await call(trade,tokenA,now+500);
assert.equal(sent.commands[0].tick,1);
assert.equal((await call(trade,tokenA,now+501)).commands.length,1);
const pause=await call({action:'pause',sessionId:round.session_id},tokenA,now+1000);
assert.equal(pause.elapsed,1000);
await rejects(call({action:'finish',sessionId:round.session_id},tokenA,now+400000),'round_in_progress');
await call({action:'resume',sessionId:round.session_id},tokenA,now+2000);
const t=performance.now();
const closed=await call({action:'finish',sessionId:round.session_id},tokenA,now+301000);
assert.equal(closed.status,'completed');
assert.equal((await call({action:'recover'},tokenA,now+301001)).round.status,'completed');
assert.equal((await call({action:'finish',sessionId:round.session_id},tokenA,now+301001)).score.final_equity,closed.score.final_equity);
console.log('Cold full round server verification wall time (ms)',Math.round(performance.now()-t));
const second=await call(start(),tokenB,now+301000);
assert.equal((await call({action:'finish',sessionId:second.session_id},tokenB,now+601000)).status,'completed');
const ranked=await (await rankings({request:make(null,null,'/rankings'),env:{DB}})).json();
const today=dayAt();
const actualDayRanked=sqlite.prepare('SELECT count(DISTINCT player_id) AS n FROM verified_scores WHERE day=?').get(dayAt(now));
assert.equal(actualDayRanked.n,2);
assert.equal(ranked.day,today);
let current=closed;
for(let i=2;i<=5;i++){
  current=await call(start(undefined,{restart:true,current:current.session_id}),tokenA,now+700000+i*1000);
}
await rejects(call(start(undefined,{restart:true,current:current.session_id}),tokenA,now+710000),'quota_exhausted');
assert.equal((await call({action:'profile'},tokenA,now+710000)).free,0);
const intent=await call({action:'adIntent',feature:'extra'},tokenA,now+710000);
const reward={unit:'7071482751',nonce:intent.nonce,transaction:'abcdef0123456789',ms:now+711000};
assert.deepEqual(await storeReward(DB,reward,now+711000),{ok:true});
await storeReward(DB,reward,now+711001);
assert.equal((await call({action:'profile'},tokenA,now+711002)).bonus,1);
const extra=await call(start(undefined,{restart:true,current:current.session_id}),tokenA,now+711003);
assert.equal((await call({action:'profile'},tokenA,now+711004)).bonus,0);
assert.notEqual(extra.session_id,current.session_id);

const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const sample='ad_unit=7071482751&custom_data='+intent.nonce+'&timestamp='+reward.ms+'&transaction_id='+reward.transaction;
const signature=createSign('SHA256').update(sample).sign(privateKey).toString('base64url');
const signed=base+'/admob?'+sample+'&signature='+signature+'&key_id=9';
const keys=async()=>[{keyId:9,pem:publicKey.export({type:'spki',format:'pem'})}];
assert.equal((await verifiedCallback(signed,now,keys)).nonce,intent.nonce);
assert.equal(await verifiedCallback(signed.replace('7071482751','6576357419'),now,keys),null);
// Retention must reject unauthorized maintenance calls and expire pre-v5 rows.
sqlite.prepare('INSERT INTO daily_rankings (kst_day,nickname,rate,profit) VALUES (?,?,?,?)')
  .run('2020-01-01','오래된기록',777,777000);
const maintenanceToken='c'.repeat(64);
const retentionRequest=token=>new Request(base+'/retention',{method:'POST',
  headers:{Authorization:'Bearer '+token}});
assert.equal((await retention({request:retentionRequest('d'.repeat(64)),env:{DB,
  SCALPING_D1_MAINTENANCE_DIGEST:createHash('sha256').update(maintenanceToken).digest('hex')}})).status,401);
const cleanup=await retention({request:retentionRequest(maintenanceToken),env:{DB,
  SCALPING_D1_MAINTENANCE_DIGEST:createHash('sha256').update(maintenanceToken).digest('hex')}});
assert.equal(cleanup.status,200);
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM daily_rankings WHERE kst_day='2020-01-01'").get().n,0);
console.log('Legacy D1 rankings retention and maintenance authentication tests passed');

// An authenticated player can erase their profile and all linked scores/sessions.
// The secret token cannot authorize new actions after deletion.
await rejects(call({action:'deleteAccount',confirm:false},tokenB,now+720000),'confirmation_required');
const bPlayer=sqlite.prepare('SELECT id FROM players WHERE token_hash=?')
  .get(createHash('sha256').update(tokenB).digest('hex')).id;
assert.equal((await call({action:'deleteAccount',confirm:true},tokenB,now+720001)).deleted,true);
for(const table of ['verified_scores','rounds','quotas','ad_intents'])
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM '+table+' WHERE player_id=?').get(bPlayer).n,0);
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM players WHERE id=?').get(bPlayer).n,0);
await rejects(call({action:'profile'},tokenB,now+720002),'identity_required');
assert.equal((await call({action:'profile'},tokenA,now+720002)).nickname,'동일닉네임');
console.log('Self-service deletion removes sessions and scores and invalidates the identity token');

// A round started yesterday must not block today's first free round.
const tokenC='e'.repeat(64);
const beforeMidnight=Date.UTC(2026,10,12,14,59);
const afterMidnight=Date.UTC(2026,10,12,15,1);
assert.equal((await call({action:'register',nickname:'날짜경계'},tokenC,beforeMidnight)).free,5);
const yesterdayRound=await call(start(),tokenC,beforeMidnight);
assert.equal((await call({action:'recover'},tokenC,afterMidnight)).round,null);
const todayRound=await call(start(),tokenC,afterMidnight);
assert.equal((await call({action:'recover'},tokenC,afterMidnight)).round.session_id,todayRound.session_id);
assert.notEqual(todayRound.session_id,yesterdayRound.session_id);
assert.equal(todayRound.kst_day,'2026-11-13');
assert.equal(sqlite.prepare('SELECT status FROM rounds WHERE id=?').get(yesterdayRound.session_id).status,'abandoned');
assert.equal((await call({action:'profile'},tokenC,afterMidnight)).free,4);
assert.equal(sqlite.prepare('SELECT used FROM quotas WHERE player_id=(SELECT id FROM players WHERE token_hash=?) AND day=?')
 .get(createHash('sha256').update(tokenC).digest('hex'),'2026-11-12').used,1);
console.log('KST midnight rollover correctly abandons stale active rounds');

console.log('D1 SQLite session, verified scoring, ownership, KST, quota, SSV and idempotency tests passed');
