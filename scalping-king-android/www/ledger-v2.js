(function () {
  'use strict';

  const risk = ScalpRisk;
  const validQuantity = qty => Number.isSafeInteger(qty) && qty >= 1 && qty <= 99999;
  const fee = gross => Math.ceil(gross / 2000);
  const cost = gross => gross + fee(gross);

  function createAccount(size) {
    return {...risk.initialLedger(),
      positions: Array.from({length: size}, () => ({qty: 0, cost: 0, principal: 0, creditQty: 0, creditCost: 0, realized: 0})),
      realized: 0, creditUsed: 0, trades: [], pending: [], orders: [], nextOrderId: 1,
      unlocks: {credit: false, emergency: false, stop: false},
      stops: Array(size).fill(null), queued: Array(size).fill(null),
      margin: null, marginSince: null, marginAt: 0, peak: risk.STARTING_EQUITY,
      drawdown: 0, forcedCount: 0, stopCount: 0,
    };
  }

  function reserved(account, field, except) {
    return account.pending.reduce((sum, order) => sum + (order === except ? 0 : order[field] || 0), 0);
  }

  function availableCash(account, except) {
    return account.cash - reserved(account, 'cashReserve', except);
  }

  function availableShares(account, index, except) {
    return account.positions[index].qty - account.pending.reduce((sum, order) =>
      sum + (order !== except && order.index === index && order.side === 'sell' ? order.remaining : 0), 0);
  }

  function availableCreditShares(account, index, except) {
    const reservedCredit = account.pending.reduce((sum, order) =>
      sum + (order !== except && order.index === index && order.creditOnly ? order.remaining : 0), 0);
    return Math.min(availableShares(account, index, except), account.positions[index].creditQty - reservedCredit);
  }

  function markedValue(stocks, account, index = -1, price = 0) {
    return stocks.reduce((sum, stock) => sum + (stock.index === index ? price : stock.price) * account.positions[stock.index].qty, 0);
  }

  function equity(market, account) {
    return risk.equity(account, markedValue(market.stocks, account));
  }

  function collateral(market, account) {
    return Math.max(0, markedValue(market.stocks, account) + account.cash);
  }

  function ratio(market, account) {
    return risk.collateralRatio(collateral(market, account), account.creditDebt);
  }

  function applyFill(stock, account, order, fill) {
    const position = account.positions[stock.index];
    const gross = fill.price * fill.qty;
    const tradeFee = fee(order.gross + gross) - fee(order.gross);
    order.gross += gross;
    order.remaining -= fill.qty;
    order.time = fill.time;
    order.status = order.remaining ? 'partial' : 'filled';
    account.fees += tradeFee;
    let total;
    let profit = 0;
    let emergencyRepayment = 0;
    if (order.side === 'buy') {
      total = gross + tradeFee;
      // Own cash is consumed first. An open buy can only use its own reservation.
      const cash = Math.min(total, order.cashReserve);
      const loan = total - cash;
      order.cashReserve -= cash;
      order.creditReserve -= loan;
      account.cash -= cash;
      account.creditDebt += loan;
      account.creditUsed += loan;
      position.principal += loan;
      if (loan) {
        position.creditQty += fill.qty;
        position.creditCost += total;
      }
      account.everFilledCreditBuy ||= loan > 0;
      position.qty += fill.qty;
      position.cost += total;
      if (order.remaining && order.price !== null) {
        const leftGross = order.remaining * order.price;
        const maxCost = leftGross + fee(order.gross + leftGross) - fee(order.gross);
        order.cashReserve = Math.min(maxCost, order.cashReserve);
        order.creditReserve = maxCost - order.cashReserve;
      }
    } else {
      total = gross - tradeFee;
      const full = fill.qty === position.qty;
      const basis = full ? position.cost : Math.round(position.cost * fill.qty / position.qty);
      // Voluntary sales allocate cash shares first, while forced sales target credit shares.
      const creditQty = (order.type === 'forced' || order.creditOnly) ? Math.min(fill.qty, position.creditQty) :
        Math.max(0, fill.qty - (position.qty - position.creditQty));
      const closesCredit = creditQty === position.creditQty;
      const principal = closesCredit ? position.principal : Math.floor(position.principal * creditQty / position.creditQty);
      const creditCost = closesCredit ? position.creditCost : Math.round(position.creditCost * creditQty / position.creditQty);
      position.creditQty -= creditQty;
      position.creditCost -= creditCost;
      position.qty -= fill.qty;
      position.cost -= basis;
      position.principal -= principal;
      if (!position.qty) account.stops[stock.index] = null;
      const cashForEmergency = creditQty > 0 ? availableCash(account) : 0;
      const settlement = risk.settleSale(account, total, principal, cashForEmergency);
      Object.assign(account, settlement.ledger);
      emergencyRepayment = settlement.emergencyRepayment;
      profit = total - basis;
      position.realized += profit;
      account.realized += profit;
    }
    const trade = {index: stock.index, side: order.side, qty: fill.qty, time: fill.time,
      average: fill.price, fee: tradeFee, total, profit, type: order.type, emergencyRepayment};
    account.trades.unshift(trade);
    return trade;
  }

  function snapshot(market, account) {
    const marked = markedValue(market.stocks, account);
    const unrealized = marked - account.positions.reduce((sum, position) => sum + position.cost, 0);
    const changes = market.stocks.map(stock => {
      const {qty, cost: basis, realized} = account.positions[stock.index];
      return {name: stock.name, profit: stock.price * qty - basis + realized};
    }).sort((a, b) => b.profit - a.profit);
    return {initial: risk.STARTING_EQUITY, realized: account.realized, unrealized,
      bestRate: (account.peak / risk.STARTING_EQUITY - 1) * 100, drawdown: account.drawdown,
      creditUsed: account.creditUsed, creditDebt: account.creditDebt,
      emergencyUsed: account.emergencyUsed ? risk.EMERGENCY_FUND : 0, emergencyRepaid: account.emergencyRepaid,
      emergencyDebt: account.emergencyDebt, forcedCount: account.forcedCount, stopCount: account.stopCount,
      bestStock: changes.find(item => item.profit > 0), worstStock: changes.findLast(item => item.profit < 0)};
  }

  function markPerformance(market, account) {
    const net = equity(market, account);
    account.peak = Math.max(account.peak, net);
    account.drawdown = Math.max(account.drawdown, (account.peak - net) / account.peak * 100);
  }

  globalThis.ScalpLedger = {validQuantity, fee, cost, createAccount, reserved, availableCash,
    availableShares, availableCreditShares, markedValue, equity, collateral, ratio, applyFill, snapshot, markPerformance};
}());
