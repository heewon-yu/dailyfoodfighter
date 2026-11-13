'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const remote = process.env.SCALPING_TEST_URL;
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8'};

function serve() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Serve nested in-app pages too, while preventing traversal outside test root.
    let filename;
    try {
      const decoded = decodeURIComponent(url.pathname);
      const resolved = path.resolve(__dirname, '.' + decoded, decoded.endsWith('/') ? 'index.html' : '');
      const relative = path.relative(__dirname, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('invalid path');
      filename = resolved;
    } catch {
      res.writeHead(400).end();
      return;
    }
    const mime = MIME[path.extname(filename)];
    if (!mime || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {'Content-Type': mime, 'X-Content-Type-Options': 'nosniff'});
    res.end(fs.readFileSync(filename));
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
    // These URLs are required for Google Play and should work without authentication.
    if (!remote) {
      const privacy = await desktop.request.get(target + 'privacy/');
      const deletion = await desktop.request.get(target + 'delete-account/');
      assert.equal(privacy.status(), 200);
      assert.equal(deletion.status(), 200);
      assert.match(await privacy.text(), /개인정보처리방침/);
      assert.match(await deletion.text(), /계정 및 데이터 삭제/);
    }
    await desktop.goto(target + '?seed=5&test=1');
    // Old offline quota/extra game entitlements must not carry across KST days.
    await desktop.evaluate(() => {
      localStorage.setItem('scalpQuotaDay', '2000-01-01');
      localStorage.setItem('scalpQuotaUsed', '5');
      localStorage.setItem('scalpQuotaBonus', '1');
    });
    await desktop.reload();
    assert.equal(await desktop.evaluate(() => localStorage.getItem('scalpQuotaUsed')), '0');
    assert.equal(await desktop.evaluate(() => localStorage.getItem('scalpQuotaBonus')), '0');
    assert.equal(await desktop.locator('#watchlist [data-stock]').count(), 10);
    assert.equal(await desktop.locator('#gameHome').count(), 0);
    // Local ?test=1 intentionally unlocks reward tools without a provider.
    assert.equal(await desktop.locator('#stopTool').isDisabled(), false);
    assert.equal(await desktop.locator('#emergencyTool').isDisabled(), true);
    const layout = () => desktop.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const panels = ['.sidebar', '.chart-panel', '.depth-panel', '.order-panel'].map(rect);
      return {heights: panels.map(panel => Math.round(panel.height)),
        tops: panels.map(panel => Math.round(panel.top)), newsTop: rect('.stock-news-panel').top};
    });
    for (const width of [1440, 1120, 900]) {
      await desktop.setViewportSize({width, height: 950});
      await desktop.waitForFunction(() => {
        const order = document.querySelector('.order-panel').offsetHeight;
        return ['.chart-panel', '.depth-panel'].every(selector => document.querySelector(selector).offsetHeight === order);
      });
      const {heights, tops, newsTop} = await layout();
      assert.equal(new Set(heights.slice(1)).size, 1);
      assert.ok(heights[0] >= heights[3]);
      if (width >= 1050) {
        assert.equal(new Set(tops).size, 1);
        assert.ok(newsTop > tops[3] + heights[3]);
      }
    }
    await desktop.setViewportSize({width: 1440, height: 700});
    await desktop.evaluate(() => {
      const sidebar = document.querySelector('.sidebar');
      window.scrollBy(0, sidebar.getBoundingClientRect().top - parseFloat(getComputedStyle(sidebar).top) + 15);
    });
    await desktop.waitForFunction(() => {
      const sidebar = document.querySelector('.sidebar');
      return Math.abs(sidebar.getBoundingClientRect().top - parseFloat(getComputedStyle(sidebar).top)) < 2;
    }, {timeout: 3000});
    await desktop.evaluate(() => window.scrollTo(0, 0));
    const listFits = page => page.locator('#watchlist').evaluate(list =>
      list.scrollHeight <= list.clientHeight && list.scrollWidth <= list.clientWidth);
    assert.ok(await listFits(desktop));
    const dots = desktop.locator('#watchlist .stock-news-dot');
    assert.equal(await dots.count(), 10);
    assert.ok((await dots.evaluateAll(items => items.map(item => item.title))).every(title => title.startsWith('장전')));
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
    assert.match(await desktop.locator('#score').innerText(), /최초 투자원금[\s\S]*100,000,000원[\s\S]*최대 낙폭[\s\S]*긴급자금대출 상환액/);
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
    const testTime = new Date();
    await mobile.clock.install({time: testTime});
    await mobile.clock.pauseAt(new Date(+testTime + 1000));
    await mobile.addInitScript(() => {
      window.scalpRewardProvider = {isAvailable: () => true, async show({onReward}) { onReward(); return 'completed'; }};
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
    });
    await mobile.goto(target + '?seed=5&test=1');
    assert.equal(await mobile.locator('#emergencyTool').isDisabled(), true);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
    assert.ok(await listFits(mobile));
    for (const width of [320, 360, 390, 412, 430]) {
      await mobile.setViewportSize({width, height: 844});
      const size = await mobile.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        return [document.documentElement.scrollWidth, rect('#chart').height, rect('#buy').top - rect('#chart').bottom, rect('.depth-panel').top - rect('#buy').bottom];
      });
      assert.equal(size[0], width);
      assert.ok(size[1] >= 180 && size[1] <= 220, String(size));
      assert.ok(size[2] >= 0 && size[2] < 370, String(size));
      assert.ok(size[3] >= 0, String(size));
    }
    await mobile.setViewportSize({width: 390, height: 844});
    await mobile.locator('#start').tap();
    await mobile.locator('#creditTool').tap();
    assert.equal(await mobile.locator('#creditDialog').isVisible(), true);
    await mobile.locator('#creditPercent').fill('0');
    assert.equal(await mobile.locator('#creditConfirm').isDisabled(), true);
    assert.equal(await mobile.locator('#emergencyTool').isDisabled(), true);
    await mobile.locator('#creditPercent').fill('300');
    assert.equal(await mobile.locator('#creditRange').inputValue(), '300');
    await mobile.locator('#creditConfirm').tap();
    assert.notEqual(await mobile.locator('#creditDebt').innerText(), '0원');
    assert.equal(await mobile.locator('#creditSellQty').count(), 0);
    await mobile.locator('#limitMode').tap();
    const upper = await mobile.locator('#limitPrice').getAttribute('max');
    await mobile.locator('#limitPrice').fill(upper);
    await mobile.locator('#quantity').fill('1');
    await mobile.locator('#sell').tap();
    assert.match(await mobile.locator('#feedback').innerText(), /지정가 매도 .*접수/);
    await mobile.locator('#pending [data-cancel]').tap();
    assert.equal(await mobile.locator('#emergencyTool').isEnabled(), true);
    await mobile.locator('#emergencyTool').tap();
    assert.ok(await mobile.locator('#emergencyDialog').isVisible());
    assert.equal(await mobile.locator('#emergencyDebt').innerText(), '0원 · 0원');
    await mobile.locator('#emergencyConfirm').tap();
    assert.equal(await mobile.locator('#emergencyDebt').innerText(), '50,000,000원 · 0원');
    assert.equal(await mobile.locator('#emergencyTool').isDisabled(), true);
    await mobile.evaluate(() => {
      window.testMarket.headlines.unshift(...[1, -1, 0].map((direction, index) =>
        ({index, direction, time: 1, title: '검증 뉴스'})));
    });
    await mobile.clock.fastForward(600);
    const newsDots = mobile.locator('#watchlist .stock-news-dot');
    assert.deepEqual(await newsDots.evaluateAll(items => items.slice(0, 3).map(dot => dot.dataset.tone)), ['up', 'down', '']);
    assert.match(await newsDots.first().getAttribute('title'), /^장중 호재/);
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
    assert.equal(await mobile.locator('#emergencyTool').isDisabled(), true);
    assert.equal(await mobile.locator('#creditTool').isEnabled(), true);
    assert.equal(await mobile.locator('#stopTool').isEnabled(), true);

    for (const name of ['risk-v2','microstructure-v2','ledger-v2','engine-v2','market']) require('./' + name + '.js');
    const {marketFeed} = await import('../../supabase/functions/scalping-king/market-feed.mjs');
    const {replay, finalScore, FULL_MS} = await import('./official-engine.mjs');
    const officialPage = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    attach(officialPage);
    const session = {session_id: 'official-fixture', server_seed: 71, market_key: 'test-only-hidden-key', commands: [], revision: 0,
      elapsed: 0, status: 'active', paused: false};
    let used = 0;
    let advanced = false;
    function snapshot(feedAfter = 0, elapsed = session.elapsed) {
      const tick = Math.floor(elapsed / globalThis.ScalpMarket.INTERVAL);
      const {market_key, ...visible} = session;
      return {...visible, elapsed, feedAfter, feed: marketFeed(session, tick, feedAfter)};
    }
    await officialPage.exposeFunction('testOfficialRpc', async input => {
      if (input.action === 'profile') return {nickname: '브라우저테스트', free: 5 - used, bonus: 0};
      if (input.action === 'start') {
        assert.match(input.requestId, /^[a-f0-9-]{36}$/);
        assert.equal(input.version, '20261112.1');
        used++;
        return snapshot();
      }
      if (input.action === 'feed') return snapshot(input.feedAfter, advanced && !session.paused ? FULL_MS : 0);
      if (input.action === 'command') {
        assert.equal(input.command.kind, 'order');
        assert.equal(input.command.qty, 2);
        session.commands.push({...input.command, tick: 0, requestId: input.requestId});
      } else if (input.action === 'pause') session.paused = true;
      else if (input.action === 'resume') session.paused = false;
      else if (input.action === 'finish') {
        session.status = 'completed';
        session.elapsed = FULL_MS;
        const {TOTAL_TICKS} = globalThis.ScalpMarket;
        const verified = finalScore(replay(session.server_seed, session.commands, TOTAL_TICKS, marketFeed(session, TOTAL_TICKS)));
        session.score = {final_equity: verified};
      } else throw new Error('Unexpected official call ' + input.action);
      session.revision++;
      return snapshot(input.feedAfter);
    });
    await officialPage.addInitScript(() => {
      window.scalpOfficial = {
        signedIn: () => true,
        call: input => window.testOfficialRpc(input),
        rankings: async () => ({day: '2026-11-12',
          rates: [{nickname: '브라우저테스트', rank: 1, value: 2}],
          profits: [{nickname: '브라우저테스트', rank: 1, value: 2000000}]}),
      };
    });
    await officialPage.goto(target);
    await officialPage.locator('#officialStatus').getByText(/브라우저테스트/).waitFor({timeout: 5000});
    await officialPage.locator('#officialRankings').tap();
    await officialPage.locator('#officialProfits').getByText(/2,000,000원/).waitFor();
    await officialPage.locator('#officialRankingDialog button[aria-label="닫기"]').tap();
    await officialPage.locator('#start').tap();
    await officialPage.locator('#status').getByText(/거래 진행 중/).waitFor({timeout: 5000});
    assert.match(await officialPage.locator('#officialStatus').innerText(), /4\/5판/);
    await officialPage.locator('#quantity').fill('2');
    await officialPage.locator('#buy').tap();
    await officialPage.locator('#feedback').getByText(/2주 체결/).waitFor();
    await officialPage.locator('#jumpPause').tap();
    await officialPage.locator('#status').getByText(/일시정지/).waitFor();
    await officialPage.locator('#jumpPause').tap();
    await officialPage.locator('#status').getByText(/거래 진행 중/).waitFor({timeout: 5000});
    advanced = true;
    await officialPage.locator('#result').waitFor({timeout: 12000});
    assert.match(await officialPage.locator('#score').innerText(), /최종 순자산/);
    assert.equal(used, 1);
    // Offline/unranked practice must work without creating a player identity.
    const practice = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    attach(practice);
    await practice.goto(target + '?seed=7');
    assert.equal(await practice.locator('#practiceStart').isVisible(),true);
    await practice.setViewportSize({width:320,height:844});
    assert.equal(await practice.evaluate(()=>document.documentElement.scrollWidth),320);
    const practiceButton=await practice.locator('#practiceStart').boundingBox();
    assert.ok(practiceButton.x>=0 && practiceButton.x+practiceButton.width<=320);
    await practice.setViewportSize({width:390,height:844});
    await practice.locator('#practiceStart').tap();
    await practice.locator('#status').getByText(/거래 진행 중/).waitFor();
    assert.match(await practice.locator('#officialStatus').innerText(),/랭킹에 기록되지 않습니다/);
    assert.equal(await practice.locator('#creditTool').isDisabled(),true);
    assert.equal(await practice.locator('#officialRankings').isDisabled(),true);
    assert.equal(await practice.locator('#officialAccount').isDisabled(),true);
    await practice.locator('#quantity').fill('2');
    await practice.locator('#buy').tap();
    assert.match(await practice.locator('#feedback').innerText(),/체결/);
    practice.once('dialog',dialog=>dialog.accept());
    await practice.locator('#practiceExit').tap();
    assert.equal(await practice.locator('#start').isVisible(),true);
    assert.equal(await practice.locator('#practiceStart').isVisible(),true);
    assert.equal(await practice.locator('#officialRankings').isEnabled(),true);
    await practice.close();
    assert.deepEqual(errors, []);
    console.log('Chrome desktop and 320/360/390/412/430px touch browser tests passed at ' + target);
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
