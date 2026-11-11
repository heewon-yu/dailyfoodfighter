/* Scalping King v2 isolated persistent order-book prototype.
 * Both NPC and player orders follow the same price-time matching rules.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ScalpMicrostructure = api;
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';
  const VI_SECONDS = 10;
  const DISCLOSURE_TYPES = Object.freeze([
    'rights_offering', 'bonus_issue', 'shareholder_return',
    'earnings_release', 'new_contract',
  ]);
  const integer = (n, field) => {
    if (!Number.isSafeInteger(n) || n < 1) throw new RangeError(field + ' must be a positive integer');
    return n;
  };
  function band(reference, tick = 50) {
    integer(reference, 'reference'); integer(tick, 'tick');
    return { lower: Math.ceil(reference * 70 / (100 * tick)) * tick,
      upper: Math.floor(reference * 130 / (100 * tick)) * tick };
  }
  function createBook(reference, tick = 50) {
    const limits = band(reference, tick);
    return { reference, tick, limits, bids: [], asks: [], nextId: 1,
      seq: 0, haltedUntil: 0, last: reference, volume: 0, value: 0,
      aggressiveBuyVolume: 0, aggressiveSellVolume: 0, trades: [] };
  }
  function sideKey(side) {
    if (side !== 'buy' && side !== 'sell') throw new RangeError('invalid side');
    return side === 'buy' ? 'bids' : 'asks';
  }
  function validPrice(book, price) {
    return Number.isSafeInteger(price) && price >= book.limits.lower &&
      price <= book.limits.upper && price % book.tick === 0;
  }
  function isHalted(book, gameSecond) {
    return gameSecond < book.haltedUntil;
  }
  function halt(book, gameSecond, seconds = VI_SECONDS) {
    if (!Number.isFinite(gameSecond) || gameSecond < 0 || !Number.isFinite(seconds) || seconds <= 0)
      throw new RangeError('invalid halt time');
    book.haltedUntil = Math.max(book.haltedUntil, gameSecond + seconds);
    return book.haltedUntil;
  }
  function append(queue, order, side) {
    queue.push(order);
    queue.sort((a,b) => (side === 'buy' ? b.price - a.price : a.price - b.price) || a.seq - b.seq);
  }
  function submit(book, input, gameSecond = 0, onFill, allowMaker) {
    const {side, qty, price = null, owner = 'npc'} = input;
    sideKey(side); integer(qty, 'qty');
    if (!Number.isFinite(gameSecond) || gameSecond < 0) throw new RangeError('invalid gameSecond');
    if (isHalted(book, gameSecond)) return {error:'VI_HALT', fills:[], remaining:qty};
    if (price !== null && !validPrice(book, price)) return {error:'PRICE_BAND', fills:[], remaining:qty};
    const id = book.nextId++;
    const current = {id, owner, side, price, qty, remaining:qty, seq:book.seq++};
    const opposite = side === 'buy' ? book.asks : book.bids;
    const fills = [];
    let selfBlocked = false;
    while (current.remaining && opposite.length) {
      const resting = opposite[0];
      if (price !== null && (side === 'buy' ? price < resting.price : price > resting.price)) break;
      if (owner !== 'npc' && owner === resting.owner) {
        selfBlocked = true;
        break;
      }
      const units = Math.min(current.remaining, resting.remaining);
      if (allowMaker && !allowMaker(resting, units)) {
        opposite.shift();
        continue;
      }
      current.remaining -= units;
      resting.remaining -= units;
      const trade = {price:resting.price, qty:units, buyer:side==='buy'?owner:resting.owner,
        seller:side==='sell'?owner:resting.owner, aggressor:side, makerOrderId:resting.id,
        takerOrderId:id, time:gameSecond};
      fills.push(trade);
      book.trades.push(trade);
      book.last = resting.price;
      book.volume += units;
      book.value += units * resting.price;
      if (side === 'buy') book.aggressiveBuyVolume += units;
      else book.aggressiveSellVolume += units;
      if (!resting.remaining) opposite.shift();
      onFill?.(trade);
    }
    const resting = Boolean(current.remaining && price !== null && !selfBlocked);
    if (resting) append(book[sideKey(side)], current, side);
    return {id, fills, resting, filled:qty-current.remaining, remaining:current.remaining,
      status:!current.remaining?'filled':!resting?'unfilled':current.remaining===qty?'pending':'partial'};
  }
  function cancel(book, id, gameSecond = 0) {
    if (isHalted(book, gameSecond)) return {error:'VI_HALT'};
    for (const side of ['bids','asks']) {
      const index = book[side].findIndex(o=>o.id===id);
      if (index>=0) return {canceled:book[side].splice(index,1)[0]};
    }
    return {error:'NOT_FOUND'};
  }
  function aggregate(book, side) {
    const levels = new Map();
    for (const o of book[sideKey(side)]) levels.set(o.price,(levels.get(o.price)||0)+o.remaining);
    return [...levels].map(([price,qty])=>({price,qty})).sort((a,b)=>side==='buy'?b.price-a.price:a.price-b.price);
  }
  function strength(book) {
    if (!book.aggressiveSellVolume) return book.aggressiveBuyVolume ? Infinity : null;
    return book.aggressiveBuyVolume / book.aggressiveSellVolume * 100;
  }
  function disclosure(type, index, magnitude = 1) {
    if (!DISCLOSURE_TYPES.includes(type)) throw new RangeError('unsupported disclosure type');
    if (!Number.isSafeInteger(index) || index < 0 || !Number.isFinite(magnitude) || magnitude <= 0)
      throw new RangeError('invalid disclosure');
    // Generate demand/supply *intent*, not a price jump or synthetic fill.
    const directions = {rights_offering:-1, bonus_issue:1, shareholder_return:1,
      earnings_release:0, new_contract:1};
    return {type,index,magnitude,direction:directions[type]};
  }
  return Object.freeze({VI_SECONDS, DISCLOSURE_TYPES, band, createBook, validPrice,
    isHalted, halt, submit, cancel, aggregate, strength, disclosure});
});
