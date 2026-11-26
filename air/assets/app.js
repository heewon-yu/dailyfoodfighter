/* ==========================================================================
   마일지도(MILEMAP) AIR — 공통 모듈
   - 데이터: /air/data/preview/index.json 매니페스트 + 지역·월별 JSON 지연 로딩
   - 화면: 공통 헤더/푸터, 필터 상태(URL), 공항 자동완성, 공제량 표시 규칙
   - 원칙: 대한항공(KE)만, F는 보너스/승급 통합(구분 불가), G/U 제외,
           좌석 수는 제공하지 않음, NEW는 확인된 unavailable→available 전환만.
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
    "https://www.koreanair.com/contents/promotion/list/2026/26winterhotpick";

  const CABINS = [
    { key: "economy", letter: "E", name: "일반석", short: "일반", cls: "cabin-e" },
    { key: "premium", letter: "R", name: "프리미엄석", short: "프리미엄", cls: "cabin-r" },
    { key: "business", letter: "P", name: "프레스티지석", short: "프레스티지", cls: "cabin-p" },
    {
      key: "first", letter: "F", name: "일등석(보너스·승급 통합)", short: "일등",
      cls: "cabin-f", combined: true
    }
  ];

  const CABIN_BY_KEY = new Map(CABINS.map(c => [c.key, c]));
  const CABIN_BY_LETTER = new Map(CABINS.map(c => [c.letter, c]));

  /* 데이터에 남아 있을 수 있는 값 별칭. G/U(승급 전용)는 표시하지 않는다. */
  const CABIN_ALIAS = {
    e: "economy", economy: "economy", "일반석": "economy", y: "economy",
    r: "premium", premium: "premium", "프리미엄석": "premium", "프리미엄": "premium",
    p: "business", business: "business", prestige: "business",
    "프레스티지석": "business", "프레스티지": "business", j: "business", c: "business",
    f: "first", first: "first", first_combined: "first", first_award: "first",
    "일등석": "first"
  };

  const EXCLUDED_CABINS = new Set([
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
    "china": "중국",
    "southeast-asia": "동남아시아",
    "southwest-asia": "서남아시아",
    "northeast-asia": "동북아시아",
    "north-america": "북미",
    "south-america": "남미",
    "europe": "유럽",
    "oceania": "대양주·괌",
    "middle-east": "중동",
    "africa": "아프리카",
    "domestic": "국내"
  };

  const NAV = [
    { key: "search", href: "", label: "검색" },
    { key: "map", href: "map/", label: "지도" },
    { key: "calendar", href: "calendar/", label: "달력" },
    { key: "new", href: "new/", label: "신규" },
    { key: "journey", href: "journey/", label: "왕복" },
    { key: "mileage", href: "mileage/", label: "공제량" },
    { key: "guide", href: "guide/", label: "이용안내" },
    { key: "status", href: "status/", label: "갱신현황" }
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

    const combined = cabinKey === "first"
      ? raw.first_combined !== false
      : raw.first_combined === true;

    if (raw.first_combined === false && cabinKey === "first" && status === "available") stats.fConflict++;
    if (combined) stats.firstCombined++;

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
        combined,
        fConflict: raw.first_combined === false && cabinKey === "first" && status === "available",
        newlyAvailable,
        isNew,
        previousStatus,
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
   * 행의 공제량 상태.
   * kind: verified | estimate | unknown | combined(일등석 통합) | unavailable
   */
  function priceOf(row) {
    if (row.cabinKey === "first" || row.combined) {
      return { kind: "combined" };
    }

    if (row.status === "unknown") return { kind: "unknown" };

    const p = row.pricing || {};

    if (p.status === "verified" && Number.isInteger(p.standard) && p.standard > 0) {
      const discounted = Number.isInteger(p.discounted) && p.discounted > 0 &&
        p.discounted < p.standard ? p.discounted : null;
      return { kind: "verified", standard: p.standard, discounted };
    }

    if ((p.status === "standard_estimate" || p.status === "promotion_estimate") &&
        Number.isInteger(p.standard) && p.standard > 0) {
      const discounted = Number.isInteger(p.discounted) && p.discounted > 0 &&
        p.discounted < p.standard ? p.discounted : null;
      return { kind: "estimate", standard: p.standard, discounted };
    }

    return { kind: "unknown" };
  }

  function payableMiles(row) {
    const price = priceOf(row);
    if (price.kind === "verified" || price.kind === "estimate") {
      return price.discounted || price.standard;
    }
    return null;
  }

  /* --------------------------------------------------------------- 공항 */

  function airports() {
    if (state.airports) return Promise.resolve(state.airports);

    if (!state.airportPromise) {
      state.airportPromise = Promise.all([
        fetchJson(ROOT + "data/airport-coordinates.json").catch(() => ({ airports: [] })),
        fetchJson(ROOT + "data/route-catalog.json").catch(() => ({ routes: [], airports: [] }))
      ]).then(([coords, catalog]) => {
        const map = new Map();

        for (const airport of coords.airports || []) {
          map.set(airport.code, {
            code: airport.code,
            name: airport.name || airport.code,
            english: airport.english_name || "",
            municipality: airport.municipality || "",
            region: airport.region || "",
            lat: Number.isFinite(airport.latitude) ? airport.latitude : null,
            lon: Number.isFinite(airport.longitude) ? airport.longitude : null
          });
        }

        for (const airport of catalog.airports || []) {
          if (!map.has(airport.code)) {
            map.set(airport.code, {
              code: airport.code, name: airport.name || airport.code,
              english: "", municipality: "", region: airport.region || "",
              lat: null, lon: null
            });
          } else if (!map.get(airport.code).region) {
            map.get(airport.code).region = airport.region || "";
          }
        }

        state.airports = map;
        state.catalog = catalog;
        return map;
      }).catch(error => {
        state.airportPromise = null;
        throw error;
      });
    }

    return state.airportPromise;
  }

  function routeCatalog() {
    if (state.catalog && Array.isArray(state.catalog.routes)) {
      return Promise.resolve(state.catalog);
    }
    return airports().then(() => state.catalog || { routes: [], airports: [] });
  }

  function airportLabel(code) {
    const airport = state.airports && state.airports.get(code);
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
        el("a", { class: "air-logo", href: ROOT }, [
          "마일지도 ",
          el("b", { text: "MILEMAP" }),
          el("small", { text: "AIR" })
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
            el("li", null, [el("a", { href: "/contact/", text: "서비스 문의" })]),
            el("li", null, [el("a", { href: ROOT + "status/", text: "데이터 갱신 현황" })])
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

    if (price.kind === "combined") {
      return el("div", { class: "flight-card__price" }, [
        el("strong", { text: "공제량 미확인", class: "price-estimate" }),
        el("small", { text: "일등석 F · 보너스/좌석승급 통합(구분 불가)" })
      ]);
    }

    if (price.kind === "unknown") {
      return el("div", { class: "flight-card__price" }, [
        el("strong", { text: "공제량 미확인", class: "price-estimate" }),
        el("small", {
          text: row.status === "unknown"
            ? "미조회 · 공제량 계산 전"
            : "공식 공제표 검증 전"
        })
      ]);
    }

    const children = [];

    if (price.discounted) {
      children.push(el("s", { text: fmtMiles(price.standard) }));
      children.push(el("strong", { text: fmtMiles(price.discounted) }));
      children.push(el("small", {
        text: `${price.kind === "estimate" ? "추정 " : ""}할인 적용 · ` +
          `${fmtMiles(price.standard - price.discounted)} 절약`
      }));
    } else {
      children.push(el("strong", { text: fmtMiles(price.standard) }));
      children.push(el("small", {
        text: price.kind === "estimate"
          ? "추정 공제량 · 공식 검증 전"
          : "공제량 · 세금·유류할증료 별도"
      }));
    }

    return el("div", { class: "flight-card__price" }, children);
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
    airports, routeCatalog, airportLabel, airportShort, searchText,
    params, param, setParams, viewLink, onPopState,
    mountChrome, combobox, pageKey, renderHeaderUpdated,
    regionLabel(region) { return REGION_LABEL[region] || region; },
    statusLabel(status) { return STATUS_LABEL[status] || status; }
  };
})();
