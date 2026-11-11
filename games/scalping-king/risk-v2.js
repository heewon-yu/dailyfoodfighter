/* Scalping King v2: accounting and risk rules.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ScalpRisk = api;
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  const STARTING_EQUITY = 100_000_000;
  const MAX_CREDIT = 200_000_000;
  const EMERGENCY_FUND = 50_000_000;
  const MAINTENANCE_RATIO = 150;
  const LIQUIDATION_DELAY_SECONDS = 30;
  const WARN_AT_SECONDS = Object.freeze([10, 5, 3]);
  const VI_HALT_SECONDS = 10;
  const MIN_RATIO = 0;
  const MAX_RATIO = 300;

  function finiteNonnegative(value, field) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(field + ' must be a nonnegative finite number');
    return value;
  }

  function initialLedger() {
    return {
      startingEquity: STARTING_EQUITY,
      cash: STARTING_EQUITY,
      creditDebt: 0,
      emergencyDebt: 0,
      emergencyUsed: false,
      everFilledCreditBuy: false,
      emergencyRepaid: 0,
      fees: 0,
    };
  }

  function investmentTarget(percent, startingEquity = STARTING_EQUITY) {
    if (!Number.isFinite(percent) || percent < MIN_RATIO || percent > MAX_RATIO) {
      throw new RangeError('investment percent must be between 0 and 300');
    }
    finiteNonnegative(startingEquity, 'startingEquity');
    const total = startingEquity * percent / 100;
    return {
      percent,
      total,
      ownCapital: Math.min(startingEquity, total),
      newCreditTarget: Math.max(0, total - startingEquity),
    };
  }

  function availableCredit(ledger, reservedCredit = 0) {
    finiteNonnegative(ledger.creditDebt, 'creditDebt');
    finiteNonnegative(reservedCredit, 'reservedCredit');
    return Math.max(0, MAX_CREDIT - ledger.creditDebt - reservedCredit);
  }

  // Credit eligibility uses ACTUAL fills, not whether an ad was viewed.
  function canUseEmergency(ledger) {
    return ledger.everFilledCreditBuy === true && ledger.emergencyUsed !== true;
  }

  function issueEmergency(ledger) {
    if (!canUseEmergency(ledger)) throw new Error('Emergency funding not eligible or already used');
    return {
      ...ledger,
      cash: ledger.cash + EMERGENCY_FUND,
      emergencyDebt: ledger.emergencyDebt + EMERGENCY_FUND,
      emergencyUsed: true,
    };
  }

  function equity(ledger, holdingsMarketValue) {
    finiteNonnegative(holdingsMarketValue, 'holdingsMarketValue');
    return ledger.cash + holdingsMarketValue - ledger.creditDebt - ledger.emergencyDebt;
  }

  function returnPercent(ledger, holdingsMarketValue) {
    return (equity(ledger, holdingsMarketValue) / ledger.startingEquity - 1) * 100;
  }

  // Underlying pledged assets and eligible collateral must be identified explicitly.
  // This utility NEVER treats a newly borrowed emergency loan as free equity.
  function collateralRatio(eligibleCollateralValue, creditDebt) {
    finiteNonnegative(eligibleCollateralValue, 'eligibleCollateralValue');
    finiteNonnegative(creditDebt, 'creditDebt');
    return creditDebt === 0 ? Infinity : eligibleCollateralValue / creditDebt * 100;
  }

  function advanceMarginCall(previous, ratio, elapsedGameSeconds, maintenance = MAINTENANCE_RATIO) {
    if (typeof ratio !== 'number' || Number.isNaN(ratio)) throw new TypeError('invalid ratio');
    finiteNonnegative(elapsedGameSeconds, 'elapsedGameSeconds');
    const last = previous || {belowSeconds: 0, warningsIssued: [], liquidationDue: false};
    if (ratio >= maintenance) return {belowSeconds: 0, warningsIssued: [], newWarnings: [], liquidationDue: false};
    const before = last.belowSeconds;
    const belowSeconds = Math.min(LIQUIDATION_DELAY_SECONDS, before + elapsedGameSeconds);
    const previousWarnings = new Set(last.warningsIssued || []);
    const newWarnings = WARN_AT_SECONDS.filter(remaining =>
      before < LIQUIDATION_DELAY_SECONDS - remaining &&
      belowSeconds >= LIQUIDATION_DELAY_SECONDS - remaining &&
      !previousWarnings.has(remaining));
    return {
      belowSeconds,
      warningsIssued: [...previousWarnings, ...newWarnings],
      newWarnings,
      liquidationDue: belowSeconds >= LIQUIDATION_DELAY_SECONDS,
    };
  }

  // Sell proceeds are net of fees. The credit principal tied to the SOLD shares
  // has priority; only the residual amount repays emergency debt.
  // The caller must update positions and realized profit in the SAME transaction.
  function settleSale(ledger, netProceeds, principalRequiredForSoldShares = 0) {
    finiteNonnegative(netProceeds, 'netProceeds');
    finiteNonnegative(principalRequiredForSoldShares, 'principalRequiredForSoldShares');
    if (principalRequiredForSoldShares > ledger.creditDebt) throw new Error('repayment exceeds credit debt');
    const creditRepayment = Math.min(netProceeds, principalRequiredForSoldShares);
    const emergencyRepayment = Math.min(
      Math.max(0, netProceeds - creditRepayment), ledger.emergencyDebt);
    return {
      ledger: {
        ...ledger,
        cash: ledger.cash + netProceeds - creditRepayment - emergencyRepayment,
        creditDebt: ledger.creditDebt - creditRepayment,
        emergencyDebt: ledger.emergencyDebt - emergencyRepayment,
        emergencyRepaid: (ledger.emergencyRepaid ?? 0) + emergencyRepayment,
      },
      creditRepayment,
      emergencyRepayment,
      creditShortfall: principalRequiredForSoldShares - creditRepayment,
    };
  }

  function clampPrice(reference, proposed, tickSize = 50) {
    finiteNonnegative(reference, 'reference');
    if (!(reference > 0) || !Number.isFinite(proposed)) throw new RangeError('invalid price');
    if (!Number.isInteger(tickSize) || tickSize < 1) throw new RangeError('invalid tick size');
    const floor = Math.ceil(reference * 70 / (100 * tickSize)) * tickSize;
    const ceiling = Math.floor(reference * 130 / (100 * tickSize)) * tickSize;
    return Math.min(ceiling, Math.max(floor, Math.round(proposed / tickSize) * tickSize));
  }

  return Object.freeze({
    STARTING_EQUITY, MAX_CREDIT, EMERGENCY_FUND, MAINTENANCE_RATIO,
    LIQUIDATION_DELAY_SECONDS, WARN_AT_SECONDS, VI_HALT_SECONDS,
    investmentTarget, initialLedger, availableCredit, canUseEmergency,
    issueEmergency, equity, returnPercent, collateralRatio, advanceMarginCall,
    settleSale, clampPrice,
  });
});
