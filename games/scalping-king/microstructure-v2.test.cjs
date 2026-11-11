// Run with: node games/scalping-king/microstructure-v2.test.cjs
'use strict';
const assert = require('node:assert/strict');
const m = require('./microstructure-v2.js');

const b = m.createBook(10000);
assert.deepEqual(b.limits,{lower:7000,upper:13000});
assert.equal(m.submit(b,{side:'buy',qty:1000,price:13000,owner:'npc'}).remaining,1000);
assert.equal(m.aggregate(b,'buy')[0].qty,1000);
let r = m.submit(b,{side:'sell',qty:700,price:13000,owner:'player'});
assert.equal(r.filled,700);
assert.equal(m.aggregate(b,'buy')[0].qty,300);
assert.equal(b.last,13000);
r = m.submit(b,{side:'sell',qty:500,price:12850,owner:'npc'});
assert.equal(r.filled,300);
assert.equal(r.remaining,200);
assert.equal(b.last,13000); // no lower bid fill yet; no fake price move.
assert.equal(m.aggregate(b,'sell')[0].qty,200);
m.submit(b,{side:'buy',qty:100,price:12850,owner:'npc'});
assert.equal(b.last,12850); // genuine trade at lower price unlocks last print
assert.equal(b.volume,1100);
assert.equal(b.value,1000*13000+100*12850);

const down = m.createBook(10000);
m.submit(down,{side:'sell',qty:1000,price:7000});
r=m.submit(down,{side:'buy',qty:1100,price:7050});
assert.equal(r.filled,1000);
assert.equal(r.remaining,100);
assert.equal(down.last,7000);
assert.equal(m.aggregate(down,'buy')[0].qty,100);
m.submit(down,{side:'sell',qty:40,price:7050});
assert.equal(down.last,7050); // higher ask executed and price leaves lower limit

const vi = m.createBook(10000);
m.submit(vi,{side:'sell',qty:12,price:10100});
m.halt(vi,22,10);
assert.equal(m.submit(vi,{side:'buy',qty:5,price:10100},23).error,'VI_HALT');
assert.equal(m.cancel(vi,1,25).error,'VI_HALT');
assert.equal(m.submit(vi,{side:'buy',qty:5,price:10100},32).filled,5);
assert.equal(vi.volume,5);
assert.equal(m.submit(vi,{side:'buy',qty:1,price:14000}).error,'PRICE_BAND');
assert.equal(m.strength(vi),Infinity);
assert.equal(m.disclosure('new_contract',0).direction,1);
assert.throws(()=>m.disclosure('trading_halt',0),RangeError);

console.log('ScalpMicrostructure v2 order book, limit and halt tests passed');
