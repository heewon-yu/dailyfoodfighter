# Scalping King v2 — Codex implementation handoff (2026-11-11)

The following handoff records the foundation branch before integration. See the implementation and test commands at the end.

## Status and safety
- Production: https://dailyfoodfighter.com/games/scalping-king/
- Repo: heewon-yu/dailyfoodfighter; production branch `main` NOT modified.
- Work branch: `feature/scalping-king-v2-foundation`.
- Existing game: `games/scalping-king/index.html`, `market.js` (~847 lines), `game.js` (~865), `chart.js`, `style.css`.
- Added `risk-v2.js`: isolated pure leverage, debt, margin countdown and limit-price functions. It is NOT loaded by index.html and NOT integrated; no claim of game deployment or passing tests.
- Before implementation: inspect full files, line-by-line source and existing GitHub Actions/build/deployment workflow; preserve old game and entire blog.

## Confirmed gameplay requirements
1. 5-minute game, 10 selected stocks, starting basis KRW 100,000,000; no short-selling/short covering.
2. Credit feature unlock via verified rewarded ad. Total-investment slider 0–300%; 100% = KRW 100m own capital, 200% = own 100m + 100m credit, 300% = own 100m + 200m credit. Shared outstanding credit cap KRW 200m across stocks, including reserved open orders. All stocks credit eligible. Maintenance collateral ratio 150%; distinguish collateral requirements from initial-margin funding rules.
3. Under 150% continuously for 30 *game-clock* seconds -> sell at daily lower-limit **limit price** (may execute against higher bids). Warn with sound/UI at 10, 5, 3 seconds remaining. Recovery >=150% automatically resets timer. No manual 'recover collateral' button. Deduplicate liquidation and voluntary close orders.
4. Emergency loan: only after actual credit BUY fill; separate rewarded ad, once/round; KRW 50m credited AND equal loan debt incurred (starting capital unchanged). Subsequent actual sell fills auto-repay. Repay mandatory principal attached to the sold credit position first, then emergency debt using remaining net sell proceeds; prevent double counting. Unpaid principal must stay as liability.
5. Loss-cut automatic SELL: rewarded unlock, user-chosen threshold (default -3%), actual liquidity/VI/limit constraints, no guaranteed fill.
6. VI: **game-specific** 10 seconds with new orders, amendments/cancellation and fills blocked for impacted stock; other stocks & master game clock continue. No 30-second auction. Freeze VI timers when rewarded-ad game pause is active. Keep liquidation due state through halts.
7. +/-30% daily limit; accumulate buy queues at upper limit and sell queues at lower limit; release only via real order flow/remaining opposite quotes and trades. No arbitrary random price changes or fake fill. Cancellations affect depth, not last trade price.
8. Keep original news; add exactly five simulated disclosures: paid capital increase, bonus share issue, shareholder returns (buybacks/cancellations/dividends), financial results, new large contracts. Announcement is not automatic share issuance or corporate-action accounting.
9. Derive volume, traded value, aggression strength, rankings from fills; results by net worth after liabilities. Responsive mobile controls.
10. VI, limits, news, disclosures and order book always free. Credit, emergency, loss-cut each need their OWN rewarded ad; allow unlock pre-game/active when eligible. All simulation clocks including margin warning stop while viewing ad. Real AdMob only in native app later; no fake rewarded callback on web. Follow website's actual advertising and privacy rules.
11. Phase plan: web update -> Android package -> AdMob -> Google Play -> iOS app.

## Critical findings from real source
- `market.js:604 stepMarket()` changes `stock.fairPrice` and `stock.price` directly from randomness, before generating random books. This must be redesigned for order-driven price discovery. Existing `bookFor()` and `refreshBooks()` replace depth periodically; cannot preserve limit order queues or correct upper/lower lock as is.
- `market.js:671 sweepBook()` reads the generated depth; `applyFill():734` deducts level qty but does NOT update last trade price, market trade volume or intraday candle. Integrate fills into one authoritative event log.
- `market.js:646 createAccount()` currently has ONLY cash/positions/orders, no debt. `equity():838` simply cash + holdings market value. Integrate ledger and correct fee allocation/positions.
- `market.js:702 maxOrder()` currently only permits orders based on cash/owned shares. 0–300% is **portfolio target**, not percentage of the CURRENT BUY order (nor automatic repeated 3x purchases).
- `game.js:422 syncTime()` derives all ticks from wall time via `performance.now`. `togglePause():461` already adjusts `startedAt` when unpausing. Reuse centralized pause semantics for ads; NEVER fast-forward the market due to the ad/watch or tab background.
- `game.js:147 renderMetrics()` currently assumes `equity` does not subtract debt, and `game.js:173 renderPhase()` enables buy/sell simply based on `phase === live`. Gate order controls additionally for selected stock VI.
- `index.html` currently loads market.js, chart.js, game.js. Adding a new script must be explicit and appropriately versioned AFTER tests.
- `game.js` already has seeded scenarios via query parameter and replayable seed; preserve deterministic random streams.

## Required sequencing
1. Confirm exact source/asset build setup, current tests, Cloudflare Pages route and deployment triggers.
2. Make repeatable Node/browser tests for `risk-v2.js`, especially 100/200/300%, 150% exactly and <150%, 30-second clock transitions, paused clock, emergency payout and partial sales/debt. Verify all test results; fix any discovered defects.
3. Refactor single game simulation clock and order/fill ledger. Centralized order-state machine with price-time priority, book events and partial fills. Preserve existing historical chart representation. Calculate OHLCV from real fills, not random arbitrary displayed prices.
4. Implement per-stock VI 10-second halt and ±30% daily limits with valid tick-size/boundary rules. Avoid race conditions with margin calls and auto loss-cut.
5. Integrate credit accounts and 0–300% investment controls, initial margin guard, collateral 150%, margin warnings/liquidations, debt accounting.
6. Integrate emergency funding and auto-repay + loss-cut orders; normalize duplicate liquidation handling.
7. Implement five disclosures and generated participant orders, aggression-based strength and sorting.
8. Improve mobile UI and accessible risk warnings; implement ad-unlock provider interface with pause/resume, but do NOT dispense fake reward in production.
9. Add integration tests (no fake liquidity, upper/lower exit, VI halted fills, 10/5/3 warnings, margin cover, liabilities, cumulative credit cap, order cancellation, scene pause/resume).
10. Verify production build and preview, then only publish after tests. Ensure unrelated blog SEO and auto-posting unmodified.

## Risk and balance design requiring explicit choices
- Starting 300% leveraged book (KRW 300m assets, KRW 200m credit) is **exactly** 150% when 100% of stock is eligible collateral; any decline triggers the 30s risk timer. Warn player at order entry.
- The leveraged portfolio percentage slider is a target, not necessarily directly the stock purchase quantity. Use existing cash, positions, price and reserved pending orders; preserve credit cap independent of emergency loan.
- Emergency cash must NOT magically repair the 150% margin rule unless genuinely eligible pledged collateral is contributed and all new liabilities are accounted.
- For a credit position sold at a loss with proceeds below outstanding allocated credit principal, retain unpaid shortfall in the credit-debt ledger.
- Beware `risk-v2.js:clampPrice` uses a provisional simple 50-KRW price tick; integrate the game's eventual price grid before committing to a real KRX-like implementation.
- Advertiser SDK rewarded callback must be verified; for web demo use visibly disabled controls or supported provider, no fake success.
- Additional point: public GitHub repo contains the game; secrets must not be added.

## Handoff acceptance criteria
Submit SHA(s), branch, changed filenames, executed tests with results, preview URL if verified, specific remaining blockers and how to reproduce. Do not claim production deployment unless verified. Preserve prod and provide rollback instruction.

This document is a real code-source-based handoff; it is NOT a claim of completed web-game upgrade.

## Additional independent foundation work (2026-11-11)
- Added `microstructure-v2.js` as pure, isolated persistent price-time order-book prototype with player/NPC orders, partial fills, ±30% order price validation, 10-second VI trading halt, cancel, aggregation, trade-sourced volume, trade value, aggression strength, and five disclosure intent types. It is **not integrated into the live game**.
- Added `microstructure-v2.test.cjs` to assert upper/lower price-lock inventory, genuine last-trade changes only upon execution, VI blocking and disclosure whitelist.
- Added `.github/workflows/scalping-v2-tests.yml` so GitHub Actions can run both isolated Node test suites for the development branch and PRs. Workflow result is NOT yet verified.
- Attempted to fetch code into the local Node runtime, but outbound raw.githubusercontent.com DNS was unavailable. Do not label tests as passed without inspecting workflow execution/logs.
- Microstructure API currently uses a simplified fixed 50 KRW tick. It does not implement cash/debt/account reservations or cancel/replace depth events from a full market participant agent; these MUST be built and integrated before release.
- Existing `main` / public website is unchanged. All new sources should remain excluded from production until a full tested migration.

## Integrated game

- The shared order book matches player and simulated participants by price and time. Replace orders lose their time priority. The tape, current price, live candles, volume, value and aggression counters are derived from the same fills.
- The game uses a fixed tick per stock session, 50 won below a 50,000 won reference and 100 won at that reference. A 10-second VI starts after the triggering incoming order finishes matching, with a further 25-second cooldown. Rolling anchors are refreshed at the start of 3-second and 20-second windows.
- Credit targets use the position basis plus open buy reservations. Fees are reserved, available own cash is used first, and pending credit orders are checked again before matching.
- Collateral is shared across positions. Eligible collateral is marked holdings plus cash, including the emergency-loan deposit. The common collateral ratio drives risk for all credit holdings. Ordinary sales allocate cash-funded shares first, and forced sales target credit-funded shares. Unpaid credit principal survives the sale. Credit-share fills also use unreserved cash alongside net proceeds after credit principal to repay the emergency loan immediately. Any unpaid emergency balance remains a liability and is deducted from net equity.
- The browser uses one simulation clock. Manual pause, rewarded ads and background tabs freeze all market timers. A background pause resumes on return to the tab.
- A web or future native ad adapter may set window.scalpRewardProvider with isAvailable(feature) and show({feature, signal, onReward}). show resolves to completed after the ad closes or canceled if abandoned. Unlocks require the provider reward callback and completed outcome for the same round. Dispatch scalp-reward-availability when readiness changes. The deployed page includes no provider and keeps the three features locked.

## Repeatable checks

- node games/scalping-king/risk-v2.test.cjs
- node games/scalping-king/microstructure-v2.test.cjs
- node games/scalping-king/integration-v2.test.cjs
- Install playwright-core and its Chromium, then run node games/scalping-king/browser-v2.test.cjs. Set SCALPING_TEST_URL to smoke-test a deployed copy. The test supplies its own ad callbacks inside the browser context.

## Layout and public playtest

- The order ticket sets the desktop height of the watchlist, chart, and order book. On phones the sticky watchlist remains a compact horizontal strip. The chart and order book still follow the order ticket height. Selected-stock news starts on the row below the order ticket on wide screens.
- The watchlist dot reflects the latest opening or intraday headline for each stock. Red is positive, blue is negative, gray is neutral. The dot title carries the headline.
- `data-test-tools="enabled"` on the game page enables credit purchases and stop loss without an ad. Emergency loans become available after a credit purchase fills and can be drawn once per round. Remove the attribute when switching back to the rewarded-ad flow and configure the provider documented above.

### Credit orders and quote depth

The credit dialog offers market and limit buys and sells. Credit-only sell orders reserve financed shares and settle those shares first. The simulated book maintains a passive quote on each side near the last price, sized for the normal maximum investment and emergency loan where price bounds and share limits allow. Quoted size becomes trade volume only on execution. VI and price limits still apply.
