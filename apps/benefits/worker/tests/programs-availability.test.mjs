import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.ts';

function fakeDatabase() {
  const state={sql:'',params:[]};
  return {
    state,
    prepare(sql) {
      state.sql=sql;
      return {
        bind(...params) {
          state.params=params;
          return {async all(){return {results:[]}}};
        }
      };
    }
  };
}
test('review lists notices with missing dates and future start dates while filtering expired',async()=>{
  const db=fakeDatabase();
  const res=await worker.fetch(new Request('https://worker.example/api/programs?availability=review'),{DB:db,INGEST_TOKEN:'unused'});
  assert.equal(res.status,200);
  assert.deepEqual((await res.json()).items,[]);
  assert.match(db.state.sql,/status NOT IN \('ARCHIVED','CLOSED'\)/);
  assert.match(db.state.sql,/end_date IS NULL OR end_date>=\?/);
  assert.doesNotMatch(db.state.sql,/start_date<=\?/);
});
test('open-only browsing still requires a verifiable current period',async()=>{
  const db=fakeDatabase();
  const res=await worker.fetch(new Request('https://worker.example/api/programs?availability=open'),{DB:db,INGEST_TOKEN:'unused'});
  assert.equal(res.status,200);
  assert.match(db.state.sql,/application_type='ROLLING'/);
  assert.match(db.state.sql,/start_date<=\?/);
});
test('availability query cannot escape the allowed modes',async()=>{
  const db=fakeDatabase();
  const res=await worker.fetch(new Request('https://worker.example/api/programs?availability=anything'),{DB:db,INGEST_TOKEN:'unused'});
  assert.equal(res.status,400);
  assert.equal(db.state.sql,'');
});

test('program browsing does not impose a 50000-row offset ceiling',async()=>{
  const db=fakeDatabase();
  const requested=75000;
  const res=await worker.fetch(new Request(`https://worker.example/api/programs?offset=${requested}`),{DB:db,INGEST_TOKEN:'unused'});
  assert.equal(res.status,200);
  assert.equal(db.state.params.at(-1),requested);
});

test('national collection requests existing official scheme titles in one query',async()=>{
  const db=fakeDatabase();
  const res=await worker.fetch(new Request('https://worker.example/api/programs?collection=national'),{DB:db,INGEST_TOKEN:'unused'});
  assert.equal(res.status,200);
  assert.match(db.state.sql,/source='GOV24'/);
  assert.ok(db.state.params.includes('첫만남이용권지원'));
  assert.ok(db.state.params.includes('아이돌봄서비스'));
  assert.ok(db.state.params.length < 100);
});

test('shared first-page cache skips D1 and never stores explicit search text',async()=>{
  const entries=new Map();
  const writes=[];
  let queries=0;
  const original=Object.getOwnPropertyDescriptor(globalThis,'caches');
  Object.defineProperty(globalThis,'caches',{configurable:true,value:{default:{
    async match(req){return entries.get(req.url)?.clone();},
    async put(req,res){entries.set(req.url,res);}
  }}});
  try{
    const env={DB:{prepare(){queries++;return {bind(){return {async all(){return {results:[]};}};}};}},INGEST_TOKEN:'unused'};
    const ctx={waitUntil(promise){writes.push(promise);}};
    const get=path=>worker.fetch(new Request('https://worker.example/api/programs?'+path),env,ctx);
    assert.equal((await get('cursor=&category=WELFARE&limit=50')).status,200);
    await Promise.all(writes);
    assert.deepEqual(await (await get('category=WELFARE&limit=50&cursor=')).json(),
      {items:[],limit:50,offset:0,nextCursor:null});
    assert.equal(queries,1);
    await get('cursor=&category=FUND&limit=50');
    await get('cursor=&q=private&limit=50');
    await get('cursor=&q=private&limit=50');
    assert.equal(queries,4);
    await Promise.all(writes);
    assert.equal(entries.size,2);
  }finally{
    if(original)Object.defineProperty(globalThis,'caches',original);
    else delete globalThis.caches;
  }
});

test('agency filter combines with search, category and cursor; institution text is bound literally',async()=>{
  const db=fakeDatabase();
  const url=new URL('https://worker.example/api/programs?category=WELFARE&q=육아&cursor=');
  url.searchParams.set('agency','교육부_%');
  const res=await worker.fetch(new Request(url),{DB:db,INGEST_TOKEN:'unused'});
  assert.equal(res.status,200);
  assert.match(db.state.sql,/category=\?/);
  assert.match(db.state.sql,/instr\(lower\(COALESCE\(agency/);
  assert.match(db.state.sql,/instr\(lower\(title\)/);
  assert.ok(db.state.params.includes('교육부_%'));
  assert.ok(db.state.params.includes('육아'));
});
