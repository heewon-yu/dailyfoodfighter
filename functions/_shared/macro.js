/**
 * 경제지표지도 (/macro/) 데이터 수집 공용 모듈.
 * Cloudflare Pages Function(functions/api/macro.js)과 스냅샷 생성 스크립트(scripts/macro-snapshot.mjs)가
 * 같은 로직을 쓰도록 한 곳에 모았다. 수치는 전부 실제 공개 데이터에서만 가져오고, 실패하면 null로 둔다.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

async function fetchText(url, { headers = {}, timeout = 8000, retries = 0 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*", ...headers },
        signal: controller.signal,
        redirect: "follow",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (err) {
      if (attempt === retries) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("unreachable");
}

async function fetchJson(url, opts = {}) {
  const text = await fetchText(url, opts);
  return JSON.parse(text);
}

/* ------------------------------------------------------------------ */
/* 시세: Yahoo Finance chart API                                       */
/* ------------------------------------------------------------------ */

async function yahoo(symbol, { range = "1mo", interval = "1d", timeout = 7000 } = {}) {
  let lastErr = null;
  for (const host of YAHOO_HOSTS) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?range=${range}&interval=${interval}&includePrePost=false`;
    try {
      const data = await fetchJson(url, { timeout, retries: 1 });
      const result = data && data.chart && data.chart.result && data.chart.result[0];
      if (!result) throw new Error("no result");
      const meta = result.meta || {};
      const quote = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
      const closes = (quote.close || []).filter((v) => typeof v === "number" && Number.isFinite(v));
      const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : closes[closes.length - 1];
      // chartPreviousClose는 '조회 구간 시작 직전' 종가라서 전일 종가로 쓸 수 없다.
      // 시계열의 뒤에서 두 번째 종가(=직전 거래일 종가)를 쓴다.
      let prev = closes.length > 1 ? closes[closes.length - 2] : null;
      if (!Number.isFinite(prev)) {
        prev = Number.isFinite(meta.previousClose) ? meta.previousClose : null;
      }
      const monthAgo = closes.length > 20 ? closes[closes.length - 21] : null;
      return {
        symbol,
        price,
        prev,
        monthAgo,
        changePct: Number.isFinite(price) && Number.isFinite(prev) && prev ? ((price - prev) / prev) * 100 : null,
        monthPct: Number.isFinite(price) && Number.isFinite(monthAgo) && monthAgo ? ((price - monthAgo) / monthAgo) * 100 : null,
        asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
        timezone: meta.exchangeTimezoneName || null,
        currency: meta.currency || null,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("yahoo failed");
}

/* ------------------------------------------------------------------ */
/* 시장 심리: CNN Fear & Greed                                         */
/* ------------------------------------------------------------------ */

async function fearGreed() {
  const data = await fetchJson("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
    timeout: 8000,
    retries: 1,
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.cnn.com/markets/fear-and-greed",
      Origin: "https://www.cnn.com",
    },
  });
  const fg = data && data.fear_and_greed;
  if (!fg || typeof fg.score !== "number") throw new Error("no fear_and_greed");
  return {
    score: fg.score,
    rating: fg.rating || null,
    prevClose: num(fg.previous_close),
    prevWeek: num(fg.previous_1_week),
    prevMonth: num(fg.previous_1_month),
    prevYear: num(fg.previous_1_year),
    asOf: fg.timestamp || null,
  };
}

/* ------------------------------------------------------------------ */
/* 금리: 미 재무부 일별 국채 수익률 곡선 CSV                            */
/* ------------------------------------------------------------------ */

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function treasuryCurve(year) {
  const url =
    `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}` +
    `/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
  const csv = await fetchText(url, { timeout: 9000, retries: 1 });
  const lines = csv.trim().split(/\r?\n/);
  const head = parseCsvLine(lines[0]).map((h) => h.trim());
  const i2 = head.indexOf("2 Yr");
  const i10 = head.indexOf("10 Yr");
  const i30 = head.indexOf("30 Yr");
  if (i2 < 0 || i10 < 0) throw new Error("no columns");
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const dateRaw = (cells[0] || "").trim();
    const y2 = parseFloat(cells[i2]);
    const y10 = parseFloat(cells[i10]);
    if (!dateRaw || !Number.isFinite(y2) || !Number.isFinite(y10)) continue;
    rows.push({
      date: toIsoDate(dateRaw),
      y2,
      y10,
      y30: Number.isFinite(parseFloat(cells[i30])) ? parseFloat(cells[i30]) : null,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return rows;
}

function toIsoDate(mdy) {
  const m = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return mdy;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* 신용 스프레드: FRED ICE BofA US High Yield OAS (BAMLH0A0HYM2)        */
/* ------------------------------------------------------------------ */

async function highYieldOas() {
  const parse = (csv) => {
    const lines = csv.trim().split(/\r?\n/);
    const rows = [];
    for (const line of lines.slice(1)) {
      const [date, value] = line.split(",");
      const v = parseFloat(value);
      if (!date || !Number.isFinite(v)) continue;
      rows.push({ date: date.trim(), value: v });
    }
    if (!rows.length) throw new Error("no fred rows");
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    return rows;
  };

  // 1) FRED 원본 CSV (엣지에서 막히는 경우가 있다)
  try {
    const csv = await fetchText("https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2", {
      timeout: 9000,
      retries: 0,
      headers: { Accept: "text/csv,*/*" },
    });
    const rows = parse(csv);
    return { latest: rows[0], prev: rows[1] || null, prevMonth: rows[21] || null, via: "FRED" };
  } catch (err) {
    /* 2) 인터넷 아카이브에 남은 FRED CSV 스냅샷 */
    const csv = await fetchText(
      "https://web.archive.org/web/2026id_/https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2",
      { timeout: 12000, retries: 0, headers: { Accept: "text/csv,*/*" } }
    );
    const rows = parse(csv);
    return {
      latest: rows[0],
      prev: rows[1] || null,
      prevMonth: rows[21] || null,
      via: "FRED (Internet Archive 스냅샷)",
    };
  }
}

/* ------------------------------------------------------------------ */
/* 물가: BLS 공개 API (CPI·Core CPI·PPI 최종수요 지수 → YoY 계산)          */
/* ------------------------------------------------------------------ */

async function blsPrices() {
  const year = new Date().getUTCFullYear();
  const body = JSON.stringify({
    seriesid: ["CUUR0000SA0", "CUUR0000SA0L1E", "WPUFD4"],
    startyear: String(year - 1),
    endyear: String(year),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let data;
  try {
    const res = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (!data || data.status !== "REQUEST_SUCCEEDED") throw new Error("bls status");
  const series = (data.Results && data.Results.series) || [];
  const pickSeries = (id) => {
    const s = series.find((x) => x.seriesID === id);
    if (!s) return null;
    const rows = s.data.filter((d) => /^\d+(\.\d+)?$/.test(String(d.value)));
    if (!rows.length) return null;
    const latest = rows[0];
    const base = rows.find(
      (d) => d.period === latest.period && Number(d.year) === Number(latest.year) - 1
    );
    const yoy = base ? (Number(latest.value) / Number(base.value) - 1) * 100 : null;
    return {
      index: Number(latest.value),
      yoy: yoy === null ? null : Math.round(yoy * 100) / 100,
      refMonth: latest.year + "-" + String(latest.period).replace("M", ""),
    };
  };
  return { cpi: pickSeries("CUUR0000SA0"), core: pickSeries("CUUR0000SA0L1E"), ppi: pickSeries("WPUFD4") };
}

/* ------------------------------------------------------------------ */
/* 기준금리: 뉴욕연은 EFFR API (targetRateFrom/To 포함)                 */
/* ------------------------------------------------------------------ */

async function fedFunds() {
  const data = await fetchJson("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json", {
    timeout: 8000,
    retries: 1,
    headers: { Accept: "application/json" },
  });
  const r = data && data.refRates && data.refRates[0];
  if (!r) throw new Error("no effr");
  return {
    low: num(r.targetRateFrom),
    high: num(r.targetRateTo),
    effr: num(r.percentRate),
    date: r.effectiveDate || null,
  };
}

/* ------------------------------------------------------------------ */
/* 버핏지수: S&P500 시가총액 합계(StockAnalysis) ÷ 미국 명목 GDP(World Bank) */
/* ------------------------------------------------------------------ */

async function sp500MarketCap() {
  const html = await fetchText("https://stockanalysis.com/list/sp-500-stocks/", {
    timeout: 12000,
    retries: 1,
    headers: { Accept: "text/html" },
  });
  const label = html.indexOf("Total Market Cap");
  if (label < 0) throw new Error("no total market cap label");
  const seg = html.slice(label, label + 2500);
  const m = seg.match(/font-semibold[^>]*>\s*([\d.,]+)\s*([TBM])\s*</i);
  if (!m) throw new Error("no total market cap value");
  const mult = { T: 1e12, B: 1e9, M: 1e6 }[m[2].toUpperCase()];
  return { usd: parseFloat(m[1].replace(/,/g, "")) * mult, asOf: new Date().toISOString().slice(0, 10) };
}

async function usGdp() {
  const data = await fetchJson(
    "https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD?format=json&per_page=5&mrnev=1",
    { timeout: 9000, retries: 1, headers: { Accept: "application/json" } }
  );
  const rows = Array.isArray(data) ? data[1] : null;
  const row = (rows || []).find((r) => r && r.value);
  if (!row) throw new Error("no gdp");
  return { usd: Number(row.value), year: row.date };
}

/* ------------------------------------------------------------------ */
/* 코인: 업비트(원화) + 코인베이스/코인게코(달러)                        */
/* ------------------------------------------------------------------ */

async function btcKrw() {
  const data = await fetchJson("https://api.upbit.com/v1/ticker?markets=KRW-BTC", {
    timeout: 7000,
    retries: 1,
    headers: { Accept: "application/json" },
  });
  const t = data && data[0];
  if (!t) throw new Error("no upbit");
  return {
    krw: num(t.trade_price),
    prevKrw: num(t.prev_closing_price),
    changePct: num(t.signed_change_rate) !== null ? num(t.signed_change_rate) * 100 : null,
    high52: null,
    asOf: t.trade_timestamp ? new Date(Number(t.trade_timestamp)).toISOString() : null,
  };
}

async function btcUsd() {
  try {
    const data = await fetchJson("https://api.coinbase.com/v2/prices/BTC-USD/spot", {
      timeout: 7000,
      retries: 1,
      headers: { Accept: "application/json" },
    });
    const v = parseFloat(data && data.data && data.data.amount);
    if (Number.isFinite(v)) return { usd: v, source: "Coinbase" };
  } catch (e) {
    /* fall through */
  }
  const data = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", {
    timeout: 7000,
    headers: { Accept: "application/json" },
  });
  const v = data && data.bitcoin && data.bitcoin.usd;
  if (!Number.isFinite(v)) throw new Error("no coingecko");
  return { usd: v, source: "CoinGecko" };
}

/* ------------------------------------------------------------------ */
/* 정리                                                                */
/* ------------------------------------------------------------------ */

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function pick(r) {
  return r.status === "fulfilled" ? r.value : null;
}

export async function collectMacro() {
  const tasks = {
    fearGreed: fearGreed(),
    vix: yahoo("^VIX"),
    yields: (async () => {
      const year = new Date().getUTCFullYear();
      let rows = await treasuryCurve(year);
      if (rows.length < 3) rows = rows.concat(await treasuryCurve(year - 1));
      rows.sort((a, b) => (a.date < b.date ? 1 : -1));
      return rows;
    })(),
    hyOas: highYieldOas(),
    fed: fedFunds(),
    bls: blsPrices(),
    spCap: sp500MarketCap(),
    gdp: usGdp(),
    btcKrw: btcKrw(),
    btcUsd: btcUsd(),
    sp500: yahoo("^GSPC"),
    nasdaq: yahoo("^IXIC"),
    kospi: yahoo("^KS11"),
    kosdaq: yahoo("^KQ11"),
    usdkrw: yahoo("KRW=X"),
    dxy: yahoo("DX-Y.NYB"),
    wti: yahoo("CL=F"),
    gold: yahoo("GC=F"),
  };

  const keys = Object.keys(tasks);
  const settled = await Promise.allSettled(keys.map((k) => tasks[k]));
  const raw = {};
  const sources = {};
  keys.forEach((k, i) => {
    raw[k] = pick(settled[i]);
    sources[k] = settled[i].status === "fulfilled" ? "ok" : "fail";
  });

  const metrics = {};

  if (raw.fearGreed) metrics.fear_greed = raw.fearGreed;
  if (raw.vix) metrics.vix = raw.vix;

  if (Array.isArray(raw.yields) && raw.yields.length) {
    const [today, prev] = raw.yields;
    metrics.yield10 = { value: today.y10, prev: prev ? prev.y10 : null, date: today.date };
    metrics.yield2 = { value: today.y2, prev: prev ? prev.y2 : null, date: today.date };
    metrics.spread = {
      value: round2(today.y10 - today.y2),
      prev: prev ? round2(prev.y10 - prev.y2) : null,
      date: today.date,
    };
  }

  if (raw.hyOas && raw.hyOas.latest) {
    metrics.hy_oas = {
      value: round2(raw.hyOas.latest.value),
      prev: raw.hyOas.prev ? round2(raw.hyOas.prev.value) : null,
      prevMonth: raw.hyOas.prevMonth ? round2(raw.hyOas.prevMonth.value) : null,
      date: raw.hyOas.latest.date,
      via: raw.hyOas.via || "FRED",
    };
  }

  if (raw.fed) metrics.fed = raw.fed;

  if (raw.bls && (raw.bls.cpi || raw.bls.ppi)) {
    metrics.prices = {
      cpi: raw.bls.cpi ? { yoy: raw.bls.cpi.yoy, refMonth: raw.bls.cpi.refMonth, index: raw.bls.cpi.index } : null,
      core: raw.bls.core ? { yoy: raw.bls.core.yoy, refMonth: raw.bls.core.refMonth } : null,
      ppi: raw.bls.ppi ? { yoy: raw.bls.ppi.yoy, refMonth: raw.bls.ppi.refMonth, index: raw.bls.ppi.index } : null,
    };
  }

  if (raw.spCap && raw.gdp && raw.spCap.usd && raw.gdp.usd) {
    metrics.buffett = {
      ratioPct: round1((raw.spCap.usd / raw.gdp.usd) * 100),
      spCapUsd: raw.spCap.usd,
      gdpUsd: raw.gdp.usd,
      gdpYear: raw.gdp.year,
      asOf: raw.spCap.asOf,
    };
  }

  for (const id of ["sp500", "nasdaq", "kospi", "kosdaq", "usdkrw", "dxy", "wti", "gold"]) {
    if (raw[id]) metrics[id] = raw[id];
  }

  if (raw.btcKrw) {
    const btc = { ...raw.btcKrw };
    if (raw.btcUsd) btc.usd = raw.btcUsd.usd;
    btc.usdSource = raw.btcUsd ? raw.btcUsd.source : null;
    const fx = raw.usdkrw && raw.usdkrw.price;
    if (btc.usd && fx && btc.krw) {
      const fair = btc.usd * fx;
      btc.fairKrw = Math.round(fair);
      btc.kimchiPct = round2((btc.krw / fair - 1) * 100);
      btc.fxUsed = fx;
    }
    metrics.btc = btc;
  }

  const marketAsOf =
    Object.values(metrics)
      .map((m) => (m && m.asOf ? m.asOf : null))
      .filter(Boolean)
      .sort()
      .pop() || null;

  return {
    generatedAt: new Date().toISOString(),
    marketAsOf,
    metrics,
    sources,
  };
}

function round2(v) {
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}
function round1(v) {
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}
