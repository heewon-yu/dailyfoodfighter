import {createHmac, timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';

const eventCache = new Map();
function derive(key, purpose) {
  return createHmac('sha256', key).update(purpose).digest().readUInt32BE() || 1;
}

export function marketFeed(session, through, after = 0) {
  let events = eventCache.get(session.session_id);
  if (!events) {
    const market = globalThis.ScalpMarket.createMarket(session.server_seed, derive(session.market_key, 'events'));
    events = market.events;
    if (eventCache.size >= 32) eventCache.delete(eventCache.keys().next().value);
    eventCache.set(session.session_id, events);
  }
  return {
    seeds: Array.from({length: Math.max(0, through - after)}, (_, index) => derive(session.market_key, 'tick:' + (after + index + 1))),
    events: events.filter(event => event.tick > after && event.tick <= through),
  };
}

export function safeSecret(actual, expected) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
