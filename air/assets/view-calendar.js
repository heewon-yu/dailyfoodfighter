/* 마일지도 AIR — 월별 달력 뷰 (/air/calendar/) */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    origin: "",
    destination: "",
    cabin: "",
    month: "",
    selectedDate: "",
    rows: [],
    meta: null,
    airportList: []
  };

  function readUrl() {
    const params = Air.params();
    state.origin = (params.get("origin") || "").toUpperCase();
    state.destination = (params.get("destination") || "").toUpperCase();
    state.cabin = params.get("cabin") || "";
    state.month = params.get("month") || "";
    state.selectedDate = "";
  }

  function syncUrl() {
    Air.setParams({
      origin: state.origin,
      destination: state.destination,
      cabin: state.cabin,
      month: state.month
    });
  }

  function filteredRows() {
    return state.rows.filter(row => {
      if (state.origin && row.origin !== state.origin) return false;
      if (state.destination && row.destination !== state.destination) return false;
      if (state.cabin && row.cabinKey !== state.cabin) return false;
      return true;
    });
  }

  function availableMonths() {
    return [...new Set(state.rows.map(row => row.month))].sort();
  }

  function selectField(id, label, value, entries, onChange) {
    const select = Air.el("select", { class: "air-select", id });
    select.append(new Option("전체", ""));

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

  function controls() {
    const airportEntries = state.airportList.map(airport => ({
      value: airport.code, label: `${airport.name} (${airport.code})`
    }));

    const cabinEntries = Air.CABINS.map(cabin => ({
      value: cabin.key, label: `${cabin.letter} · ${cabin.name}`
    }));

    const swap = Air.el("button", {
      type: "button",
      class: "air-btn air-btn--ghost air-btn--sm",
      text: "⇄ 방향 바꾸기"
    });

    swap.addEventListener("click", () => {
      const origin = state.origin;
      state.origin = state.destination;
      state.destination = origin;
      render();
    });

    return Air.el("div", { class: "air-panel", style: "margin-bottom:16px" }, [
      Air.el("div", { class: "air-filters", style: "grid-template-columns:repeat(auto-fit,minmax(190px,1fr))" }, [
        selectField("air-cal-origin", "출발 공항", state.origin, airportEntries, value => { state.origin = value; }),
        selectField("air-cal-destination", "도착 공항", state.destination, airportEntries, value => { state.destination = value; }),
        selectField("air-cal-cabin", "좌석 등급", state.cabin, cabinEntries, value => { state.cabin = value; })
      ]),
      Air.el("div", { class: "air-actions" }, [swap])
    ]);
  }

  function dayState(dayRows) {
    if (!dayRows.length) return "unknown";

    if (dayRows.some(row => row.status === "available")) return "available";
    if (dayRows.every(row => row.status === "unknown")) return "unknown";
    return "unavailable";
  }

  function calendar() {
    const months = availableMonths();

    if (!state.month && months.length) state.month = months[0];
    if (state.month && !months.includes(state.month)) {
      /* 데이터가 없는 월은 미조회로 보여준다. */
    }

    const month = state.month || months[0];
    if (!month) {
      return Air.emptyState("달력으로 표시할 기록이 없습니다", "갱신현황에서 데이터 수집 상태를 확인해 주세요.");
    }

    state.month = month;

    const [year, monthNumber] = month.split("-").map(Number);
    const index = months.indexOf(month);

    const prev = Air.el("button", { type: "button", "aria-label": "이전 달", text: "‹" });
    const next = Air.el("button", { type: "button", "aria-label": "다음 달", text: "›" });

    prev.disabled = months.length <= 1;
    next.disabled = months.length <= 1;

    prev.addEventListener("click", () => {
      state.month = months[Math.max(0, index - 1)];
      state.selectedDate = "";
      render();
    });

    next.addEventListener("click", () => {
      state.month = months[Math.min(months.length - 1, index + 1)];
      state.selectedDate = "";
      render();
    });

    const head = Air.el("div", { class: "calendar-head" }, [
      Air.el("h2", { text: `${year}년 ${monthNumber}월` }),
      Air.el("div", { class: "calendar-nav" }, [
        prev,
        Air.el("strong", { text: `${months.length}개 조회 월` }),
        next
      ])
    ]);

    const grid = Air.el("div", { class: "calendar-grid", role: "grid", "aria-label": `${year}년 ${monthNumber}월 좌석 달력` });

    ["일", "월", "화", "수", "목", "금", "토"].forEach((weekday, position) => {
      grid.append(Air.el("div", {
        class: `calendar-weekday${position === 0 ? " is-sun" : position === 6 ? " is-sat" : ""}`,
        role: "columnheader",
        text: weekday
      }));
    });

    const offset = new Date(year, monthNumber - 1, 1).getDay();
    const days = new Date(year, monthNumber, 0).getDate();

    for (let i = 0; i < offset; i++) {
      grid.append(Air.el("div", { class: "calendar-day is-blank", "aria-hidden": "true" }));
    }

    const today = Air.todayKst();
    const rows = filteredRows();
    const monthRows = rows.filter(row => row.month === month);

    for (let day = 1; day <= days; day++) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const dayRows = monthRows.filter(row => row.date === date);
      const status = dayState(dayRows);

      const availableCabins = Air.CABINS.filter(cabin =>
        dayRows.some(row => row.status === "available" && row.cabinKey === cabin.key)
      );

      const hasNew = dayRows.some(row => row.isNew);
      const stale = state.meta && dayRows.length &&
        dayRows.every(row => row.status === "unavailable") &&
        dayRows.some(row => Air.isStaleRow(row, state.meta.generatedAt));

      const cell = Air.el("button", {
        type: "button",
        class: [
          "calendar-day",
          `is-${status}`,
          date === today ? "is-today" : "",
          stale ? "is-stale" : ""
        ].filter(Boolean).join(" "),
        role: "gridcell",
        "aria-pressed": String(state.selectedDate === date)
      });

      cell.append(Air.el("strong", { text: String(day) }));

      const marks = Air.el("div", { class: "calendar-day__marks" });
      for (const cabin of availableCabins) {
        marks.append(Air.el("span", {
          class: `calendar-day__mark ${cabin.cls}`,
          text: cabin.letter,
          title: `${cabin.name} 좌석 표시`
        }));
      }
      if (hasNew) {
        marks.append(Air.el("span", { class: "badge badge--new", style: "font-size:9.5px;padding:1px 4px", text: "NEW" }));
      }
      cell.append(marks);

      cell.append(Air.el("span", {
        class: "calendar-day__state",
        text: status === "available" ? `${availableCabins.length}개 등급` :
          status === "unknown" ? "미조회" :
          stale ? "없음·오래됨" : "없음"
      }));

      cell.setAttribute("aria-label",
        `${date} ${status === "available" ? availableCabins.map(cabin => cabin.name).join(", ") + " 좌석 표시" :
          status === "unknown" ? "미조회" : "좌석 표시 없음"}`);

      cell.addEventListener("click", () => {
        state.selectedDate = state.selectedDate === date ? "" : date;
        render();
      });

      grid.append(cell);
    }

    const legend = Air.el("div", { class: "calendar-legend" }, [
      legendItem("is-available", "좌석 있음"),
      legendItem("is-unavailable", "좌석 없음"),
      legendItem("is-unknown", "미조회(데이터 없음)"),
      legendItem("is-stale", "오래된 데이터"),
      ...Air.CABINS.map(cabin => Air.el("span", null, [
        Air.el("span", { class: `calendar-day__mark ${cabin.cls}`, text: cabin.letter }),
        cabin.name
      ]))
    ]);

    return Air.el("div", null, [
      head,
      grid,
      legend,
      Air.el("p", { class: "air-map-note", text:
        "색이 있는 날짜는 저장된 조회 기록이 있는 날입니다. 미조회 날짜는 좌석이 없다는 뜻이 아니며, 실제 예약 가능 여부는 대한항공 공식 조회에서 확인해야 합니다." }),
      state.selectedDate ? detail(state.selectedDate, monthRows) : null
    ]);
  }

  function legendItem(cls, label) {
    const color = cls === "is-available" ? "#bfe8cf" :
      cls === "is-unavailable" ? "#e2e8f0" :
      cls === "is-unknown" ? "#f6e3c4" : "#f3d9a4";

    return Air.el("span", null, [
      Air.el("i", { style: `background:${color}` }),
      label
    ]);
  }

  function detail(date, monthRows) {
    const rows = monthRows.filter(row => row.date === date);
    const panel = Air.el("section", { class: "air-card", style: "margin-top:16px" });

    panel.append(Air.el("h2", { style: "font-size:17px;margin-bottom:10px", text: `${Air.fmtDate(date)} 상세` }));

    if (!rows.length) {
      panel.append(Air.el("p", { class: "air-inline-note", text:
        "이 날짜는 조회 기록이 없습니다(미조회). 좌석 없음과 다릅니다." }));
      return panel;
    }

    const byRoute = new Map();

    for (const row of rows) {
      const key = `${row.origin}-${row.destination}`;
      if (!byRoute.has(key)) byRoute.set(key, []);
      byRoute.get(key).push(row);
    }

    for (const [key, entries] of byRoute) {
      const [origin, destination] = key.split("-");

      panel.append(Air.el("div", { style: "padding:10px 0;border-bottom:1px solid #eef2f7" }, [
        Air.el("div", { style: "display:flex;justify-content:space-between;gap:10px;align-items:center" }, [
          Air.el("a", {
            href: Air.ROOT + "route/?" + new URLSearchParams({
              origin, destination, month: entries[0].month
            }).toString(),
            style: "font-weight:800;color:#0f2340;text-decoration:none",
            text: `${Air.airportShort(origin)} ${origin} → ${Air.airportShort(destination)} ${destination}`
          }),
          Air.el("a", { href: Air.KE_AWARD_URL, target: "_blank", rel: "noopener noreferrer",
            style: "font-size:12px;font-weight:700", text: "공식 조회 ↗" })
        ]),
        Air.el("div", { class: "flight-card__meta", style: "margin-top:6px" },
          entries.sort((a, b) => a.cabin.letter.localeCompare(b.cabin.letter)).map(row =>
            Air.el("span", null, [
              Air.cabinChip(row.cabinKey),
              " ",
              Air.statusBadge(row, state.meta),
              " "
            ])
          )
        )
      ]));
    }

    panel.append(Air.el("p", { class: "air-inline-note", style: "margin-top:10px", text:
      "일등석 F는 보너스와 좌석승급이 통합된 표시로, 보너스 예약 확정을 의미하지 않습니다." }));

    return panel;
  }

  function render() {
    const root = $("air-calendar-view");
    root.replaceChildren();

    syncUrl();

    if (!state.rows.length) {
      root.append(Air.emptyState("달력으로 표시할 기록이 없습니다", "갱신현황에서 데이터 수집 상태를 확인해 주세요."));
      return;
    }

    root.append(controls(), calendar());
  }

  async function init() {
    Air.mountChrome();
    readUrl();

    try {
      const payload = await Air.data({});
      state.rows = payload.rows;
      state.meta = await Air.manifestMeta();
    } catch (error) {
      $("air-calendar-view").replaceChildren(Air.emptyState(
        "좌석 데이터를 불러오지 못했습니다",
        "갱신현황 화면에서 데이터 상태를 확인해 주세요."
      ));
      return;
    }

    try {
      const airports = await Air.airports();
      const codes = new Set(state.rows.flatMap(row => [row.origin, row.destination]));
      state.airportList = [...airports.values()]
        .filter(airport => codes.has(airport.code))
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } catch {
      state.airportList = [];
    }

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
