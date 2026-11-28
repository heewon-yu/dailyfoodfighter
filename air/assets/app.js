/* ==========================================================================
   마일지도(MILEMAP) AIR — 공통 모듈
   - 데이터: Cloudflare D1 API(/api/air/manifest + /api/air/routes) 우선,
             실패하면 정적 매니페스트(/air/data/preview/index.json + snapshots) 폴백
   - 화면: 공통 헤더/푸터, 필터 상태(URL), 공항 자동완성, 공제 마일 표시 규칙
   - 원칙: 대한항공(KE)만, 프레스티지석(P)·일등석(F) 두 등급만 표시(일반석 E·프리미엄석 R 제외),
           R(프리미엄석)·G/U(승급 전용) 제외, 좌석 수는 제공하지 않음,
           공제 마일은 공식 공제표 + 성수기/평수기 규칙으로만 계산,
           NEW는 확인된 unavailable→available 전환만.
   ========================================================================== */
(() => {
  "use strict";

  const ROOT = "/air/";

  /* 운영 전환 시 이 한 줄만 ../data/ 로 바꾼다. */
  const DATA_ROOT = ROOT + "data/preview/";

  /* D1 API (functions/api/air/*). 행 데이터·월 목록을 여기서 읽는다.
     ?data=static 을 붙이면 정적 스냅샷으로 강제 폴백한다(점검용). */
  const API_ROOT = "/api/air/";
  const D1_PAGE_LIMIT = 20000;   // GET /api/air/routes 의 1회 상한
  const D1_MAX_PAGES = 40;       // 안전장치(20,000행 × 40 = 80만행)


  const FRESH_HOURS = 26;

  const PROGRAM = "KE_SKYPASS";
  const PROGRAM_LABEL = "대한항공 스카이패스";

  const KE_AWARD_URL =
    "https://www.koreanair.com/booking/book-and-manage/award-seat-availability";
  const KE_HOTPICK_URL =
    "https://www.koreanair.com/contents/skypass/use-miles/award-ticket/hotpick";

  /* 화면에는 프레스티지석(P) · 일등석(F) 두 등급만 표시한다.
     일반석(E)·프리미엄석(R)은 표시·검색·수집·합산 어디에서도 쓰지 않는다. */
  const CABINS = [
    { key: "business", letter: "P", name: "프레스티지석", short: "프레스티지", cls: "cabin-p" },
    { key: "first", letter: "F", name: "일등석", short: "일등", cls: "cabin-f" }
  ];

  const CABIN_BY_KEY = new Map(CABINS.map(c => [c.key, c]));
  const CABIN_BY_LETTER = new Map(CABINS.map(c => [c.letter, c]));

  /* 데이터에 남아 있을 수 있는 값 별칭. 일반석(E)·프리미엄석(R)·G/U(승급 전용)는 쓰지 않는다. */
  const CABIN_ALIAS = {
    p: "business", business: "business", prestige: "business", o: "business",
    "프레스티지석": "business", "프레스티지": "business", j: "business", c: "business",
    f: "first", first: "first", first_combined: "first", first_award: "first",
    "일등석": "first"
  };

  const EXCLUDED_CABINS = new Set([
    "e", "economy", "일반석", "일반", "y", "x",
    "r", "premium", "프리미엄석", "프리미엄",
    "g", "u", "premium_upgrade", "business_upgrade", "first_upgrade",
    "upgrade_premium", "upgrade_business", "upgrade_first",
    "premium_upgrade_seat", "business_upgrade_seat",
    "좌석승급(프리미엄)", "좌석승급(프레스티지)"
  ]);

  const STATUS_LABEL = {
    available: "좌석 있음",
    unavailable: "좌석 없음",
    unknown: "미조회"
  };

  const REGION_LABEL = {
    "japan": "일본",
    "china": "중국·동북아",
    "southeast-asia": "동남아시아",
    "southwest-asia": "서남아시아",
    "northeast-asia": "동북아시아",
    "north-america": "북미",
    "south-america": "남미",
    "europe": "유럽·중동",
    "oceania": "대양주·괌",
    "middle-east": "중동",
    "africa": "아프리카",
    "domestic": "국내"
  };

  /* 지도와 달력은 /air/calendar/ 하나로 통합했다(2026-11-26 유희원 님 지시).
     /air/map/ 은 /air/calendar/ 로 이동한다. */
  const NAV = [
    { key: "search", href: "", label: "검색" },
    { key: "calendar", href: "calendar/", label: "달력/지도" },
    { key: "first", href: "first/", label: "일등석" },
    { key: "mileage", href: "mileage/", label: "공제표" },
    { key: "guide", href: "guide/", label: "이용안내" }
  ];

  /* -------------------------------------------------------------- 유틸 */

  function el(tag, props, children) {
    const node = document.createElement(tag);

    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false) continue;

        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "html") node.innerHTML = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key.startsWith("on") && typeof value === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) node.setAttribute(key, "");
        else node.setAttribute(key, String(value));
      }
    }

    if (children) {
      for (const child of [].concat(children)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child.nodeType ? child : document.createTextNode(String(child)));
      }
    }

    return node;
  }

  const nf = new Intl.NumberFormat("ko-KR");

  function fmtMiles(n) {
    return Number.isInteger(n) && n > 0 ? nf.format(n) + " 마일" : null;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    if (!y || !m || !d) return String(iso);
    return `${y}.${m}.${d}`;
  }

  function fmtMonth(value) {
    if (!value) return "전체 기간";
    const [y, m] = String(value).split("-");
    return `${y}년 ${Number(m)}월`;
  }

  const dtf = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  });

  function fmtDateTime(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return dtf.format(date).replace(/\./g, ".").replace(/\s+/g, " ").trim() + " KST";
  }

  function hoursSince(iso) {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return null;
    return (Date.now() - t) / 36e5;
  }

  function fmtAge(iso) {
    const h = hoursSince(iso);
    if (h === null) return null;
    if (h < 1) return "방금 전";
    if (h < 24) return `${Math.round(h)}시간 전`;
    return `${Math.round(h / 24)}일 전`;
  }

  function todayKst() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
  }

  /* ---------------------------------------------------------- 데이터 계층 */

  const state = {
    manifest: null,
    manifestPromise: null,
    parts: new Map(),
    rows: null,
    rowsKey: "",
    stats: null,
    airports: null,
    airportPromise: null,
    catalog: null,
    catalogPromise: null,
    /* "d1" | "static" — 지금 실제로 읽고 있는 데이터 출처 */
    source: null
  };

  async function fetchJson(url, cacheMode) {
    const response = await fetch(url, cacheMode ? { cache: cacheMode } : { cache: "no-store" });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function sourceOverride() {
    const value = params().get("data");
    return value === "static" || value === "d1" ? value : null;
  }

  /** D1 매니페스트(/api/air/manifest) → 정적 index.json 과 같은 모양으로 맞춘다. */
  async function d1Manifest() {
    const payload = await fetchJson(API_ROOT + "manifest", "default");

    if (!payload || payload.ok !== true) throw new Error("D1_MANIFEST_UNAVAILABLE");
    if (!Array.isArray(payload.files) || !payload.files.length) throw new Error("D1_MANIFEST_EMPTY");

    return {
      mode: payload.mode === "test" ? "test" : "production",
      schema_version: payload.schema_version || 3,
      generated_at: payload.generated_at || null,
      updated_at: payload.updated_at || null,
      total: Number.isFinite(payload.total) ? payload.total : null,
      snapshot: payload.snapshot || "d1",
      files: payload.files.map(file => ({ month: file.month, total: file.total, source: "d1" })),
      source: payload.source_name || null,
      source_url: payload.source_url || null,
      source_updated_at: payload.source_updated_at || null,
      collection: payload.collection || { method: "D1", logged_in: false, routes: [], months: payload.months || [] },
      last_success_at: payload.last_success_at || payload.generated_at || null,
      last_error: payload.last_error || null,
      data_source: "d1"
    };
  }

  /** 정적 스냅샷 매니페스트(폴백) */
  async function staticManifest() {
    const manifest = await fetchJson(DATA_ROOT + "index.json");

    if (manifest.mode !== "test" && manifest.mode !== "production") {
      throw new Error("INVALID_MANIFEST_MODE");
    }
    if (!Array.isArray(manifest.files) || !manifest.files.length) {
      throw new Error("INVALID_MANIFEST_FILES");
    }

    return Object.assign({}, manifest, { data_source: "static" });
  }

  /**
   * 매니페스트: D1 우선, 실패하면 정적 JSON.
   * (?data=static 이면 정적, ?data=d1 이면 D1 실패 시 폴백 없이 에러)
   */
  function getManifest() {
    if (state.manifest) return Promise.resolve(state.manifest);

    if (!state.manifestPromise) {
      const override = sourceOverride();

      state.manifestPromise = (async () => {
        if (override !== "static") {
          try {
            const manifest = await d1Manifest();
            state.source = "d1";
            return manifest;
          } catch (error) {
            if (override === "d1") throw error;
          }
        }

        const manifest = await staticManifest();
        state.source = "static";
        return manifest;
      })()
        .then(manifest => {
          state.manifest = manifest;
          return manifest;
        })
        .catch(error => {
          state.manifestPromise = null;
          throw error;
        });
    }

    return state.manifestPromise;
  }

  function safePath(path) {
    const base = new URL(DATA_ROOT, location.origin);
    const url = new URL(path, base);

    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      throw new Error("INVALID_DATA_PATH");
    }

    return url.href;
  }

  /** D1 한 달 전체 행 — 20,000행 상한을 넘으면 offset 으로 이어 읽는다. */
  async function loadD1Month(month) {
    const items = [];

    for (let page = 0; page < D1_MAX_PAGES; page += 1) {
      const offset = page * D1_PAGE_LIMIT;
      const url = `${API_ROOT}routes?month=${encodeURIComponent(month)}` +
        `&limit=${D1_PAGE_LIMIT}&offset=${offset}`;
      const payload = await fetchJson(url, "default");

      if (!payload || payload.ok !== true || !Array.isArray(payload.items)) {
        throw new Error("D1_ROUTES_UNAVAILABLE");
      }

      items.push(...payload.items);

      const total = Number.isFinite(payload.total) ? payload.total : items.length;
      if (!payload.items.length || items.length >= total) break;
    }

    return items;
  }

  async function loadPart(file) {
    const key = file.source === "d1" ? `d1:${file.month}` : file.path;
    if (state.parts.has(key)) return state.parts.get(key);

    const promise = (file.source === "d1"
      ? loadD1Month(file.month)
      : fetchJson(safePath(file.path)).then(part => {
          if (!Array.isArray(part.items)) throw new Error("INVALID_DATA_PART");
          return part.items;
        }))
      .catch(error => {
        state.parts.delete(key);
        throw error;
      });

    state.parts.set(key, promise);
    return promise;
  }

  function fileMatches(file, filter) {
    /* D1 파일은 월 단위이고 권역 정보가 없다 — 권역 필터는 정적 파일에만 쓴다. */
    if (file.source !== "d1" && filter.region && file.region !== filter.region) return false;
    if (filter.month && file.month !== filter.month) return false;
    return true;
  }

  /**
   * 필터(지역/월)에 해당하는 지역·월 파일만 읽어 정규화된 행을 돌려준다.
   * D1 읽기가 중간에 실패하면 정적 스냅샷으로 한 번 폴백한다.
   * @returns {Promise<{rows:Array, stats:Object}>}
   */
  async function loadRows(filter = {}) {
    const manifest = await getManifest();

    try {
      return await assembleRows(manifest, filter);
    } catch (error) {
      if (manifest.data_source !== "d1" || sourceOverride() === "d1") throw error;

      /* D1(API·D1 장애) 폴백 — 한 번만 정적 스냅샷으로 다시 읽는다. */
      state.manifest = null;
      state.manifestPromise = null;
      state.parts.clear();
      state.source = "static";
      const fallback = await staticManifest();
      state.manifest = fallback;
      state.manifestPromise = Promise.resolve(fallback);
      return assembleRows(fallback, filter);
    }
  }

  async function assembleRows(manifest, filter) {
    const files = manifest.files.filter(file => fileMatches(file, filter));

    const parts = await Promise.all(files.map(async file => ({
      file,
      items: await loadPart(file)
    })));

    const rows = [];
    const stats = {
      raw: 0,
      excludedProgram: 0,
      excludedCabin: 0,
      invalid: 0,
      fConflict: 0,
      newUnproven: 0,
      firstCombined: 0,
      files: files.map(f => ({ region: f.region, month: f.month, total: f.total }))
    };

    for (const { file, items } of parts) {
      for (const raw of items) {
        const { row, reason } = normalize(raw, stats, file.region);
        if (row) rows.push(row);
        else if (reason) {
          if (reason === "program") stats.excludedProgram++;
          else if (reason === "cabin") stats.excludedCabin++;
          else stats.invalid++;
        }
      }
    }

    return { rows, stats };
  }

  function normalize(raw, stats, region) {
    stats.raw++;

    if (raw && raw.test_data !== undefined && raw.test_data !== null &&
        raw.test_data !== 1 && raw.test_data !== true) {
      /* 운영 export 에 섞인 fixture 는 표시하지 않는다. */
      return { reason: "invalid" };
    }

    if (!raw || typeof raw !== "object") return { reason: "invalid" };

    const program = String(raw.program || "");

    if (program !== PROGRAM) return { reason: "program" };

    const cabinRaw = String(raw.cabin || "").trim();
    const cabinKey = CABIN_ALIAS[cabinRaw.toLowerCase()] || CABIN_ALIAS[cabinRaw];

    if (!cabinKey) {
      if (EXCLUDED_CABINS.has(cabinRaw.toLowerCase()) || EXCLUDED_CABINS.has(cabinRaw)) {
        return { reason: "cabin" };
      }
      return { reason: "invalid" };
    }

    const origin = String(raw.origin || "").toUpperCase();
    const destination = String(raw.destination || "").toUpperCase();
    const date = String(raw.departure_date || "").slice(0, 10);

    if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { reason: "invalid" };
    }

    const statusRaw = String(raw.status || "").toLowerCase();
    const status = ["available", "unavailable", "unknown"].includes(statusRaw)
      ? statusRaw : "unknown";

    const cabin = CABIN_BY_KEY.get(cabinKey);

    const newlyAvailable = raw.newly_available === true;
    const previousStatus = raw.previous_status ? String(raw.previous_status) : null;
    const newEvidence = raw.new_evidence ? String(raw.new_evidence) : null;

    /* 확인된 unavailable → available 전환만 NEW 로 인정한다. */
    const isNew = newlyAvailable && status === "available" &&
      (previousStatus === "unavailable" || newEvidence === "confirmed_transition");

    if (newlyAvailable && !isNew) stats.newUnproven++;

    const pricingRaw = raw.pricing && typeof raw.pricing === "object" ? raw.pricing : {};

    return {
      row: {
        program,
        origin,
        destination,
        date,
        month: date.slice(0, 7),
        region: region || "",
        cabinKey,
        cabin,
        status,
        seatCount: null,
        newlyAvailable,
        isNew,
        previousStatus,
        firstCombined: raw.first_combined === true,
        collectedAt: raw.collected_at || null,
        sourceUpdatedAt: raw.source_updated_at || null,
        pricing: {
          status: String(pricingRaw.status || "unverified"),
          standard: Number.isInteger(pricingRaw.standard_miles) ? pricingRaw.standard_miles : null,
          discounted: Number.isInteger(pricingRaw.discounted_miles) ? pricingRaw.discounted_miles : null,
          promotion: pricingRaw.promotion || null
        }
      }
    };
  }

  function cacheKey(filter) {
    return `${filter.region || "*"}|${filter.month || "*"}`;
  }

  /**
   * 뷰에서 공통으로 쓰는 캐시된 로더.
   */
  async function data(filter = {}) {
    const key = cacheKey(filter);
    if (state.rowsKey === key && state.rows) {
      return { rows: state.rows, stats: state.stats };
    }

    const result = await loadRows(filter);
    state.rowsKey = key;
    state.rows = result.rows;
    state.stats = result.stats;
    return result;
  }

  /* 지도·달력·검색에서 쓰는 전체(모든 지역·월) 데이터 */
  function allData() {
    return data({});
  }

  async function manifestMeta() {
    const manifest = await getManifest();
    const generatedAt = manifest.generated_at || null;
    const ageHours = hoursSince(generatedAt);
    const stale = ageHours !== null && ageHours > FRESH_HOURS;

    return {
      mode: manifest.mode,
      schemaVersion: manifest.schema_version,
      generatedAt,
      generatedLabel: fmtDateTime(generatedAt),
      ageHours,
      ageLabel: fmtAge(generatedAt),
      stale,
      regions: [...new Set(manifest.files.map(f => f.region).filter(Boolean))].sort(),
      months: [...new Set(manifest.files.map(f => f.month).filter(Boolean))].sort(),
      files: manifest.files,
      dataSource: manifest.data_source || "static",
      snapshot: manifest.snapshot || null,
      total: manifest.total || null,
      lastSuccess: manifest.last_success_at || null,
      lastError: manifest.last_error || null,
      sourceUpdatedAt: manifest.source_updated_at || null,
      sourceUpdatedLabel: fmtDateTime(manifest.source_updated_at || null),
      sourceUrl: manifest.source_url || null,
      collectionRoutes: manifest.collection && Array.isArray(manifest.collection.routes)
        ? manifest.collection.routes : null
    };
  }

  function isStaleRow(row, reference) {
    const stamp = row.collectedAt || row.sourceUpdatedAt;
    const h = hoursSince(stamp);
    if (h === null) return false;
    const ref = hoursSince(reference);
    if (ref !== null && h > ref + 6) return true;
    return h > FRESH_HOURS;
  }

  /* ------------------------------------------------------------- 공제량 */

  /**
   * 행의 공제량 상태 — 대한항공 공식 공제표 + 성수기 계산만 사용한다.
   * kind: official | no-chart
   */
  function priceOf(row) {
    const award = window.Air && Air.award;

    if (!award || typeof award.miles !== "function") {
      return { kind: "no-chart", cabin: null, region: null };
    }

    const result = award.miles(row.origin, row.destination, row.date, row.cabinKey);

    if (!result || result.state !== "ok") {
      return { kind: "no-chart", cabin: result ? result.cabin : null, region: result ? result.region : null };
    }

    return Object.assign({ kind: "official" }, result);
  }

  function payableMiles(row) {
    const price = priceOf(row);
    return price.kind === "official" ? price.miles : null;
  }

  /** 성수기/평수기 배지 (달력·카드·표 공통) */
  function seasonBadge(origin, date, options) {
    const award = window.Air && Air.award;
    if (!award || typeof award.seasonOf !== "function") return null;

    const season = award.seasonOf(date, origin);

    return el("span", {
      class: `badge ${season.peak ? "badge--peak" : "badge--offpeak"}`,
      title: season.peak
        ? "대한항공 성수기 기간에 포함되는 날짜입니다."
        : "대한항공 비수기(평수기) 기간입니다.",
      text: (options && options.long ? "" : "") + season.label
    });
  }

  function milesText(value) {
    return fmtMiles(value) || "—";
  }

  /* ------------------------------------------------------- 보너스 핫픽 */

  function hotpickBadge(row) {
    const award = window.Air && Air.award;
    if (!award || typeof award.hotpickAt !== "function") return null;

    const hit = award.hotpickAt(row.origin, row.destination, row.date, row.cabinKey);

    if (hit.state === "applies") {
      return el("span", {
        class: "badge badge--hotpick",
        title: `대한항공 보너스 핫픽 할인 대상 구간입니다. 편도 ${fmtMiles(hit.discount)} 할인.`,
        text: `핫픽 -${fmtMiles(hit.discount)}`
      });
    }

    if (hit.state === "excluded") {
      return el("span", {
        class: "badge badge--hotpick-off",
        title: "대한항공 공식 안내 기준 핫픽 출발 제외 기간(12/23~1/4, 2/4~3/2)에 들어가는 날짜입니다. 실제 할인 여부는 예매 화면의 초록색 할인 표시로 확인해야 합니다.",
        text: "핫픽 제외 기간"
      });
    }

    return null;
  }

  /** 카드 가격 영역에 붙는 핫픽 안내(적용 시 실공제 + 편명 조건) */
  function hotpickNote(row) {
    const award = window.Air && Air.award;
    if (!award || typeof award.hotpickMiles !== "function") return null;

    const hit = award.hotpickMiles(row.origin, row.destination, row.date, row.cabinKey);
    if (!hit) return null;

    const flightNote = hit.flights && hit.flights.length
      ? `대상 편명 ${hit.flights.join("·")} 확인 필요`
      : "해당 노선 전편";

    return el("div", { class: "price-hotpick" }, [
      el("b", { text: `보너스 핫픽 시 ${fmtMiles(hit.miles)}` }),
      el("span", { text: ` (-${fmtMiles(hit.discount)}) · ${flightNote}` })
    ]);
  }

  /* --------------------------------------------------------------- 공항 */

  function airports() {
    if (state.airports) return Promise.resolve(state.airports);

    if (!state.airportPromise) {
      const award = window.Air && Air.award;

      const loadAward = award && typeof award.load === "function"
        ? award.load()
        : Promise.reject(new Error("AWARD_MODULE_MISSING"));

      state.airportPromise = loadAward.then(() => {
        const map = new Map();

        for (const entry of award.airports()) {
          map.set(entry.code, {
            code: entry.code,
            name: entry.name || entry.code,
            city: entry.city || "",
            english: entry.english || "",
            municipality: entry.municipality || "",
            region: entry.region || "",
            country: entry.country || "",
            aliases: entry.aliases || [],
            chart: entry.chart === true,
            lat: Number.isFinite(entry.lat) ? entry.lat : null,
            lon: Number.isFinite(entry.lon) ? entry.lon : null
          });
        }

        state.airports = map;
        return map;
      }).catch(error => {
        state.airportPromise = null;
        throw error;
      });
    }

    return state.airportPromise;
  }

  function routeCatalog() {
    const award = window.Air && Air.award;
    if (!award || typeof award.load !== "function") {
      return Promise.resolve({ routes: [], airports: [] });
    }

    return award.load().then(() => ({
      routes: award.airports()
        .filter(entry => entry.chart)
        .map(entry => ({ program: PROGRAM, origin: "ICN", destination: entry.code })),
      airports: award.airports()
    }));
  }

  function airport(code) {
    const award = window.Air && Air.award;

    if (award && typeof award.airport === "function") {
      const entry = award.airport(code);
      if (entry) return entry;
    }

    return state.airports ? state.airports.get(String(code || "").toUpperCase()) || null : null;
  }

  function airportLabel(code) {    const airport = state.airports && state.airports.get(code);
    if (!airport) return code;
    return `${airport.name} (${code})`;
  }

  function airportShort(code) {
    const airport = state.airports && state.airports.get(code);
    return airport ? airport.name : code;
  }

  function searchText(airport) {
    return [
      airport.code, airport.name, airport.english, airport.municipality, airport.region
    ].filter(Boolean).join(" ").toLowerCase();
  }

  /* ---------------------------------------------------------- URL 상태 */

  function params() {
    return new URLSearchParams(location.search);
  }

  function param(name, fallback = "") {
    return params().get(name) || fallback;
  }

  /**
   * 현재 필터 상태를 URL 에 반영한다. push=false 면 replaceState.
   */
  function setParams(values, push = false) {
    const url = new URL(location.href);

    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === undefined || value === "" || value === "all") {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    if (url.href === location.href) return;

    if (push) history.pushState(null, "", url);
    else history.replaceState(null, "", url);

    renderHeaderUpdated();
  }

  /**
   * 다른 뷰로 이동할 때 현재 필터를 그대로 넘긴다.
   */
  function viewLink(path, extra = {}) {
    const url = new URL(ROOT + path, location.origin);
    const current = params();

    for (const [key, value] of current.entries()) {
      /* 페이지 번호는 화면별로 달라서 넘기지 않는다. */
      if (key === "page") continue;
      url.searchParams.set(key, value);
    }

    for (const [key, value] of Object.entries(extra)) {
      if (value === null || value === undefined || value === "") url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }

    return url.pathname + url.search;
  }

  function onPopState(handler) {
    window.addEventListener("popstate", () => handler(params()));
  }

  /* --------------------------------------------------------------- 화면 */

  function pageKey() {
    return document.body.dataset.airPage || "search";
  }

  async function renderHeaderUpdated() {
    const target = document.getElementById("air-updated");
    if (!target) return;

    try {
      const meta = await manifestMeta();

      target.replaceChildren();

      if (!meta.generatedAt) {
        target.append(el("span", { class: "air-dot" }), "데이터 갱신 시각 미확인");
        return;
      }

      const stale = meta.ageHours !== null && meta.ageHours > FRESH_HOURS;

      target.append(
        el("span", {
          class: `air-dot ${stale ? "air-dot--stale" : "air-dot--fresh"}`,
          "aria-hidden": "true"
        }),
        el("span", null, [
          "마지막 데이터 생성 ",
          el("strong", { text: meta.generatedLabel || "미확인" }),
          stale ? " · 오래된 데이터" : ""
        ])
      );
    } catch {
      target.replaceChildren(
        el("span", { class: "air-dot air-dot--error", "aria-hidden": "true" }),
        "데이터 상태 확인 실패"
      );
    }
  }

  function mountChrome() {
    if (document.querySelector(".air-header")) return;

    const key = pageKey();

    const skip = el("a", { class: "skip-link", href: "#air-main", text: "본문으로 바로 가기" });
    document.body.prepend(skip);

    /* /hotel/과 동일한 상단: 왼쪽 배지+이름/부제, 오른쪽 탭(하위 메뉴) 한 줄 */
    const header = el("header", { class: "air-header" }, [
      el("div", { class: "air-header__inner" }, [
        el("a", { class: "air-logo", href: ROOT, "aria-label": "마일지도 홈" }, [
          el("span", { class: "air-logo__badge", "aria-hidden": "true", text: "✈" }),
          el("span", null, [
            el("b", { text: "마일지도" }),
            el("small", { text: "대한항공 SKYPASS 국제선" })
          ])
        ]),
        el("nav", { class: "air-nav", "aria-label": "주요 메뉴" },
          NAV.map(item => el("a", {
            href: viewLink(item.href),
            "aria-current": item.key === key ? "page" : null,
            text: item.label
          }))
        )
      ])
    ]);

    const main = document.getElementById("air-main");
    if (main) main.before(header);
    else document.body.prepend(header);

    const footer = el("footer", { class: "air-footer" }, [
      el("div", { class: "air-footer__inner" }, [
        el("div", null, [
          el("h2", { text: "마일지도 · 서비스 안내" }),
          el("p", null, [
            "마일지도는 대한항공 SKYPASS 국제선 보너스 좌석을 날짜별로 확인할 수 있게 ",
            "정리한 독립 서비스입니다. 대한항공 및 어떤 항공사와도 제휴 관계가 없으며, ",
            "공식 서비스가 아닙니다."
          ]),
          el("p", null, "표시된 내용은 예약 가능 여부나 좌석을 보장하지 않습니다. 실제 발권 전 항공사 공식 채널에서 확인하세요.")
        ]),
        el("div", null, [
          el("h2", { text: "데이터 출처" }),
          el("ul", null, [
            el("li", null, [
              el("a", {
                href: KE_AWARD_URL, target: "_blank", rel: "noopener noreferrer",
                text: "대한항공 보너스 좌석 조회 ↗"
              })
            ]),
            el("li", null, [
              el("a", {
                href: KE_HOTPICK_URL, target: "_blank", rel: "noopener noreferrer",
                text: "대한항공 보너스 핫픽 ↗"
              })
            ]),
            el("li", { text: "공항 좌표: OurAirports (Public Domain)" }),
            el("li", { text: "노선 후보: 공공데이터 기반 운항 스케줄" })
          ])
        ]),
        el("div", null, [
          el("h2", { text: "약관·정책" }),
          el("ul", null, [
            el("li", null, [el("a", { href: ROOT + "guide/", text: "이용안내·FAQ" })]),
            el("li", null, [el("a", { href: ROOT + "guide/#terms", text: "이용조건" })]),
            el("li", null, [el("a", { href: "/privacy/", text: "개인정보처리방침" })]),
            el("li", null, [el("a", { href: "/contact/", text: "서비스 문의" })])
          ])
        ])
      ]),
      el("div", { class: "air-footer__bar" }, [
        el("span", { text: "© 2026 DailyFoodFighter AIR" }),
        el("span", { text: "공식 조회 화면 수집 · 실제 예약 보장 아님 · 무제휴" })
      ])
    ]);

    document.body.append(footer);

    renderHeaderUpdated();
  }

  function autoMount() {
    mountChrome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoMount, { once: true });
  } else {
    autoMount();
  }

  /* --------------------------------------------------------- 자동완성 */

  /**
   * 공항 자동완성 콤보박스.
   * container: .air-combo 요소, getItems: () => [{value,label,code,search}]
   */
  function combobox(container, options) {
    const input = container.querySelector("input");
    const list = el("ul", {
      class: "air-combo__list",
      role: "listbox",
      id: container.id + "-list",
      hidden: true
    });

    container.append(list);

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", list.id);

    let items = [];
    let active = -1;
    let selected = options.value || "";

    function labelFor(value) {
      if (!value) return "";
      const found = items.find(item => item.value === value);
      return found ? found.label : value;
    }

    function close() {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    }

    function open() {
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function filterItems() {
      const keyword = input.value.trim().toLowerCase();

      const base = options.includeEmpty !== false
        ? [{ value: "", label: options.emptyLabel || "전체", code: "" }, ...items]
        : items.slice();

      if (!keyword || keyword === labelFor(selected).toLowerCase()) {
        return base;
      }

      return base.filter(item =>
        !item.value ? false : item.search.includes(keyword) ||
          item.label.toLowerCase().includes(keyword)
      );
    }

    function paint() {
      const view = filterItems();

      list.replaceChildren();

      if (!view.length) {
        list.append(el("li", { class: "air-combo__empty", text: "일치하는 공항이 없습니다." }));
        open();
        return;
      }

      view.forEach((item, index) => {
        const li = el("li", {
          role: "option",
          id: `${list.id}-${index}`,
          "aria-selected": item.value === selected ? "true" : "false",
          class: index === active ? "is-active" : null
        }, [
          el("span", { text: item.label }),
          item.code ? el("span", { class: "air-combo__code", text: item.code }) : ""
        ]);

        li.addEventListener("mousedown", event => {
          event.preventDefault();
          choose(item);
        });

        list.append(li);
      });

      open();
    }

    function choose(item) {
      selected = item.value;
      input.value = item.value ? item.label : "";
      close();
      if (typeof options.onSelect === "function") options.onSelect(item.value);
    }

    function move(step) {
      const view = filterItems();
      if (!view.length) return;
      active = (active + step + view.length) % view.length;
      [...list.children].forEach((li, index) =>
        li.classList.toggle("is-active", index === active));
      const current = list.children[active];
      if (current) {
        input.setAttribute("aria-activedescendant", current.id);
        current.scrollIntoView({ block: "nearest" });
      }
    }

    input.addEventListener("input", () => {
      active = -1;
      paint();
    });

    input.addEventListener("focus", () => {
      input.select();
      paint();
    });

    input.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (list.hidden) paint();
        else move(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Enter") {
        const view = filterItems();
        if (!list.hidden && view.length) {
          event.preventDefault();
          choose(view[Math.max(0, active)] || view[0]);
        }
      } else if (event.key === "Escape") {
        close();
      }
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (!container.contains(document.activeElement)) {
          /* 입력값이 남아 있으면 확정된 선택으로 되돌린다. */
          input.value = selected ? labelFor(selected) : "";
          close();
        }
      }, 120);
    });

    document.addEventListener("pointerdown", event => {
      if (!container.contains(event.target)) close();
    });

    return {
      setItems(next) {
        items = next;
        if (!selected) input.value = "";
        else input.value = labelFor(selected);
      },
      setValue(value) {
        selected = value || "";
        input.value = selected ? labelFor(selected) : "";
      },
      getValue() {
        return selected;
      }
    };
  }

  /* ---------------------------------------------------- 공항 자동완성 */

  /**
   * 공항 자동완성 입력란. 도시명·공항명·영문·IATA 코드를 모두 받는다.
   * 데이터가 없는 공항도 후보에 뜨고, 후보마다 좌석 데이터 유무를 정직하게 표시한다.
   */
  function airportCombo(container, options = {}) {
    const input = container.querySelector("input");
    const list = el("ul", {
      class: "air-combo__list",
      role: "listbox",
      id: container.id + "-list",
      hidden: true
    });

    container.append(list);

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", list.id);
    if (options.placeholder) input.setAttribute("placeholder", options.placeholder);

    let selected = options.value || "";
    let view = [];
    let active = -1;

    function labelOf(code) {
      const airport = state.airports && state.airports.get(code);
      return airport ? `${airport.name} (${code})` : (code || "");
    }

    function liveCodes() {
      return window.Air && Air.award && Air.award.hasLive ? Air.award.hasLive : () => false;
    }

    function popular() {
      const award = window.Air && Air.award;
      if (!award) return [];

      const live = award.airports().filter(entry => award.hasLive(entry.code));
      const korea = award.airports().filter(entry => ["ICN", "GMP"].includes(entry.code));
      const charted = award.airports().filter(entry => entry.chart);

      const seen = new Set();
      const out = [];

      for (const entry of [...live, ...korea, ...charted]) {
        if (seen.has(entry.code)) continue;
        seen.add(entry.code);
        out.push(entry);
      }

      return out;
    }

    function candidates(keyword) {
      const award = window.Air && Air.award;
      if (!award) return [];

      const keywordTrimmed = keyword.trim();

      if (!keywordTrimmed || keywordTrimmed === labelOf(selected)) return popular();
      return award.search(keywordTrimmed, 8);
    }

    function open() {
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function close() {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    }

    function paint() {
      view = candidates(input.value);
      list.replaceChildren();

      if (!view.length) {
        list.append(el("li", {
          class: "air-combo__empty",
          text: "일치하는 공항이 없습니다. 도시명·공항명·코드(ICN)로 다시 입력해 보세요."
        }));
        open();
        return;
      }

      const hasLive = liveCodes();

      view.forEach((entry, index) => {
        const live = hasLive(entry.code);

        const title = el("strong", { text: entry.name });
        const sub = [entry.english || entry.municipality, entry.region]
          .filter(Boolean).join(" · ");

        const li = el("li", {
          role: "option",
          id: `${list.id}-${index}`,
          "aria-selected": entry.code === selected ? "true" : "false",
          class: index === active ? "is-active" : null
        }, [
          el("span", { class: "air-combo__body" }, [
            title,
            sub ? el("small", { text: sub }) : null
          ]),
          el("span", { class: "air-combo__meta" }, [
            el("span", { class: "air-combo__code", text: entry.code }),
            el("span", {
              class: `air-combo__tag ${live ? "is-live" : "is-idle"}`,
              title: live
                ? "이 공항이 포함된 노선의 좌석 데이터가 수집되어 있습니다."
                : "이 공항의 좌석 데이터는 아직 수집되지 않았습니다. 공제표 기준 마일리지는 확인할 수 있습니다.",
              text: live ? "좌석 데이터" : "미수집"
            })
          ])
        ]);

        li.addEventListener("mousedown", event => {
          event.preventDefault();
          choose(entry);
        });

        list.append(li);
      });

      open();
    }

    function choose(entry) {
      selected = entry.code;
      input.value = labelOf(entry.code);
      close();
      if (typeof options.onSelect === "function") options.onSelect(entry.code);
    }

    function move(step) {
      if (!view.length) return;
      active = (active + step + view.length) % view.length;

      [...list.children].forEach((li, index) =>
        li.classList.toggle("is-active", index === active));

      const current = list.children[active];
      if (current) {
        input.setAttribute("aria-activedescendant", current.id);
        current.scrollIntoView({ block: "nearest" });
      }
    }

    input.addEventListener("input", () => {
      active = -1;
      paint();
    });

    input.addEventListener("focus", () => {
      paint();
    });

    input.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (list.hidden) paint();
        else move(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Enter") {
        if (!list.hidden && view.length) {
          event.preventDefault();
          choose(view[Math.max(0, active)] || view[0]);
        }
      } else if (event.key === "Escape") {
        close();
      }
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (!container.contains(document.activeElement)) {
          input.value = selected ? labelOf(selected) : "";
          close();
        }
      }, 120);
    });

    document.addEventListener("pointerdown", event => {
      if (!container.contains(event.target)) close();
    });

    if (selected) input.value = labelOf(selected);

    return {
      setValue(code) {
        selected = code || "";
        input.value = selected ? labelOf(selected) : "";
      },
      getValue() {
        return selected;
      }
    };
  }

  /* ----------------------------------------------------- 상태 배지 등 */

  function statusBadge(row, meta) {
    const stale = meta && isStaleRow(row, meta.generatedAt);

    if (row.isNew) {
      return el("span", { class: "badge badge--new", text: "NEW" });
    }

    if (row.status === "available") {
      return el("span", { class: "badge badge--available", text: STATUS_LABEL.available });
    }

    if (row.status === "unavailable") {
      return el("span", {
        class: `badge badge--unavailable${stale ? " badge--stale" : ""}`,
        text: stale ? "좌석 없음 · 오래됨" : STATUS_LABEL.unavailable
      });
    }

    return el("span", {
      class: "badge badge--unknown",
      text: "미조회",
      title: "이 날짜는 아직 조회된 기록이 없습니다. 좌석 없음과 다릅니다."
    });
  }

  function cabinChip(cabinKey) {
    const cabin = CABIN_BY_KEY.get(cabinKey);
    if (!cabin) return null;

    return el("span", { class: `cabin-chip ${cabin.cls}` }, [
      el("span", { class: "cabin-chip__l", text: cabin.letter }),
      el("span", { text: cabin.short })
    ]);
  }

  function priceNode(row) {
    const price = priceOf(row);

    if (price.kind !== "official") {
      return el("div", { class: "flight-card__price" }, [
        el("strong", { text: "공제 구간 확인 중", class: "price-estimate" }),
        el("small", { text: "이 노선은 대한항공 공식 공제표에 아직 표기되어 있지 않습니다." })
      ]);
    }

    const otherLabel = price.season.peak ? "평수기" : "성수기";
    const otherMiles = price.season.peak ? price.offpeak : price.peak;

    return el("div", { class: "flight-card__price" }, [
      el("strong", { text: milesText(price.miles) }),
      el("small", { text: `${price.season.label} 적용 · ${otherLabel} ${milesText(otherMiles)}` }),
      el("small", { class: "price-sub", text: "편도 공제량 · 세금·유류할증료 별도" }),
      hotpickNote(row)
    ]);
  }

  function emptyState(title, description) {
    return el("div", { class: "air-empty" }, [
      el("strong", { text: title }),
      description ? el("p", { text: description }) : null
    ]);
  }

  /* ------------------------------------------- 재조회 요청 큐 (2026-11-28)
     사용자가 노선-월을 조회했을 때 그 노선-월의 D1 collected_at 이 2시간보다 오래됐거나
     아직 기록이 없으면, 조용히 POST /api/air/refresh-request 로 큐에 한 번 넣고
     상태 배지(대기/처리/완료)를 보여 준다. 집 PC 의 queue_worker.py 가 pending 을 가져가
     그 노선-월만 다시 수집·D1 업서트하고 결과를 보고한다. 버튼으로 직접 요청할 수도 있다. */

  const REFRESH = {
    freshHours: 2,
    pollMs: 20000,          /* 상태 확인 주기 */
    pollTries: 9,           /* 최대 3분 */
    sessionTtlMs: 30 * 60 * 1000  /* 같은 세션에서 같은 노선-월 자동 요청은 30분에 1회 */
  };

  /* key → { status, item, fresh } — 화면을 다시 그려도 상태를 유지한다. */
  const refreshMemory = new Map();

  function refreshKey(scope) {
    return `${scope.origin}-${scope.destination}-${scope.month}`;
  }

  /** 노선-월의 마지막 수집 시각과 신선도(2시간 이내). 데이터가 없으면 fresh=false. */
  function refreshFreshness(rows, origin, destination, month) {
    let latest = null;
    let count = 0;

    for (const row of rows || []) {
      if (row.origin !== origin || row.destination !== destination || row.month !== month) continue;
      count += 1;
      if (row.collectedAt) {
        const at = new Date(row.collectedAt).getTime();
        if (!Number.isNaN(at) && (latest === null || at > latest)) latest = at;
      }
    }

    const hours = latest === null ? null : (Date.now() - latest) / 36e5;
    return {
      rows: count,
      collectedAt: latest === null ? null : new Date(latest).toISOString(),
      hours,
      fresh: count > 0 && hours !== null && hours <= REFRESH.freshHours
    };
  }

  function refreshAskedAt(key) {
    try {
      const value = Number(sessionStorage.getItem("milemap-refresh:" + key));
      return Number.isFinite(value) ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  function refreshMarkAsked(key) {
    try {
      sessionStorage.setItem("milemap-refresh:" + key, String(Date.now()));
    } catch (error) {
      /* 사생활 보호 모드 등 저장소가 막혀도 요청 자체는 계속한다. */
    }
  }

  async function refreshPost(scope) {
    const response = await fetch(API_ROOT + "refresh-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scope),
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function refreshGet(scope) {
    const query = new URLSearchParams(scope).toString();
    const response = await fetch(API_ROOT + "refresh-request?" + query, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  /**
   * 재조회 상태 줄 — [상태 점] 설명 [재조회 버튼].
   * @param {{origin:string, dst?}} options
   *   origin, destination, month, rows(지금 읽은 행), auto(자동 요청 여부, 기본 true)
   */
  function refreshBar(options) {
    const scope = {
      origin: String(options.origin || "").toUpperCase(),
      destination: String(options.destination || "").toUpperCase(),
      month: String(options.month || "")
    };

    if (!/^[A-Z]{3}$/.test(scope.origin) || !/^[A-Z]{3}$/.test(scope.destination) ||
        !/^\d{4}-\d{2}$/.test(scope.month)) {
      return null;
    }

    const key = refreshKey(scope);
    const info = refreshFreshness(options.rows, scope.origin, scope.destination, scope.month);

    const dot = el("span", { class: "air-refresh__dot", "aria-hidden": "true" });
    const text = el("span", { class: "air-refresh__text" });
    const button = el("button", {
      type: "button",
      class: "air-btn air-btn--ghost air-btn--sm air-refresh__btn"
    });
    const bar = el("div", { class: "air-refresh", role: "status", "aria-live": "polite" }, [
      dot, text, button
    ]);

    let timer = null;
    let tries = 0;

    function stopPolling() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function paint() {
      const saved = refreshMemory.get(key) || null;
      const status = saved ? saved.status : null;
      const queueState = status === "queued" ? "queued" :
        status === "deduped" || status === "processing" ? "processing" :
        status === "done" ? "done" :
        status === "failed" || status === "failed_cooldown" ? "failed" :
        status === "daily_limit_reached" || status === "rate_limited" ? "limited" :
        info.fresh ? "fresh" : info.rows ? "stale" : "missing";

      bar.dataset.state = queueState;
      dot.dataset.state = queueState;

      if (queueState === "fresh") {
        text.textContent = `최근 ${REFRESH.freshHours}시간 내 최신 데이터 · ${fmtDateTime(info.collectedAt) || "방금"} 조회`;
        button.textContent = "🔄 재조회 요청";
        button.title = "이미 최근 데이터입니다. 눌러도 다시 수집하지 않습니다.";
        button.disabled = false;
      } else if (queueState === "stale") {
        text.textContent = `${fmtAge(info.collectedAt) || "오래됨"} 조회 · ${fmtDateTime(info.collectedAt) || "시각 없음"}`;
        button.textContent = "🔄 최신 좌석 재조회 요청";
        button.title = "집 PC 수집기가 이 노선-월을 다시 조회해 좌석 데이터를 갱신합니다.";
        button.disabled = false;
      } else if (queueState === "missing") {
        text.textContent = "이 노선·월은 아직 조회 기록이 없습니다";
        button.textContent = "🔄 최신 좌석 재조회 요청";
        button.title = "집 PC 수집기가 이 노선-월을 처음 조회합니다.";
        button.disabled = false;
      } else if (queueState === "queued") {
        text.textContent = "실시간 재조회 대기 중 · 수집되면 자동으로 반영됩니다";
        button.textContent = "요청됨";
        button.disabled = true;
      } else if (queueState === "processing") {
        text.textContent = "실시간 재조회 중입니다…";
        button.textContent = "진행 중";
        button.disabled = true;
      } else if (queueState === "done") {
        text.textContent = "재조회 완료 · 새로고침하면 최신 좌석이 반영됩니다";
        button.textContent = "새로고침";
        button.disabled = false;
      } else if (queueState === "failed") {
        text.textContent = "재조회가 잠시 실패했습니다 · 잠시 후 다시 시도해 주세요";
        button.textContent = "다시 요청";
        button.disabled = false;
      } else {
        text.textContent = "오늘 재조회 요청이 많습니다 · 잠시 후 다시 시도해 주세요";
        button.textContent = "잠시 후";
        button.disabled = true;
      }
    }

    function remember(payload) {
      if (!payload || payload.ok !== true) return null;
      const saved = { status: payload.status || "unknown", item: payload.item || null,
        fresh: payload.fresh || null, queue: payload.queue || null };
      refreshMemory.set(key, saved);
      return saved;
    }

    function poll() {
      stopPolling();
      if (!refreshMemory.has(key)) return;
      tries = 0;
      timer = setInterval(async () => {
        tries += 1;
        if (tries > REFRESH.pollTries) {
          stopPolling();
          return;
        }
        try {
          const payload = await refreshGet(scope);
          if (!payload || payload.ok !== true) return;
          refreshMemory.set(key, { status: payload.status, item: payload.item,
            fresh: payload.fresh, queue: payload.queue });
          paint();
          if (!["pending", "processing"].includes(payload.status)) stopPolling();
        } catch (error) {
          /* 상태 확인 실패는 조용히 넘긴다 — 배지는 마지막 상태를 유지한다. */
        }
      }, REFRESH.pollMs);
    }

    async function ask(manual) {
      if (button.disabled && !manual) return;
      button.disabled = true;

      if (manual && refreshMemory.get(key) && refreshMemory.get(key).status === "done") {
        location.reload();
        return;
      }

      try {
        const payload = await refreshPost(scope);
        const saved = remember(payload);
        if (!saved) throw new Error("REFRESH_FAILED");
        refreshMarkAsked(key);
        paint();
        if (["queued", "deduped"].includes(saved.status)) poll();
      } catch (error) {
        refreshMemory.delete(key);
        paint();
        text.textContent = "재조회 요청을 보내지 못했습니다 · 잠시 후 다시 시도해 주세요";
      }
    }

    button.addEventListener("click", () => {
      if (refreshMemory.get(key) && refreshMemory.get(key).status === "done") {
        location.reload();
        return;
      }
      ask(true);
    });

    paint();

    if (!info.fresh) {
      const saved = refreshMemory.get(key);
      if (saved && ["queued", "deduped"].includes(saved.status)) {
        poll();
      } else if (!saved) {
        /* 세션당 1회 자동 요청 — 이미 요청한 노선-월은 조용히 상태만 확인한다. */
        if (Date.now() - refreshAskedAt(key) > REFRESH.sessionTtlMs && options.auto !== false) {
          refreshMarkAsked(key);
          ask(false);
        } else {
          refreshGet(scope).then(payload => {
            if (!payload || payload.ok !== true) return;
            refreshMemory.set(key, { status: payload.status, item: payload.item,
              fresh: payload.fresh, queue: payload.queue });
            paint();
            if (["pending", "processing"].includes(payload.status)) poll();
          }).catch(() => {});
        }
      }
    }

    return bar;
  }

  /* ------------------------------------------------------------- 공개 API */

  window.Air = {
    ROOT, DATA_ROOT, API_ROOT, FRESH_HOURS, PROGRAM, PROGRAM_LABEL,
    KE_AWARD_URL, KE_HOTPICK_URL,
    CABINS, CABIN_BY_KEY, CABIN_BY_LETTER, NAV, REGION_LABEL,
    el, fmtMiles, fmtDate, fmtMonth, fmtDateTime, fmtAge, hoursSince, todayKst,
    getManifest, loadRows, data, allData, manifestMeta, isStaleRow, safePath,
    priceOf, payableMiles, statusBadge, cabinChip, priceNode, emptyState,
    seasonBadge, milesText, hotpickBadge, hotpickNote,
    airports, routeCatalog, airportLabel, airportShort, searchText, airport,
    params, param, setParams, viewLink, onPopState,
    mountChrome, combobox, airportCombo, pageKey, renderHeaderUpdated,
    refreshBar, refreshFreshness, refreshPost, refreshGet,
    regionLabel(region) { return REGION_LABEL[region] || region; },
    /* 지금 읽고 있는 데이터 출처("d1" | "static" | null) — 점검·디버그용 */
    dataSource() { return state.source; },
    statusLabel(status) { return STATUS_LABEL[status] || status; }
  };
})();
