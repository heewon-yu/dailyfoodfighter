(function () {
  'use strict';

  const CASH = 100_000_000;
  const DURATION = 300;
  const INTERVAL = 500;
  const BOOK_INTERVAL = INTERVAL / 2;
  const TOTAL_TICKS = DURATION * 1000 / INTERVAL;
  const PRICE_STEP = 50;
  const CHART_PERIODS = [1, 5, 10, 20];
  const STOCKS = [
    ['네오칩스', '반도체', 'NC', '#4338ca', 'AI 서버용 고대역폭 메모리 검사 장비를 만드는 기업.', '신규 검사 장비의 고객사 평가가 시작됐어요.', 1.1],
    ['볼트에너지', '2차전지', 'VE', '#0f766e', '전기차와 에너지 저장 장치용 배터리 소재를 생산하는 기업.', '배터리 소재 공장의 가동률 회복이 관측됐어요.', .9],
    ['메디온랩', '바이오', 'ML', '#a23b77', '면역 항암제 후보 물질과 진단 플랫폼을 개발하는 기업.', '항암제 초기 임상 데이터 발표 일정이 공개됐어요.', 1.45],
    ['오르빗웨이', '우주항공', 'OW', '#354887', '저궤도 위성의 자세 제어와 통신 부품을 공급하는 기업.', '다음 분기 위성 부품 공급 입찰에 참여했어요.', 1.25],
    ['모션로보틱스', '로봇', 'MR', '#ab5230', '물류센터 자동화 로봇과 협동로봇을 제작하는 기업.', '신형 피킹 로봇을 물류 박람회에서 선보였어요.', 1.22],
    ['그리드웨이브', '전력기기', 'GW', '#1a6f9d', '송배전 변압기와 전력망 모니터링 장치를 공급하는 기업.', '해외 전력망 증설에 맞춰 생산 증설을 검토 중이에요.', .78],
    ['픽셀웍스', '게임', 'PW', '#6f45a2', '모바일 액션 게임과 글로벌 퍼블리싱을 운영하는 기업.', '신작 비공개 테스트 신청이 시작됐어요.', 1.15],
    ['솔라리움', '신재생', 'SL', '#917020', '태양광 인버터와 발전량 예측 서비스를 개발하는 기업.', '대형 태양광 단지의 예비 사업자 명단에 올랐어요.', .95],
    ['하버링크', '물류', 'HL', '#3d5a70', '스마트 항만 운영과 선박 화물 추적 솔루션을 제공하는 기업.', '주요 항만의 물동량 회복 전망이 나왔어요.', .72],
    ['루미네트', '클라우드', 'LN', '#007883', 'GPU 임대형 클라우드와 데이터센터 운영을 하는 기업.', 'GPU 리전의 예약 물량이 공개됐어요.', 1.15],
  ];
  const NEWS = [
    [
      ['대형 AI 서버 고객사와 장비 계약', '차세대 칩 양산 검증 통과', '해외 메모리 업체 첫 납품'],
      ['주요 고객사 설비 투자 연기', '차세대 장비 수율 문제 보고', '부품 수급 차질로 출하 지연'],
    ],
    [
      ['전기차 업체 장기 공급 계약', '배터리 소재 원가 절감 성공', '신형 배터리 샘플 승인'],
      ['전기차 업체 발주 축소', '핵심 원재료 가격 급등', '배터리 생산 라인 점검 중단'],
    ],
    [
      ['항암제 임상 중간 지표 개선', '글로벌 제약사 기술이전 협의', '진단 플랫폼 허가 획득'],
      ['임상 모집 일정 추가 지연', '기술이전 협상 종료 공시', '규제기관 임상 자료 보완 요청'],
    ],
    [
      ['위성 통신 부품 수주 발표', '발사 실증 첫 교신 성공', '해외 항공사 신규 공급 확정'],
      ['위성 발사 일정 재차 연기', '시험 위성 통신 장애 보고', '부품 입찰에서 탈락'],
    ],
    [
      ['대형 물류센터 로봇 계약', '협동로봇 해외 인증 통과', '신제품 사전 예약 목표 초과'],
      ['납품 로봇 안전 점검 공지', '자동화 계약 협상 중단', '핵심 모터 공급 차질'],
    ],
    [
      ['초고압 변압기 수출 수주', '북미 전력망 증설 계약 발표', '신규 생산 라인 조기 가동'],
      ['전력망 프로젝트 승인 지연', '변압기 핵심 소재 원가 상승', '해외 수주 납품 일정 지연'],
    ],
    [
      ['신작 출시 첫날 매출 상위권', '글로벌 퍼블리싱 계약 체결', '콘솔 신작 테스트 호평'],
      ['신작 출시 일정 연기', '서버 장애로 긴급 점검', '주요 게임 이용자 수 감소'],
    ],
    [
      ['대형 태양광 단지 입찰 수주', '고효율 인버터 인증 통과', '발전 예측 서비스 공급 확대'],
      ['태양광 단지 사업 승인 보류', '인버터 부품 가격 상승', '발전 설비 보조금 축소 전망'],
    ],
    [
      ['아시아 항만 운영권 수주', '화물 추적 시스템 공급 계약', '주요 항로 물동량 예상 상회'],
      ['주요 항로 물동량 감소', '항만 파업으로 작업 지연', '항만 운영권 재입찰 결정'],
    ],
    [
      ['GPU 장기 임대 계약 공시', '데이터센터 신규 리전 개장', '대기업 클라우드 이전 수주'],
      ['주요 데이터센터 서비스 장애', 'GPU 공급 일정 지연', '대형 고객 계약 갱신 보류'],
    ],
  ];

  function randomGenerator(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let mixed = Math.imul(seed ^ (seed >>> 15), seed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  function integer(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
  }

  function priceStep(price) {
    return Math.max(PRICE_STEP, Math.round(price / PRICE_STEP) * PRICE_STEP);
  }

  function barsFromHistory(random, reference) {
    const closes = Array(25).fill(reference);
    for (let i = 23; i >= 0; i--) {
      closes[i] = priceStep(closes[i + 1] * (1 + (random() - .5) * .034));
    }
    return closes.slice(1).map((close, index) => ({
      time: (index - 24) * 60,
      open: closes[index], close,
      high: priceStep(Math.max(close, closes[index]) * (1 + random() * .009)),
      low: priceStep(Math.min(close, closes[index]) * (1 - random() * .009)),
      volume: integer(random, 17000, 73000),
    }));
  }

  function initialTicks(random, bars) {
    return bars.flatMap((bar) => {
      let previous = bar.open;
      return Array.from({length: 40}, (_, index) => {
        const close = index === 39 ? bar.close : Math.max(bar.low, Math.min(bar.high,
          priceStep(bar.open + (bar.close - bar.open) * (index + 1) / 40 + (random() - .5) * bar.open * .005)));
        const point = {time: bar.time + index * 1.5, open: previous, close,
          high: Math.max(previous, close), low: Math.min(previous, close), volume: integer(random, 95, 840)};
        previous = close;
        return point;
      });
    });
  }

  function fillHistoricalTicks(anchors) {
    return anchors.flatMap(anchor => {
      let open = anchor.open;
      return Array.from({length: 3}, (_, index) => {
        const close = priceStep(anchor.open + (anchor.close - anchor.open) * (index + 1) / 3);
        const volume = Math.floor(anchor.volume * (index + 1) / 3) - Math.floor(anchor.volume * index / 3);
        const tick = {time: anchor.time + (index + 1) / 2, open, close,
          high: Math.max(open, close), low: Math.min(open, close), volume};
        open = close;
        return tick;
      });
    });
  }

  function updateSeries(series, point) {
    const timeMs = Math.round(point.time * 1000) - 1;
    for (const period of CHART_PERIODS) {
      const bars = series[period];
      const time = Math.floor(timeMs / (period * 1000)) * period;
      const last = bars.at(-1);
      if (last?.time === time) {
        last.high = Math.max(last.high, point.high);
        last.low = Math.min(last.low, point.low);
        last.close = point.close;
        last.volume += point.volume;
      } else {
        bars.push({...point, time});
        if (bars.length > 100) bars.shift();
      }
    }
  }

  function bookFor(stock, random) {
    const asks = [];
    const bids = [];
    const spread = stock.shockTicks > 0 ? 2 : 1;
    for (let i = 0; i < 5; i++) {
      const offset = (i + spread) * PRICE_STEP;
      asks.push({price: stock.price + offset, qty: integer(random, 210, 980) + i * 180});
      bids.push({price: stock.price - offset, qty: integer(random, 210, 980) + i * 180});
    }
    return {asks, bids};
  }

  function eventSchedule(random) {
    const events = [];
    const firstSide = STOCKS.map(() => random() < .5 ? -1 : 1);
    const newsOffset = STOCKS.map(() => integer(random, 0, 2));
    for (let round = 0; round < 3; round++) {
      const order = STOCKS.map((_, index) => index);
      for (let i = order.length - 1; i > 0; i--) {
        const next = integer(random, 0, i);
        [order[i], order[next]] = [order[next], order[i]];
      }
      order.forEach((index, position) => {
        const direction = round === 0 ? firstSide[index] : round === 1 ? -firstSide[index] : (random() < .5 ? -1 : 1);
        const tick = 12 + round * 186 + position * 16 + integer(random, 0, 9);
        const title = NEWS[index][direction > 0 ? 0 : 1][(newsOffset[index] + round) % 3];
        const strength = .0015 + random() * .0033;
        events.push({index, direction, tick, title, strength, duration: integer(random, 20, 34)});
      });
    }
    return events;
  }

  function createMarket(seed) {
    const random = randomGenerator(seed);
    const bookRandom = randomGenerator(seed ^ 0x6ab02ed9);
    const historyRandom = randomGenerator(seed ^ 0x3c7fd5a5);
    const stocks = STOCKS.map(([name, sector, short, color, description, preview, volatility], index) => {
      const reference = integer(random, 200, 1000) * PRICE_STEP;
      const bars = barsFromHistory(random, reference);
      const earlier = initialTicks(historyRandom, bars.slice(-10, -2));
      const recent = initialTicks(random, bars.slice(-2));
      const history = fillHistoricalTicks(earlier.concat(recent));
      const series = Object.fromEntries(CHART_PERIODS.map(period => [period, []]));
      history.forEach(point => updateSeries(series, point));
      const stock = {index, name, sector, short, color, description, preview, volatility,
        reference, series, ticks: history.slice(-180), price: reference, fairPrice: reference, volume: 0,
        high: reference, low: reference, shock: 0, shockTicks: 0};
      stock.book = bookFor(stock, bookRandom);
      return stock;
    });
    const headlines = stocks.map(stock => ({index: stock.index, title: stock.preview, time: 0, direction: 0}));
    return {seed, stocks, headlines, random, bookRandom, events: eventSchedule(random), eventIndex: 0, tick: 0};
  }

  function refreshBooks(market) {
    market.stocks.forEach(stock => { stock.book = bookFor(stock, market.bookRandom); });
  }

  function stepMarket(market) {
    if (market.tick >= TOTAL_TICKS) return false;
    market.tick += 1;
    const time = market.tick * INTERVAL / 1000;
    const next = market.events[market.eventIndex];
    if (next?.tick === market.tick) {
      const stock = market.stocks[next.index];
      stock.shock = next.direction * next.strength;
      stock.shockTicks = next.duration;
      stock.gap = next.direction * (next.strength * 1.7 + .0025);
      market.headlines.unshift({index: next.index, title: next.title, time, direction: next.direction});
      market.eventIndex += 1;
    }
    market.stocks.forEach(stock => {
      const {random} = market;
      const open = stock.price;
      const noise = (random() + random() - 1) * .0049 * stock.volatility;
      const pullback = (stock.reference - stock.fairPrice) / stock.reference * .0016;
      const movement = noise + pullback + stock.shock * stock.volatility * .67 + (stock.gap ?? 0);
      stock.gap = 0;
      stock.fairPrice = Math.max(stock.reference * .65, Math.min(stock.reference * 1.4, stock.fairPrice * (1 + movement)));
      stock.price = priceStep(stock.fairPrice);
      stock.high = Math.max(stock.high, stock.price);
      stock.low = Math.min(stock.low, stock.price);
      const volume = Math.round(integer(random, 60, 495) * (1 + Math.abs(movement) * 270 + (stock.shockTicks > 0 ? 1.7 : 0)));
      stock.volume += volume;
      const high = Math.max(open, stock.price);
      const low = Math.min(open, stock.price);
      const point = {time, open, high, low, close: stock.price, volume};
      stock.ticks.push(point);
      if (stock.ticks.length > 180) stock.ticks.shift();
      updateSeries(stock.series, point);
      stock.shockTicks = Math.max(0, stock.shockTicks - 1);
      stock.shock = stock.shockTicks ? stock.shock * .977 : 0;
    });
    refreshBooks(market);
    return true;
  }

  function createAccount() {
    return {cash: CASH, realized: 0, fees: 0, positions: STOCKS.map(() => ({qty: 0, cost: 0})), trades: []};
  }

  function quoteOrder(stock, side, qty) {
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99999) return null;
    let remaining = qty;
    let gross = 0;
    const levels = [];
    for (const level of (side === 'buy' ? stock.book.asks : stock.book.bids)) {
      const take = Math.min(level.qty, remaining);
      if (take > 0) {
        gross += take * level.price;
        levels.push({level, qty: take});
        remaining -= take;
      }
      if (!remaining) break;
    }
    if (remaining) return null;
    const fee = Math.ceil(gross / 2000);
    return {gross, fee, average: gross / qty, total: side === 'buy' ? gross + fee : gross - fee, levels};
  }

  function maxOrder(stock, account, side) {
    const book = side === 'buy' ? stock.book.asks : stock.book.bids;
    const liquidity = book.reduce((total, level) => total + level.qty, 0);
    if (side === 'sell') return Math.min(liquidity, account.positions[stock.index].qty);
    let low = 0;
    let high = liquidity;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (quoteOrder(stock, side, mid).total <= account.cash) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  function executeOrder(stock, account, side, qty, time) {
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99999) return {error: '수량을 1~99,999주 사이의 정수로 입력하세요.'};
    const position = account.positions[stock.index];
    if (side === 'sell' && qty > position.qty) return {error: '보유 수량이 부족해요.'};
    const quote = quoteOrder(stock, side, qty);
    if (!quote) return {error: '호가 잔량이 부족해요. 수량을 줄여 주세요.'};
    if (side === 'buy' && quote.total > account.cash) return {error: '주문 가능 현금이 부족해요.'};
    let profit = 0;
    if (side === 'buy') {
      account.cash -= quote.total;
      position.qty += qty;
      position.cost += quote.total;
    } else {
      const cost = qty === position.qty ? position.cost : Math.round(position.cost * qty / position.qty);
      position.qty -= qty;
      position.cost -= cost;
      account.cash += quote.total;
      profit = quote.total - cost;
      account.realized += profit;
    }
    quote.levels.forEach(fill => { fill.level.qty -= fill.qty; });
    account.fees += quote.fee;
    const trade = {index: stock.index, side, qty, time, average: quote.average, fee: quote.fee, total: quote.total, profit};
    account.trades.unshift(trade);
    return {trade};
  }

  function equity(market, account) {
    return account.cash + market.stocks.reduce((total, stock) => total + stock.price * account.positions[stock.index].qty, 0);
  }

  globalThis.ScalpMarket = {CASH, DURATION, INTERVAL, BOOK_INTERVAL, TOTAL_TICKS, createMarket, refreshBooks, stepMarket, createAccount, quoteOrder, maxOrder, executeOrder, equity};
}());

