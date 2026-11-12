(function () {
  'use strict';

  const {CASH, DURATION, INTERVAL, TOTAL_TICKS, createMarket, stepMarket, createAccount,
    quoteOrder, maxOrder, executeOrder, limitEstimate, availableCash, availableShares, placeLimit,
    amendLimit, cancelLimit, expirePending, equity, isHalted, priceStatus, executeCredit, executeCreditSale, creditQuote, notify} = ScalpMarket;
  const risk = ScalpRisk;
  const ledger = ScalpLedger;
  const strength = stock => ScalpMicrostructure.strength(stock.depth);
  const ratioText = value => value === Infinity ? '—' : value.toFixed(1) + '%';
  const {drawChart, timeText} = ScalpChart;
  const $ = id => document.getElementById(id);
  const fmt = new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 0});
  const num = value => fmt.format(value);
  const money = value => num(value) + '원';
  const signed = value => (value > 0 ? '+' : '') + num(value);
  const pct = value => (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  const tone = value => value > 0 ? 'up' : value < 0 ? 'down' : '';
  const newsLabel = item => {
    const sentiment = item.direction > 0 ? '호재' : item.direction < 0 ? '악재' : '';
    if (item.type) return '공시 · ' + item.label;
    return item.time ? sentiment : '개장 전' + (sentiment ? ' · ' + sentiment : '');
  };
  const delta = stock => (stock.price / stock.reference - 1) * 100;
  const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
  const code = seed => seed.toString(36).toUpperCase().padStart(7, '0');
  const bestKey = 'scalping-king.best.v1';

  function initialSeed() {
    const raw = new URLSearchParams(location.search).get('seed');
    if (!raw || !/^[a-z0-9]{1,7}$/i.test(raw)) return randomSeed();
    const parsed = parseInt(raw, 36);
    return parsed <= 0xffffffff ? parsed : randomSeed();
  }

  function readBest() {
    try {
      const stored = localStorage.getItem(bestKey);
      const value = Number(stored);
      return stored !== null && Number.isFinite(value) ? value : null;
    } catch { return null; }
  }

  function readScoreFromAddress() {
    const match = /^#score=([a-z0-9]{1,7}),(\d{1,16}),(\d{1,16}),(\d{1,16}),([01])$/i.exec(location.hash);
    if (!match) return null;
    const [, seedCode, amount, trades, charges, record] = match;
    const seed = parseInt(seedCode, 36);
    const [total, count, fees] = [amount, trades, charges].map(Number);
    if (seed > 0xffffffff || ![total, count, fees].every(Number.isSafeInteger)) return null;
    const profit = total - CASH;
    return {seed, total, profit, rate: profit / CASH * 100, count, fees, record: record === '1'};
  }

  let result = readScoreFromAddress();
  let market = createMarket(result?.seed ?? initialSeed());
  let account = createAccount();
  let best = readBest();
  let selected = 0;
  let phase = 'ready';
  let startedAt = 0;
  let pausedAt = 0;
  let loop = 0;
  let adController = null;
  let pauseReason = null;
  let audio = null;
  let latestNotice = null;
  let chartMode = '10';
  let newsMode = 'all';
  let orderType = 'market';
  let orderPercent = 0;
  let accountMode = 'positions';
  let cursor = null;
  let newsKey = '';
  let stockNewsKey = '';
  let lastSeenNews = 0;
  let scoreImage = null;
  let watchKey = '';
  let amendment = null;
  const canvas = $('chart');
  const orderQty = $('quantity');
  const orderPrice = $('limitPrice');
  const watchlist = $('watchlist');
  const orderBook = $('orderBook');

  function buildDepthRows(side) {
    return Array.from({length: 5}, (_, index) => {
      const row = document.createElement('div');
      row.className = 'book-row ' + side;
      row.innerHTML = '<span>' + (side === 'ask' ? '매도 ' : '매수 ') + (index + 1) +
        '</span><button type="button" class="book-price"></button><span></span>';
      const [, price, qty] = row.children;
      return {row, price, qty};
    });
  }

  const askRows = buildDepthRows('ask');
  const bidRows = buildDepthRows('bid');
  const spreadRow = document.createElement('div');
  spreadRow.className = 'book-mid';
  spreadRow.innerHTML = '<span>호가 차이</span><b></b>';
  orderBook.append(...askRows.map(item => item.row).reverse(), spreadRow, ...bidRows.map(item => item.row));

  function buildWatchlist() {
    return market.stocks.map(stock => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stock-row';
      button.dataset.stock = stock.index;
      button.innerHTML = '<span class="stock-icon" style="--icon:' + stock.color + '">' + stock.short +
        '</span><span class="stock-name"><span class="stock-name-line"><b>' + stock.name +
        '</b><span class="stock-news-dot" hidden></span></span><small>' + stock.sector +
        '</small></span><span class="stock-value"><b></b><small></small></span>';
      return button;
    });
  }

  let stockButtons = buildWatchlist();

  function change10(stock) {
    const lookback = 10000 / INTERVAL;
    const previous = market.tick > lookback ? stock.ticks.at(-1 - lookback).close : stock.reference;
    return (stock.price / previous - 1) * 100;
  }

  function renderWatchlist() {
    const term = $('search').value.trim().toLowerCase();
    const sort = $('sort').value;
    const stocks = market.stocks.filter(stock => (stock.name + stock.sector + stock.short).toLowerCase().includes(term));
    if (phase !== 'ready') {
      if (sort === 'surge') stocks.sort((a, b) => change10(b) - change10(a));
      if (sort === 'drop') stocks.sort((a, b) => change10(a) - change10(b));
      if (sort === 'rise') stocks.sort((a, b) => delta(b) - delta(a));
      if (sort === 'fall') stocks.sort((a, b) => delta(a) - delta(b));
      if (sort === 'volume') stocks.sort((a, b) => b.volume - a.volume);
      if (sort === 'value') stocks.sort((a, b) => b.depth.value - a.depth.value);
      if (sort === 'strength') stocks.sort((a, b) => (strength(b) ?? -1) - (strength(a) ?? -1));
    }
    const key = stocks.map(stock => stock.index).join(',') || '-';
    if (key !== watchKey) {
      const focused = document.activeElement;
      watchlist.replaceChildren(...stocks.map(stock => stockButtons[stock.index]));
      if (!stocks.length) watchlist.innerHTML = '<div class="empty">검색 결과가 없어요.</div>';
      if (focused?.parentElement === watchlist) focused.focus({preventScroll: true});
      $('listCount').textContent = stocks.length;
      watchKey = key;
    }
    const latestNews = new Map();
    for (const item of market.headlines) {
      if (!latestNews.has(item.index)) latestNews.set(item.index, item);
    }
    stocks.forEach((stock, rank) => {
      const button = stockButtons[stock.index];
      const period = phase !== 'ready' && (sort === 'surge' || sort === 'drop') ? change10(stock) : delta(stock);
      const [price, rate] = button.lastElementChild.children;
      const item = latestNews.get(stock.index);
      const dot = button.querySelector('.stock-news-dot');
      dot.hidden = !item;
      if (item) {
        dot.dataset.tone = tone(item.direction);
        const session = item.time ? '장중' : '장전';
        const sentiment = item.direction > 0 ? '호재' : item.direction < 0 ? '악재' : '중립';
        dot.title = session + ' ' + sentiment + ' · ' + item.title;
        dot.setAttribute('aria-label', session + ' ' + sentiment);
        dot.setAttribute('role', 'img');
      }
      button.setAttribute('aria-pressed', String(stock.index === selected));
      button.dataset.rank = sort === 'default' ? '' : String(rank + 1);
      price.textContent = num(stock.price);
      price.className = tone(delta(stock));
      const status = isHalted(stock) ? 'VI' : priceStatus(stock);
      rate.textContent = (status ? status + ' · ' : '') + pct(period);
      rate.className = tone(period);
    });
  }

  function renderMetrics() {
    const total = equity(market, account);
    const profit = total - CASH;
    $('equity').innerHTML = num(total) + '<small> 원</small>';
    $('cash').innerHTML = num(availableCash(account)) + '<small> 원</small>';
    $('returnRate').className = tone(profit);
    $('returnRate').textContent = pct(profit / CASH * 100);
    $('best').textContent = best === null ? '—' : pct(best);
    $('best').className = best === null ? '' : tone(best);
    const unrealized = ledger.markedValue(market.stocks, account) - account.positions.reduce((sum, position) => sum + position.cost, 0);
    $('positionCount').textContent = account.positions.filter(position => position.qty).length + '개';
    $('unrealized').textContent = signed(unrealized) + '원';
    $('unrealized').className = tone(unrealized);
    $('realized').textContent = signed(account.realized) + '원';
    $('realized').className = tone(account.realized);
  }

  function renderClock() {
    const remaining = Math.max(0, Math.ceil(DURATION - market.time));
    $('timer').textContent = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
    $('timer').classList.toggle('urgent', phase === 'live' && remaining <= 30);
    $('timerBar').style.width = remaining / DURATION * 100 + '%';
    $('mobileTimer').textContent = $('timer').textContent;
  }

  function renderPhase() {
    $('status').textContent = {ready: '개장 대기', live: '거래 진행 중', paused: pauseReason === 'ad' ? '광고 시청 중' : '일시정지', done: '장 마감'}[phase];
    $('status').closest('.session').dataset.phase = phase;
    $('seedLabel').textContent = code(market.seed);
    const inSession = phase === 'live' || phase === 'paused';
    $('start').hidden = phase !== 'ready' || Boolean(result);
    $('openScoreShare').hidden = !result;
    $('startNextRound').hidden = !result;
    for (const id of ['pause', 'jumpPause']) {
      $(id).hidden = !inSession;
      $(id).disabled = Boolean(adController);
      $(id).textContent = phase === 'paused' ? (id === 'pause' ? '거래 재개' : '재개') : '일시정지';
    }
    $('restart').hidden = !inSession || Boolean(adController);
    $('gameHome').disabled = Boolean(adController);
    $('jumpRestart').hidden = phase !== 'paused' || Boolean(adController);
    renderOrderAvailability();
    renderClock();
  }

  function renderChart() {
    const position = account.positions[selected];
    const averagePrice = position.qty > 0 ? position.cost / position.qty : null;
    const key = $('averagePriceKey');
    key.hidden = averagePrice === null;
    key.textContent = averagePrice === null ? '' : '매수평균가 ' + money(averagePrice);
    const display = drawChart(canvas, market.stocks[selected], {mode: chartMode, showMA: $('showMA').checked, cursor, averagePrice});
    if (!display) return;
    const {bar, legend} = display;
    $('ohlc').textContent = '시 ' + num(bar.open) + ' 고 ' + num(bar.high) + ' 저 ' + num(bar.low) + ' 종 ' + num(bar.close);
    $('maKey').innerHTML = legend.filter(entry => entry.value !== null)
      .map(entry => '<b style="color:' + entry.color + '">MA' + entry.period + ' ' + num(entry.value) + '</b>').join('　');
  }

  function renderStock(stock) {
    $('stockTitle').innerHTML = stock.name + '<small>SIM-' + String(stock.sourceIndex + 1).padStart(2, '0') + ' · ' + stock.sector + '</small>';
    $('price').textContent = num(stock.price);
    $('price').className = tone(delta(stock));
    const jump = stock.price - stock.reference;
    $('change').textContent = (jump > 0 ? '▲ ' : jump < 0 ? '▼ ' : '') + signed(jump) + ' (' + pct(delta(stock)) + ')';
    $('change').className = tone(delta(stock));
    $('reference').textContent = num(stock.reference);
    $('high').textContent = num(stock.high);
    $('low').textContent = num(stock.low);
    $('volume').textContent = num(stock.volume) + '주';
    const depth = stock.depth;
    $('quoteBand').textContent = '하한 ' + num(depth.limits.lower) + ' · 상한 ' + num(depth.limits.upper);
    $('quoteValue').textContent = '거래대금 ' + money(depth.value);
    const power = strength(stock);
    $('quoteStrength').textContent = '체결강도 ' + (power === Infinity ? '∞' : power === null ? '—' : power.toFixed(1) + '%');
    $('quoteAggression').textContent = '매수 주도 ' + num(depth.aggressiveBuyVolume) + '주 · 매도 주도 ' + num(depth.aggressiveSellVolume) + '주';
    $('stockHalt').hidden = !isHalted(stock);
    if (isHalted(stock)) $('stockHalt').textContent = 'VI 거래정지 · 재개까지 ' + Math.ceil(depth.haltedUntil - market.time) + '초';
    orderPrice.min = String(depth.limits.lower);
    orderPrice.max = String(depth.limits.upper);
    orderPrice.step = String(depth.tick);
    $('company').textContent = stock.description + ' 개장 전 뉴스: ' + stock.preview;
    $('volatility').textContent = '변동성 ' + (stock.volatility >= 1.2 ? '높음' : stock.volatility >= .9 ? '보통' : '낮음');
    $('orderStock').textContent = stock.name + ' · 현재가 ' + money(stock.price);
    renderChart();
  }

  function renderDepth(stock) {
    const {asks, bids} = stock.book;
    const peak = Math.max(1, ...asks.map(level => level.qty), ...bids.map(level => level.qty));
    function updateRows(rows, levels) {
      rows.forEach(({row, price, qty}, index) => {
        const level = levels[index];
        price.disabled = !level;
        if (!level) {
          row.style.setProperty('--size', '0%');
          delete price.dataset.price;
          price.textContent = qty.textContent = '—';
          price.removeAttribute('aria-label');
          return;
        }
        row.style.setProperty('--size', Math.round(level.qty / peak * 79) + '%');
        if (price.dataset.price !== String(level.price)) {
          price.dataset.price = String(level.price);
          price.textContent = num(level.price);
          price.setAttribute('aria-label', row.firstElementChild.textContent + ' ' + money(level.price) + ' 지정가 입력');
        }
        qty.textContent = num(level.qty);
      });
    }
    updateRows(askRows, asks);
    updateRows(bidRows, bids);
    const insideAsk = asks.find(level => level.qty > 0);
    const insideBid = bids.find(level => level.qty > 0);
    const spread = insideAsk && insideBid ? money(insideAsk.price - insideBid.price) : '—';
    spreadRow.lastElementChild.textContent = spread;
    $('tape').innerHTML = stock.depth.trades.slice(-4).reverse().map(fill =>
      '<div class="tape-row"><span>' + timeText(fill.time) + '</span><span class="' + (fill.aggressor === 'buy' ? 'up' : 'down') + '">' +
      num(fill.price) + '</span><span>' + num(fill.qty) + '주</span></div>').join('') || '<div class="empty">체결 대기 중</div>';
  }

  function renderOrderAvailability() {
    const disabled = phase !== 'live' || isHalted(market.stocks[selected]);
    $('buy').disabled = disabled;
    $('sell').disabled = disabled;
    $('start').disabled = Boolean(adController);
  }

  function setupAudio() {
    if (!$('warningSound').checked) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      audio ??= new Audio();
      audio.resume().catch(() => {});
    } catch { /* Visual warnings stay available. */ }
  }

  function playWarning() {
    if (!$('warningSound').checked || audio?.state !== 'running') return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime;
    oscillator.frequency.value = 760;
    gain.gain.setValueAtTime(.08, start);
    gain.gain.exponentialRampToValueAtTime(.001, start + .16);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + .16);
  }

  function renderRisk() {
    const marginRatio = ledger.ratio(market, account);
    $('creditDebt').textContent = money(account.creditDebt);
    $('collateralRatio').textContent = ratioText(marginRatio);
    $('collateralAssets').textContent = money(ledger.collateral(market, account));
    $('emergencyDebt').textContent = money(account.emergencyDebt) + ' · ' + money(account.emergencyRepaid);
    const margin = account.marginSince !== null;
    const remaining = margin ? Math.max(0, Math.ceil(risk.LIQUIDATION_DELAY_SECONDS - (market.time - account.marginSince))) : null;
    const activeLiquidation = account.pending.some(order => order.type === 'forced') || account.queued.includes('forced');
    $('marginState').textContent = activeLiquidation ? '청산 대기' :
      !margin ? '정상' : remaining ? '미달 · ' + remaining + '초' : '150% 미달';
    $('marginState').className = margin || activeLiquidation ? 'up' : '';
    const items = market.notices.filter(item => market.time - item.time < 5)
      .sort((a, b) => Number(b.warning) - Number(a.warning)).slice(0, 3);
    const newest = market.notices[0];
    if (newest && newest !== latestNotice) {
      const since = latestNotice ? market.notices.indexOf(latestNotice) : market.notices.length;
      if (market.notices.slice(0, since < 0 ? 3 : since).some(item => item.warning)) playWarning();
      latestNotice = newest;
    }
    const text = items.map(item => item.message).join('  ·  ');
    const notice = $('riskNotice');
    notice.hidden = !text;
    if (notice.textContent !== text) notice.textContent = text;
    renderRewardTools();
    if ($('creditDialog').open) renderCredit();
  }

  const rewardTools = [
    {key: 'credit', id: 'creditTool', label: '신용거래'},
    {key: 'emergency', id: 'emergencyTool', label: '긴급자금대출'},
    {key: 'stop', id: 'stopTool', label: '로스컷'},
  ];

  function renderRewardTools() {
    const provider = window.scalpRewardProvider;
    for (const {key, id, label} of rewardTools) {
      const button = $(id);
      const unlocked = account.unlocks[key];
      const funded = key === 'emergency' && account.emergencyUsed;
      const eligible = key !== 'emergency' || risk.canUseEmergency(account);
      button.disabled = phase === 'done' || Boolean(result) || Boolean(adController) || funded || !eligible ||
        (!unlocked && !ScalpReward.ready(provider, key));
      button.textContent = label + (funded ? ' · 사용 완료' : unlocked || !eligible ? '' : ' · 광고');
    }
    $('rewardHint').textContent = adController ? '광고 시청 중에는 장세와 타이머가 멈춰요.' :
      !rewardTools.some(({key}) => ScalpReward.ready(provider, key) || account.unlocks[key]) ?
        '광고를 준비하는 중이거나 연결할 수 없어요. 기본 거래는 계속할 수 있어요.' :
        account.everFilledCreditBuy ? '기능별 보상형 광고 1회 · 이번 판에만 적용' :
          '긴급자금대출은 신용매수가 실제 체결된 뒤 이용할 수 있어요.';
  }

  function showCredit() {
    $('creditFeedback').textContent = '';
    $('creditOrderType').value = orderType;
    $('creditLimitPrice').value = orderPrice.value;
    $('creditSellQty').value = '';
    $('creditDialog').showModal();
    renderCredit();
  }

  function creditPercent() {
    const value = $('creditPercent').valueAsNumber;
    return Number.isInteger(value) && value >= 0 && value <= 300 && value % 10 === 0 ? value : null;
  }

  function creditLimit() {
    return $('creditOrderType').value === 'limit' ? $('creditLimitPrice').valueAsNumber : undefined;
  }

  function renderCredit() {
    const percent = creditPercent();
    const stock = market.stocks[selected];
    const limit = creditLimit();
    $('creditLimitField').hidden = limit === undefined;
    const saleQty = $('creditSellQty').valueAsNumber;
    const available = ledger.availableCreditShares(account, stock.index);
    const validLimit = limit === undefined || ScalpMicrostructure.validPrice(stock.depth, limit);
    $('creditSellConfirm').disabled = phase !== 'live' || Boolean(adController) ||
      !validLimit || !ledger.validQuantity(saleQty) || saleQty > available;
    $('creditSellAll').disabled = available <= 0;
    const plan = percent === null ? null : creditQuote(stock, account, percent, limit);
    const items = [
      ['종목 · 주문 방식', stock.name + (limit === undefined ? ' · 시장가' : ' · 지정가 ' + money(limit))],
      ['현재 자기자본', money(equity(market, account))],
      ['총 투자규모 목표', plan ? money(plan.target.total) : '—'],
      ['신용매수 예정금액', plan ? money(plan.creditReserve) : '—'],
      ['신용채무 잔액', money(account.creditDebt)],
      ['남은 신용한도', money(risk.availableCredit(account, ledger.reserved(account, 'creditReserve')))],
      ['신용매도 가능', num(available) + '주'],
      ['예상 매수수량', plan ? num(plan.qty) + '주' : '—'],
      ['예상 담보비율', plan ? ratioText(plan.expectedRatio) : '—'],
      ['유지담보비율', '150%'],
    ];
    const html = items.map(([label, value]) => '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>').join('');
    if ($('creditDetails').innerHTML !== html) $('creditDetails').innerHTML = html;
    $('creditConfirm').disabled = phase !== 'live' || !plan?.qty || Boolean(adController);
    if (percent === null) $('creditFeedback').textContent = '0~300% 범위에서 10% 단위로 입력하세요.';
    else if (phase === 'ready') $('creditFeedback').textContent = '거래를 시작한 뒤 매수를 확정할 수 있어요.';
  }

  function showStop() {
    $('stopStock').textContent = market.stocks[selected].name + ' · ' + num(account.positions[selected].qty) + '주 보유';
    $('stopPercent').value = String(account.stops[selected] ?? -3);
    $('stopDialog').showModal();
  }

  function grantTool(key) {
    if (key === 'emergency') {
      Object.assign(account, risk.issueEmergency(account));
      notify(market, '긴급자금대출 5,000만원 지급 · 동일 금액 채무 기록');
    }
    account.unlocks[key] = true;
  }

  function openTool(key) {
    if (key === 'credit') showCredit();
    if (key === 'stop') showStop();
  }

  async function unlock(key) {
    if (adController || phase === 'done' || result) return;
    if (key === 'emergency' && !risk.canUseEmergency(account)) return;
    if (account.unlocks[key]) {
      openTool(key);
      return;
    }
    const provider = window.scalpRewardProvider;
    if (!ScalpReward.ready(provider, key)) return;
    const wasLive = phase === 'live';
    if (wasLive) suspend('ad');
    if (phase === 'done') return;
    const controller = new AbortController();
    const round = account;
    adController = controller;
    renderPhase();
    renderRisk();
    const earned = await ScalpReward.request(provider, key, controller.signal);
    if (adController !== controller || account !== round) return;
    adController = null;
    if (earned) {
      grantTool(key);
      feedback(rewardTools.find(item => item.key === key).label + ' 기능을 사용할 수 있어요.', 'ok');
    } else feedback('광고가 완료되지 않았어요. 기존 장세를 이어갑니다.', 'error');
    if (wasLive) {
      pauseReason = document.hidden ? 'background' : 'ad';
      resume();
    }
    renderPhase();
    render();
    if (earned) openTool(key);
  }

  function renderScoreDetails(details) {
    if (!details) return;
    const stockResult = stock => stock ? stock.name + ' · ' + signed(stock.profit) + '원' : '—';
    const entries = [
      ['최초 투자원금', money(details.initial)],
      ['장중 최고 수익률', pct(details.bestRate)],
      ['최대 낙폭', details.drawdown.toFixed(2) + '%'],
      ['실현손익', signed(details.realized) + '원'],
      ['평가손익', signed(details.unrealized) + '원'],
      ['신용매수 사용액', money(details.creditUsed)],
      ['신용채무 잔액', money(details.creditDebt)],
      ['긴급자금대출 사용액', money(details.emergencyUsed)],
      ['긴급자금대출 상환액', money(details.emergencyRepaid)],
      ['긴급자금대출 잔여 채무', money(details.emergencyDebt)],
      ['반대매매', details.forcedCount + '회'],
      ['로스컷 발동', details.stopCount + '회'],
      ['최고 수익 종목', stockResult(details.bestStock)],
      ['최대 손실 종목', stockResult(details.worstStock)],
    ];
    const list = document.createElement('dl');
    list.className = 'score-details';
    for (const [label, value] of entries) {
      const item = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      item.append(term, description);
      list.append(item);
    }
    $('score').append(list);
  }

  for (const {id, key} of rewardTools) $(id).addEventListener('click', () => unlock(key));
  window.addEventListener('scalp-reward-availability', renderRewardTools);
  $('warningSound').addEventListener('change', setupAudio);
  $('creditRange').addEventListener('input', () => {
    $('creditPercent').value = $('creditRange').value;
    $('creditFeedback').textContent = '';
    renderCredit();
  });
  $('creditPercent').addEventListener('input', () => {
    const value = creditPercent();
    if (value !== null) $('creditRange').value = String(value);
    $('creditFeedback').textContent = '';
    renderCredit();
  });
  for (const id of ['creditOrderType', 'creditLimitPrice', 'creditSellQty']) {
    $(id).addEventListener('input', () => {
      $('creditFeedback').textContent = '';
      renderCredit();
    });
  }
  $('creditSellAll').addEventListener('click', () => {
    $('creditSellQty').value = String(Math.min(99999, ledger.availableCreditShares(account, selected)));
    renderCredit();
  });
  $('creditSellConfirm').addEventListener('click', () => submitCreditOrder('sell'));
  $('creditConfirm').addEventListener('click', () => submitCreditOrder('buy'));

  function submitCreditOrder(side) {
    syncTime();
    const percent = creditPercent();
    if (phase !== 'live' || adController || (side === 'buy' && percent === null)) return;
    const stock = market.stocks[selected];
    const limit = creditLimit();
    const {error, trade: fill, order} = side === 'buy' ? executeCredit(stock, account, percent, limit) :
      executeCreditSale(stock, account, $('creditSellQty').valueAsNumber, limit);
    if (error) {
      $('creditFeedback').textContent = error;
      return;
    }
    $('creditDialog').close();
    if (fill) showFill(fill, order.status === 'canceled' ? 0 : order.remaining);
    else feedback(order.status === 'canceled' ? '본인 주문과 충돌해 취소됐어요.' : '신용 지정가 주문이 접수됐어요.');
    render();
  }
  $('stopSave').addEventListener('click', () => {
    if (phase === 'done' || !account.unlocks.stop || adController) return;
    const field = $('stopPercent');
    if (!field.checkValidity() || !Number.isFinite(field.valueAsNumber)) return field.reportValidity();
    account.stops[selected] = field.valueAsNumber;
    $('stopDialog').close();
    feedback(market.stocks[selected].name + ' 로스컷 ' + account.stops[selected] + '% 적용', 'ok');
    render();
  });
  $('stopClear').addEventListener('click', () => {
    account.stops[selected] = null;
    $('stopDialog').close();
    feedback(market.stocks[selected].name + ' 로스컷 설정을 해제했어요.', 'ok');
    render();
  });

  function orderQuantity(stock, side) {
    if (!orderPercent) return orderQty.valueAsNumber;
    const limit = orderType === 'limit' ? orderPrice.valueAsNumber : undefined;
    return maxOrder(stock, account, side, limit, orderPercent);
  }

  function setOrderPercent(percent) {
    orderPercent = percent;
    $('percentTotal').textContent = percent ? percent + '% 선택' : '비율 미선택';
    $('clearPercent').hidden = !percent;
  }

  function renderEstimate(stock = market.stocks[selected]) {
    for (const side of ['buy', 'sell']) {
      const qty = orderQuantity(stock, side);
      const estimate = orderType === 'limit' ? limitEstimate(qty, orderPrice.valueAsNumber)?.[side] :
        quoteOrder(stock, side, qty)?.total;
      const button = $(side);
      const label = side === 'buy' ? '매수' : '매도';
      button.textContent = orderPercent ? label + ' ' + num(qty) + '주' : label;
      $(side === 'buy' ? 'estimateBuy' : 'estimateSell').textContent = estimate === undefined ? '—' : money(estimate);
    }
    $('held').textContent = num(availableShares(account, stock.index)) + ' / ' + num(account.positions[stock.index].qty) + '주';
  }

  function renderStockNews() {
    const headlines = market.headlines.filter(item => item.index === selected);
    const key = selected + ':' + headlines.length;
    if (key === stockNewsKey) return;
    stockNewsKey = key;
    $('stockNewsName').textContent = market.stocks[selected].name;
    $('stockNews').innerHTML = headlines.map(item => {
      const label = newsLabel(item);
      return '<article class="stock-news-row"><div><span class="tag ' + tone(item.direction) + '">' + label +
        '</span>' + (item.time ? '<time>' + timeText(item.time) + '</time>' : '') + '</div><p>' + item.title + '</p></article>';
    }).join('');
    $('stockNews').scrollTop = 0;
  }

  function renderNews() {
    renderStockNews();
    const view = market.headlines.length + ':' + newsMode + ':' + selected;
    if (newsKey === view) return;
    newsKey = view;
    const headlines = market.headlines.filter(item => newsMode === 'all' || item.index === selected);
    $('news').innerHTML = headlines.map(item => {
      const stock = market.stocks[item.index];
      const type = newsLabel(item);
      return '<article class="news-row"><span class="tag ' + tone(item.direction) + '">' + type +
        '</span><div><button type="button" data-stock="' + stock.index + '">' + stock.name +
        '</button><p>' + item.title + '</p></div><time>' + (item.time ? timeText(item.time) : '개장 전') + '</time></article>';
    }).join('');
    if (market.headlines.length > 10) {
      const latest = market.headlines[0];
      const stock = market.stocks[latest.index];
      $('liveNews').hidden = false;
      $('liveNews').dataset.stock = stock.index;
      $('liveNews').className = 'live-news ' + tone(latest.direction);
      $('liveNews').innerHTML = '<span class="tag ' + tone(latest.direction) + '">' + (latest.type ? newsLabel(latest) : '속보 · ' + newsLabel(latest)) +
        '</span><strong>' + stock.name + '</strong><span>' + latest.title + '</span>';
      $('newsUnread').hidden = lastSeenNews >= market.headlines.length;
    } else {
      $('liveNews').hidden = true;
      $('newsUnread').hidden = true;
    }
  }

  function renderAccount() {
    if (accountMode === 'orders') {
      const states = {pending: '체결 대기', partial: '부분 체결', filled: '체결 완료', canceled: '취소', expired: '마감 취소'};
      const rows = account.orders.map(order => {
        const stock = market.stocks[order.index];
        const filled = order.qty - order.remaining;
        const open = order.status === 'pending' || order.status === 'partial';
        const remaining = open ? ' · 남은 ' + num(order.remaining) + '주' : order.remaining ? ' · 취소 ' + num(order.remaining) + '주' : '';
        return '<article class="account-row order-history-row"><div class="pending-row-top"><span class="tag ' +
          (order.side === 'buy' ? 'up">매수' : 'down">매도') + '</span><button type="button" data-stock="' + order.index +
          '">' + stock.name + '</button><time>' + timeText(order.time) + '</time>' + (open ? pendingButtons(order) : '') +
          '</div><p><strong>' + states[order.status] + '</strong> · ' + (order.type === 'market' ? '시장가' : money(order.price)) +
          ' · 체결 ' + num(filled) + ' / ' + num(order.qty) + '주' + remaining +
          (order.amendments ? ' · 정정 ' + order.amendments + '회' : '') + '</p></article>';
      });
      updateAccountList(rows, '아직 접수된 주문이 없어요.');
      return;
    }
    const positions = account.positions.flatMap((position, index) => {
      if (!position.qty) return [];
      const stock = market.stocks[index];
      const profit = stock.price * position.qty - position.cost;
      const reserved = position.qty - availableShares(account, index);
      return '<div class="account-row"><span class="stock-icon" style="--icon:' + stock.color + '">' + stock.short +
        '</span><div><button type="button" data-stock="' + index + '">' + stock.name +
        '</button><p>' + num(position.qty) + '주 · 평균 매입 ' + money(position.cost / position.qty) +
        (reserved ? ' · 매도 예약 ' + num(reserved) + '주' : '') +
        (position.principal ? ' · 신용 ' + num(position.creditQty) + '주 · 신용 평단 ' + money(position.creditCost / position.creditQty) +
          ' · 연결 채무 ' + money(position.principal) + ' · 공동담보 ' + ratioText(ledger.ratio(market, account)) : '') +
        (account.stops[index] === null ? '' : ' · 로스컷 ' + account.stops[index] + '%') +
        '</p></div><strong class="' + tone(profit) + '">' + signed(profit) + '원</strong></div>';
    });
    const fills = account.trades.map(trade =>
      '<div class="account-row"><span class="tag ' + (trade.side === 'buy' ? 'up">매수' : 'down">매도') +
      '</span><div><button type="button" data-stock="' + trade.index + '">' + market.stocks[trade.index].name +
      '</button><p>' + ({limit: '지정가', forced: '반대매매', stop: '로스컷'}[trade.type] || '시장가') + ' · ' + num(trade.qty) + '주 × 평균 ' +
      money(trade.average) + '</p></div><time>' + timeText(trade.time) + '</time></div>');
    const rows = accountMode === 'positions' ? positions : fills;
    const fallback = accountMode === 'positions' ? '보유 중인 종목이 없어요.' : '아직 체결된 주문이 없어요.';
    updateAccountList(rows, fallback);
  }

  function updateAccountList(rows, fallback) {
    const html = rows.length ? rows.join('') : '<div class="empty">' + fallback + '</div>';
    if ($('account').dataset.content !== html) {
      $('account').innerHTML = html;
      $('account').dataset.content = html;
    }
  }

  function pendingButtons(order) {
    const label = market.stocks[order.index].name + ' 지정가 주문 ' + order.id + '번 ';
    if (order.type === 'forced' || order.type === 'stop') return '<small>' + (order.type === 'forced' ? '반대매매' : '로스컷') + '</small>';
    const disabled = phase === 'live' && !isHalted(market.stocks[order.index]) ? '' : ' disabled';
    return '<button type="button" class="amend-order" data-amend="' + order.id + '" aria-label="' + label + '정정"' +
      disabled + '>정정</button><button type="button" class="cancel-order" data-cancel="' + order.id + '" aria-label="' +
      label + '취소"' + disabled + '>취소</button>';
  }

  function renderPending() {
    const count = account.pending.length;
    $('pendingJump').textContent = '미체결 ' + count + '건 ↓';
    const reserved = account.cash - availableCash(account);
    $('reservedCash').textContent = '대기 ' + count + '건 · 예약 현금 ' + money(reserved) + ' · 예약 신용 ' + money(ledger.reserved(account, 'creditReserve'));
    const list = $('pending');
    const html = count ? account.pending.map(order => {
      const filled = order.qty - order.remaining;
      const side = order.side === 'buy' ? 'up">매수' : 'down">매도';
      return '<article class="pending-row"><div class="pending-row-top"><span class="tag ' + side +
        '</span><button type="button" class="pending-stock" data-stock="' + order.index + '">' +
        market.stocks[order.index].name + '</button>' + pendingButtons(order) + '</div><p>' + money(order.price) +
        ' · 남은 ' + num(order.remaining) + '주</p><small>' + (filled ? '부분 체결 ' + num(filled) + ' / ' + num(order.qty) + '주' : '체결 대기') +
        '</small></article>';
    }).join('') : '<div class="empty">미체결 주문이 없어요.</div>';
    if (list.dataset.content !== html) {
      list.innerHTML = html;
      list.dataset.content = html;
    }
  }

  function render() {
    const stock = market.stocks[selected];
    renderWatchlist();
    renderStock(stock);
    renderDepth(stock);
    renderEstimate(stock);
    renderNews();
    renderMetrics();
    renderAccount();
    renderPending();
    renderOrderAvailability();
    renderRisk();
  }

  function feedback(message, type = '') {
    $('feedback').textContent = message;
    $('feedback').dataset.type = type;
  }

  function selectStock(index, jump) {
    if (!market.stocks[index]) return;
    if (selected !== index) {
      orderPrice.value = String(market.stocks[index].price);
      setOrderPercent(0);
    }
    selected = index;
    cursor = null;
    if (phase === 'live') feedback(market.stocks[index].name + ' 주문을 준비할 수 있어요.');
    render();
    if (jump && window.matchMedia('(max-width: 810px)').matches) $('market').scrollIntoView({block: 'start'});
  }

  function syncTime() {
    if (phase !== 'live') return;
    const target = Math.min(TOTAL_TICKS, Math.floor((performance.now() - startedAt) / INTERVAL));
    if (market.tick < target) {
      const last = account.trades[0];
      while (market.tick < target) stepMarket(market, account);
      if (market.tick === TOTAL_TICKS) {
        finish();
        return;
      }
      if (account.trades[0] !== last) showFill(account.trades[0]);
      render();
    }
    renderClock();
  }

  function start() {
    if (phase !== 'ready') return;
    startedAt = performance.now();
    setupAudio();
    phase = 'live';
    feedback('수량을 확인한 뒤 매수 또는 매도를 누르세요.');
    renderPhase();
    loop = window.setInterval(syncTime, 50);
    if (window.matchMedia('(max-width: 550px)').matches) $('market').scrollIntoView({block: 'start'});
  }

  function suspend(reason) {
    if (phase !== 'live') return;
    syncTime();
    if (phase !== 'live') return;
    pausedAt = performance.now();
    phase = 'paused';
    pauseReason = reason;
    clearInterval(loop);
    renderPhase();
    render();
  }

  function resume() {
    if (phase !== 'paused' || adController || document.hidden) return;
    startedAt += performance.now() - pausedAt;
    phase = 'live';
    pauseReason = null;
    loop = window.setInterval(syncTime, 50);
    renderPhase();
    render();
  }

  function togglePause() {
    if (adController) return;
    if (phase === 'live') {
      suspend('manual');
      if (phase === 'paused') feedback('거래를 재개하면 남은 시간과 미체결 주문이 이어져요.');
    } else if (phase === 'paused') {
      resume();
      if (phase === 'live') feedback('거래를 재개했어요.');
    }
  }

  function showFill(fill, remaining = 0) {
    const type = {limit: '지정가 ', forced: '반대매매 ', stop: '로스컷 '}[fill.type] || '';
    const side = fill.side === 'buy' ? '매수 ' : '매도 ';
    feedback(market.stocks[fill.index].name + ' ' + type + side + num(fill.qty) + '주 체결 · 평균 ' +
      money(fill.average) + (remaining ? ' · 남은 ' + num(remaining) + '주' : ''), 'ok');
  }

  function trade(side) {
    syncTime();
    if (phase !== 'live') return;
    const stock = market.stocks[selected];
    const qty = orderQuantity(stock, side);
    if (orderPercent && orderType === 'limit' && !limitEstimate(1, orderPrice.valueAsNumber)) {
      feedback('가격제한폭과 호가단위를 확인하세요.', 'error');
      return;
    }
    if (orderPercent && !qty) {
      feedback('선택한 비율로 주문 가능한 수량이 0주예요.', 'error');
      return;
    }
    const {error, trade: fill, order} = orderType === 'limit' ?
      placeLimit(stock, account, side, qty, orderPrice.valueAsNumber) : executeOrder(stock, account, side, qty);
    if (error) {
      feedback(error, 'error');
      return;
    }
    setOrderPercent(0);
    if (fill) showFill(fill, order.status === 'canceled' ? 0 : order.remaining);
    else if (order.status === 'canceled') feedback('본인 미체결 주문과 충돌해 잔량이 취소됐어요.', 'error');
    else feedback(stock.name + ' 지정가 ' + (side === 'buy' ? '매수 ' : '매도 ') + num(qty) + '주 접수 · 체결 대기', 'ok');
    render();
  }

  function loadAmendment(order, message = '') {
    amendment = {id: order.id, remaining: order.remaining};
    const name = market.stocks[order.index].name;
    $('amendContext').textContent = name + ' · ' + (order.side === 'buy' ? '매수' : '매도') +
      ' · 기존 지정가 ' + money(order.price) + ' · 남은 ' + num(order.remaining) + '주';
    const {limits, tick} = market.stocks[order.index].depth;
    $('amendPrice').min = String(limits.lower);
    $('amendPrice').max = String(limits.upper);
    $('amendPrice').step = String(tick);
    $('amendPrice').value = String(order.price);
    $('amendQty').value = String(order.remaining);
    $('amendFeedback').textContent = message;
    $('amendFeedback').dataset.type = 'error';
  }

  function openAmendment(id) {
    syncTime();
    if (phase !== 'live') return;
    const order = account.pending.find(item => item.id === id);
    if (!order) {
      feedback('이미 체결되었거나 취소된 주문이에요.', 'error');
      return;
    }
    loadAmendment(order);
    $('amendDialog').showModal();
  }

  function submitAmendment(event) {
    event.preventDefault();
    syncTime();
    if (phase !== 'live' || !amendment) return;
    const current = account.pending.find(item => item.id === amendment.id);
    if (!current) {
      $('amendFeedback').textContent = '이미 체결되었거나 취소된 주문이에요.';
      return;
    }
    if (current.remaining !== amendment.remaining) {
      loadAmendment(current, '정정하는 동안 일부가 체결됐어요. 최신 잔량을 보고 다시 입력해 주세요.');
      return;
    }
    const {error, order, trade: fill} = amendLimit(market, account, current.id, $('amendQty').valueAsNumber,
      $('amendPrice').valueAsNumber);
    if (error) {
      $('amendFeedback').textContent = error;
      return;
    }
    $('amendDialog').close();
    if (fill) showFill(fill, order.remaining);
    else feedback(market.stocks[order.index].name + ' 주문 정정 · ' + money(order.price) + ' · ' +
      num(order.remaining) + '주 체결 대기', 'ok');
    render();
  }

  function finish() {
    phase = 'done';
    clearInterval(loop);
    const expired = expirePending(market, account);
    const total = equity(market, account);
    const profit = total - CASH;
    const rate = profit / CASH * 100;
    const record = account.trades.length > 0 && (best === null || rate > best);
    if (record) {
      best = rate;
      try { localStorage.setItem(bestKey, String(best)); } catch { /* Per-session records still work. */ }
    }
    result = {seed: market.seed, total, profit, rate, count: account.trades.length, fees: account.fees, record, details: ledger.snapshot(market, account)};
    feedback(expired ? '장이 마감되어 미체결 ' + expired + '건이 자동 취소됐어요.' :
      '장이 마감됐어요. 최종 평가자산은 보유 종목을 종가로 계산했어요.');
    renderPhase();
    render();
    if ($('guide').open) $('guide').close();
    for (const id of ['amendDialog', 'creditDialog', 'stopDialog']) if ($(id).open) $(id).close();
    openResult();
  }

  function openResult() {
    const {seed, record, rate, total, profit, count, fees} = result;
    $('score').innerHTML = '<span>' + (record ? '개인 최고 기록' : '최종 수익률') + '</span><strong>' + pct(rate) +
      '</strong><dl><div><dt>최종 순자산</dt><dd>' + money(total) + '</dd></div><div><dt>총손익</dt><dd>' + signed(profit) +
      '원</dd></div><div><dt>거래 횟수</dt><dd>' + count + '회</dd></div><div><dt>총수수료</dt><dd>' + money(fees) +
      '</dd></div><div><dt>장세 코드</dt><dd>' + code(seed) + '</dd></div></dl>';
    renderScoreDetails(result.details);
    $('result').showModal();
    prepareScoreImage(result, code(seed));
  }

  function reset() {
    clearInterval(loop);
    $('result').close();
    for (const id of ['creditDialog', 'stopDialog', 'amendDialog']) if ($(id).open) $(id).close();
    pauseReason = null;
    latestNotice = null;
    if (/^https?:$/.test(location.protocol)) {
      const url = new URL(location.href);
      url.searchParams.delete('seed');
      if (url.hash.startsWith('#score=')) url.hash = '';
      history.replaceState(null, '', url);
    }
    const previousOpenings = new Set(market.stocks.map(stock => stock.preview));
    do {
      market = createMarket(randomSeed());
    } while (market.stocks.some(stock => previousOpenings.has(stock.preview)));
    account = createAccount();
    stockButtons = buildWatchlist();
    watchKey = '';
    phase = 'ready';
    result = null;
    scoreImage = null;
    amendment = null;
    cursor = null;
    selected = 0;
    newsKey = '';
    stockNewsKey = '';
    lastSeenNews = 0;
    $('shareFeedback').textContent = '';
    $('scoreShareLink').hidden = true;
    $('search').value = '';
    orderQty.value = '100';
    setOrderPercent(0);
    orderPrice.value = String(market.stocks[selected].price);
    feedback('거래를 시작하면 주문할 수 있어요.');
    renderPhase();
    render();
    window.scrollTo(0, 0);
    $('start').focus({preventScroll: true});
  }

  function restartRound() {
    if (adController || (phase === 'ready' && !result)) return;
    reset();
    start();
  }

  function setShareEnabled(enabled) {
    $('openScoreShare').disabled = !enabled;
    $('shareImage').disabled = !enabled;
  }

  function prepareScoreImage(snapshot, seedCode) {
    setShareEnabled(false);
    const image = document.createElement('canvas');
    image.width = 920;
    image.height = 660;
    const ctx = image.getContext('2d');
    ctx.fillStyle = '#edf2f8';
    ctx.fillRect(0, 0, image.width, image.height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(28, 28, 864, 604);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(28, 28, 864, 6);
    function label(value, x, y, size, color, weight = 600) {
      ctx.fillStyle = color;
      ctx.font = weight + ' ' + size + 'px "Malgun Gothic", "Noto Sans KR", sans-serif';
      ctx.fillText(value, x, y);
    }
    function field(name, value, x, y) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(x, y - 24, 360, 1);
      label(name, x, y + 3, 19, '#cbd5e1');
      label(value, x, y + 41, 29, '#fff', 800);
    }
    label('5분 단타왕  /  장 마감 성적표', 63, 103, 33, '#fff', 800);
    label(snapshot.record ? '최종 수익률 · 개인 최고 기록' : '최종 수익률', 65, 166, 22, '#cbd5e1');
    label(pct(snapshot.rate), 59, 268, 94, '#fbbf24', 900);
    field('최종 평가자산', money(snapshot.total), 65, 333);
    field('총손익', signed(snapshot.profit) + '원', 495, 333);
    field('거래 횟수', snapshot.count + '회', 65, 427);
    field('총수수료', money(snapshot.fees), 495, 427);
    field('장세 코드', seedCode, 65, 521);
    label('가상 모의거래 · dailyfoodfighter.com', 65, 605, 18, '#94a3b8');
    image.toBlob(blob => {
      if (result !== snapshot) return;
      if (!blob) {
        showShareHelp('성적표 이미지를 만들지 못했어요.');
        return;
      }
      scoreImage = new File([blob], 'scalping-king-' + seedCode + '.png', {type: 'image/png'});
      setShareEnabled(true);
    }, 'image/png');
  }

  function showShareHelp(message) {
    const {seed, total, count, fees, record} = result;
    const url = new URL(location.href);
    url.hash = 'score=' + [code(seed), total, count, fees, Number(record)].join(',');
    try { history.replaceState(null, '', url); } catch { /* The result address is still available below. */ }
    const link = $('scoreShareLink');
    link.value = url.href;
    link.hidden = false;
    $('shareFeedback').textContent = message +
      ' 카카오톡에서 열었다면 메뉴에서 외부 브라우저로 열어 주세요. 아래 주소를 Chrome이나 Safari에서 열어도 같은 성적표를 이어서 공유할 수 있어요.';
    if (!$('result').open) $('result').showModal();
  }

  async function shareScoreImage() {
    if (!scoreImage) return;
    const file = scoreImage;
    const files = [file];
    $('shareFeedback').textContent = '';
    $('scoreShareLink').hidden = true;
    try {
      if (!navigator.share || (navigator.canShare && !navigator.canShare({files}))) {
        showShareHelp('현재 브라우저에서 이미지 공유 메뉴를 열 수 없어요.');
        return;
      }
      setShareEnabled(false);
      await navigator.share({files});
    } catch (error) {
      if (error.name !== 'AbortError' && scoreImage === file) {
        showShareHelp('이미지 공유 메뉴를 열지 못했어요.');
      }
    } finally {
      if (scoreImage === file) setShareEnabled(true);
    }
  }

  function segment(name, update) {
    const buttons = [...document.querySelectorAll('[data-' + name + ']')];
    buttons.forEach(button => button.addEventListener('click', () => {
      buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      update(button.dataset[name]);
    }));
  }

  watchlist.addEventListener('click', event => {
    const button = event.target.closest('[data-stock]');
    if (button) selectStock(Number(button.dataset.stock), false);
  });
  orderBook.addEventListener('click', event => {
    const price = event.target.closest('[data-price]');
    if (!price) return;
    orderPrice.value = price.dataset.price;
    $('limitMode').click();
  });
  for (const id of ['news', 'account', 'liveNews', 'pending']) {
    $(id).addEventListener('click', event => {
      const amend = event.target.closest('[data-amend]');
      if (amend) {
        openAmendment(Number(amend.dataset.amend));
        return;
      }
      const cancel = event.target.closest('[data-cancel]');
      if (cancel) {
        syncTime();
        if (phase !== 'live') return;
        const {order, error} = cancelLimit(market, account, Number(cancel.dataset.cancel));
        feedback(error || market.stocks[order.index].name + ' 미체결 ' + num(order.remaining) + '주를 취소했어요.', order ? 'ok' : 'error');
        render();
        return;
      }
      const button = event.target.closest('[data-stock]');
      if (button) selectStock(Number(button.dataset.stock), id !== 'liveNews');
      if (id === 'news' || id === 'liveNews') {
        lastSeenNews = market.headlines.length;
        $('newsUnread').hidden = true;
      }
    });
  }
  $('search').addEventListener('input', renderWatchlist);
  $('sort').addEventListener('change', renderWatchlist);
  $('showMA').addEventListener('change', renderChart);
  $('start').addEventListener('click', start);
  $('openScoreShare').addEventListener('click', shareScoreImage);
  $('startNextRound').addEventListener('click', restartRound);
  $('pause').addEventListener('click', togglePause);
  $('jumpPause').addEventListener('click', togglePause);
  $('restart').addEventListener('click', restartRound);
  $('gameHome').addEventListener('click', () => { if (!adController) reset(); });
  $('jumpRestart').addEventListener('click', restartRound);
  $('guideButton').addEventListener('click', () => $('guide').showModal());
  $('amendForm').addEventListener('submit', submitAmendment);
  $('buy').addEventListener('click', () => trade('buy'));
  $('sell').addEventListener('click', () => trade('sell'));
  $('shareImage').addEventListener('click', shareScoreImage);
  orderQty.addEventListener('input', () => {
    setOrderPercent(0);
    renderEstimate();
  });
  for (const button of document.querySelectorAll('[data-percent]')) {
    button.addEventListener('click', () => {
      setOrderPercent(Math.min(100, orderPercent + Number(button.dataset.percent)));
      renderEstimate();
    });
  }
  $('clearPercent').addEventListener('click', () => {
    setOrderPercent(0);
    renderEstimate();
    orderQty.focus({preventScroll: true});
  });
  orderPrice.value = String(market.stocks[selected].price);
  orderPrice.addEventListener('input', () => renderEstimate());
  for (const [id, bookSide] of [['bestBid', 'bids'], ['bestAsk', 'asks']]) {
    $(id).addEventListener('click', () => {
      syncTime();
      const level = market.stocks[selected].book[bookSide].find(item => item.qty);
      if (level) {
        orderPrice.value = String(level.price);
        renderEstimate();
      }
    });
  }
  function setQuantity(value) {
    setOrderPercent(0);
    orderQty.value = String(Math.max(1, Math.min(99999, value)));
    renderEstimate();
  }
  $('minus').addEventListener('click', () => setQuantity(Math.floor(orderQty.valueAsNumber || 1) - 1));
  $('plus').addEventListener('click', () => setQuantity(Math.floor(orderQty.valueAsNumber || 0) + 1));
  document.querySelectorAll('[data-quantity]').forEach(button =>
    button.addEventListener('click', () => setQuantity(Number(button.dataset.quantity))));
  for (const [id, side] of [['maxBuy', 'buy'], ['maxSell', 'sell']]) {
    $(id).addEventListener('click', () => {
      syncTime();
      const limit = orderType === 'limit' ? orderPrice.valueAsNumber : undefined;
      const maximum = maxOrder(market.stocks[selected], account, side, limit);
      if (maximum) setQuantity(maximum);
      else feedback(side === 'buy' ? '매수 가능한 수량이 없어요.' : '매도 가능한 수량이 없어요.', 'error');
    });
  }
  segment('chart', value => {
    chartMode = value;
    cursor = null;
    $('chartLabel').textContent = value + '초 시가·고가·저가·종가';
    renderChart();
  });
  segment('news', value => { newsMode = value; renderNews(); });
  segment('order', value => {
    orderType = value;
    const isLimit = value === 'limit';
    $('limitFields').hidden = !isLimit;
    $('buyLabel').textContent = isLimit ? '매수 예약 금액' : '매수 예상 결제';
    $('sellLabel').textContent = isLimit ? '매도 최소 정산' : '매도 예상 정산';
    renderEstimate();
    if (isLimit) orderPrice.scrollIntoView({block: 'nearest', inline: 'nearest'});
  });
  segment('account', value => { accountMode = value; renderAccount(); });
  $('jumpChart').addEventListener('click', () => $('market').scrollIntoView({block: 'start'}));
  $('jumpTrade').addEventListener('click', () => $('orderTitle').scrollIntoView({block: 'start'}));
  $('marketJump').addEventListener('click', () => $('search').focus());
  $('pendingJump').addEventListener('click', () => $('pendingTitle').scrollIntoView({block: 'nearest'}));
  $('jumpNews').addEventListener('click', () => {
    $('stockNewsTitle').scrollIntoView({block: 'start'});
    lastSeenNews = market.headlines.length;
    $('newsUnread').hidden = true;
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    const bounds = canvas.getBoundingClientRect();
    cursor = {x: event.clientX - bounds.left, y: event.clientY - bounds.top};
    renderChart();
  });
  canvas.addEventListener('pointerleave', () => { cursor = null; renderChart(); });
  new ResizeObserver(renderChart).observe(canvas);
  const shell = document.querySelector('.shell');
  const orderPanel = document.querySelector('.order-panel');
  const sidebar = document.querySelector('.sidebar');
  const panelSizes = new ResizeObserver(entries => {
    for (const {target} of entries) {
      if (target === orderPanel) shell.style.setProperty('--order-panel-height', target.offsetHeight + 'px');
      else shell.style.setProperty('--watchlist-offset', target.offsetHeight + 12 + 'px');
    }
  });
  panelSizes.observe(orderPanel, {box: 'border-box'});
  panelSizes.observe(sidebar, {box: 'border-box'});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend('background');
    else if (pauseReason === 'background') resume();
  });

  renderPhase();
  render();
  if (result) openResult();
}());
