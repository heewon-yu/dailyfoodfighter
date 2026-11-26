/* 마일지도 AIR — 메인 검색 뷰 (/air/)
   - 공항 이름·도시명·IATA 코드 자동완성(유사 공항 추천)
   - 편도/왕복을 검색 폼 안에서 선택. 왕복은 가는 편·오는 편 공제량을 각각 계산해 합산.
   - 공제 마일은 대한항공 공식 공제표 + 성수기/평수기 규칙으로만 계산한다. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const PAGE_SIZE = 20;

  const state = {
    origin: "",
    destination: "",
    month: "",
    cabin: "",
    status: "",
    sort: "date-asc",
    page: 1,
    trip: "one",
    outDate: "",
    inDate: "",
    meta: null
  };

  let comboOrigin;
  let comboDestination;

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
        dataset: { cabin: option.key }
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

  function liveAirportsFromManifest(meta) {
    const codes = new Set();

    for (const route of meta && meta.collectionRoutes ? meta.collectionRoutes : []) {
      for (const code of String(route).split("-")) {
        if (/^[A-Z]{3}$/.test(code)) codes.add(code);
      }
    }

    return codes;
  }

  async function loadAirports() {
    await Air.airports();

    const live = liveAirportsFromManifest(state.meta);
    if (live.size && Air.award && Air.award.setLiveRoutes) Air.award.setLiveRoutes([...live]);

    comboOrigin = Air.airportCombo($("air-origin-combo"), {
      value: state.origin,
      placeholder: "도시·공항명·코드 (예: 인천, 도쿄, ICN)",
      onSelect: value => {
        state.origin = value;
        state.page = 1;
        commit();
      }
    });

    comboDestination = Air.airportCombo($("air-destination-combo"), {
      value: state.destination,
      placeholder: "도시·공항명·코드 (예: 도쿄, 나리타, NRT)",
      onSelect: value => {
        state.destination = value;
        state.page = 1;
        commit();
      }
    });
  }

  async function readMeta() {
    state.meta = await Air.manifestMeta();

    fillSelect($("air-month"),
      state.meta.months.map(month => ({ value: month, label: Air.fmtMonth(month) })),
      state.month, "전체 기간");
  }

  /* ------------------------------------------------------------ 필터 적용 */

  function apply(push) {
    Air.setParams({
      origin: state.origin,
      destination: state.destination,
      month: state.month,
      cabin: state.cabin,
      status: state.status,
      sort: state.sort === "date-asc" ? "" : state.sort,
      page: state.page > 1 ? state.page : "",
      trip: state.trip === "round" ? "round" : "",
      out: state.trip === "round" ? state.outDate : "",
      in: state.trip === "round" ? state.inDate : ""
    }, push);
  }

  function commit() {
    apply(true);
    renderRoundTrip();
    renderResults();
  }

  function readStateFromUrl() {
    const params = Air.params();

    state.origin = (params.get("origin") || "").toUpperCase();
    state.destination = (params.get("destination") || "").toUpperCase();
    state.month = params.get("month") || "";
    state.cabin = params.get("cabin") || "";
    state.status = params.get("status") || "";
    state.sort = params.get("sort") || "date-asc";
    state.page = Number(params.get("page")) || 1;
    state.trip = params.get("trip") === "round" ? "round" : "one";
    state.outDate = params.get("out") || "";
    state.inDate = params.get("in") || "";
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
          Air.statusBadge(row, state.meta)
        ])
      ]),
      Air.el("div", { class: "flight-card__meta" }, [
        Air.el("span", { class: "flight-card__date", text: Air.fmtDate(row.date) }),
        Air.seasonBadge(row.origin, row.date),
        Air.el("span", { text: "·" }),
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

  /** 좌석 데이터가 없는 노선을 골랐을 때: 공식 공제표 기준 마일만 정직하게 보여준다. */
  function chartPanel(origin, destination) {
    const award = Air.award;
    const record = award && award.route(origin, destination);
    const wrapper = Air.el("div", { class: "chart-hint" });

    if (!record) {
      wrapper.append(Air.el("p", { class: "air-inline-note", text:
        "대한항공 직항 노선표에 없는 조합입니다. 출발·도착 공항을 다시 선택해 주세요." }));
      return wrapper;
    }

    wrapper.append(Air.el("p", { class: "chart-hint__title" }, [
      Air.el("strong", { text: `${Air.airportShort(origin)} → ${Air.airportShort(destination)}` }),
      Air.el("span", { text: ` · 공제 구간 ${record.region}` })
    ]));

    const chart = record.miles || {};

    if (!Array.isArray(chart.E)) {
      wrapper.append(Air.el("p", { class: "air-inline-note", text:
        "이 노선(몽골)은 대한항공 공식 공제표에 구간 값이 아직 표기되어 있지 않습니다. 공식 채널에서 확인해 주세요." }));
      return wrapper;
    }

    wrapper.append(Air.el("div", { class: "chart-hint__grid" }, Air.CABINS.map(cabin => {
      const values = chart[cabin.letter];
      return Air.el("div", { class: "chart-hint__cell" }, [
        Air.el("span", { class: "air-field__label" }, [Air.cabinChip(cabin.key)]),
        Air.el("b", { text: `평수기 ${Air.milesText(values[0])}` }),
        Air.el("span", { text: `성수기 ${Air.milesText(values[1])}` })
      ]);
    })));

    wrapper.append(Air.el("p", { class: "air-inline-note", text:
      "좌석 데이터는 아직 수집되지 않아 좌석 유무는 표시할 수 없습니다. 공제 마일은 대한항공 공식 공제표 기준 편도 금액이며, 세금·유류할증료는 별도입니다." }));

    return wrapper;
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
      payload = await Air.data({ month: state.month });
    } catch (error) {
      results.replaceChildren(Air.emptyState(
        "데이터를 불러오지 못했습니다",
        "잠시 후 다시 시도해 주세요. 계속되면 갱신현황 화면에서 데이터 상태를 확인해 주세요."
      ));
      summary.textContent = "";
      return;
    }

    if (state.trip === "round") return;

    const rows = payload.rows.filter(row => {
      if (state.origin && row.origin !== state.origin) return false;
      if (state.destination && row.destination !== state.destination) return false;
      if (state.cabin && row.cabinKey !== state.cabin) return false;
      return matchesStatus(row);
    });

    const counts = {
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

      const box = Air.el("div", { class: "air-stack" });

      box.append(Air.emptyState(
        pairMissing ? "이 노선의 좌석 데이터는 아직 수집되지 않았습니다" :
          state.status === "new" ? "확인된 신규 좌석이 없습니다" :
          state.status === "unknown" ? "미조회 기록이 없습니다" :
          state.status === "stale" ? "오래된 데이터가 없습니다" :
          "조건에 맞는 기록이 없습니다",
        pairMissing
          ? "좌석 유무는 데이터가 수집된 뒤 표시됩니다. 좌석이 없다는 뜻이 아니며, 공제 마일은 아래 공식 공제표로 확인할 수 있습니다."
          : state.status === "unknown"
            ? "선택한 조건의 모든 날짜에 조회 기록이 있습니다. 미조회는 데이터가 없는 상태로, 좌석 없음과 다릅니다."
            : "필터를 바꾸거나 조건 초기화를 눌러 다시 검색해 주세요. 미조회 날짜는 좌석 없음과 다릅니다."
      ));

      if (pairMissing) box.append(chartPanel(state.origin, state.destination));

      results.replaceChildren(box);
      renderPagination(0, 1);
      return;
    }

    results.replaceChildren(
      Air.el("div", { class: "air-result-grid" }, pageRows.map(card))
    );

    renderPagination(sorted.length, state.page);
  }

  /* --------------------------------------------------------- 왕복 모드 */

  function isoAddDays(iso, days) {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function defaultDates() {
    const today = Air.todayKst();
    if (!state.outDate) state.outDate = isoAddDays(today, 30);
    if (!state.inDate) state.inDate = isoAddDays(today, 34);

    if (state.inDate < state.outDate) state.inDate = state.outDate;
  }

  function legBlock(direction, rows) {
    const isOut = direction === "out";
    const origin = isOut ? state.origin : state.destination;
    const destination = isOut ? state.destination : state.origin;
    const date = isOut ? state.outDate : state.inDate;

    const wrapper = Air.el("div", { class: "round-leg" });

    if (!Air.award) {
      wrapper.append(Air.el("p", { class: "air-inline-note", text: "공제표 모듈을 불러오지 못했습니다." }));
      return wrapper;
    }

    const cabinKey = state.cabin || "economy";
    const price = Air.award.miles(origin, destination, date, cabinKey);
    const head = Air.el("div", { class: "round-leg__head" }, [
      Air.el("h3", { text: isOut ? "가는 편" : "오는 편" }),
      Air.el("span", { class: "flight-card__code", text: `${origin} → ${destination}` })
    ]);

    wrapper.append(head);

    wrapper.append(Air.el("div", { class: "round-leg__date" }, [
      Air.el("span", { class: "air-field__label", text: isOut ? "가는 날" : "오는 날" }),
      Air.el("strong", { text: date ? Air.fmtDate(date) : "날짜 미선택" })
    ]));

    if (!price || price.state !== "ok") {
      wrapper.append(Air.el("p", { class: "air-inline-note", text:
        "이 노선은 대한항공 공식 공제표에 구간 값이 아직 표기되어 있지 않습니다." }));
      return wrapper;
    }

    const rowsForLeg = rows.filter(row =>
      row.origin === origin && row.destination === destination &&
      row.date === date && row.cabinKey === cabinKey
    );

    const statusRow = rowsForLeg[0];

    wrapper.append(Air.el("div", { class: "round-leg__price" }, [
      Air.el("strong", { text: Air.milesText(price.miles) }),
      Air.el("span", { class: "round-leg__season" }, [
        Air.seasonBadge(origin, date),
        Air.el("small", { text: `${cabinKey === "economy" ? "일반석" : cabinKey === "business" ? "프레스티지석" : "일등석"} · ${price.season.peak ? "성수기" : "평수기"} 공제` })
      ])
    ]));

    if (statusRow) {
      wrapper.append(Air.el("div", { class: "round-leg__seat" }, [
        Air.el("span", { class: "air-field__label", text: "좌석" }),
        Air.statusBadge(statusRow, state.meta)
      ]));
    } else {
      const hasRoute = rows.some(row => row.origin === origin && row.destination === destination);

      wrapper.append(Air.el("div", { class: "round-leg__seat" }, [
        Air.el("span", { class: "air-field__label", text: "좌석" }),
        Air.el("span", { class: "badge badge--idle", text: hasRoute ? "이 날짜 미조회" : "귀국편 미수집" }),
        Air.el("small", { class: "air-inline-note", text: hasRoute
          ? "선택한 날짜의 좌석 기록이 없습니다. 좌석 없음과 다릅니다."
          : "이 방향 좌석 데이터는 아직 수집되지 않았습니다. 공제 마일은 공식 공제표 기준입니다." })
      ]));
    }

    return wrapper;
  }

  async function renderRoundTrip() {
    const panel = $("air-journey-panel");
    const searchResults = $("air-search-results");
    const roundFields = $("air-round-fields");
    const monthField = $("air-month-field");

    const round = state.trip === "round";

    panel.hidden = !round;
    searchResults.hidden = round;
    roundFields.hidden = !round;
    if (monthField) monthField.hidden = round;
    $("air-search-form").classList.toggle("is-round", round);

    $("air-trip-one").setAttribute("aria-pressed", String(!round));
    $("air-trip-round").setAttribute("aria-pressed", String(round));

    $("air-out-date").value = state.outDate;
    $("air-in-date").value = state.inDate;

    if (!round) return;

    if (state.origin && state.destination && state.origin !== state.destination) defaultDates();

    $("air-out-date").value = state.outDate;
    $("air-in-date").value = state.inDate;
    $("air-in-date").min = state.outDate || "";

    panel.replaceChildren(Air.el("div", { class: "air-loading", text: "왕복 공제량을 계산하는 중" }));

    let rows = [];

    try {
      const payload = await Air.data({});
      rows = payload.rows;
    } catch {
      rows = [];
    }

    if (state.trip !== "round") return;

    if (!state.origin || !state.destination) {
      panel.replaceChildren(Air.emptyState(
        "출발·도착 공항을 먼저 선택해 주세요",
        "위 검색창에서 출발 공항과 도착 공항을 입력하면 가는 편·오는 편 공제량과 왕복 합계를 계산합니다."
      ));
      return;
    }

    if (state.origin === state.destination) {
      panel.replaceChildren(Air.emptyState("출발지와 목적지가 같습니다", "서로 다른 공항을 선택해 주세요."));
      return;
    }

    const cabinKey = state.cabin || "economy";
    const outPrice = Air.award.miles(state.origin, state.destination, state.outDate, cabinKey);
    const inPrice = Air.award.miles(state.destination, state.origin, state.inDate, cabinKey);

    const wrapper = Air.el("div", { class: "round-panel" });

    const record = Air.award.route(state.origin, state.destination);

    wrapper.append(Air.el("div", { class: "round-panel__head" }, [
      Air.el("h2", { text: `${Air.airportShort(state.origin)} → ${Air.airportShort(state.destination)} 왕복` }),
      Air.el("p", { class: "air-inline-note", text:
        `${state.origin} ↔ ${state.destination}${record ? ` · 공제 구간 ${record.region}` : ""} · ${Air.PROGRAM_LABEL}` }),
      Air.el("p", { class: "air-inline-note", text:
        `좌석 등급은 위 검색 폼의 선택을 따릅니다(선택이 없으면 일반석). 현재 ${cabinKey === "economy" ? "일반석" : cabinKey === "business" ? "프레스티지석" : "일등석"} 기준입니다.` })
    ]));

    wrapper.append(Air.el("div", { class: "round-legs" }, [
      legBlock("out", rows),
      legBlock("in", rows)
    ]));

    if (outPrice && outPrice.state === "ok" && inPrice && inPrice.state === "ok") {
      const total = outPrice.miles + inPrice.miles;

      const totalBox = Air.el("div", { class: "round-total" }, [
        Air.el("div", { class: "round-total__label", text: "왕복 공제 마일" }),
        Air.el("div", { class: "round-total__value", text: Air.milesText(total) }),
        Air.el("div", { class: "round-total__break" }, [
          Air.el("span", { text: `가는 편 ${Air.fmtDate(state.outDate)} ${outPrice.season.label} ${Air.milesText(outPrice.miles)}` }),
          Air.el("span", { text: `+ 오는 편 ${Air.fmtDate(state.inDate)} ${inPrice.season.label} ${Air.milesText(inPrice.miles)}` })
        ]),
        Air.el("p", { class: "round-total__note", text:
          "가는 날·오는 날 각각의 성수기/평수기 공제 마일을 더한 값입니다. 세금·유류할증료는 별도이며, 좌석 확보를 보장하지 않습니다." })
      ]);

      wrapper.append(totalBox);
    } else {
      wrapper.append(Air.el("div", { class: "round-total" }, [
        Air.el("div", { class: "round-total__label", text: "왕복 공제 마일" }),
        Air.el("div", { class: "round-total__value", text: "공제 구간 확인 중" })
      ]));
    }

    const upcoming = Air.award.upcomingPeak(state.origin, Air.todayKst(), 3);

    if (upcoming.length) {
      wrapper.append(Air.el("div", { class: "round-note" }, [
        Air.el("p", { class: "air-field__label", text: "다가오는 성수기 (대한민국 출발 기준)" }),
        Air.el("p", { class: "air-inline-note", text: upcoming.map(range =>
          `${Air.fmtDate(range.start)} ~ ${Air.fmtDate(range.end)}`).join(" · ") }),
        Air.el("p", { class: "air-inline-note", text:
          "성수기에는 같은 좌석도 공제 마일이 더 듭니다. 날짜를 옮겨 평수기로 계산해 보세요." })
      ]));
    }

    panel.replaceChildren(wrapper);

    if (outPrice && outPrice.state === "ok" && inPrice && inPrice.state === "ok") {
      apply(false);
    }
  }

  /* ------------------------------------------------------------- 이벤트 */

  function bind() {
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
      renderRoundTrip();
    });

    $("air-reset").addEventListener("click", () => {
      state.origin = "";
      state.destination = "";
      state.month = "";
      state.cabin = "";
      state.status = "";
      state.sort = "date-asc";
      state.page = 1;
      state.trip = "one";
      state.outDate = "";
      state.inDate = "";

      comboOrigin.setValue("");
      comboDestination.setValue("");
      $("air-month").value = "";
      $("air-status").value = "";
      $("air-sort").value = "date-asc";
      $("air-out-date").value = "";
      $("air-in-date").value = "";

      cabinSegment();
      apply(true);
      renderResults();
      renderRoundTrip();
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
      renderRoundTrip();
      renderResults();
    });

    $("air-trip-round").addEventListener("click", () => {
      state.trip = "round";
      apply(true);
      renderRoundTrip();
    });

    $("air-out-date").addEventListener("change", event => {
      state.outDate = event.target.value;
      if (state.inDate && state.inDate < state.outDate) state.inDate = state.outDate;
      apply(true);
      renderRoundTrip();
    });

    $("air-in-date").addEventListener("change", event => {
      state.inDate = event.target.value;
      apply(true);
      renderRoundTrip();
    });

    Air.onPopState(() => {
      readStateFromUrl();
      syncControls();
      renderResults();
      renderRoundTrip();
    });
  }

  function syncControls() {
    if (comboOrigin) comboOrigin.setValue(state.origin);
    if (comboDestination) comboDestination.setValue(state.destination);

    $("air-month").value = state.month;
    $("air-status").value = state.status;
    $("air-sort").value = state.sort;
    $("air-out-date").value = state.outDate;
    $("air-in-date").value = state.inDate;
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

    if (state.month && !state.meta.months.includes(state.month)) state.month = "";

    $("air-month").value = state.month;
    $("air-status").value = state.status;
    $("air-sort").value = state.sort;

    bind();

    try {
      await loadAirports();
      syncControls();
    } catch (error) {
      console.warn("AIR: airport catalog unavailable", error);
    }

    renderResults();
    renderRoundTrip();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
