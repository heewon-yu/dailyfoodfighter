import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createSign, generateKeyPairSync} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {dayAt, gameRequest, storeReward} from '../../functions/_shared/scalping.js';
import {onRequest as rankings} from '../../functions/api/scalping/rankings.js';
import {verifiedCallback} from '../../functions/api/scalping/admob.js';

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
await rejects(call(start()),'identity_required');
assert.equal((await call({action:'register',nickname:'동일닉네임'})).free,5);
assert.equal((await call({action:'register',nickname:'동일닉네임'},tokenB)).free,5);
const command = start();
const round = await call(command);
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
console.log('D1 SQLite session, verified scoring, ownership, KST, quota, SSV and idempotency tests passed');
