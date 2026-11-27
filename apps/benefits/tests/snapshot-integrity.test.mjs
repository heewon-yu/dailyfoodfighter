import assert from 'node:assert/strict';
import test from 'node:test';
import {audit,ids} from '../scripts/verify-snapshot-integrity.mjs';

// Fixed inventory and manually specified expectations remain independent of
// the fetched response. The fake API models cursor transport, not D1 SQL.
function fixture(){
  const programs=Array.from({length:1250},(_,i)=>({
    id:'GOV24:'+String(i).padStart(5,'0'),
    title:'경상북도 특화 지원',region_sido:'경상북도',category:'WELFARE',
    apply_url:'https://example.test/'+i
  }));
  programs[1201]={...programs[1201],title:'인천광역시 출산지원',region_sido:'인천광역시'};
  programs[1220]={...programs[1220],title:'가정양육수당 지원',region_sido:'전국'};
  programs[1249]={...programs[1249],title:'아동수당 지원',region_sido:'전국'};
  return {
    capturedAt:'2026-11-20T03:00:00Z',
    programs,
    scenarios:[{
      name:'Incheon with a child',
      regionMode:'mine',
      profile:{regionSido:'인천광역시',childrenCount:1,childBirthYears:'2025'},
      expectedIds:['GOV24:01201','GOV24:01220','GOV24:01249'],
      params:{availability:'review'}
    }]
  };
}
function fakeApi(programs,{omitId,duplicate=false}={}){
  const data=programs.filter(p=>p.id!==omitId);
  let calls=0;
  return {
    get calls(){return calls;},
    fetcher:async url=>{
      calls++;
      const query=new URL(url).searchParams;
      const cursor=query.get('cursor')||'';
      const at=cursor?Number(cursor):0;
      const size=Number(query.get('limit')||50);
      const items=data.slice(at,at+size).map(p=>({...p}));
      if(duplicate && at===0 && items.length>1)items[1]=items[0];
      const next=at+size<data.length?String(at+size):null;
      return {ok:true,json:async()=>({items,nextCursor:next})};
    }
  };
}
test('full snapshot and Incheon child reference IDs are found beyond raw 1000',async()=>{
  const s=fixture(),api=fakeApi(s.programs);
  const result=await audit(s,'http://127.0.0.1:8787/api/programs',{fetcher:api.fetcher});
  assert.equal(result.passed,true);
  assert.equal(result.reports[0].actual,1250);
  assert.equal(result.reports[1].actual,3);
  assert.ok(result.reports[1].pages>=2);
  assert.ok(api.calls>6);
});
test('snapshot audit reports a silently omitted official program',async()=>{
  const s=fixture(),api=fakeApi(s.programs,{omitId:'GOV24:01220'});
  const result=await audit(s,'http://127.0.0.1:8787/api/programs',{fetcher:api.fetcher});
  assert.equal(result.passed,false);
  assert.ok(result.reports[0].missing.includes('GOV24:01220'));
  assert.ok(result.reports[1].missing.includes('GOV24:01220'));
});
test('snapshot audit rejects a duplicated raw program even if UI would hide it',async()=>{
  const s=fixture(),api=fakeApi(s.programs,{duplicate:true});
  await assert.rejects(audit(s,'http://127.0.0.1:8787/api/programs',{
    fetcher:api.fetcher
  }),/repeated raw ID/);
});
test('snapshot audit detects unexpected API ID, invalid snapshot and unsafe filter keys',async()=>{
  const s=fixture(),mutant={id:'GOV24:99999',title:'unexpected',region_sido:'전국'};
  assert.equal((await audit(s,'http://127.0.0.1:8787/api/programs',{
    fetcher:fakeApi([...s.programs,mutant]).fetcher
  })).passed,false);
  assert.throws(()=>ids(['A','A'],'source'),/duplicate/);
  const invalid={...s,scenarios:[{name:'private parameter',expectedIds:[],params:{regionSido:'인천'}}]};
  await assert.rejects(audit(invalid,'http://127.0.0.1:8787/api/programs',{
    fetcher:fakeApi(s.programs).fetcher
  }),/not a public query parameter/);
});
