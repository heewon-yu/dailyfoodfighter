(function () {
  'use strict';

  const {CASH, DURATION, INTERVAL, BOOK_INTERVAL, TOTAL_TICKS, createMarket, refreshBooks, stepMarket, createAccount,
    quoteOrder, maxOrder, executeOrder, limitEstimate, availableCash, availableShares, placeLimit, matchPending,
    cancelLimit, equity} = ScalpMarket;
  const {drawChart, timeText} = ScalpChart;
  const $ = id => document.getElementById(id);
  const fmt = new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 0});
  const num = value => fmt.format(value);
  const money = value => num(value) + '원';
  const signed = value => (value > 0 ? '+' : '') + num(value);
  const pct = value => (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  const tone = value => value > 0 ? 'up' : value < 0 ? 'down' : '';
  const delta = stock => (stock.price / stock.reference - 1) * 100;
  const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
  const code = seed => seed.toString(36).toUpperCase().padStart(7, '0');
  const bestKey = 'scalping-king.best.v1';
  const publicURL = 'https://dailyfoodfighter.com/games/scalping-king/';

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

  let market = createMarket(initialSeed());
  let account = createAccount();
  let best = readBest();
  let selected = 0;
  let phase = 'ready';
  let startedAt = 0;
  let pausedAt = 0;
  let loop = 0;
  let bookStep = 0;
  let chartMode = '10';
  let newsMode = 'all';
  let orderType = 'market';
  let accountMode = 'positions';
  let cursor = null;
  let newsKey = '';
  let stockNewsKey = '';
  let lastSeenNews = 0;
  let result = null;
  let watchKey = '';
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
        '</span><span class="stock-name"><b>' + stock.name + '</b><small>' + stock.sector +
        '</small></span><span class="stock-value"><b></b><small></small></span>';
      return button;
    });
  }

  const stockButtons = buildWatchlist();

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
      if (sort === 'volume') stocks.sort((a, b) => b.volume - a.volume);
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
    stocks.forEach(stock => {
      const button = stockButtons[stock.index];
      const period = phase !== 'ready' && (sort === 'surge' || sort === 'drop') ? change10(stock) : delta(stock);
      const [price, rate] = button.lastElementChild.children;
      button.setAttribute('aria-pressed', String(stock.index === selected));
      price.textContent = num(stock.price);
      price.className = tone(delta(stock));
      rate.textContent = pct(period);
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
    const unrealized = profit - account.realized;
    $('positionCount').textContent = account.positions.filter(position => position.qty).length + '개';
    $('unrealized').textContent = signed(unrealized) + '원';
    $('unrealized').className = tone(unrealized);
    $('realized').textContent = signed(account.realized) + '원';
    $('realized').className = tone(account.realized);
  }

  function renderClock() {
    const now = phase === 'paused' ? pausedAt : performance.now();
    const remaining = phase === 'done' ? 0 : phase === 'ready' ? DURATION :
      Math.max(0, Math.ceil(DURATION - (now - startedAt) / 1000));
    $('timer').textContent = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
    $('timer').classList.toggle('urgent', phase === 'live' && remaining <= 30);
    $('timerBar').style.width = remaining / DURATION * 100 + '%';
  }

  function renderPhase() {
    $('status').textContent = {ready: '개장 대기', live: '거래 진행 중', paused: '일시정지', done: '장 마감'}[phase];
    $('status').closest('.session').dataset.phase = phase;
    $('seedLabel').textContent = code(market.seed);
    const inSession = phase === 'live' || phase === 'paused';
    $('start').hidden = inSession;
    $('start').textContent = phase === 'done' ? '성적표 다시 보기' : '▶ 5분 거래 시작';
    $('heroMain').textContent = phase === 'done' ? '마감 수익률을 확인하고 성적표를 공유하세요.' :
      '5분간 1억원으로 단타를 쳐서 수익을 내보세요!';
    $('heroInvite').hidden = phase === 'done';
    for (const id of ['pause', 'jumpPause']) {
      $(id).hidden = !inSession;
      $(id).textContent = phase === 'paused' ? '거래 재개' : '일시정지';
    }
    $('buy').disabled = phase !== 'live';
    $('sell').disabled = phase !== 'live';
    renderClock();
  }

  function renderChart() {
    const display = drawChart(canvas, market.stocks[selected], {mode: chartMode, showMA: $('showMA').checked, cursor});
    if (!display) return;
    const {bar, legend} = display;
    $('ohlc').textContent = '시 ' + num(bar.open) + ' 고 ' + num(bar.high) + ' 저 ' + num(bar.low) + ' 종 ' + num(bar.close);
    $('maKey').innerHTML = legend.filter(entry => entry.value !== null)
      .map(entry => '<b style="color:' + entry.color + '">MA' + entry.period + ' ' + num(entry.value) + '</b>').join('　');
  }

  function renderStock(stock) {
    $('stockTitle').innerHTML = stock.name + '<small>SIM-' + String(stock.index + 1).padStart(2, '0') + ' · ' + stock.sector + '</small>';
    $('price').textContent = num(stock.price);
    $('price').className = tone(delta(stock));
    const jump = stock.price - stock.reference;
    $('change').textContent = (jump > 0 ? '▲ ' : jump < 0 ? '▼ ' : '') + signed(jump) + ' (' + pct(delta(stock)) + ')';
    $('change').className = tone(delta(stock));
    $('reference').textContent = num(stock.reference);
    $('high').textContent = num(stock.high);
    $('low').textContent = num(stock.low);
    $('volume').textContent = num(stock.volume) + '주';
    $('company').textContent = stock.description + ' 개장 전 뉴스: ' + stock.preview;
    $('volatility').textContent = '변동성 ' + (stock.volatility >= 1.2 ? '높음' : stock.volatility >= .9 ? '보통' : '낮음');
    $('orderStock').textContent = stock.name + ' · 현재가 ' + money(stock.price);
    renderChart();
  }

  function renderDepth(stock) {
    const {asks, bids} = stock.book;
    const peak = Math.max(1, ...asks.map(level => level.qty), ...bids.map(level => level.qty));
    function updateRows(rows, levels) {
      levels.forEach((level, index) => {
        const {row, price, qty} = rows[index];
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
    $('tape').innerHTML = stock.ticks.slice(-4).reverse().map(bar =>
      '<div class="tape-row"><span>' + timeText(bar.time) + '</span><span class="' + tone(bar.close - bar.open) + '">' +
      num(bar.close) + '</span><span>' + num(bar.volume) + '주</span></div>').join('');
  }

  function renderEstimate(stock = market.stocks[selected]) {
    const qty = orderQty.valueAsNumber;
    const limit = orderType === 'limit';
    const estimate = limit ? limitEstimate(qty, orderPrice.valueAsNumber) : {
      buy: quoteOrder(stock, 'buy', qty)?.total, sell: quoteOrder(stock, 'sell', qty)?.total,
    };
    $('estimateBuy').textContent = estimate?.buy === undefined ? '—' : money(estimate.buy);
    $('estimateSell').textContent = estimate?.sell === undefined ? '—' : money(estimate.sell);
    $('held').textContent = num(availableShares(account, stock.index)) + ' / ' + num(account.positions[stock.index].qty) + '주';
  }

  function renderStockNews() {
    const headlines = market.headlines.filter(item => item.index === selected);
    const key = selected + ':' + headlines.length;
    if (key === stockNewsKey) return;
    stockNewsKey = key;
    $('stockNewsName').textContent = market.stocks[selected].name;
    $('stockNews').innerHTML = headlines.map(item => {
      const label = item.direction > 0 ? '호재' : item.direction < 0 ? '악재' : '개장 전';
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
      const type = item.direction > 0 ? '호재' : item.direction < 0 ? '악재' : '개장 전';
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
      $('liveNews').innerHTML = '<span class="tag ' + tone(latest.direction) + '">' + (latest.direction > 0 ? '속보 · 호재' : '속보 · 악재') +
        '</span><strong>' + stock.name + '</strong><span>' + latest.title + '</span>';
      $('newsUnread').hidden = lastSeenNews >= market.headlines.length;
    } else {
      $('liveNews').hidden = true;
      $('newsUnread').hidden = true;
    }
  }

  function renderAccount() {
    const positions = account.positions.flatMap((position, index) => {
      if (!position.qty) return [];
      const stock = market.stocks[index];
      const profit = stock.price * position.qty - position.cost;
      const reserved = position.qty - availableShares(account, index);
      return '<div class="account-row"><span class="stock-icon" style="--icon:' + stock.color + '">' + stock.short +
        '</span><div><button type="button" data-stock="' + index + '">' + stock.name +
        '</button><p>' + num(position.qty) + '주 · 평균 매입 ' + money(position.cost / position.qty) +
        (reserved ? ' · 매도 예약 ' + num(reserved) + '주' : '') +
        '</p></div><strong class="' + tone(profit) + '">' + signed(profit) + '원</strong></div>';
    });
    const fills = account.trades.map(trade =>
      '<div class="account-row"><span class="tag ' + (trade.side === 'buy' ? 'up">매수' : 'down">매도') +
      '</span><div><button type="button" data-stock="' + trade.index + '">' + market.stocks[trade.index].name +
      '</button><p>' + (trade.type === 'limit' ? '지정가' : '시장가') + ' · ' + num(trade.qty) + '주 × 평균 ' +
      money(trade.average) + '</p></div><time>' + timeText(trade.time) + '</time></div>');
    const rows = accountMode === 'positions' ? positions : fills;
    const fallback = accountMode === 'positions' ? '보유 중인 종목이 없어요.' : '아직 체결된 주문이 없어요.';
    const html = rows.length ? rows.join('') : '<div class="empty">' + fallback + '</div>';
    if ($('account').dataset.content !== html) {
      $('account').innerHTML = html;
      $('account').dataset.content = html;
    }
  }

  function renderPending() {
    const count = account.pending.length;
    $('pendingJump').textContent = '미체결 ' + count + '건 ↓';
    const reserved = account.cash - availableCash(account);
    $('reservedCash').textContent = '대기 ' + count + '건 · 예약 현금 ' + money(reserved);
    const list = $('pending');
    const html = count ? account.pending.map(order => {
      const filled = order.qty - order.remaining;
      const side = order.side === 'buy' ? 'up">매수' : 'down">매도';
      return '<article class="pending-row"><div class="pending-row-top"><span class="tag ' + side +
        '</span><button type="button" class="pending-stock" data-stock="' + order.index + '">' +
        market.stocks[order.index].name + '</button><button type="button" class="cancel-order" data-cancel="' + order.id +
        '" aria-label="' + market.stocks[order.index].name + ' 지정가 주문 ' + order.id + '번 취소"' +
        (phase === 'live' ? '' : ' disabled') + '>취소</button></div><p>' + money(order.price) +
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
  }

  function feedback(message, type = '') {
    $('feedback').textContent = message;
    $('feedback').dataset.type = type;
  }

  function selectStock(index, jump) {
    if (!market.stocks[index]) return;
    if (selected !== index) orderPrice.value = String(market.stocks[index].price);
    selected = index;
    cursor = null;
    if (phase === 'live') feedback(market.stocks[index].name + ' 주문을 준비할 수 있어요.');
    render();
    if (jump && window.matchMedia('(max-width: 810px)').matches) $('market').scrollIntoView({block: 'start'});
  }

  function syncTime() {
    if (phase !== 'live') return;
    const target = Math.min(TOTAL_TICKS * 2, Math.floor((performance.now() - startedAt) / BOOK_INTERVAL));
    if (target > bookStep) {
      const previousTick = market.tick;
      let lastFill = null;
      while (bookStep < target) {
        bookStep += 1;
        if (bookStep % 2) refreshBooks(market);
        else stepMarket(market);
        if (bookStep < TOTAL_TICKS * 2) {
          lastFill = matchPending(market, account, bookStep * BOOK_INTERVAL / 1000).at(-1) ?? lastFill;
        }
      }
      if (market.tick === TOTAL_TICKS) {
        finish();
        return;
      }
      if (lastFill) showFill(lastFill.trade, lastFill.remaining);
      if (lastFill || market.tick > previousTick) render();
      else {
        renderDepth(market.stocks[selected]);
        renderEstimate();
      }
    }
    renderClock();
  }

  function start() {
    if (phase === 'done') {
      $('result').showModal();
      return;
    }
    if (phase !== 'ready') return;
    startedAt = performance.now();
    bookStep = 0;
    phase = 'live';
    feedback('수량을 확인한 뒤 매수 또는 매도를 누르세요.');
    renderPhase();
    loop = window.setInterval(syncTime, 50);
    if (window.matchMedia('(max-width: 550px)').matches) $('market').scrollIntoView({block: 'start'});
  }

  function togglePause() {
    if (phase === 'live') {
      syncTime();
      if (phase !== 'live') return;
      pausedAt = performance.now();
      phase = 'paused';
      clearInterval(loop);
      feedback('거래를 재개하면 남은 시간과 미체결 주문이 이어져요.');
    } else if (phase === 'paused') {
      startedAt += performance.now() - pausedAt;
      phase = 'live';
      loop = window.setInterval(syncTime, 50);
      feedback('거래를 재개했어요.');
    } else return;
    renderPhase();
    renderPending();
  }

  function showFill(fill, remaining = 0) {
    const type = fill.type === 'limit' ? '지정가 ' : '';
    const side = fill.side === 'buy' ? '매수 ' : '매도 ';
    feedback(market.stocks[fill.index].name + ' ' + type + side + num(fill.qty) + '주 체결 · 평균 ' +
      money(fill.average) + (remaining ? ' · 남은 ' + num(remaining) + '주' : ''), 'ok');
  }

  function trade(side) {
    syncTime();
    if (phase !== 'live') return;
    const stock = market.stocks[selected];
    const qty = orderQty.valueAsNumber;
    const time = bookStep * BOOK_INTERVAL / 1000;
    const {error, trade: fill, order} = orderType === 'limit' ?
      placeLimit(stock, account, side, qty, orderPrice.valueAsNumber, time) : executeOrder(stock, account, side, qty, time);
    if (error) {
      feedback(error, 'error');
      return;
    }
    if (fill) showFill(fill, order?.remaining);
    else feedback(stock.name + ' 지정가 ' + (side === 'buy' ? '매수 ' : '매도 ') + num(qty) + '주 접수 · 체결 대기', 'ok');
    render();
  }

  function finish() {
    phase = 'done';
    clearInterval(loop);
    const expired = account.pending.length;
    account.pending.length = 0;
    const total = equity(market, account);
    const profit = total - CASH;
    const rate = profit / CASH * 100;
    const record = account.trades.length > 0 && (best === null || rate > best);
    if (record) {
      best = rate;
      try { localStorage.setItem(bestKey, String(best)); } catch { /* Per-session records still work. */ }
    }
    result = {total, profit, rate, count: account.trades.length, fees: account.fees, record};
    $('score').innerHTML = '<span>' + (record ? '개인 최고 기록' : '최종 수익률') + '</span><strong>' + pct(rate) +
      '</strong><dl><div><dt>최종 평가자산</dt><dd>' + money(total) + '</dd></div><div><dt>총손익</dt><dd>' + signed(profit) +
      '원</dd></div><div><dt>거래 횟수</dt><dd>' + result.count + '회</dd></div><div><dt>총수수료</dt><dd>' + money(result.fees) +
      '</dd></div><div><dt>장세 코드</dt><dd>' + code(market.seed) + '</dd></div></dl>';
    feedback(expired ? '장이 마감되어 미체결 ' + expired + '건이 자동 취소됐어요.' :
      '장이 마감됐어요. 최종 평가자산은 보유 종목을 종가로 계산했어요.');
    renderPhase();
    render();
    if ($('guide').open) $('guide').close();
    $('result').showModal();
  }

  function reset() {
    $('result').close();
    if (/^https?:$/.test(location.protocol)) {
      const url = new URL(location.href);
      url.searchParams.delete('seed');
      history.replaceState(null, '', url);
    }
    market = createMarket(randomSeed());
    account = createAccount();
    phase = 'ready';
    result = null;
    cursor = null;
    selected = 0;
    newsKey = '';
    stockNewsKey = '';
    lastSeenNews = 0;
    $('shareFeedback').textContent = '';
    $('search').value = '';
    orderQty.value = '100';
    orderPrice.value = String(market.stocks[selected].price);
    feedback('거래를 시작하면 주문할 수 있어요.');
    renderPhase();
    render();
    window.scrollTo(0, 0);
    $('start').focus({preventScroll: true});
  }

  async function shareResult() {
    if (!result) return;
    const url = publicURL + '?seed=' + code(market.seed);
    const message = ['[5분 단타왕] ' + pct(result.rate) + (result.record ? ' · 개인 최고 기록' : ''),
      '1억 → ' + money(result.total) + ' / 총손익 ' + signed(result.profit) + '원',
      '체결 ' + result.count + '회 · 장세 코드 ' + code(market.seed), '같은 장세에 도전: ' + url].join('\n');
    try {
      await navigator.clipboard.writeText(message);
      $('shareFeedback').textContent = '성적과 도전 링크를 복사했어요.';
    } catch {
      const field = document.createElement('textarea');
      field.value = message;
      field.setAttribute('aria-label', '공유할 결과');
      $('shareFeedback').replaceChildren(field);
      field.style.width = '100%';
      field.rows = 4;
      field.select();
    }
  }

  function saveScore() {
    if (!result) return;
    const image = document.createElement('canvas');
    image.width = 1000;
    image.height = 560;
    const ctx = image.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1000, 560);
    ctx.fillStyle = '#1b2943';
    ctx.fillRect(48, 42, 904, 476);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(48, 42, 904, 6);
    function label(value, x, y, size, color, weight = 600) {
      ctx.fillStyle = color;
      ctx.font = weight + ' ' + size + 'px "Malgun Gothic", "Noto Sans KR", sans-serif';
      ctx.fillText(value, x, y);
    }
    label('5분 단타왕  /  SCALPING ARENA', 84, 110, 33, '#ffffff', 800);
    label('최종 수익률' + (result.record ? ' · 개인 최고 기록' : ''), 86, 173, 23, '#cbd5e1');
    label(pct(result.rate), 79, 280, 96, '#fbbf24', 900);
    label('최종 평가자산', 86, 349, 22, '#cbd5e1');
    label(money(result.total), 86, 395, 40, '#ffffff', 800);
    label('총손익', 555, 349, 22, '#cbd5e1');
    label(signed(result.profit) + '원', 555, 395, 40, '#ffffff', 800);
    label('체결 ' + result.count + '회  ·  장세 ' + code(market.seed) + '  ·  가상 모의거래', 86, 474, 22, '#cbd5e1');
    image.toBlob(blob => {
      if (!blob) {
        $('shareFeedback').textContent = '성적표 이미지를 만들 수 없어요.';
        return;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'scalping-king-' + code(market.seed) + '.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
      $('shareFeedback').textContent = '성적표 이미지 다운로드를 시작했어요.';
    }, 'image/png');
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
      const cancel = event.target.closest('[data-cancel]');
      if (cancel) {
        syncTime();
        if (phase !== 'live') return;
        const order = cancelLimit(account, Number(cancel.dataset.cancel));
        feedback(order ? market.stocks[order.index].name + ' 미체결 ' + num(order.remaining) + '주를 취소했어요.' :
          '이미 체결되었거나 취소된 주문이에요.', order ? 'ok' : '');
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
  $('pause').addEventListener('click', togglePause);
  $('jumpPause').addEventListener('click', togglePause);
  $('guideButton').addEventListener('click', () => $('guide').showModal());
  $('buy').addEventListener('click', () => trade('buy'));
  $('sell').addEventListener('click', () => trade('sell'));
  $('share').addEventListener('click', shareResult);
  $('saveScore').addEventListener('click', saveScore);
  $('playAgain').addEventListener('click', reset);
  orderQty.addEventListener('input', () => renderEstimate());
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
  document.addEventListener('visibilitychange', syncTime);

  renderPhase();
  render();
}());

