(function () {
  'use strict';

  const book = ScalpMicrostructure;
  const risk = ScalpRisk;
  const ledger = ScalpLedger;
  const missingOrder = '이미 체결되었거나 취소된 주문이에요.';
  const haltedMessage = 'VI 거래정지 중이에요. 재개 후 주문할 수 있어요.';
  const format = new Intl.NumberFormat('ko-KR');

  function isHalted(stock) {
    return book.isHalted(stock.depth, stock.market.time);
  }

  function notify(market, message, warning = false) {
    market.notices.unshift({message, warning, time: market.time});
    if (market.notices.length > 20) market.notices.pop();
  }

  function priceStatus(stock) {
    if (stock.price === stock.depth.limits.upper) return '상한가';
    if (stock.price === stock.depth.limits.lower) return '하한가';
    return '';
  }

  function updateDepth(stock) {
    stock.book.asks = book.aggregate(stock.depth, 'sell').slice(0, 5);
    stock.book.bids = book.aggregate(stock.depth, 'buy').slice(0, 5);
  }

  function removePending(account, order, status, time) {
    const index = account.pending.indexOf(order);
    if (index >= 0) account.pending.splice(index, 1);
    order.status = status;
    order.time = time;
    order.cashReserve = order.creditReserve = 0;
  }

  function rememberMargin(market, account) {
    if (!account) return;
    const ratio = ledger.ratio(market, account);
    if (ratio >= risk.MAINTENANCE_RATIO) {
      account.margin = null;
      account.marginSince = null;
    } else if (account.marginSince === null) {
      account.marginSince = market.time;
      account.marginAt = market.time;
      notify(market, '담보비율 150% 미달 · 반대매매까지 30초');
    }
  }

  function loanAllowed(stock, account, qty, mark, cash, loan) {
    if (!loan) return true;
    const {market} = stock;
    const postCollateral = ledger.markedValue(market.stocks, account, stock.index, mark) +
      qty * mark + account.cash - cash - account.emergencyDebt;
    return postCollateral * 2 >= (account.creditDebt + loan) * 3;
  }

  function submit(stock, input, order = null) {
    const {market} = stock;
    const account = market.account;
    const fills = [];
    let triggered = false;
    const result = book.submit(stock.depth, input, market.time, fill => {
      const before = priceStatus(stock);
      stock.price = fill.price;
      const first = stock.depth.volume === fill.qty;
      stock.high = first ? fill.price : Math.max(stock.high, fill.price);
      stock.low = first ? fill.price : Math.min(stock.low, fill.price);
      stock.volume = stock.depth.volume;
      stock.pointFill(fill);
      const player = order || stock.playerOrders.get(fill.makerOrderId);
      if (player) {
        const trade = ledger.applyFill(stock, account, player, fill);
        fills.push(trade);
        if (trade.emergencyRepayment) notify(market, '긴급자금대출 ' + format.format(trade.emergencyRepayment) + '원 자동 상환');
        if (!player.remaining) {
          stock.playerOrders.delete(fill.makerOrderId);
          removePending(account, player, 'filled', market.time);
        }
      }
      const after = priceStatus(stock);
      if (before !== after) notify(market, stock.name + ' ' + (after ? after + ' 진입' : before + ' 이탈'));
      if (account) {
        rememberMargin(market, account);
        ledger.markPerformance(market, account);
      }
      if (market.time >= stock.viReadyAt) {
        const fast = Math.abs(stock.price / stock.fastAnchor - 1);
        const slow = Math.abs(stock.price / stock.slowAnchor - 1);
        if (fast >= .065 || slow >= .12) {
          triggered = true;
        }
      }
    }, (maker, fillQty) => {
      const player = stock.playerOrders.get(maker.id);
      if (!player?.creditReserve) return true;
      const gross = fillQty * maker.price;
      const amount = gross + ledger.fee(player.gross + gross) - ledger.fee(player.gross);
      const cash = Math.min(amount, player.cashReserve);
      if (loanAllowed(stock, account, fillQty, maker.price, cash, amount - cash)) return true;
      stock.playerOrders.delete(maker.id);
      removePending(account, player, 'canceled', market.time);
      notify(market, stock.name + ' 신용 주문 취소 · 체결 전 담보비율 미달');
      return false;
    });
    if (triggered) {
      book.halt(stock.depth, market.time);
      stock.wasHalted = true;
      stock.viReadyAt = stock.depth.haltedUntil + 25;
      notify(market, stock.name + " VI 발동 · 10초 거래정지");
    }
    updateDepth(stock);
    return {...result, trade: fills.at(-1)};
  }

  function initialize(stock, market, random, pointFill) {
    const tick = stock.reference < 50000 ? 50 : 100;
    Object.assign(stock, {market, pointFill, depth: book.createBook(stock.reference, tick),
      playerOrders: new Map(), book: {}, viReadyAt: 5,
      fastAnchor: stock.reference, slowAnchor: stock.reference, wasHalted: false});
    for (const [side, direction] of [['buy', -1], ['sell', 1]]) {
      for (let i = 1; i <= 8; i++) {
        book.submit(stock.depth, {side, price: stock.reference + direction * tick * i,
          qty: 250 + Math.floor(random() * 550) + i * 90});
      }
    }
    updateDepth(stock);
  }

  function participant(stock, random) {
    const {market, depth} = stock;
    // Consume the same random draws even during VI or after player fills.
    const [choice, size, cancel, offset, counter, jump] = Array.from({length: 6}, random);
    if (isHalted(stock)) {
      stock.wasHalted = true;
      return;
    }
    if (stock.wasHalted) {
      stock.wasHalted = false;
      stock.fastAnchor = stock.slowAnchor = stock.price;
      notify(market, stock.name + ' VI 해제 · 거래 재개');
    }
    if (market.tick % 6 === 1) stock.fastAnchor = stock.price;
    if (market.tick % 40 === 1) stock.slowAnchor = stock.price;
    const flow = market.tick < stock.flowUntil ? stock.flowDirection : 0;
    const drift = stock.shock - (stock.price / stock.reference - 1) * .48;
    const trend = flow ? flow * .36 : Math.max(-.34, Math.min(.34, drift));
    const side = choice < .5 + trend ? 'buy' : 'sell';
    const queue = side === 'buy' ? depth.asks : depth.bids;
    const stale = queue.find(order => order.owner === 'npc' &&
      (Math.abs(order.price - stock.price) > depth.tick * 13 || cancel < .24));
    if (stale) book.cancel(depth, stale.id, market.time);
    if (queue.length) {
      const burst = jump < .018 || (Math.abs(stock.shock) > .15 && jump < .10) || (flow && jump < .44);
      const qty = Math.round((70 + size * 480 + (burst ? 1700 + counter * 4700 : 0)) * stock.volatility);
      submit(stock, {side, qty});
    }
    if (isHalted(stock)) return;
    // Quote placement and cancellation leave the last traded price unchanged.
    // At a limit, trend-followers queue at the limit while opposite flow can exit it.
    for (const [quoteSide, direction] of [['buy', -1], ['sell', 1]]) {
      const atLimit = stock.price === (direction < 0 ? depth.limits.upper : depth.limits.lower);
      const queue = direction < 0 ? depth.bids : depth.asks;
      const best = queue[0]?.price;
      const step = best === undefined ? 1 : 1 + Math.floor(offset * 7);
      const price = atLimit && counter < .68 ? stock.price :
        Math.max(depth.limits.lower, Math.min(depth.limits.upper, stock.price + direction * depth.tick * step));
      const depthAtPrice = queue.filter(order => order.owner === 'npc' && order.price === price);
      if (depthAtPrice.length < (atLimit ? 8 : 2)) {
        submit(stock, {side: quoteSide, price, qty: 240 + Math.round(size * 490 + counter * 380)});
      }
      if (isHalted(stock)) break;
    }
  }

  function quoteOrder(stock, side, qty) {
    if (!ledger.validQuantity(qty)) return null;
    let remaining = qty;
    let gross = 0;
    let mark = Infinity;
    for (const level of side === 'buy' ? stock.depth.asks : stock.depth.bids) {
      if (level.owner === 'player') break;
      const take = Math.min(remaining, level.remaining);
      gross += take * level.price;
      mark = Math.min(mark, level.price);
      remaining -= take;
      if (!remaining) break;
    }
    const filled = qty - remaining;
    const fee = ledger.fee(gross);
    return filled ? {qty: filled, gross, mark, fee, average: gross / filled,
      total: gross + (side === 'buy' ? fee : -fee)} : null;
  }

  function limitEstimate(qty, limit) {
    if (!ledger.validQuantity(qty) || !Number.isSafeInteger(limit) || limit < 1) return null;
    const gross = qty * limit;
    return {buy: ledger.cost(gross), sell: gross - ledger.fee(gross)};
  }

  function maxOrder(stock, account, side, limit, percent = 100) {
    if (isHalted(stock)) return 0;
    if (limit !== undefined && !book.validPrice(stock.depth, limit)) return 0;
    const liquidity = limit !== undefined ? 99999 :
      quoteOrder(stock, side, 99999)?.qty || 0;
    if (side === 'sell') return Math.min(liquidity, Math.floor(ledger.availableShares(account, stock.index) * percent / 100));
    const cash = ledger.availableCash(account) * percent / 100;
    if (limit !== undefined) return Math.min(99999, Math.floor(cash * 2000 / (limit * 2001)));
    let low = 0;
    let high = liquidity;
    while (low < high) {
      const qty = Math.ceil((low + high) / 2);
      if (quoteOrder(stock, side, qty).total <= cash) low = qty;
      else high = qty - 1;
    }
    return low;
  }

  function portfolioBudget(account, percent, except) {
    const target = risk.investmentTarget(percent);
    const invested = account.positions.reduce((sum, position) => sum + position.cost, 0);
    const pending = ledger.reserved(account, 'cashReserve', except) + ledger.reserved(account, 'creditReserve', except);
    return {target, budget: Math.max(0, target.total - invested - pending),
      cash: Math.max(0, ledger.availableCash(account, except)),
      credit: Math.max(0, Math.min(risk.availableCredit(account, ledger.reserved(account, 'creditReserve', except)),
        target.newCreditTarget - account.creditDebt - ledger.reserved(account, 'creditReserve', except)))};
  }

  function financing(stock, account, percent, quote, mark, except, budget) {
    const total = quote.total;
    if (percent === null) {
      return total <= ledger.availableCash(account, except) ? {cashReserve: total, creditReserve: 0} : null;
    }
    const cash = Math.min(budget.cash, total);
    const loan = total - cash;
    if (total > budget.budget || loan > budget.credit || !loanAllowed(stock, account, quote.qty, mark, cash, loan)) return null;
    return {cashReserve: cash, creditReserve: loan};
  }

  function creditQuote(stock, account, percent, limit) {
    const budget = portfolioBudget(account, percent);
    const quantity = limit === undefined ? quoteOrder(stock, 'buy', 99999)?.qty || 0 :
      book.validPrice(stock.depth, limit) ? 99999 : 0;
    let low = 0;
    let high = isHalted(stock) ? 0 : quantity;
    let best = {qty: 0, cashReserve: 0, creditReserve: 0, expectedRatio: ledger.ratio(stock.market, account)};
    while (low < high) {
      const qty = Math.ceil((low + high) / 2);
      const quote = limit === undefined ? quoteOrder(stock, 'buy', qty) : {qty, gross: qty * limit, total: ledger.cost(qty * limit), mark: Math.min(limit, stock.price, stock.depth.asks[0]?.price ?? limit)};
      const plan = financing(stock, account, percent, quote, quote.mark, null, budget);
      if (!plan) {
        high = qty - 1;
      } else {
        low = qty;
        const assets = ledger.markedValue(stock.market.stocks, account, stock.index, quote.mark) +
          qty * quote.mark + account.cash - plan.cashReserve - account.emergencyDebt;
        best = {qty, ...plan, expectedRatio: risk.collateralRatio(Math.max(0, assets), account.creditDebt + plan.creditReserve)};
      }
    }
    return {...budget, ...best};
  }

  function validate(stock, account, side, qty, price, percent, except, type) {
    if (isHalted(stock)) return {error: haltedMessage};
    if (!ledger.validQuantity(qty)) return {error: '수량을 1~99,999주 사이의 정수로 입력하세요.'};
    if (price !== null && !book.validPrice(stock.depth, price)) return {error: '가격제한폭과 ' + stock.depth.tick + '원 호가단위를 확인하세요.'};
    if (side === 'sell' && type !== 'forced' && type !== 'stop' && account.queued[stock.index])
      return {error: '자동 청산이 대기 중이에요.'};
    if (side === 'sell') return qty <= ledger.availableShares(account, stock.index, except) ? {} :
      {error: '매도 가능 수량이 부족해요. 미체결 주문도 확인해 주세요.'};
    if (percent !== null && !account.unlocks.credit) return {error: '신용매수가 잠겨 있어요.'};
    const quote = price === null ? quoteOrder(stock, side, qty) : {qty, gross: price * qty, total: ledger.cost(price * qty), mark: Math.min(price, stock.price, stock.depth.asks[0]?.price ?? price)};
    if (!quote) return {error: '매도 호가 잔량이 없어요.'};
    const budget = percent === null ? null : portfolioBudget(account, percent, except);
    return financing(stock, account, percent, quote, quote.mark, except, budget) ||
      {error: percent === null ? '주문 가능 현금이 부족해요.' : '투자 목표, 신용한도 또는 담보비율을 확인하세요.'};
  }

  function send(stock, account, order) {
    const result = submit(stock, {side: order.side, qty: order.remaining, price: order.price, owner: 'player'}, order);
    if (result.resting) {
      order.bookId = result.id;
      stock.playerOrders.set(result.id, order);
      account.pending.push(order);
    } else {
      removePending(account, order, order.remaining ? 'canceled' : 'filled', stock.market.time);
    }
    return {order, trade: result.trade};
  }

  function place(stock, account, side, qty, price, type, percent = null) {
    if (price !== null && account.pending.length >= 30 && type === 'limit')
      return {error: '미체결 주문은 최대 30건까지 보관할 수 있어요.'};
    const checked = validate(stock, account, side, qty, price, percent, null, type);
    if (checked.error) return checked;
    if (price === null && !quoteOrder(stock, side, qty)) return {error: '체결 가능한 상대 호가가 없어요.'};
    stock.market.account = account;
    const order = {id: account.nextOrderId++, index: stock.index, side, type, price, qty, remaining: qty,
      percent, gross: 0, status: 'pending', time: stock.market.time, amendments: 0, ...checked};
    account.orders.unshift(order);
    return send(stock, account, order);
  }

  function executeOrder(stock, account, side, qty) {
    return place(stock, account, side, qty, null, 'market');
  }

  function placeLimit(stock, account, side, qty, price) {
    return place(stock, account, side, qty, price, 'limit');
  }

  function executeCredit(stock, account, percent, limit) {
    const {qty} = creditQuote(stock, account, percent, limit);
    if (!qty) return {error: '목표 비율 내에서 담보 및 자금 조건을 충족하는 수량이 없어요.'};
    return place(stock, account, 'buy', qty, limit ?? null, limit === undefined ? 'market' : 'limit', percent);
  }

  function cancelLimit(market, account, id, allowAuto = false) {
    const order = account.pending.find(item => item.id === id);
    if (!order) return {error: missingOrder};
    const stock = market.stocks[order.index];
    if (isHalted(stock)) return {error: haltedMessage};
    if (!allowAuto && (order.type === 'forced' || order.type === 'stop')) return {error: '자동 청산 주문이에요.'};
    book.cancel(stock.depth, order.bookId, market.time);
    stock.playerOrders.delete(order.bookId);
    removePending(account, order, 'canceled', market.time);
    updateDepth(stock);
    return {order};
  }

  function amendLimit(market, account, id, qty, price) {
    const order = account.pending.find(item => item.id === id);
    if (!order) return {error: missingOrder};
    if (order.type !== 'limit') return {error: '자동 청산 주문이에요.'};
    if (qty === order.remaining && price === order.price) return {error: '바뀐 지정가나 수량을 입력하세요.'};
    const filled = order.qty - order.remaining;
    if (!ledger.validQuantity(filled + qty)) return {error: '기존 체결 수량을 합쳐 99,999주까지 가능해요.'};
    const stock = market.stocks[order.index];
    const checked = validate(stock, account, order.side, qty, price, order.percent, order, order.type);
    if (checked.error) return checked;
    cancelLimit(market, account, id);
    Object.assign(order, checked, {qty: filled + qty, remaining: qty, price, status: filled ? 'partial' : 'pending',
      time: market.time, amendments: order.amendments + 1});
    return send(stock, account, order);
  }

  function expirePending(market, account) {
    const count = account.pending.length;
    for (const order of [...account.pending]) {
      const stock = market.stocks[order.index];
      const queue = order.side === 'buy' ? stock.depth.bids : stock.depth.asks;
      const index = queue.findIndex(item => item.id === order.bookId);
      if (index >= 0) queue.splice(index, 1);
      stock.playerOrders.delete(order.bookId);
      removePending(account, order, 'expired', market.time);
      updateDepth(stock);
    }
    account.queued.fill(null);
    return count;
  }

  function updateRisk(market, account) {
    rememberMargin(market, account);
    if (account.marginSince !== null) {
      account.margin = risk.advanceMarginCall(account.margin, ledger.ratio(market, account), market.time - account.marginAt);
      account.marginAt = market.time;
      for (const seconds of account.margin.newWarnings) notify(market, '반대매매 ' + seconds + '초 전', true);
    }
    const due = account.margin?.liquidationDue;
    for (const stock of market.stocks) {
      const i = stock.index;
      const position = account.positions[i];
      if (!position.qty) {
        account.queued[i] = null;
        continue;
      }
      const threshold = account.stops[i];
      const pending = account.pending.filter(order => order.index === i);
      const activeForced = pending.some(order => order.type === 'forced');
      const activeStop = pending.some(order => order.type === 'stop');
      const forced = due && position.principal > 0 && !activeForced;
      const stop = threshold !== null && (stock.price * position.qty / position.cost - 1) * 100 <= threshold &&
        !activeForced && !activeStop;
      if (forced) account.queued[i] = 'forced';
      else if (stop && !account.queued[i]) account.queued[i] = 'stop';
      if ((!due || ledger.ratio(market, account) >= risk.MAINTENANCE_RATIO) && account.queued[i] === 'forced') account.queued[i] = null;
      const type = account.queued[i];
      if (!type || isHalted(stock)) continue;
      for (const order of pending) if (order.side === 'sell' || type === 'forced') cancelLimit(market, account, order.id, true);
      account.queued[i] = null;
      if (type === 'forced' && ledger.ratio(market, account) >= risk.MAINTENANCE_RATIO) continue;
      const qty = type === 'forced' ? position.creditQty : position.qty;
      const result = place(stock, account, 'sell', Math.min(qty, 99999), stock.depth.limits.lower, type);
      if (result.error) continue;
      if (type === 'forced') account.forcedCount++;
      else account.stopCount++;
      notify(market, stock.name + (type === 'forced' ? ' 반대매매' : ' 로스컷') + ' 주문 제출');
    }
    ledger.markPerformance(market, account);
  }

  globalThis.ScalpEngine = {initialize, participant, submitParticipant: submit, updateRisk, isHalted, priceStatus, notify,
    quoteOrder, maxOrder, limitEstimate, executeOrder, placeLimit, cancelLimit, amendLimit, expirePending, executeCredit, creditQuote};
}());
