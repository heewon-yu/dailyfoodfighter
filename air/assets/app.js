/* ==========================================================================
   마일지도(MILEMAP) AIR — 공통 모듈
   - 데이터: /air/data/preview/index.json 매니페스트 + 월별 JSON 지연 로딩
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
    catalogPromise: null
  };

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function getManifest() {
    if (state.manifest) return Promise.resolve(state.manifest);

    if (!state.manifestPromise) {
      state.manifestPromise = fetchJson(DATA_ROOT + "index.json")
        .then(manifest => {
          if (manifest.mode !== "test" && manifest.mode !== "production") {
            throw new Error("INVALID_MANIFEST_MODE");
          }
          if (!Array.isArray(manifest.files) || !manifest.files.length) {
            throw new Error("INVALID_MANIFEST_FILES");
          }
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

  async function loadPart(file) {
    if (state.parts.has(file.path)) return state.parts.get(file.path);

    const promise = fetchJson(safePath(file.path)).then(part => {
      if (!Array.isArray(part.items)) throw new Error("INVALID_DATA_PART");
      return part.items;
    }).catch(error => {
      state.parts.delete(file.path);
      throw error;
    });

    state.parts.set(file.path, promise);
    return promise;
  }

  function fileMatches(file, filter) {
    if (filter.region && file.region !== filter.region) return false;
    if (filter.month && file.month !== filter.month) return false;
    return true;
  }

  /**
   * 필터(지역/월)에 해당하는 지역·월 파일만 읽어 정규화된 행을 돌려준다.
   * @returns {Promise<{rows:Array, stats:Object}>}
   */
  async function loadRows(filter = {}) {
    const manifest = await getManifest();
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
      regions: [...new Set(manifest.files.map(f => f.region))].sort(),
      months: [...new Set(manifest.files.map(f => f.month))].sort(),
      files: manifest.files,
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

    const header = el("header", { class: "air-header" }, [
      el("div", { class: "air-header__inner" }, [
        el("a", { class: "air-logo", href: ROOT, "aria-label": "마일지도 홈" }, [
          el("b", { "aria-hidden": "true", text: "✈" }),
          el("span", { text: "마일지도" })
        ]),
        el("span", { class: "air-header__scope", text: "대한항공 SKYPASS 국제선 전용" }),
        el("p", { class: "air-header__updated", id: "air-updated" }, "갱신 정보 확인 중")
      ]),
      el("nav", { class: "air-nav", "aria-label": "주요 메뉴" },
        NAV.map(item => el("a", {
          href: viewLink(item.href),
          "aria-current": item.key === key ? "page" : null,
          text: item.label
        }))
      )
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

  /* ------------------------------------------------------------- 공개 API */

  window.Air = {
    ROOT, DATA_ROOT, FRESH_HOURS, PROGRAM, PROGRAM_LABEL,
    KE_AWARD_URL, KE_HOTPICK_URL,
    CABINS, CABIN_BY_KEY, CABIN_BY_LETTER, NAV, REGION_LABEL,
    el, fmtMiles, fmtDate, fmtMonth, fmtDateTime, fmtAge, hoursSince, todayKst,
    getManifest, loadRows, data, allData, manifestMeta, isStaleRow, safePath,
    priceOf, payableMiles, statusBadge, cabinChip, priceNode, emptyState,
    seasonBadge, milesText, hotpickBadge, hotpickNote,
    airports, routeCatalog, airportLabel, airportShort, searchText, airport,
    params, param, setParams, viewLink, onPopState,
    mountChrome, combobox, airportCombo, pageKey, renderHeaderUpdated,
    regionLabel(region) { return REGION_LABEL[region] || region; },
    statusLabel(status) { return STATUS_LABEL[status] || status; }
  };
})();
