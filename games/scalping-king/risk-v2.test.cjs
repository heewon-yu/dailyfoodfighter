// Run: node games/scalping-king/risk-v2.test.cjs
'use strict';
const assert = require('node:assert/strict');
const risk = require('./risk-v2.js');

assert.deepEqual(risk.investmentTarget(100), { percent: 100, total: 100e6, ownCapital: 100e6, newCreditTarget: 0 });
assert.deepEqual(risk.investmentTarget(200), { percent: 200, total: 200e6, ownCapital: 100e6, newCreditTarget: 100e6 });
assert.deepEqual(risk.investmentTarget(300), { percent: 300, total: 300e6, ownCapital: 100e6, newCreditTarget: 200e6 });
assert.throws(() => risk.investmentTarget(301), RangeError);
assert.equal(risk.availableCredit({creditDebt: 75e6}, 25e6), 100e6);
assert.equal(risk.collateralRatio(300e6, 200e6), 150);
assert.equal(risk.collateralRatio(285e6, 200e6), 142.5);
assert.equal(risk.advanceMarginCall(null, 150, 30).liquidationDue, false);
let countdown = risk.advanceMarginCall(null, 149.9, 19);
assert.deepEqual(countdown.newWarnings, []);
countdown = risk.advanceMarginCall(countdown, 149.9, 1);
assert.deepEqual(countdown.newWarnings, [10]);
countdown = risk.advanceMarginCall(countdown, 149.9, 5);
assert.deepEqual(countdown.newWarnings, [5]);
countdown = risk.advanceMarginCall(countdown, 149.9, 2);
assert.deepEqual(countdown.newWarnings, [3]);
countdown = risk.advanceMarginCall(countdown, 149.9, 3);
assert.equal(countdown.liquidationDue, true);
assert.equal(risk.advanceMarginCall(countdown, 150, 0).belowSeconds, 0);

const start = risk.initialLedger();
assert.equal(risk.canUseEmergency(start), false);
const credit = {...start, creditDebt: 100e6, everFilledCreditBuy: true};
const funded = risk.issueEmergency(credit);
assert.equal(funded.cash, 150e6);
assert.equal(funded.emergencyDebt, 50e6);
assert.equal(risk.canUseEmergency(funded), false);
assert.equal(risk.equity(funded, 100e6), risk.equity(credit, 100e6));

const sold = risk.settleSale(funded, 60e6, 35e6);
assert.equal(sold.creditRepayment, 35e6);
assert.equal(sold.emergencyRepayment, 25e6);
assert.equal(sold.ledger.creditDebt, 65e6);
assert.equal(sold.ledger.emergencyDebt, 25e6);
assert.equal(sold.ledger.cash, 150e6);
const loss = risk.settleSale({...credit, cash: 0}, 20e6, 30e6);
assert.equal(loss.creditShortfall, 10e6);
assert.equal(loss.ledger.creditDebt, 80e6);

assert.equal(risk.clampPrice(10_000, 15_000), 13_000);
assert.equal(risk.clampPrice(10_000, 5_000), 7_000);
console.log('ScalpRisk v2 pure-rule tests passed');
