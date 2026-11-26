/* 마일지도 AIR — 노선 상세 뷰 (/air/route/) */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    origin: "",
    destination: "",
    month: "",
    rows: [],
    meta: null,
    airportList: []
  };

  function readUrl() {
    const params = Air.params();
    state.origin = (params.get("origin") || "").toUpperCase();
    state.destination = (params.get("destination") || "").toUpperCase();
    state.month = params.get("month") || "";
  }

  function syncUrl(push) {
    Air.setParams({
      origin: state.origin,
      destination: state.destination,
      month: state.month
    }, push);
  }

  function routeRows() {
    return state.rows.filter(row =>
      row.origin === state.origin && row.destination === state.destination
    );
  }

  function selectField(id, label, value, entries, onChange) {
    const select = Air.el("select", { class: "air-select", id });
    select.append(new Option("선택", ""));

    for (const entry of entries) {
      select.append(new Option(entry.label, entry.value));
    }

    select.value = value;
    select.addEventListener("change", () => {
      onChange(select.value);
      render();
    });

    return Air.el("div", { class: "air-field" }, [
      Air.el("label", { for: id, text: label }),
      select
    ]);
  }

  function controls(months) {
    const airportEntries = state.airportList.map(airport => ({
      value: airport.code, label: `${airport.name} (${airport.code})`
    }));

    const swap = Air.el("button", {
      type: "button", class: "air-btn air-btn--ghost air-btn--sm", text: "⇄ 방향 바꾸기"
    });

    swap.addEventListener("click", () => {
      const origin = state.origin;
      state.origin = state.destination;
      state.destination = origin;
      state.month = "";
      render();
    });

    return Air.el("div", { class: "air-panel", style: "margin-bottom:16px" }, [
      Air.el("div", { class: "air-filters", style: "grid-template-columns:repeat(auto-fit,minmax(190px,1fr))" }, [
        selectField("air-route-origin", "출발 공항", state.origin, airportEntries, value => { state.origin = value; state.month = ""; }),
        selectField("air-route-destination", "도착 공항", state.destination, airportEntries, value => { state.destination = value; state.month = ""; }),
        selectField("air-route-month", "탑승월", state.month,
          months.map(month => ({ value: month, label: Air.fmtMonth(month) })),
          value => { state.month = value; })
      ]),
      Air.el("div", { class: "air-actions" }, [swap])
    ]);
  }

  function cell(row) {
    if (!row) {
      return Air.el("td", {
        class: "cell-muted",
        style: "font-size:12px",
        title: "이 날짜에 해당 등급 조회 기록이 없습니다(미조회).",
        text: "기록 없음"
      });
    }

    const price = Air.priceOf(row);
    const miles = Air.payableMiles(row);

    const children = [Air.statusBadge(row, state.meta)];

    if (price.kind === "combined") {
      children.push(Air.el("div", { class: "air-inline-note", text: "통합(구분 불가)" }));
    } else if (miles) {
      children.push(Air.el("div", {
        class: "num",
        style: "font-size:12px;margin-top:3px;color:#43526b",
        text: (price.kind === "estimate" ? "추정 " : "") + Air.fmtMiles(miles)
      }));
    } else {
      children.push(Air.el("div", { class: "air-inline-note", text: "공제량 미확인" }));
    }

    return Air.el("td", null, children);
  }

  function table(rows, month) {
    const dates = [...new Set(rows.filter(row => !month || row.month === month).map(row => row.date))].sort();

    if (!dates.length) return null;

    const head = Air.el("thead", null, [
      Air.el("tr", null, [
        Air.el("th", { scope: "col", text: "날짜" }),
        ...Air.CABINS.map(cabin =>
          Air.el("th", { scope: "col" }, [
            Air.el("span", { class: "cabin-chip " + cabin.cls }, [
              Air.el("span", { text: cabin.letter }),
              Air.el("span", { text: cabin.short })
            ])
          ])
        )
      ])
    ]);

    const body = Air.el("tbody");

    for (const date of dates) {
      const row = Air.el("tr", null, [
        Air.el("th", { scope: "row", class: "num", style: "font-weight:700", text: Air.fmtDate(date) })
      ]);

      for (const cabin of Air.CABINS) {
        const match = rows.find(item => item.date === date && item.cabinKey === cabin.key);
        row.append(cell(match));
      }

      body.append(row);
    }

    return Air.el("div", { class: "air-table-wrap" }, [
      Air.el("table", { class: "air-table" }, [head, body])
    ]);
  }

  function tiles(rows) {
    const dates = new Set(rows.map(row => row.date));
    const availableDays = new Set(rows.filter(row => row.status === "available").map(row => row.date));
    const unknownDays = new Set(rows.filter(row => row.status === "unknown").map(row => row.date));

    return Air.el("div", { class: "air-tiles", style: "margin-bottom:16px" }, [
      Air.el("div", { class: "air-tile" }, [
        Air.el("div", { class: "air-tile__label", text: "조회된 날짜" }),
        Air.el("div", { class: "air-tile__value", text: String(dates.size) }),
        Air.el("div", { class: "air-tile__sub", text: "좌석 상태가 기록된 날짜" })
      ]),
      Air.el("div", { class: "air-tile" }, [
        Air.el("div", { class: "air-tile__label", text: "좌석 표시 있는 날" }),
        Air.el("div", { class: "air-tile__value", text: String(availableDays.size) }),
        Air.el("div", { class: "air-tile__sub", text: "E·R·P·F 중 하나 이상" })
      ]),
      Air.el("div", { class: "air-tile" }, [
        Air.el("div", { class: "air-tile__label", text: "미조회 날짜" }),
        Air.el("div", { class: "air-tile__value", text: String(unknownDays.size) }),
        Air.el("div", { class: "air-tile__sub", text: "데이터 없음 · 좌석 없음과 다름" })
      ])
    ]);
  }

  function render() {
    const root = $("air-route-view");
    root.replaceChildren();

    syncUrl();

    const months = [...new Set(routeRows().map(row => row.month))].sort();

    if (state.month && !months.includes(state.month)) state.month = "";
    if (!state.month && months.length) state.month = months[0];

    root.append(controls(months));

    if (!state.origin || !state.destination) {
      root.append(Air.emptyState(
        "노선을 선택해 주세요",
        "출발 공항과 도착 공항을 선택하면 날짜별 E·R·P·F 좌석 상태를 볼 수 있습니다."
      ));
      return;
    }

    if (state.origin === state.destination) {
      root.append(Air.emptyState("출발지와 목적지가 같습니다", "서로 다른 공항을 선택해 주세요."));
      return;
    }

    const rows = routeRows();

    const head = Air.el("div", { class: "air-card", style: "margin-bottom:16px" }, [
      Air.el("div", { style: "display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:flex-start" }, [
        Air.el("div", null, [
          Air.el("p", { class: "air-inline-note", text: "노선 상세 · 대한항공 SKYPASS 국제선" }),
          Air.el("h2", { style: "font-size:22px;margin:4px 0 6px", text:
            `${Air.airportShort(state.origin)} ${state.origin} → ${Air.airportShort(state.destination)} ${state.destination}` }),
          Air.el("p", { class: "air-inline-note", text:
            `방향: ${state.origin} → ${state.destination} · 탑승월 ${state.month ? Air.fmtMonth(state.month) : "전체"}` })
        ]),
        Air.el("div", { style: "display:flex;flex-direction:column;gap:6px;align-items:flex-end" }, [
          Air.el("a", {
            class: "air-btn air-btn--sm",
            href: Air.KE_AWARD_URL,
            target: "_blank",
            rel: "noopener noreferrer",
            text: "대한항공 공식 조회 ↗"
          }),
          state.meta && state.meta.generatedLabel
            ? Air.el("span", { class: "air-inline-note", text: `데이터 생성 ${state.meta.generatedLabel}` })
            : null
        ])
      ])
    ]);

    root.append(head);

    if (!rows.length) {
      root.append(Air.emptyState(
        "이 노선은 아직 조회 기록이 없습니다",
        "노선 후보에 있더라도 보너스 좌석 조회 기록이 없으면 미조회로 표시합니다. 좌석이 없다는 뜻이 아닙니다."
      ));
      return;
    }

    root.append(tiles(rows));

    const monthRows = state.month ? rows.filter(row => row.month === state.month) : rows;

    if (!monthRows.length) {
      root.append(Air.emptyState(
        `${Air.fmtMonth(state.month)} 조회 기록이 없습니다`,
        "다른 탑승월을 선택해 주세요. 조회되지 않은 월은 좌석 없음과 다릅니다."
      ));
      return;
    }

    root.append(table(monthRows, state.month));

    root.append(Air.el("p", { class: "air-map-note", text:
      "· 좌석 수는 제공하지 않습니다(항공사가 공개하지 않음). · 일등석 F는 보너스/좌석승급 통합 표시이며 보너스 확정이 아닙니다. " +
      "· 승급 전용 좌석(G·U)은 표시·합산에서 제외합니다. · 공제량은 검증된 공식 표가 있을 때만 표시합니다." }));
  }

  async function init() {
    Air.mountChrome();
    readUrl();

    try {
      const payload = await Air.data({});
      state.rows = payload.rows;
      state.meta = await Air.manifestMeta();
    } catch (error) {
      $("air-route-view").replaceChildren(Air.emptyState(
        "좌석 데이터를 불러오지 못했습니다",
        "갱신현황 화면에서 데이터 상태를 확인해 주세요."
      ));
      return;
    }

    try {
      const airports = await Air.airports();
      const codes = new Set(state.rows.flatMap(row => [row.origin, row.destination]));
      state.airportList = [...airports.values()]
        .filter(airport => codes.has(airport.code) || airport.code === state.origin || airport.code === state.destination)
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } catch {
      state.airportList = [];
    }

    if (!state.origin || !state.destination) {
      const first = state.rows[0];
      if (first) {
        state.origin = first.origin;
        state.destination = first.destination;
      }
    }

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
