const {createMarket, createAccount, stepMarket, executeOrder, placeLimit, executeCredit,
  amendLimit, cancelLimit, expirePending, equity, randomGenerator, INTERVAL, TOTAL_TICKS} = globalThis.ScalpMarket;
const {canUseEmergency, issueEmergency} = globalThis.ScalpRisk;

export const GAME_VERSION = '20261112.1';
export const FULL_MS = INTERVAL * TOTAL_TICKS;
export const FEATURES = new Set(['credit', 'emergency', 'stop', 'extra']);
const integer = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;

export function commandFrom(input) {
  if (!input || typeof input !== 'object') return null;
  const {kind, stock, side, qty, price = null, percent, order, feature, nonce} = input;
  const validStock = integer(stock, 0, 9);
  const validQty = integer(qty, 1, 99999);
  const validPrice = integer(price, 1, 1000000);
  if (kind === 'order' && validStock && validQty && ['buy', 'sell'].includes(side) && (price === null || validPrice))
    return {kind, stock, side, qty, price};
  if (kind === 'credit' && validStock && integer(percent, 0, 300) && percent % 10 === 0 && (price === null || validPrice))
    return {kind, stock, percent, price};
  if (kind === 'cancel' && integer(order, 1, 1000000)) return {kind, order};
  if (kind === 'amend' && integer(order, 1, 1000000) && validQty && validPrice) return {kind, order, qty, price};
  if (kind === 'stop' && validStock && (percent === null || (Number.isFinite(percent) && percent <= -0.1 && percent >= -99)))
    return {kind, stock, percent};
  if (kind === 'emergency') return {kind};
  if (kind === 'activate' && feature !== 'extra' && FEATURES.has(feature) && typeof nonce === 'string')
    return {kind, feature, nonce};
  return null;
}

export function applyCommand(state, action) {
  const {market, account} = state;
  const stock = market.stocks[action.stock];
  const limit = action.price ?? undefined;
  switch (action.kind) {
    case 'order':
      return limit === undefined ? executeOrder(stock, account, action.side, action.qty) :
        placeLimit(stock, account, action.side, action.qty, limit);
    case 'credit': return executeCredit(stock, account, action.percent, limit);
    case 'cancel': return cancelLimit(market, account, action.order);
    case 'amend': return amendLimit(market, account, action.order, action.qty, action.price);
    case 'activate':
      if (action.feature === 'emergency' && !canUseEmergency(account)) return {error: 'not_eligible'};
      account.unlocks[action.feature] = true;
      return {};
    case 'stop':
      if (!account.unlocks.stop || !account.positions[action.stock].qty) return {error: 'not_eligible'};
      account.stops[action.stock] = action.percent;
      return {};
    case 'emergency':
      if (!account.unlocks.emergency || !canUseEmergency(account)) return {error: 'not_eligible'};
      Object.assign(account, issueEmergency(account));
      return {};
    default: return {error: 'invalid_command'};
  }
}

export function advance(state, target) {
  while (state.market.tick < target) {
    if (state.seeds) {
      const seed = state.seeds[state.market.tick];
      if (!seed) throw new Error('Missing official market tick');
      state.market.random = randomGenerator(seed);
    }
    stepMarket(state.market, state.account);
  }
}

export function replay(seed, commands, finalTick, feed) {
  const state = {market: createMarket(seed), account: createAccount()};
  if (feed) { state.seeds = feed.seeds; state.market.events = feed.events; }
  let previousTick = 0;
  for (const command of commands) {
    if (!integer(command.tick, previousTick, Math.min(finalTick, TOTAL_TICKS - 1))) throw new Error('Invalid stored command tick');
    advance(state, command.tick);
    if (applyCommand(state, command)?.error) throw new Error('Stored command cannot be replayed');
    previousTick = command.tick;
  }
  advance(state, finalTick);
  return state;
}

export function elapsedMs(session) {
  const anchor = Date.parse(session.anchor_at);
  const delta = session.paused ? 0 : Math.max(0, session.server_ms - anchor);
  return Math.min(FULL_MS, session.elapsed_ms + delta);
}
export function tickAt(ms) { return Math.min(TOTAL_TICKS, Math.floor(ms / INTERVAL)); }
export function finalScore(state) {
  expirePending(state.market, state.account);
  return equity(state.market, state.account);
}

export const eligibleForEmergency = canUseEmergency;
