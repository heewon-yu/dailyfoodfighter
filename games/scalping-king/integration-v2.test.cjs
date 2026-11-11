'use strict';

const assert = require('node:assert/strict');
for (const file of ['risk-v2', 'microstructure-v2', 'ledger-v2', 'engine-v2', 'market', 'reward-v2']) require('./' + file + '.js');
const game = globalThis.ScalpMarket;
const book = globalThis.ScalpMicrostructure;
const risk = globalThis.ScalpRisk;
const ledger = globalThis.ScalpLedger;

function fixture(seed = 5) {
  const market = game.createMarket(seed);
  const account = game.createAccount();
  market.account = account;
  return {market, account, stock: market.stocks[0]};
}

function clearNpc(stock) {
  for (const order of [...stock.depth.asks, ...stock.depth.bids]) {
    if (order.owner === 'npc') book.cancel(stock.depth, order.id, stock.market.time);
  }
}

function npc(stock, side, qty, price = null) {
  return game.submitParticipant(stock, {side, qty, price});
}

function checkAccounting(market, account) {
  assert.ok(ledger.availableCash(account) >= 0);
  assert.ok(account.creditDebt + ledger.reserved(account, 'creditReserve') <= risk.MAX_CREDIT);
  assert.ok(account.positions.reduce((sum, item) => sum + item.principal, 0) <= account.creditDebt);
  for (const stock of market.stocks) {
    assert.ok(ledger.availableShares(account, stock.index) >= 0);
    assert.equal(stock.price, stock.depth.last);
    assert.equal(stock.volume, stock.depth.trades.reduce((sum, trade) => sum + trade.qty, 0));
    assert.equal(stock.depth.value, stock.depth.trades.reduce((sum, trade) => sum + trade.qty * trade.price, 0));
    assert.equal(stock.depth.aggressiveBuyVolume + stock.depth.aggressiveSellVolume, stock.volume);
    assert.ok(stock.depth.trades.every(trade => book.validPrice(stock.depth, trade.price)));
    for (const candle of stock.series[1].filter(bar => bar.time >= 0)) {
      const trades = stock.depth.trades.filter(trade => Math.floor(Math.max(0, trade.time - .001)) === candle.time);
      assert.equal(candle.volume, trades.reduce((sum, trade) => sum + trade.qty, 0));
      if (!trades.length) continue;
      assert.equal(candle.open, trades[0].price);
      assert.equal(candle.close, trades.at(-1).price);
      assert.equal(candle.high, Math.max(...trades.map(trade => trade.price)));
      assert.equal(candle.low, Math.min(...trades.map(trade => trade.price)));
    }
    assert.ok(!stock.depth.asks.length || !stock.depth.bids.length || stock.depth.bids[0].price < stock.depth.asks[0].price);
  }
  const result = ledger.snapshot(market, account);
  assert.equal(result.realized + result.unrealized, game.equity(market, account) - risk.STARTING_EQUITY);
}

{
  const {market, account, stock} = fixture();
  const price = stock.reference;
  const tick = stock.depth.tick;
  clearNpc(stock);
  npc(stock, 'buy', 25, price - tick);
  const order = game.placeLimit(stock, account, 'buy', 60, price - tick).order;
  assert.ok(order.cashReserve > 0);
  assert.equal(npc(stock, 'sell', 30).filled, 30);
  assert.equal(order.remaining, 55);
  assert.equal(account.positions[0].qty, 5);
  assert.equal(order.status, 'partial');
  assert.equal(game.amendLimit(market, account, order.id, 20, price - 2 * tick).order.qty, 25);
  assert.equal(game.cancelLimit(market, account, order.id).order.status, 'canceled');
  assert.equal(ledger.availableCash(account), account.cash);
  assert.equal(stock.price, price - tick);
  assert.ok(game.placeLimit(stock, account, 'buy', 1, stock.depth.limits.upper + tick).error);
  checkAccounting(market, account);
}

{
  const {market, account, stock} = fixture();
  clearNpc(stock);
  const price = stock.reference;
  npc(stock, 'sell', 99999, price);
  assert.ok(game.executeCredit(stock, account, 300).error);
  assert.equal(risk.canUseEmergency(account), false);
  account.unlocks.credit = true;
  assert.equal(game.creditQuote(stock, account, 0).qty, 0);
  assert.equal(game.creditQuote(stock, account, 100).creditReserve, 0);
  assert.ok(game.creditQuote(stock, account, 200).creditReserve <= 100e6);
  const plan = game.creditQuote(stock, account, 300);
  assert.ok(plan.expectedRatio >= 150);
  assert.ok(plan.creditReserve > 190e6 && plan.creditReserve <= 200e6);
  const bought = game.executeCredit(stock, account, 300);
  assert.equal(bought.order.status, 'filled');
  assert.ok(account.everFilledCreditBuy);
  assert.equal(risk.canUseEmergency(account), true);
  assert.ok(game.executeCredit(stock, account, 300).error);
  const equity = game.equity(market, account);
  const collateral = ledger.collateral(market, account);
  Object.assign(account, risk.issueEmergency(account));
  assert.equal(game.equity(market, account), equity);
  assert.equal(ledger.collateral(market, account), collateral + 50e6);
  assert.throws(() => risk.issueEmergency(account));
  clearNpc(stock);
  const beforeDebt = account.creditDebt;
  npc(stock, 'buy', 100, price);
  const sale = game.executeOrder(stock, account, 'sell', 120);
  assert.equal(sale.trade.qty, 100);
  assert.equal(sale.order.remaining, 20);
  assert.ok(account.creditDebt < beforeDebt);
  assert.equal(account.emergencyDebt, 0);
  assert.equal(sale.trade.emergencyRepayment, 50e6);
  assert.equal(account.emergencyDebt + account.emergencyRepaid, 50e6);
  checkAccounting(market, account);
}

{
  const {market, account, stock} = fixture();
  const price = stock.reference;
  clearNpc(stock);
  account.unlocks.credit = true;
  const resting = game.executeCredit(stock, account, 300, price).order;
  assert.ok(resting.creditReserve > 190e6);
  assert.equal(account.creditDebt, 0);
  assert.equal(risk.canUseEmergency(account), false);
  const other = game.executeCredit(market.stocks[1], account, 300, market.stocks[1].reference);
  assert.ok(ledger.reserved(account, 'creditReserve') <= risk.MAX_CREDIT);
  if (other.order) game.cancelLimit(market, account, other.order.id);
  book.halt(stock.depth, 0);
  assert.ok(game.cancelLimit(market, account, resting.id).error);
  assert.ok(game.amendLimit(market, account, resting.id, 1, price).error);
  assert.ok(game.placeLimit(stock, account, 'buy', 1, price).error);
  assert.equal(npc(stock, 'sell', 100).error, 'VI_HALT');
  assert.equal(resting.remaining, resting.qty);
  market.time = 10;
  assert.equal(game.cancelLimit(market, account, resting.id).order.status, 'canceled');
  assert.equal(ledger.reserved(account, 'creditReserve'), 0);
  assert.equal(ledger.availableCash(account), risk.STARTING_EQUITY);
}

{
  const {market, account, stock} = fixture();
  const price = stock.reference;
  clearNpc(stock);
  account.unlocks.credit = true;
  npc(stock, 'sell', 99999, price);
  game.executeCredit(stock, account, 300);
  clearNpc(stock);
  market.time = 1;
  npc(stock, 'buy', 500, stock.depth.limits.lower);
  npc(stock, 'sell', 500);
  assert.equal(account.marginSince, 1);
  market.time = 21;
  game.updateRisk(market, account);
  assert.deepEqual(account.margin.newWarnings, [10]);
  market.time = 26;
  game.updateRisk(market, account);
  assert.deepEqual(account.margin.newWarnings, [5]);
  market.time = 28;
  game.updateRisk(market, account);
  assert.deepEqual(account.margin.newWarnings, [3]);
  book.halt(stock.depth, 29);
  market.time = 31;
  account.stops[0] = -3;
  game.updateRisk(market, account);
  assert.equal(account.queued[0], 'forced');
  assert.equal(account.forcedCount, 0);
  assert.equal(account.stopCount, 0);
  market.time = 39;
  game.updateRisk(market, account);
  const forced = account.pending[0];
  assert.equal(forced.type, 'forced');
  assert.equal(forced.price, stock.depth.limits.lower);
  assert.equal(forced.remaining, forced.qty);
  const debt = account.creditDebt;
  npc(stock, 'buy', 150);
  assert.equal(forced.status, 'partial');
  assert.equal(forced.remaining, forced.qty - 150);
  assert.ok(account.creditDebt < debt);
  game.updateRisk(market, account);
  assert.equal(account.forcedCount, 1);
  assert.equal(account.stopCount, 0);
  checkAccounting(market, account);
}

{
  const {market, account, stock} = fixture();
  const price = stock.reference;
  clearNpc(stock);
  npc(stock, 'sell', 100, price);
  game.executeOrder(stock, account, 'buy', 100);
  account.unlocks.stop = true;
  account.stops[0] = -3;
  npc(stock, 'buy', 50, stock.depth.limits.lower);
  npc(stock, 'sell', 50);
  game.updateRisk(market, account);
  assert.equal(account.stopCount, 1);
  assert.equal(account.pending[0].remaining, 100);
  npc(stock, 'buy', 100);
  assert.equal(account.positions[0].qty, 0);
  assert.equal(account.pending.length, 0);
  checkAccounting(market, account);
}

function fullRound(seed) {
  const {market, account} = fixture(seed);
  for (let i = 0; i < game.TOTAL_TICKS; i++) assert.equal(game.stepMarket(market, account), true);
  assert.equal(game.stepMarket(market, account), false);
  assert.equal(market.time, 300);
  assert.equal(market.stocks.length, 10);
  assert.equal(game.equity(market, account), 100e6);
  assert.equal(new Set(market.headlines.filter(item => item.type).map(item => item.type)).size, 5);
  assert.ok(market.headlines.some(item => item.time && !item.type));
  assert.ok(market.stocks.every(stock => stock.volume > 0));
  checkAccounting(market, account);
  return {events: market.headlines, trades: market.stocks.map(stock => stock.depth.trades),
    halts: market.notices.filter(item => item.message.includes('VI')), prices: market.stocks.map(stock => stock.price)};
}

assert.deepEqual(fullRound(71), fullRound(71));
assert.notDeepEqual(fullRound(71).prices, fullRound(72).prices);

(async () => {
  const ad = globalThis.ScalpReward;
  const signal = new AbortController().signal;
  assert.equal(await ad.request(null, 'credit', signal), false);
  assert.equal(await ad.request({isAvailable: () => true, show: async () => { throw Error('network'); }}, 'credit', signal), false);
  const show = outcome => async ({onReward}) => { onReward(); onReward(); return outcome; };
  assert.equal(await ad.request({isAvailable: () => true, show: show('canceled')}, 'stop', signal), false);
  assert.equal(await ad.request({isAvailable: () => true, show: async () => 'completed'}, 'emergency', signal), false);
  assert.equal(await ad.request({isAvailable: key => key === 'stop', show: show('completed')}, 'credit', signal), false);
  assert.equal(await ad.request({isAvailable: key => key === 'stop', show: show('completed')}, 'stop', signal), true);
  console.log('Scalping King v2 integrated market, order ledger, VI, risk, emergency and reward tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
