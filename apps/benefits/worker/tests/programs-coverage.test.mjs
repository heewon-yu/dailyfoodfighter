import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { matchesBrowseTopic } from '../../src/lib/browse-topics.ts';
import { matchProgram } from '../../src/lib/matching.ts';
import { scanPage } from '../../src/lib/page-scan.ts';
import { displayRegion } from '../../src/lib/region-visibility.ts';
import worker from '../src/index.ts';

test('Worker and browser traversal return all independently expected IDs beyond the first 1000 candidates',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  try{
    for(const name of ['0001_initial.sql','0002_browse_indexes.sql']){
      sqlite.exec(readFileSync(new URL('../../migrations/'+name,import.meta.url),'utf8'));
    }
    const insert=sqlite.prepare(`INSERT INTO programs
      (id,source,source_id,category,title,agency,summary,region_sido,created_at,eligibility_json,apply_url,needs_review)
      VALUES ('GOV24:'||?,'GOV24',?,'WELFARE',?,?,?,?,'2026-11-19 00:00:00',?,'https://example.org',0)`);
    // Expected IDs are assigned by the fixture. They are not computed from the matcher.
    const expected=['a','b','c','d'].map(id=>'GOV24:'+id);
    const row=(id,title,agency,summary,region,flags={})=>
      insert.run(id,id,title,agency,summary,region,JSON.stringify({condition_flags:flags}));
    row('a','[서울/인천] 인턴 채용','교육부','생활지원',null,{JA0202:'Y'});
    row('b','[인천] 공고','교육부','인턴 과정과 생활지원',null);
    row('c','[전국] 인턴 교육','교육부','생활지원',null);
    row('d','[인천] 생활지원','교육부','인턴 모집',null);
    row('exclude-income','[인천] 인턴 채용','교육부','생활지원',null,{JA0201:'Y'});
    row('exclude-agency','[인천] 인턴 채용','보건복지부','생활지원',null);
    row('exclude-facet','[인천] 청소년 생활지원','교육부','',null);
    row('exclude-query','[인천] 인턴 채용','교육부','다른 사업',null);
    sqlite.exec('BEGIN');
    for(let i=0;i<1100;i++) row('z'+String(i).padStart(4,'0'),'[경북] 인턴 모집','교육부','생활지원',null);
    sqlite.exec('COMMIT');

    const env={DB:{prepare(sql){return {bind(...args){return {async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};}},INGEST_TOKEN:'unused'};
    const profile={regionSido:'인천광역시',regionSigungu:'연수구',incomeBracket:60};
    const calls=[];
    const opts={
      pageSize:50,maxRows:1000,
      async fetchBatch(cursor,limit){
        const url=new URL('https://worker.example/api/programs?availability=review&category=WELFARE&topic=youth&subtopic=young');
        for(const [k,v] of Object.entries({cursor,limit,q:'생활지원',agency:'교육부'}))url.searchParams.set(k,v);
        const response=await worker.fetch(new Request(url),env);
        assert.equal(response.status,200);
        calls.push(url.toString());
        return response.json();
      },
      accept:p=>matchesBrowseTopic(p,'youth','young')&&displayRegion(p,profile,'mine')&&matchProgram(p,profile).status!=='NO',
    };
    const first=await scanPage({...opts,start:{pending:[],cursor:''}});
    assert.equal(first.rowsScanned,1000);
    assert.deepEqual(first.items,[]);
    assert.equal(first.hasMore,true);
    const next=await scanPage({...opts,start:first.position});
    assert.deepEqual(next.items.map(p=>p.id).sort(),expected);
    assert.equal(next.hasMore,false);
    assert.equal(new Set(calls).size,calls.length);
    assert.ok(calls.every(url=>!decodeURIComponent(url).includes('연수구')));
  }finally{sqlite.close();}
});
