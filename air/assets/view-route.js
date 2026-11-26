/* 마일지도 AIR — 노선 상세 뷰 (/air/route/)
   출발·도착(자동완성)과 탑승월을 골라 날짜별 E·P·F 좌석 상태와
   공식 공제표 기준 성수기·평수기 공제 마일을 표로 보여준다. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    origin: "",
    destination: "",
    month: "",
    rows: [],
    meta: null,
    mounted: false
  };

  let comboOrigin;
  let comboDestination;
  let selectMonth;
  let slot;

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

  /* ---------------------------------------------------------- 공제표 요약 */

  const CABIN_LABEL = { economy: "일반석", business: "프레스티지석", first: "일등석" };

  function chartSummary() {
    const award = Air.award;
    if (!award) return null;

    const record = award.route(state.origin, state.destination);
    if (!record) {
      return Air.el("div", { class: "air-card" }, [
        Air.el("p", { class: "air-inline-note", text:
          "대한항공 직항 노선표에 없는 조합입니다. 출발·도착 공항을 다시 선택해 주세요." })
      ]);
    }

    const card = Air.el("div", { class: "air-card air-chart-card" });

    card.append(Air.el("div", { class: "air-results-head", style: "margin-bottom:10px" }, [
      Air.el("h2", { style: "font-size:16px", text: "공식 공제표 기준 마일" }),
      Air.el("span", { class: "air-count", text: `공제 구간 ${record.region}` })
    ]));

    const chart = record.miles || {};
    const table = Air.el("table", { class: "air-table air-table--compact" }, [
      Air.el("thead", null, [
        Air.el("tr", null, [
          Air.el("th", { scope: "col", text: "등급" }),
          Air.el("th", { scope: "col", text: "평수기 편도" }),
          Air.el("th", { scope: "col", text: "성수기 편도" }),
          Air.el("th", { scope: "col", text: "평수기 왕복" }),
          Air.el("th", { scope: "col", text: "성수기 왕복" })
        ])
      ]),
      Air.el("tbody", null, Air.CABINS.map(cabin => {
        const values = chart[cabin.letter];

        return Air.el("tr", null, [
          Air.el("th", { scope: "row" }, [Air.cabinChip(cabin.key)]),
          ...(Array.isArray(values)
            ? [
                Air.el("td", { class: "num", text: Air.milesText(values[0]) }),
                Air.el("td", { class: "num", text: Air.milesText(values[1]) }),
                Air.el("td", { class: "num", text: Air.milesText(values[0] * 2) }),
                Air.el("td", { class: "num", text: Air.milesText(values[1] * 2) })
              ]
            : [Air.el("td", { class: "cell-muted", colspan: "4", text: "공제 구간 확인 중" })])
        ]);
      }))
    ]);

    card.append(Air.el("div", { class: "air-table-wrap" }, [table]));
    card.append(Air.el("p", { class: "air-map-note", text:
      "대한항공 공식 보너스 공제표(편도 기준)를 그대로 옮긴 값입니다. 세금·유류할증료는 별도입니다." }));

    return card;
  }

  /* ----------------------------------------------------------------- 표 */

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

    const children = [Air.statusBadge(row, state.meta)];

    if (price.kind === "official") {
      children.push(Air.el("div", { class: "route-cell__miles" }, [
        Air.seasonBadge(row.origin, row.date),
        Air.el("b", { text: Air.milesText(price.miles) })
      ]));
    } else {
      children.push(Air.el("div", { class: "air-inline-note", text: "공제 구간 확인 중" }));
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
        Air.el("th", { scope: "row", class: "num", style: "font-weight:700;white-space:nowrap" }, [
          Air.el("div", { text: Air.fmtDate(date) }),
          Air.seasonBadge(state.origin, date)
        ])
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
    const knownDates = new Set(rows.filter(row => row.status !== "unknown").map(row => row.date));
    const unknownDays = new Set([...dates].filter(date => !knownDates.has(date)));

    return Air.el("div", { class: "air-tiles", style: "margin-bottom:16px" }, [
      Air.el("div", { class: "air-tile" }, [
        Air.el("div", { class: "air-tile__label", text: "조회된 날짜" }),
        Air.el("div", { class: "air-tile__value", text: String(dates.size) }),
        Air.el("div", { class: "air-tile__sub", text: "좌석 상태가 기록된 날짜" })
      ]),
      Air.el("div", { class: "air-tile" }, [
        Air.el("div", { class: "air-tile__label", text: "좌석 표시 있는 날" }),
        Air.el("div", { class: "air-tile__value", text: String(availableDays.size) }),
        Air.el("div", { class: "air-tile__sub", text: "E·P·F 중 하나 이상" })
      ]),
      Air.el("div", { class: "air-tile" }, [
        Air.el("div", { class: "air-tile__label", text: "미조회 날짜" }),
        Air.el("div", { class: "air-tile__value", text: String(unknownDays.size) }),
        Air.el("div", { class: "air-tile__sub", text: "데이터 없음 · 좌석 없음과 다름" })
      ])
    ]);
  }

  /* -------------------------------------------------------------- 화면 */

  function controls() {
    const monthSelect = Air.el("select", { class: "air-select", id: "air-route-month" });
    selectMonth = monthSelect;

    const swap = Air.el("button", {
      type: "button", class: "air-btn air-btn--ghost air-btn--sm", text: "⇄ 방향 바꾸기"
    });

    swap.addEventListener("click", () => {
      const origin = state.origin;
      state.origin = state.destination;
      state.destination = origin;
      state.month = "";
      comboOrigin.setValue(state.origin);
      comboDestination.setValue(state.destination);
      render();
    });

    return [
      Air.el("div", { class: "air-panel", style: "margin-bottom:16px" }, [
        Air.el("div", { class: "air-filters", style: "grid-template-columns:repeat(auto-fit,minmax(190px,1fr))" }, [
          Air.el("div", { class: "air-field" }, [
            Air.el("label", { for: "air-route-origin-input", text: "출발 공항" }),
            Air.el("div", { class: "air-combo", id: "air-route-origin-combo" }, [
              Air.el("input", {
                class: "air-input air-combo__input", id: "air-route-origin-input", type: "search",
                placeholder: "도시·공항명·코드", autocomplete: "off", spellcheck: "false"
              })
            ])
          ]),
          Air.el("div", { class: "air-field" }, [
            Air.el("label", { for: "air-route-destination-input", text: "도착 공항" }),
            Air.el("div", { class: "air-combo", id: "air-route-destination-combo" }, [
              Air.el("input", {
                class: "air-input air-combo__input", id: "air-route-destination-input", type: "search",
                placeholder: "도시·공항명·코드", autocomplete: "off", spellcheck: "false"
              })
            ])
          ]),
          Air.el("div", { class: "air-field" }, [
            Air.el("label", { for: "air-route-month", text: "탑승월" }),
            monthSelect
          ])
        ]),
        Air.el("div", { class: "air-actions" }, [swap])
      ])
    ];
  }

  function render() {
    if (!state.mounted) {
      const root = $("air-route-view");
      root.append(...controls());

      comboOrigin = Air.airportCombo($("air-route-origin-combo"), {
        value: state.origin,
        placeholder: "도시·공항명·코드",
        onSelect: value => { state.origin = value; state.month = ""; render(); }
      });

      comboDestination = Air.airportCombo($("air-route-destination-combo"), {
        value: state.destination,
        placeholder: "도시·공항명·코드",
        onSelect: value => { state.destination = value; state.month = ""; render(); }
      });

      selectMonth.addEventListener("change", () => {
        state.month = selectMonth.value;
        render();
      });

      slot = Air.el("div", { id: "air-route-slot" });
      root.append(slot);
      state.mounted = true;
    }

    const months = [...new Set(routeRows().map(row => row.month))].sort();

    if (state.month && !months.includes(state.month)) state.month = "";
    if (!state.month && months.length) state.month = months[0];

    selectMonth.replaceChildren(new Option("전체 기간", ""));
    for (const month of months) selectMonth.append(new Option(Air.fmtMonth(month), month));
    selectMonth.value = state.month;

    syncUrl();

    slot.replaceChildren();

    if (!state.origin || !state.destination) {
      slot.append(Air.emptyState(
        "노선을 선택해 주세요",
        "출발 공항과 도착 공항을 입력하면 날짜별 E·P·F 좌석 상태와 공제 마일을 볼 수 있습니다."
      ));
      return;
    }

    if (state.origin === state.destination) {
      slot.append(Air.emptyState("출발지와 목적지가 같습니다", "서로 다른 공항을 선택해 주세요."));
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

    slot.append(head);

    const summary = chartSummary();
    if (summary) slot.append(summary);

    if (!rows.length) {
      slot.append(Air.el("div", { style: "margin-top:16px" }, [
        Air.el("div", { class: "air-notice air-notice--info" }, [
          Air.el("span", { class: "air-notice__icon", text: "ℹ" }),
          Air.el("div", null, [
            Air.el("strong", { text: "이 노선의 좌석 데이터는 아직 수집되지 않았습니다. " }),
            "좌석이 없다는 뜻이 아닙니다. 위 공식 공제표 기준 마일은 지금도 확인할 수 있으며, ",
            "좌석 현황은 대한항공 공식 조회에서 확인해 주세요."
          ])
        ])
      ]));
      return;
    }

    slot.append(tiles(rows));

    const monthRows = state.month ? rows.filter(row => row.month === state.month) : rows;

    if (!monthRows.length) {
      slot.append(Air.emptyState(
        `${Air.fmtMonth(state.month)} 조회 기록이 없습니다`,
        "다른 탑승월을 선택해 주세요. 조회되지 않은 월은 좌석 없음과 다릅니다."
      ));
      return;
    }

    const tableNode = table(monthRows, state.month);
    if (tableNode) slot.append(tableNode);

    slot.append(Air.el("p", { class: "air-map-note", text:
      "· 좌석 수는 제공하지 않습니다(항공사가 공개하지 않음). · 공제 마일은 공식 공제표의 편도 기준이며 탑승일의 성수기·평수기로 자동 계산합니다. " +
      "· 승급 전용 좌석(G·U)은 표시·합산에서 제외합니다. · 세금·유류할증료는 별도입니다." }));
  }

  async function init() {
    Air.mountChrome();
    readUrl();

    try {
      const payload = await Air.data({});
      state.rows = payload.rows;
      state.meta = await Air.manifestMeta();

      const live = new Set(state.rows.flatMap(row => [row.origin, row.destination]));
      if (live.size && Air.award && Air.award.setLiveRoutes) Air.award.setLiveRoutes([...live]);
    } catch (error) {
      $("air-route-view").replaceChildren(Air.emptyState(
        "좌석 데이터를 불러오지 못했습니다",
        "잠시 후 새로고침해 주세요. 계속되면 이용안내를 확인해 주세요."
      ));
      return;
    }

    try {
      await Air.airports();
    } catch {
      /* 공항 사전이 없어도 기존 조건으로 표는 그린다. */
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
