#!/usr/bin/env node
/** Read-only complete ID audit against an independently captured snapshot.
 * Usage: node scripts/verify-snapshot-integrity.mjs snapshot.json http://127.0.0.1:8787/api/programs
 * Remote hosts require --allow-remote. Never run against production casually.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {scanPage} from '../src/lib/page-scan.ts';
import {displayRegion} from '../src/lib/region-visibility.ts';
import {matchProgram} from '../src/lib/matching.ts';

const allowed=new Set(['category','q','topic','subtopic','availability','agency','collection']);
export function ids(rows,label){
  assert.ok(Array.isArray(rows),label+' must be an array');
  const all=rows.map(row=>typeof row==='string'?row:row?.id);
  assert.ok(all.every(id=>typeof id==='string'&&id.length),label+' has invalid IDs');
  assert.equal(new Set(all).size,all.length,label+' has duplicate IDs');
  return all;
}
export async function audit(snapshot,endpoint,{fetcher=fetch,maxPages=10000,onResult=()=>{}}={}){
  assert.ok(!Number.isNaN(Date.parse(snapshot.capturedAt||'')),'snapshot must include capturedAt');
  const reference=ids(snapshot.programs,'snapshot.programs');
  const scenarios=[
    {name:'full inventory',expectedIds:reference,params:{availability:'review'}},
    ...(snapshot.scenarios||[])
  ];
  const reports=[];
  for(const scenario of scenarios){
    const expected=ids(scenario.expectedIds,scenario.name+'.expectedIds');
    const params=scenario.params||{};
    for(const [key,value] of Object.entries(params)){
      assert.ok(allowed.has(key),'not a public query parameter: '+key);
      assert.equal(typeof value,'string');
    }
    const url=new URL(endpoint);
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    const mode=scenario.regionMode||'all',profile=scenario.profile||{};
    assert.ok(['mine','unknown','all'].includes(mode),'invalid region mode');
    const accept=p=>displayRegion(p,profile,mode)&&
      (!scenario.personalFirst||matchProgram(p,profile,undefined,
        {compareAllRegions:mode==='all'}).status!=='NO');
    let position={pending:[],cursor:''},pages=0,calls=0,scanned=0,done=false;
    const seen=new Set(),seenRaw=new Set(),actual=[];
    const before=Date.now();
    while(pages<maxPages){
      const result=await scanPage({
        start:position,pageSize:50,maxRows:1000,accept,excludedIds:seen,
        fetchBatch:async(cursor,limit)=>{
          const requestUrl=new URL(url);
          requestUrl.searchParams.set('cursor',cursor);
          requestUrl.searchParams.set('limit',String(limit));
          const res=await fetcher(requestUrl.toString());
          calls++;
          if(!res.ok)throw Error('API returned '+res.status);
          const data=await res.json();
          if(!Array.isArray(data.items)||data.items.length>limit||
            (data.nextCursor!==null&&typeof data.nextCursor!=='string'))
            throw Error('invalid pagination response');
          for(const item of data.items){
            if(typeof item?.id!=='string'||!item.id)throw Error('API returned record without ID');
            if(seenRaw.has(item.id))throw Error('API repeated raw ID: '+item.id);
            seenRaw.add(item.id);
          }
          return {items:data.items,nextCursor:data.nextCursor};
        }
      });
      for(const p of result.items){
        if(seen.has(p.id))throw Error('duplicate ID emitted: '+p.id);
        actual.push(p.id);seen.add(p.id);
      }
      scanned+=result.rowsScanned;pages++;position=result.position;
      if(!result.hasMore){done=true;break;}
    }
    if(!done)throw Error('page safety limit reached without end of inventory');
    const expectedSet=new Set(expected),actualSet=new Set(actual);
    const missing=expected.filter(id=>!actualSet.has(id));
    const extra=actual.filter(id=>!expectedSet.has(id));
    const report={name:scenario.name,expected:expected.length,actual:actual.length,
      missing,extra,pages,calls,scanned,durationMs:Date.now()-before};
    reports.push(report);onResult(report);
  }
  return {passed:reports.every(r=>!r.missing.length&&!r.extra.length),reports};
}
async function main(){
  const [file,endpoint,...flags]=process.argv.slice(2);
  if(!file||!endpoint)throw Error('Usage: node scripts/verify-snapshot-integrity.mjs SNAPSHOT.json http://127.0.0.1:8787/api/programs');
  const host=new URL(endpoint).hostname;
  if(!['127.0.0.1','localhost','[::1]'].includes(host)&&!flags.includes('--allow-remote'))
    throw Error('Refusing remote URL without --allow-remote');
  const snapshot=JSON.parse(await readFile(file,'utf8'));
  const result=await audit(snapshot,endpoint,{onResult:r=>{
    console.log(r.name+': '+r.actual+'/'+r.expected+' pages='+r.pages+
      ' requests='+r.calls+' ms='+r.durationMs);
    if(r.missing.length)console.log('Missing IDs:',r.missing.slice(0,20));
    if(r.extra.length)console.log('Unexpected IDs:',r.extra.slice(0,20));
  }});
  console.log(result.passed?'PASS: snapshot ID parity':'FAIL: missing or unexpected IDs');
  if(!result.passed)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
