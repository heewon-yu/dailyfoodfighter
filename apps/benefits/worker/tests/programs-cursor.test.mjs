import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../src/index.ts';

test('indexed cursor browsing returns every category match once despite inserts and updates', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    for (const name of ['0001_initial.sql','0002_browse_indexes.sql']) {
      sqlite.exec(readFileSync(new URL('../../migrations/'+name,import.meta.url),'utf8'));
    }
    const insert=sqlite.prepare(`INSERT INTO programs
      (id,source,source_id,category,title,apply_url,created_at)
      VALUES ('GOV24:' || ?, 'GOV24', ?, ?, '공고', 'https://example.org', ?)`);
    const expected=[];
    sqlite.exec('BEGIN');
    for (let i=0;i<2400;i++) {
      const suffix=String(i).padStart(5,'0');
      insert.run(suffix,suffix,i%2?'WELFARE':'FUND','2026-11-19 00:00:00');
      if (i%2) expected.unshift('GOV24:'+suffix);
    }
    sqlite.exec('COMMIT');
    const plans=[];
    const env={DB:{prepare(sql) {
      return {bind(...args) {
        if(sql.includes('(created_at, id) <')) {
          const plan=sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(...args);
          plans.push(plan.map(x=>x.detail).join(' '));
        }
        return {async all() { return {results:sqlite.prepare(sql).all(...args)}; }};
      }};
    }},INGEST_TOKEN:'unused'};
    const seen=[];
    let cursor='';
    do {
      const url=new URL('https://worker.example/api/programs?availability=review&category=WELFARE&limit=200');
      url.searchParams.set('cursor',cursor);
      const res=await worker.fetch(new Request(url),env);
      assert.equal(res.status,200);
      const body=await res.json();
      assert.equal(body.items.length,200);
      assert.ok(body.items.every(item=>!('created_at' in item)));
      seen.push(...body.items.map(x=>x.id));
      if(seen.length===200) {
        insert.run('new','new','WELFARE','2026-11-20 00:00:00');
        sqlite.exec("UPDATE programs SET updated_at='2026-11-20 00:00:00' WHERE id='GOV24:00001'");
      }
      cursor=body.nextCursor;
    } while(cursor!==null);
    assert.deepEqual(seen,expected);
    assert.equal(plans.length,5);
    for (const plan of plans) assert.match(plan,/SEARCH.*programs_browse_category_created_idx.*created_at,id\)</);
  } finally {
    sqlite.close();
  }
});


test('Gov24 pending query uses the partial index and returns only unenriched records',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  try {
    for(const name of ['0001_initial.sql','0002_browse_indexes.sql']){
      sqlite.exec(readFileSync(new URL('../../migrations/'+name,import.meta.url),'utf8'));
    }
    const insert=sqlite.prepare(`INSERT INTO programs
      (id,source,source_id,category,title,apply_url,eligibility_json,status)
      VALUES (?,? ,?,'WELFARE','공고','https://example.org',?,?)`);
    insert.run('GOV24:one','GOV24','one','{}','UNKNOWN');
    insert.run('GOV24:two','GOV24','two','{"details_enriched":1}','UNKNOWN');
    insert.run('GOV24:three','GOV24','three','{}','CLOSED');
    insert.run('BIZINFO:one','BIZINFO','one','{}','UNKNOWN');

    let plan='';
    const env={DB:{prepare(sql){return {bind(...args){
      plan=sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(p=>p.detail).join(' ');
      return {async all(){return {results:sqlite.prepare(sql).all(...args)};}};
    }};}},INGEST_TOKEN:'test-token'};
    const response=await worker.fetch(new Request('https://worker.example/api/ingest/pending?limit=20',{
      headers:{Authorization:'Bearer test-token'}
    }),env);
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).items.map(x=>x.source_id),['one']);
    assert.match(plan,/USING INDEX programs_pending_gov24_idx/);
    assert.doesNotMatch(plan,/TEMP B-TREE/);
  } finally {sqlite.close();}
});
