/* 마일지도 AIR — 메인 검색 뷰 (/air/) */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const PAGE_SIZE = 20;

  const state = {
    origin: "",
    destination: "",
    region: "",
    month: "",
    cabin: "",
    status: "",
    sort: "date-asc",
    page: 1,
    trip: "one",
    meta: null
  };

  let comboOrigin;
  let comboDestination;
  let airportItems = [];
  let catalogRoutes = [];

  /* ------------------------------------------------------------ 필터 UI */

  function cabinSegment() {
    const root = $("air-cabin");

    const options = [{ key: "", letter: "전체", label: "전체" }].concat(
      Air.CABINS.map(cabin => ({ key: cabin.key, letter: cabin.letter, label: cabin.short, cls: cabin.cls }))
    );

    root.replaceChildren();

    for (const option of options) {
      const button = Air.el("button", {
        type: "button",
        class: option.key ? null : "cabin-all",
        "aria-pressed": String(state.cabin === option.key),
        dataset: { cabin: option.key },
        title: option.key === "first" ? "일등석 F는 보너스와 좌석승급이 통합되어 구분할 수 없습니다." : null
      }, [
        option.cls && option.key
          ? Air.el("span", { class: "cabin-chip " + option.cls }, [
              Air.el("span", { text: option.letter }),
              Air.el("span", { text: option.label })
            ])
          : option.label
      ]);

      button.addEventListener("click", () => {
        state.cabin = option.key;
        state.page = 1;
        cabinSegment();
        commit();
      });

      root.append(button);
    }
  }

  function fillSelect(select, entries, selected, placeholder) {
    select.replaceChildren(new Option(placeholder, ""));

    for (const entry of entries) {
      select.append(new Option(entry.label, entry.value));
    }

    select.value = entries.some(entry => entry.value === selected) ? selected : "";
  }

  /* ------------------------------------------------------------- 로딩 */

  async function loadAirports() {
    const airports = await Air.airports();
    const catalog = await Air.routeCatalog();

    const routeAirports = new Set();
    for (const route of catalog.routes || []) {
      if (route.program && route.program !== Air.PROGRAM) continue;
      routeAirports.add(route.origin);
      routeAirports.add(route.destination);
    }

    airportItems = [...airports.values()]
      .filter(airport => !routeAirports.size || routeAirports.has(airport.code))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .map(airport => ({
        value: airport.code,
        label: `${airport.name} (${airport.code})`,
        code: airport.code,
        search: Air.searchText(airport),
        region: airport.region || ""
      }));

    catalogRoutes = (catalog.routes || []).filter(route =>
      !route.program || route.program === Air.PROGRAM);

    comboOrigin = Air.combobox($("air-origin-combo"), {
      value: state.origin,
      emptyLabel: "전체 출발 공항",
      onSelect: value => {
        state.origin = value;
        state.page = 1;
        refreshDestination();
        commit();
      }
    });
    comboOrigin.setItems(airportItems);

    comboDestination = Air.combobox($("air-destination-combo"), {
      value: state.destination,
      emptyLabel: "전체 목적지",
      onSelect: value => {
        state.destination = value;
        state.page = 1;
        commit();
      }
    });

    refreshDestination();
  }

  /**
   * 출발지가 정해지면 그 공항에서 출발하는 노선의 목적지만 후보로 보여준다.
   * (카탈로그는 노선 후보일 뿐이며 보너스 좌석 확인 여부와 다르다.)
   */
  function refreshDestination() {
    if (!comboDestination) return;

    if (!state.origin || !catalogRoutes.length) {
      comboDestination.setItems(airportItems);
      return;
    }

    const allowed = new Set(
      catalogRoutes.filter(route => route.origin === state.origin)
        .map(route => route.destination)
    );

    if (!allowed.size) {
      comboDestination.setItems(airportItems);
      return;
    }

    comboDestination.setItems(airportItems.filter(item => allowed.has(item.value)));

    if (state.destination && !allowed.has(state.destination)) {
      state.destination = "";
      comboDestination.setValue("");
    }
  }

  async function readMeta() {
    state.meta = await Air.manifestMeta();

    fillSelect($("air-region"),
      state.meta.regions.map(region => ({ value: region, label: Air.regionLabel(region) })),
      state.region, "전체 지역");

    fillSelect($("air-month"),
      state.meta.months.map(month => ({ value: month, label: Air.fmtMonth(month) })),
      state.month, "전체 기간");
  }

  /* ------------------------------------------------------------ 필터 적용 */

  function apply(push) {
    Air.setParams({
      origin: state.origin,
      destination: state.destination,
      region: state.region,
      month: state.month,
      cabin: state.cabin,
      status: state.status,
      sort: state.sort === "date-asc" ? "" : state.sort,
      page: state.page > 1 ? state.page : "",
      trip: state.trip === "round" ? "round" : ""
    }, push);
  }

  function commit() {
    apply(true);
    renderResults();
  }

  function readStateFromUrl() {
    const params = Air.params();

    state.origin = (params.get("origin") || "").toUpperCase();
    state.destination = (params.get("destination") || "").toUpperCase();
    state.region = params.get("region") || "";
    state.month = params.get("month") || "";
    state.cabin = params.get("cabin") || "";
    state.status = params.get("status") || "";
    state.sort = params.get("sort") || "date-asc";
    state.page = Number(params.get("page")) || 1;
    state.trip = params.get("trip") === "round" ? "round" : "one";
  }

  /* ------------------------------------------------------------ 결과 렌더 */

  function matchesStatus(row) {
    if (!state.status) return true;
    if (state.status === "new") return row.isNew;
    if (state.status === "stale") {
      return state.meta && Air.isStaleRow(row, state.meta.generatedAt);
    }
    return row.status === state.status;
  }

  function sortRows(rows) {
    const withMiles = row => Air.payableMiles(row);
    const cabinOrder = row => Air.CABINS.findIndex(cabin => cabin.key === row.cabinKey);

    const compare = {
      "date-asc": (a, b) => a.date.localeCompare(b.date) || a.destination.localeCompare(b.destination) ||
        cabinOrder(a) - cabinOrder(b),
      "date-desc": (a, b) => b.date.localeCompare(a.date) || a.destination.localeCompare(b.destination) ||
        cabinOrder(a) - cabinOrder(b),
      "miles-asc": (a, b) => {
        const x = withMiles(a);
        const y = withMiles(b);
        if (x === null && y === null) return a.date.localeCompare(b.date);
        if (x === null) return 1;
        if (y === null) return -1;
        return x - y || a.date.localeCompare(b.date);
      },
      "miles-desc": (a, b) => {
        const x = withMiles(a);
        const y = withMiles(b);
        if (x === null && y === null) return a.date.localeCompare(b.date);
        if (x === null) return 1;
        if (y === null) return -1;
        return y - x || a.date.localeCompare(b.date);
      }
    }[state.sort] || ((a, b) => a.date.localeCompare(b.date));

    return rows.slice().sort(compare);
  }

  function routeHref(row) {
    return Air.ROOT + "route/?" + new URLSearchParams({
      origin: row.origin,
      destination: row.destination,
      month: row.month
    }).toString();
  }

  function card(row) {
    const cardClass = ["flight-card"];
    if (row.status === "unknown") cardClass.push("flight-card--unknown");
    if (row.status === "unavailable") cardClass.push("flight-card--unavailable");

    const observed = Air.fmtDateTime(row.collectedAt || row.sourceUpdatedAt);

    return Air.el("article", { class: cardClass.join(" "), "aria-label":
      `${row.origin} ${row.destination} ${row.date} ${row.cabin.name} ${Air.statusLabel(row.status)}` }, [
      Air.el("div", { class: "flight-card__top" }, [
        Air.el("div", null, [
          Air.el("a", {
            class: "flight-card__route",
            href: routeHref(row),
            text: `${Air.airportShort(row.origin)} → ${Air.airportShort(row.destination)}`
          }),
          Air.el("span", { class: "flight-card__code", text: `${row.origin} → ${row.destination}` })
        ]),
        Air.el("div", { class: "flight-card__meta" }, [
          Air.statusBadge(row, state.meta),
          row.cabin.combined ? Air.el("span", { class: "badge badge--combined", text: "F 통합" }) : null
        ])
      ]),
      Air.el("div", { class: "flight-card__meta" }, [
        Air.el("span", { class: "flight-card__date", text: Air.fmtDate(row.date) }),
        Air.el("span", { text: "·" }),
        Air.el("span", { text: Air.PROGRAM_LABEL }),
        Air.cabinChip(row.cabinKey)
      ]),
      Air.el("div", { class: "flight-card__bottom" }, [
        Air.priceNode(row),
        Air.el("div", { class: "flight-card__side" }, [
          observed
            ? Air.el("span", { class: "flight-card__observed", text: `관측 ${observed}` })
            : Air.el("span", { class: "flight-card__observed", text: "관측 시각 없음" }),
          Air.el("a", {
            class: "flight-card__link",
            href: Air.KE_AWARD_URL,
            target: "_blank",
            rel: "noopener noreferrer",
            text: "공식 조회 ↗"
          })
        ])
      ])
    ]);
  }

  function renderPagination(total, page) {
    const nav = $("air-pagination");
    nav.replaceChildren();

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pages <= 1) return;

    const prev = Air.el("button", {
      class: "air-btn air-btn--ghost air-btn--sm",
      type: "button",
      text: "이전",
      disabled: page <= 1
    });

    prev.addEventListener("click", () => {
      state.page = page - 1;
      renderResults();
      apply(true);
      document.getElementById("air-results-title").scrollIntoView({ block: "start" });
    });

    const next = Air.el("button", {
      class: "air-btn air-btn--ghost air-btn--sm",
      type: "button",
      text: "다음",
      disabled: page >= pages
    });

    next.addEventListener("click", () => {
      state.page = page + 1;
      renderResults();
      apply(true);
      document.getElementById("air-results-title").scrollIntoView({ block: "start" });
    });

    nav.append(prev, Air.el("span", { text: `${page} / ${pages} 페이지` }), next);
  }

  async function renderResults() {
    const results = $("air-results");
    const summary = $("air-result-summary");

    if (state.trip === "round") {
      results.replaceChildren();
      $("air-pagination").replaceChildren();
      summary.replaceChildren();
      return;
    }

    results.replaceChildren(Air.el("div", { class: "air-loading", text: "좌석 데이터를 불러오는 중" }));

    let payload;

    try {
      payload = await Air.data({ region: state.region, month: state.month });
    } catch (error) {
      results.replaceChildren(Air.emptyState(
        "데이터를 불러오지 못했습니다",
        "잠시 후 다시 시도해 주세요. 계속되면 갱신현황 화면에서 데이터 상태를 확인해 주세요."
      ));
      summary.textContent = "";
      return;
    }

    const rows = payload.rows.filter(row => {
      if (state.origin && row.origin !== state.origin) return false;
      if (state.destination && row.destination !== state.destination) return false;
      if (state.cabin && row.cabinKey !== state.cabin) return false;
      return matchesStatus(row);
    });

    const counts = {
      total: payload.rows.length,
      available: rows.filter(row => row.status === "available").length,
      unavailable: rows.filter(row => row.status === "unavailable").length,
      unknown: rows.filter(row => row.status === "unknown").length,
      new: rows.filter(row => row.isNew).length
    };

    const sorted = sortRows(rows);
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), pages);
    const pageRows = sorted.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

    summary.replaceChildren(...[
      Air.el("span", null, [Air.el("b", { text: String(sorted.length) }), "건"]),
      Air.el("span", { text: `좌석 있음 ${counts.available}` }),
      Air.el("span", { text: `좌석 없음 ${counts.unavailable}` }),
      Air.el("span", { text: `미조회 ${counts.unknown}` }),
      counts.new ? Air.el("span", { text: `NEW ${counts.new}` }) : null
    ].filter(Boolean));

    if (!sorted.length) {
      const pairMissing = state.origin && state.destination &&
        !payload.rows.some(row => row.origin === state.origin && row.destination === state.destination);

      results.replaceChildren(Air.emptyState(
        pairMissing ? "이 노선은 아직 조회 기록이 없습니다" :
          state.status === "new" ? "확인된 신규 좌석이 없습니다" :
          state.status === "unknown" ? "미조회 기록이 없습니다" :
          state.status === "stale" ? "오래된 데이터가 없습니다" :
          "조건에 맞는 기록이 없습니다",
        pairMissing
          ? "조회 기록이 없는 상태(미조회)이며, 좌석이 없다는 뜻이 아닙니다. 다른 노선이나 지역을 선택해 주세요."
          : state.status === "unknown"
            ? "선택한 조건의 모든 날짜에 조회 기록이 있습니다. 미조회는 데이터가 없는 상태로, 좌석 없음과 다릅니다."
            : "필터를 바꾸거나 조건 초기화를 눌러 다시 검색해 주세요. 미조회 날짜는 좌석 없음과 다릅니다."
      ));
      renderPagination(0, 1);
      return;
    }

    results.replaceChildren(
      Air.el("div", { class: "air-result-grid" }, pageRows.map(card))
    );

    renderPagination(sorted.length, state.page);
  }

  /* --------------------------------------------------------- 왕복 모드 */

  async function renderJourney() {
    const panel = $("air-journey-panel");
    const searchResults = $("air-search-results");

    const round = state.trip === "round";

    panel.hidden = !round;
    searchResults.hidden = round;

    $("air-trip-one").setAttribute("aria-pressed", String(!round));
    $("air-trip-round").setAttribute("aria-pressed", String(round));

    if (!round) return;

    if (typeof Air.mountJourney !== "function") {
      panel.replaceChildren(Air.emptyState(
        "왕복 화면을 불러오지 못했습니다",
        "왕복 조합 페이지에서 다시 시도해 주세요."
      ));
      return;
    }

    Air.mountJourney(panel, {
      origin: state.origin,
      destination: state.destination,
      month: state.month,
      cabin: state.cabin,
      compact: true
    });
  }

  /* ------------------------------------------------------------- 이벤트 */

  function bind() {
    $("air-region").addEventListener("change", event => {
      state.region = event.target.value;
      state.page = 1;
      apply(true);
      renderResults();
    });

    $("air-month").addEventListener("change", event => {
      state.month = event.target.value;
      state.page = 1;
      apply(true);
      renderResults();
    });

    $("air-status").addEventListener("change", event => {
      state.status = event.target.value;
      state.page = 1;
      apply(true);
      renderResults();
    });

    $("air-sort").addEventListener("change", event => {
      state.sort = event.target.value;
      state.page = 1;
      apply(true);
      renderResults();
    });

    $("air-search-form").addEventListener("submit", event => {
      event.preventDefault();
      state.page = 1;
      apply(true);
      renderResults();
      renderJourney();
    });

    $("air-reset").addEventListener("click", () => {
      state.origin = "";
      state.destination = "";
      state.region = "";
      state.month = "";
      state.cabin = "";
      state.status = "";
      state.sort = "date-asc";
      state.page = 1;
      state.trip = "one";

      comboOrigin.setValue("");
      comboDestination.setValue("");
      $("air-region").value = "";
      $("air-month").value = "";
      $("air-status").value = "";
      $("air-sort").value = "date-asc";

      cabinSegment();
      apply(true);
      renderResults();
      renderJourney();
      $("air-share").textContent = "링크 복사";
    });

    $("air-share").addEventListener("click", async () => {
      apply(false);
      try {
        await navigator.clipboard.writeText(location.href);
        $("air-share").textContent = "복사 완료";
      } catch {
        $("air-share").textContent = "주소창에서 복사하세요";
      }
      setTimeout(() => { $("air-share").textContent = "링크 복사"; }, 2400);
    });

    $("air-trip-one").addEventListener("click", () => {
      state.trip = "one";
      state.page = 1;
      apply(true);
      renderJourney();
      renderResults();
    });

    $("air-trip-round").addEventListener("click", () => {
      state.trip = "round";
      apply(true);
      renderJourney();
    });

    Air.onPopState(() => {
      readStateFromUrl();
      syncControls();
      renderResults();
      renderJourney();
    });
  }

  function syncControls() {
    if (comboOrigin) comboOrigin.setValue(state.origin);
    if (comboDestination) comboDestination.setValue(state.destination);

    $("air-region").value = state.region;
    $("air-month").value = state.month;
    $("air-status").value = state.status;
    $("air-sort").value = state.sort;
    cabinSegment();
  }

  /* ---------------------------------------------------------------- init */

  async function init() {
    Air.mountChrome();

    readStateFromUrl();

    cabinSegment();

    try {
      await readMeta();
    } catch (error) {
      $("air-results").replaceChildren(Air.emptyState(
        "데이터 목록을 불러오지 못했습니다",
        "데이터 매니페스트(index.json)를 읽을 수 없습니다. 갱신현황 화면에서 상태를 확인해 주세요."
      ));
      bind();
      return;
    }

    if (state.region && !state.meta.regions.includes(state.region)) state.region = "";
    if (state.month && !state.meta.months.includes(state.month)) state.month = "";

    $("air-region").value = state.region;
    $("air-month").value = state.month;
    $("air-status").value = state.status;
    $("air-sort").value = state.sort;

    bind();

    try {
      await loadAirports();
      syncControls();
    } catch (error) {
      /* 공항 목록이 없어도 코드 직접 입력 없이 기존 데이터로 검색은 가능하다. */
      console.warn("AIR: airport catalog unavailable", error);
    }

    renderResults();
    renderJourney();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
