'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const remote = process.env.SCALPING_TEST_URL;
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'};

function serve() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const name = path.basename(url.pathname) || 'index.html';
    const mime = MIME[path.extname(name)];
    if (!mime || !fs.existsSync(path.join(__dirname, name))) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {'Content-Type': mime});
    res.end(fs.readFileSync(path.join(__dirname, name)));
  });
}

async function run() {
  const server = remote ? null : serve();
  if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath: process.env.CHROME_PATH, headless: true});
    const target = remote || 'http://127.0.0.1:' + server.address().port + '/';
    const errors = [];
    const attach = page => page.on('pageerror', error => errors.push(error.message));
    const desktop = await browser.newPage({viewport: {width: 1440, height: 950}});
    attach(desktop);
    await desktop.clock.install();
    await desktop.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', {value: () => true});
      Object.defineProperty(navigator, 'share', {value: async ({files}) => {
        window.sharedScore = files.map(file => ({name: file.name, type: file.type, size: file.size}));
      }});
    });
    await desktop.goto(target + '?seed=5');
    assert.equal(await desktop.locator('#watchlist [data-stock]').count(), 10);
    assert.equal(await desktop.locator('#creditTool').isDisabled(), true);
    assert.equal(await desktop.locator('#stopTool').isDisabled(), true);
    assert.equal(await desktop.locator('#emergencyTool').isDisabled(), true);
    await desktop.locator('#start').click();
    await desktop.locator('#quantity').fill('2');
    await desktop.locator('#buy').click();
    assert.match(await desktop.locator('#feedback').innerText(), /체결/);
    assert.match(await desktop.locator('#averagePriceKey').innerText(), /매수평균가/);
    await desktop.locator('#limitMode').click();
    const limitPrice = desktop.locator('#limitPrice');
    const lower = await limitPrice.getAttribute('min');
    const tick = Number(await limitPrice.getAttribute('step'));
    await limitPrice.fill(lower);
    await desktop.locator('#buy').click();
    assert.equal(await desktop.locator('#pending [data-amend]').count(), 1);
    await desktop.locator('#pending [data-amend]').click();
    await desktop.locator('#amendPrice').fill(String(Number(lower) + tick));
    await desktop.locator('#amendQty').fill('3');
    await desktop.locator('#amendForm button[type=submit]').click();
    assert.match(await desktop.locator('#pending').innerText(), /3주/);
    await desktop.locator('#pending [data-cancel]').click();
    assert.equal(await desktop.locator('#pending [data-cancel]').count(), 0);
    await desktop.locator('[data-chart="1"]').click();
    assert.match(await desktop.locator('#chartLabel').innerText(), /^1초/);
    await desktop.locator('#sort').selectOption('value');
    assert.equal(await desktop.locator('#watchlist [data-rank="1"]').count(), 1);
    await desktop.locator('#pause').click();
    const timer = await desktop.locator('#timer').innerText();
    const quote = await desktop.locator('#price').innerText();
    await desktop.clock.fastForward(12000);
    assert.equal(await desktop.locator('#timer').innerText(), timer);
    assert.equal(await desktop.locator('#price').innerText(), quote);
    await desktop.locator('#pause').click();
    await desktop.clock.fastForward(1000);
    assert.notEqual(await desktop.locator('#timer').innerText(), timer);
    await desktop.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, value: true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const backgroundTime = await desktop.locator('#timer').innerText();
    await desktop.clock.fastForward(10000);
    assert.equal(await desktop.locator('#timer').innerText(), backgroundTime);
    await desktop.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, value: false});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await desktop.clock.fastForward(305000);
    assert.equal(await desktop.locator('#timer').innerText(), '00:00');
    assert.equal(await desktop.locator('#result').isVisible(), true);
    assert.match(await desktop.locator('#score').innerText(), /최초 투자원금[\s\S]*100,000,000원[\s\S]*최대 낙폭[\s\S]*긴급자금 상환액/);
    await desktop.locator('#shareImage:not([disabled])').waitFor();
    await desktop.locator('#shareImage').click();
    const [shared] = await desktop.evaluate(() => window.sharedScore);
    assert.equal(shared.type, 'image/png');
    assert.ok(shared.size > 1000);
    await desktop.locator('#result .modal-head button').click();
    await desktop.locator('#startNextRound').click();
    assert.match(await desktop.locator('#status').innerText(), /거래 진행/);
    assert.match(await desktop.locator('#equity').innerText(), /100,000,000/);

    const mobile = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true,
      hasTouch: true, deviceScaleFactor: 2});
    attach(mobile);
    await mobile.clock.install();
    // This provider exists only in the test browser and is never served as a site asset.
    await mobile.addInitScript(() => {
      Object.defineProperty(window, 'ScalpMarket', {configurable: true, set(api) {
        const original = api.createMarket;
        api.createMarket = seed => {
          const market = original(seed);
          const stock = market.stocks[0];
          for (const order of [...stock.depth.asks, ...stock.depth.bids])
            ScalpMicrostructure.cancel(stock.depth, order.id, 0);
          api.submitParticipant(stock, {side: 'sell', qty: 99999, price: stock.reference});
          window.testMarket = market;
          return market;
        };
        Object.defineProperty(window, 'ScalpMarket', {value: api});
      }});
      window.scalpRewardProvider = {
        isAvailable: () => true,
        show: ({feature, onReward}) => new Promise(resolve => {
          window.endTestAd = (outcome, earned) => {
            if (earned) { onReward(); onReward(); }
            resolve(outcome);
          };
          window.testAdFeature = feature;
        }),
      };
    });
    await mobile.goto(target + '?seed=5');
    assert.equal(await mobile.locator('#emergencyTool').isDisabled(), true);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
    await mobile.locator('#start').tap();
    await mobile.locator('#creditTool').tap();
    assert.equal(await mobile.evaluate(() => window.testAdFeature), 'credit');
    const adTimer = await mobile.locator('#timer').innerText();
    const adPrice = await mobile.locator('#price').innerText();
    const adBook = await mobile.locator('#orderBook').innerText();
    await mobile.clock.fastForward(20000);
    assert.equal(await mobile.locator('#timer').innerText(), adTimer);
    assert.equal(await mobile.locator('#price').innerText(), adPrice);
    assert.equal(await mobile.locator('#orderBook').innerText(), adBook);
    await mobile.evaluate(() => window.endTestAd('canceled', true));
    assert.equal(await mobile.locator('#creditDialog').isVisible(), false);
    assert.match(await mobile.locator('#creditTool').innerText(), /잠금/);
    await mobile.locator('#creditTool').tap();
    await mobile.evaluate(() => window.endTestAd('completed', true));
    assert.equal(await mobile.locator('#creditDialog').isVisible(), true);
    await mobile.locator('#creditPercent').fill('0');
    assert.equal(await mobile.locator('#creditConfirm').isDisabled(), true);
    await mobile.locator('#creditPercent').fill('300');
    assert.equal(await mobile.locator('#creditRange').inputValue(), '300');
    await mobile.locator('#creditConfirm').tap();
    assert.notEqual(await mobile.locator('#creditDebt').innerText(), '0원');
    assert.equal(await mobile.locator('#emergencyTool').isEnabled(), true);
    await mobile.locator('#emergencyTool').tap();
    assert.equal(await mobile.evaluate(() => window.testAdFeature), 'emergency');
    await mobile.evaluate(() => window.endTestAd('completed', true));
    assert.equal(await mobile.locator('#emergencyDebt').innerText(), '50,000,000원 · 0원');
    assert.equal(await mobile.locator('#emergencyTool').isDisabled(), true);
    await mobile.evaluate(() => {
      const stock = window.testMarket.stocks[0];
      ScalpMicrostructure.halt(stock.depth, window.testMarket.time);
    });
    await mobile.clock.fastForward(600);
    assert.equal(await mobile.locator('#stockHalt').isVisible(), true);
    assert.equal(await mobile.locator('#buy').isDisabled(), true);
    await mobile.locator('#watchlist [data-stock="1"]').tap();
    assert.equal(await mobile.locator('#buy').isEnabled(), true);
    await mobile.locator('#watchlist [data-stock="0"]').tap();
    await mobile.clock.fastForward(10000);
    assert.equal(await mobile.locator('#buy').isEnabled(), true);
    await mobile.locator('#stopTool').tap();
    assert.equal(await mobile.evaluate(() => window.testAdFeature), 'stop');
    await mobile.evaluate(() => window.endTestAd('completed', true));
    assert.equal(await mobile.locator('#stopDialog').isVisible(), true);
    assert.equal(await mobile.locator('#stopPercent').inputValue(), '-3');
    await mobile.locator('#stopPercent').fill('-8');
    await mobile.locator('#stopSave').tap();
    assert.match(await mobile.locator('#feedback').innerText(), /-8% 적용/);
    await mobile.locator('#jumpPause').tap();
    const pausedMobile = await mobile.locator('#mobileTimer').innerText();
    await mobile.clock.fastForward(10000);
    assert.equal(await mobile.locator('#mobileTimer').innerText(), pausedMobile);
    await mobile.locator('#jumpRestart').tap();
    assert.match(await mobile.locator('#creditTool').innerText(), /잠금/);
    assert.match(await mobile.locator('#stopTool').innerText(), /잠금/);
    assert.deepEqual(errors, []);
    console.log('Chrome desktop and 390px touch browser tests passed at ' + target);
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
