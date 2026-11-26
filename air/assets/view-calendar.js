/* 마일지도 AIR — 월별 달력 뷰 (/air/calendar/)
   날짜 칸에 좌석 표식(E·P·F)과 성수기 여부를 함께 보여준다.
   공제 마일은 대한항공 공식 공제표 + 성수기 규칙으로 계산한다. */
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
    mounted: false
  };

  let comboOrigin;
  let comboDestination;
  let slot;

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

  function controls() {
    const cabinEntries = Air.CABINS.map(cabin => ({
      value: cabin.key, label: `${cabin.letter} · ${cabin.name}`
    }));

    const cabinSelect = Air.el("select", { class: "air-select", id: "air-cal-cabin" });
    cabinSelect.append(new Option("전체 등급", ""));
    for (const entry of cabinEntries) cabinSelect.append(new Option(entry.label, entry.value));
    cabinSelect.value = state.cabin;
    cabinSelect.addEventListener("change", () => {
      state.cabin = cabinSelect.value;
      render();
    });

    const swap = Air.el("button", {
      type: "button",
      class: "air-btn air-btn--ghost air-btn--sm",
      text: "⇄ 방향 바꾸기"
    });

    swap.addEventListener("click", () => {
      const origin = state.origin;
      state.origin = state.destination;
      state.destination = origin;
      comboOrigin.setValue(state.origin);
      comboDestination.setValue(state.destination);
      state.selectedDate = "";
      render();
    });

    return Air.el("div", { class: "air-panel", style: "margin-bottom:16px" }, [
      Air.el("div", { class: "air-filters", style: "grid-template-columns:repeat(auto-fit,minmax(190px,1fr))" }, [
        Air.el("div", { class: "air-field" }, [
          Air.el("label", { for: "air-cal-origin-input", text: "출발 공항" }),
          Air.el("div", { class: "air-combo", id: "air-cal-origin-combo" }, [
            Air.el("input", {
              class: "air-input air-combo__input", id: "air-cal-origin-input", type: "search",
              placeholder: "도시·공항명·코드", autocomplete: "off", spellcheck: "false"
            })
          ])
        ]),
        Air.el("div", { class: "air-field" }, [
          Air.el("label", { for: "air-cal-destination-input", text: "도착 공항" }),
          Air.el("div", { class: "air-combo", id: "air-cal-destination-combo" }, [
            Air.el("input", {
              class: "air-input air-combo__input", id: "air-cal-destination-input", type: "search",
              placeholder: "도시·공항명·코드", autocomplete: "off", spellcheck: "false"
            })
          ])
        ]),
        Air.el("div", { class: "air-field" }, [
          Air.el("label", { for: "air-cal-cabin", text: "좌석 등급" }),
          cabinSelect
        ])
      ]),
      Air.el("div", { class: "air-actions" }, [swap])
    ]);
  }

  function mountControls() {
    const root = $("air-calendar-view");

    root.append(controls());

    comboOrigin = Air.airportCombo($("air-cal-origin-combo"), {
      value: state.origin,
      placeholder: "도시·공항명·코드",
      onSelect: value => {
        state.origin = value;
        state.selectedDate = "";
        render();
      }
    });

    comboDestination = Air.airportCombo($("air-cal-destination-combo"), {
      value: state.destination,
      placeholder: "도시·공항명·코드",
      onSelect: value => {
        state.destination = value;
        state.selectedDate = "";
        render();
      }
    });

    slot = Air.el("div", { id: "air-calendar-slot" });
    root.append(slot);
    state.mounted = true;
  }

  function dayState(dayRows) {
    if (!dayRows.length) return "unknown";
    if (dayRows.some(row => row.status === "available")) return "available";
    if (dayRows.every(row => row.status === "unknown")) return "unknown";
    return "unavailable";
  }

  function calendar() {
    const months = availableMonths();
    const month = state.month || months[0];

    if (!month) {
      return Air.emptyState("달력으로 표시할 기록이 없습니다", "갱신현황에서 데이터 수집 상태를 확인해 주세요.");
    }

    state.month = month;

    const [year, monthNumber] = month.split("-").map(Number);
    const index = months.indexOf(month);

    const prev = Air.el("button", { type: "button", "aria-label": "이전 달", text: "‹" });
    const next = Air.el("button", { type: "button", "aria-label": "다음 달", text: "›" });

    prev.disabled = index <= 0;
    next.disabled = index >= months.length - 1 || index < 0;

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
    const seasonOrigin = state.origin || "ICN";
    const firstDate = [...new Set(monthRows.map(row => row.date))].sort()[0] || "";
    const detailDate = state.selectedDate || firstDate;

    for (let day = 1; day <= days; day++) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const dayRows = monthRows.filter(row => row.date === date);
      const status = dayState(dayRows);
      const season = Air.award ? Air.award.seasonOf(date, seasonOrigin) : { peak: false, label: "" };

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
          season.peak ? "is-peak" : "",
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

      if (season.peak) cell.append(Air.el("span", { class: "calendar-day__peak", text: "성수기" }));

      cell.setAttribute("aria-label",
        `${date} ${season.peak ? "성수기 " : "평수기 "}${status === "available" ? availableCabins.map(cabin => cabin.name).join(", ") + " 좌석 표시" :
          status === "unknown" ? "미조회" : "좌석 표시 없음"}`);

      cell.addEventListener("click", () => {
        state.selectedDate = state.selectedDate === date ? "" : date;
        renderCalendarOnly();
      });

      grid.append(cell);
    }

    const legend = Air.el("div", { class: "calendar-legend" }, [
      legendItem("is-available", "좌석 있음"),
      legendItem("is-unavailable", "좌석 없음"),
      legendItem("is-unknown", "미조회(데이터 없음)"),
      legendItem("is-peak", "성수기 기간"),
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
        "색이 있는 날짜는 저장된 조회 기록이 있는 날입니다. 미조회 날짜는 좌석이 없다는 뜻이 아니며, 실제 예약 가능 여부는 대한항공 공식 조회에서 확인해야 합니다. 성수기 표시는 대한민국 출발 기준 공식 성수기 기간입니다." }),
      state.selectedDate ? detail(state.selectedDate, monthRows) :
        (detailDate ? detail(detailDate, monthRows) : null)
    ]);
  }

  function legendItem(cls, label) {
    const color = cls === "is-available" ? "#bfe8cf" :
      cls === "is-unavailable" ? "#e2e8f0" :
      cls === "is-peak" ? "#fbdcaa" : "#f6e3c4";

    return Air.el("span", null, [
      Air.el("i", { style: `background:${color}` }),
      label
    ]);
  }

  function detail(date, monthRows) {
    const rows = monthRows.filter(row => row.date === date);
    const panel = Air.el("section", { class: "air-card", style: "margin-top:16px" });
    const season = Air.award ? Air.award.seasonOf(date, state.origin || "ICN") : null;

    panel.append(Air.el("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px" }, [
      Air.el("h2", { style: "font-size:17px;margin:0", text: `${Air.fmtDate(date)} 상세` }),
      season ? Air.seasonBadge(state.origin || "ICN", date) : null
    ]));

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

      const routeBox = Air.el("div", { style: "padding:10px 0;border-bottom:1px solid #eef2f7" }, [
        Air.el("div", { style: "display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap" }, [
          Air.el("a", {
            href: Air.ROOT + "route/?" + new URLSearchParams({
              origin, destination, month: entries[0].month
            }).toString(),
            style: "font-weight:800;color:#0f2340;text-decoration:none",
            text: `${Air.airportShort(origin)} ${origin} → ${Air.airportShort(destination)} ${destination}`
          }),
          Air.el("a", { href: Air.KE_AWARD_URL, target: "_blank", rel: "noopener noreferrer",
            style: "font-size:12px;font-weight:700", text: "공식 조회 ↗" })
        ])
      ]);

      for (const row of entries.slice().sort((a, b) => a.cabin.letter.localeCompare(b.cabin.letter))) {
        const price = Air.priceOf(row);
        routeBox.append(Air.el("div", { class: "calendar-detail-row" }, [
          Air.cabinChip(row.cabinKey),
          Air.statusBadge(row, state.meta),
          Air.el("span", { class: "calendar-detail-row__miles", text:
            price.kind === "official"
              ? `${price.season.label} ${Air.milesText(price.miles)}`
              : "공제 구간 확인 중" })
        ]));
      }

      panel.append(routeBox);
    }

    panel.append(Air.el("p", { class: "air-inline-note", style: "margin-top:10px", text:
      "공제 마일은 대한항공 공식 공제표의 편도 기준이며, 세금·유류할증료는 별도입니다." }));

    return panel;
  }

  function renderCalendarOnly() {
    if (!slot) return;
    const y = window.scrollY;
    slot.replaceChildren(calendar());
    syncUrl();
    window.scrollTo({ top: y });
  }

  function render() {
    if (!state.mounted) mountControls();
    renderCalendarOnly();
  }

  async function init() {
    Air.mountChrome();
    readUrl();

    try {
      const payload = await Air.data({});
      state.rows = payload.rows;
      state.meta = await Air.manifestMeta();

      const live = new Set();
      for (const route of state.meta.collectionRoutes || []) {
        for (const code of String(route).split("-")) {
          if (/^[A-Z]{3}$/.test(code)) live.add(code);
        }
      }
      if (live.size && Air.award && Air.award.setLiveRoutes) Air.award.setLiveRoutes([...live]);
    } catch (error) {
      $("air-calendar-view").replaceChildren(Air.emptyState(
        "좌석 데이터를 불러오지 못했습니다",
        "갱신현황 화면에서 데이터 상태를 확인해 주세요."
      ));
      return;
    }

    try {
      await Air.airports();
    } catch {
      /* 공항 사전이 없어도 기존 조건으로 달력은 그린다. */
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
