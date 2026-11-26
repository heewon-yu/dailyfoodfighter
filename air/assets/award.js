/* 마일지도 AIR — 공식 공제표·성수기 계산 + 공항 사전 (award)
   - data/award-chart.json : 대한항공 공식 보너스 공제표(권역·등급별 평수기/성수기) + 직항 노선표
   - data/peak-season.json : 2026~2027 성수기 기간
   - data/airports.json    : 자동완성용 공항 사전(한글·영문·도시·IATA 별칭)
   화면은 이 모듈이 계산한 값만 표시한다. 추정·임의 계산은 하지 않는다. */
(() => {
  "use strict";

  const AWARD_URL = "/air/data/award-chart.json";
  const PEAK_URL = "/air/data/peak-season.json";
  const AIRPORTS_URL = "/air/data/airports.json";
  const HOTPICK_URL = "/air/data/bonus-hotpick.json";

  const PEAK_KEY_DEFAULT = "국제선_미주출발외";
  const PEAK_KEY_AMERICAS = "국제선_미주출발";

  const CABIN_LETTER = { economy: "E", business: "P", first: "F" };

  const state = {
    chart: null,
    peak: null,
    airports: null,
    hotpick: null,
    hotpickMap: new Map(),
    byCode: new Map(),
    routeMap: new Map(),
    americas: new Set(),
    liveCodes: new Set(),
    loading: null
  };

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
    return response.json();
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s.,()'’\-_/]/g, "");
  }

  function load() {
    if (state.chart && state.peak && state.airports && state.hotpick) return Promise.resolve(state);
    if (state.loading) return state.loading;

    state.loading = Promise.all([
      fetchJson(AWARD_URL).catch(error => {
        console.warn("AIR: award chart unavailable", error);
        return { regions: [], routes: [], pending: [] };
      }),
      fetchJson(PEAK_URL).catch(error => {
        console.warn("AIR: peak season unavailable", error);
        return { periods: {} };
      }),
      fetchJson(AIRPORTS_URL).catch(error => {
        console.warn("AIR: airport dictionary unavailable", error);
        return { airports: [] };
      }),
      fetchJson(HOTPICK_URL).catch(error => {
        console.warn("AIR: bonus hotpick unavailable", error);
        return { regions: [], index: [], notes: [] };
      })
    ]).then(([chart, peak, airports, hotpick]) => {
      state.chart = chart;
      state.peak = peak;
      state.airports = airports.airports || [];
      state.hotpick = hotpick || { regions: [], index: [], notes: [] };

      state.hotpickMap = new Map();
      for (const item of state.hotpick.index || []) {
        const key = `${item.o}-${item.d}-${item.cabin}`;
        if (!state.hotpickMap.has(key)) state.hotpickMap.set(key, item);
      }

      for (const airport of state.airports) {
        state.byCode.set(airport.code, airport);
      }

      for (const route of chart.routes || []) {
        const record = {
          origin: route.o,
          destination: route.d,
          region: route.region,
          miles: route.miles || {}
        };
        state.routeMap.set(`${route.o}-${route.d}`, record);
        if (!state.routeMap.has(`${route.d}-${route.o}`)) {
          state.routeMap.set(`${route.d}-${route.o}`, record);
        }
        if (route.region === "북미") state.americas.add(route.d);
      }

      state.loading = null;
      return state;
    }).catch(error => {
      state.loading = null;
      throw error;
    });

    return state.loading;
  }

  /* ------------------------------------------------------------- 공항 사전 */

  function airport(code) {
    return state.byCode.get(String(code || "").toUpperCase()) || null;
  }

  function allAirports() {
    return state.airports.slice();
  }

  function hasLive(code) {
    return state.liveCodes.has(String(code || "").toUpperCase());
  }

  function setLiveRoutes(codes) {
    state.liveCodes = new Set((codes || []).map(code => String(code).toUpperCase()));
  }

  function score(airportEntry, keyword) {
    const code = airportEntry.code.toLowerCase();
    const name = norm(airportEntry.name);
    const city = norm(airportEntry.city);
    const english = norm(airportEntry.english);
    const municipality = norm(airportEntry.municipality);
    const aliases = (airportEntry.aliases || []).map(norm);

    if (code === keyword) return 1000;
    if (city === keyword) return 940;
    if (aliases.includes(keyword)) return 900;
    if (name === keyword) return 880;
    if (name.startsWith(keyword)) return 820;
    if (city.startsWith(keyword)) return 800;
    if (aliases.some(alias => alias.startsWith(keyword))) return 780;
    if (code.startsWith(keyword)) return 760;
    if (english.startsWith(keyword)) return 720;
    if (municipality.startsWith(keyword)) return 700;
    if (name.includes(keyword)) return 620;
    if (aliases.some(alias => alias.includes(keyword))) return 580;
    if (english.includes(keyword) || municipality.includes(keyword)) return 520;
    if (code.includes(keyword)) return 480;
    return 0;
  }

  function search(keyword, limit = 8) {
    const q = norm(keyword);
    if (!q) return [];

    return state.airports
      .map(entry => {
        const value = score(entry, q);
        return value ? { entry, value } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.value - a.value ||
        Number(hasLive(b.entry.code)) - Number(hasLive(a.entry.code)) ||
        Number(b.entry.chart) - Number(a.entry.chart) ||
        String(a.entry.name).localeCompare(String(b.entry.name), "ko"))
      .slice(0, limit)
      .map(hit => hit.entry);
  }

  /* ------------------------------------------------------------- 공제표 */

  function route(origin, destination) {
    const o = String(origin || "").toUpperCase();
    const d = String(destination || "").toUpperCase();
    if (!o || !d || o === d) return null;
    return state.routeMap.get(`${o}-${d}`) || null;
  }

  function isAmericasOrigin(origin) {
    const airportEntry = airport(origin);
    if (!airportEntry) return false;
    return state.americas.has(airportEntry.code) || airportEntry.country === "US" || airportEntry.country === "CA";
  }

  function peakKey(origin) {
    return isAmericasOrigin(origin) ? PEAK_KEY_AMERICAS : PEAK_KEY_DEFAULT;
  }

  function dateParts(dateISO) {
    const match = String(dateISO || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return { year: match[1], month: match[2], day: match[3], md: `${match[2]}-${match[3]}` };
  }

  function isPeak(dateISO, origin) {
    const parts = dateParts(dateISO);
    if (!parts) return false;

    const periods = state.peak &&
      state.peak.periods &&
      state.peak.periods[peakKey(origin)] &&
      state.peak.periods[peakKey(origin)][parts.year] &&
      state.peak.periods[peakKey(origin)][parts.year][String(Number(parts.month))];

    if (!Array.isArray(periods)) return false;

    return periods.some(range => {
      const [start, end] = String(range).split("~");
      if (!start || !end) return false;
      return parts.md >= start && parts.md <= end;
    });
  }

  function seasonOf(dateISO, origin) {
    const peak = isPeak(dateISO, origin);
    return { peak, key: peak ? "peak" : "offpeak", label: peak ? "성수기" : "평수기" };
  }

  /**
   * 노선·날짜·등급의 공식 공제 마일.
   * @returns {{state:'ok', miles:number, offpeak:number, peak:number, season:object, region:string, cabin:string}
   *          |{state:'no-chart', region:string|null, cabin:string}}
   */
  function miles(origin, destination, dateISO, cabinKey) {
    const letter = CABIN_LETTER[cabinKey] || String(cabinKey || "").toUpperCase();
    const record = route(origin, destination);

    if (!record) return { state: "no-chart", region: null, cabin: letter };

    const chart = record.miles && record.miles[letter];

    if (!Array.isArray(chart) || !Number.isInteger(chart[0])) {
      return { state: "no-chart", region: record.region, cabin: letter };
    }

    const season = seasonOf(dateISO, origin);

    return {
      state: "ok",
      region: record.region,
      cabin: letter,
      offpeak: chart[0],
      peak: chart[1],
      season,
      miles: season.peak ? chart[1] : chart[0]
    };
  }

  function regionTable() {
    return (state.chart && state.chart.regions ? state.chart.regions : []).filter(
      region => region.miles && Array.isArray(region.miles.E)
    );
  }

  function pendingRoutes() {
    return state.chart && Array.isArray(state.chart.pending) ? state.chart.pending : [];
  }

  function peakPeriods(origin) {
    const key = peakKey(origin);
    const periods = state.peak && state.peak.periods ? state.peak.periods[key] : null;
    return { key, periods: periods || {} };
  }

  function peakPeriodsAll() {
    return state.peak && state.peak.periods ? state.peak.periods : {};
  }

  /* --------------------------------------------------------- 보너스 핫픽 */

  /** 핫픽 할인 대상 여부. 구간·등급이 맞고 탑승일이 노선별 출발 기간에 들면 applies. */
  function hotpickAt(origin, destination, dateISO, cabinKey) {
    const o = String(origin || "").toUpperCase();
    const d = String(destination || "").toUpperCase();
    const cabin = String(cabinKey || "").toLowerCase();

    const item = state.hotpickMap.get(`${o}-${d}-${cabin}`);
    if (!item) return { state: "none" };

    const day = String(dateISO || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return { state: "no-date", item, discount: item.discount_oneway };
    }

    if (day < item.period_start || day > item.period_end) {
      return { state: "out-of-period", item, discount: item.discount_oneway, day };
    }

    if (hotpickExcluded(day)) {
      return { state: "excluded", item, discount: item.discount_oneway, day };
    }

    return {
      state: "applies",
      item,
      discount: item.discount_oneway,
      discountRound: item.discount_round,
      flights: item.flights || [],
      day
    };
  }

  /** 공식 안내의 출발 제외 기간(12/23~1/4, 2/4~3/2). 연도를 넘는 구간을 처리한다. */
  function hotpickExcluded(dateISO) {
    const parts = dateParts(dateISO);
    if (!parts) return false;
    const ex = (state.hotpick && state.hotpick.departure_window && state.hotpick.departure_window.excluded) || [];

    return ex.some(range => {
      const start = String(range.start || "");
      const end = String(range.end || "");
      if (!start || !end) return false;
      return start <= end
        ? parts.md >= start && parts.md <= end
        : parts.md >= start || parts.md <= end;
    });
  }

  /** 노선·날짜·등급의 핫픽 적용 실공제 마일(편도). 대상이 아니면 null. */
  function hotpickMiles(origin, destination, dateISO, cabinKey) {
    const hit = hotpickAt(origin, destination, dateISO, cabinKey);
    if (hit.state !== "applies") return null;

    const base = miles(origin, destination, dateISO, cabinKey);
    if (base.state !== "ok") return null;

    return {
      base: base.miles,
      miles: Math.max(0, base.miles - hit.discount),
      discount: hit.discount,
      season: base.season,
      flights: hit.flights,
      item: hit.item
    };
  }

  function hotpickRegions() {
    return (state.hotpick && Array.isArray(state.hotpick.regions)) ? state.hotpick.regions : [];
  }

  function hotpickMeta() {
    const data = state.hotpick || {};
    return {
      source: data.source || null,
      purchase: data.purchase_period || null,
      window: data.departure_window || null,
      notes: data.notes || [],
      domestic: data.domestic || null,
      counts: data.counts || null
    };
  }

  function peakRule() {
    return state.peak ? state.peak.rule || "" : "";
  }

  function peakNote() {
    return state.peak ? state.peak.note || "" : "";
  }

  /** 오늘 이후 다가오는 성수기 구간(최대 count개) */
  function upcomingPeak(origin, fromISO, count = 3) {
    const start = dateParts(fromISO || new Date().toISOString().slice(0, 10));
    if (!start) return [];

    const table = peakPeriods(origin).periods;
    const result = [];

    for (const year of Object.keys(table).sort()) {
      for (const month of Object.keys(table[year]).sort((a, b) => Number(a) - Number(b))) {
        for (const range of table[year][month] || []) {
          const [a, b] = String(range).split("~");
          const startISO = `${year}-${a}`;
          const endISO = `${year}-${b}`;
          if (endISO < (fromISO || "").slice(0, 10)) continue;
          if (startISO < (fromISO || "").slice(0, 10) && endISO >= (fromISO || "").slice(0, 10)) {
            result.push({ start: (fromISO || "").slice(0, 10), end: endISO, ongoing: true });
          } else {
            result.push({ start: startISO, end: endISO, ongoing: false });
          }
        }
      }
    }

    return result.sort((a, b) => a.start.localeCompare(b.start)).slice(0, count);
  }

  const api = {
    load,
    ready: load,
    airport,
    airports: allAirports,
    search,
    hasLive,
    setLiveRoutes,
    route,
    miles,
    hotpickAt,
    hotpickMiles,
    hotpickExcluded,
    hotpickRegions,
    hotpickMeta,
    seasonOf,
    isPeak,
    peakKey,
    regionTable,
    pendingRoutes,
    peakPeriods,
    peakPeriodsAll,
    peakRule,
    peakNote,
    upcomingPeak,
    CABIN_LETTER
  };

  /* app.js 가 먼저 로드되므로 Air 에 붙인다. */
  if (window.Air) window.Air.award = api;
  window.AirAward = api;
})();
