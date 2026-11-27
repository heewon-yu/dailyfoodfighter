import assert from 'node:assert/strict';
import test from 'node:test';
import { scanPage } from '../src/lib/page-scan.ts';

const start = {pending:[],cursor:''};
function fixture(total) {
  const calls=[];
  return {
    calls,
    fetchBatch:async (cursor,limit)=>{
      const offset=Number(cursor);
      calls.push([offset,limit]);
      const end=Math.min(total,offset+limit);
      return {items:Array.from({length:end-offset},(_,i)=>({id:String(offset+i)})),
        nextCursor:end<total?String(end):null};
    }
  };
}

test('finds results after an empty 1000-row window without repeating earlier batches',async()=>{
  const source=fixture(1400);
  const opts={...source,pageSize:50,maxRows:1000,accept:p=>Number(p.id)>=1000};
  const first=await scanPage({...opts,start});
  assert.equal(first.rowsScanned,1000);
  assert.deepEqual(first.items,[]);
  assert.equal(first.hasMore,true);
  const second=await scanPage({...opts,start:first.position});
  assert.deepEqual(second.items.map(p=>Number(p.id)),Array.from({length:50},(_,i)=>1000+i));
  assert.equal(source.calls.at(-1)[0],1000);
});

test('reuses unconsumed rows on next page without another network request',async()=>{
  const source=fixture(180);
  const opts={...source,pageSize:50,maxRows:1000,accept:p=>Number(p.id)>=50};
  const first=await scanPage({...opts,start});
  const second=await scanPage({...opts,start:first.position});
  const third=await scanPage({...opts,start:second.position});
  assert.equal(source.calls.length,2);
  assert.equal(third.hasMore,false);
  assert.deepEqual([first,second,third].flatMap(p=>p.items.map(item=>Number(item.id))),
    Array.from({length:130},(_,i)=>i+50));
});

test('deduplicates priority and previously emitted IDs and stops on an exact final page',async()=>{
  const source=fixture(50);
  const result=await scanPage({...source,start,pageSize:50,maxRows:1000,accept:()=>true,
    initialItems:[{id:'0'},{id:'0'}],excludedIds:new Set(['1'])});
  assert.equal(result.hasMore,false);
  assert.equal(result.items.length,49);
  assert.equal(new Set(result.items.map(p=>p.id)).size,49);
  assert.equal(source.calls.length,1);
});

test('rejects a response that would otherwise repeat the same cursor indefinitely',async()=>{
  await assert.rejects(scanPage({start,pageSize:50,maxRows:1000,accept:()=>true,
    fetchBatch:async()=>({items:[{id:'0'}],nextCursor:''})}),/Invalid pagination cursor/);
});
