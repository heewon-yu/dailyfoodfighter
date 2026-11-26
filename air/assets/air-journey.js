/* 마일지도 AIR — 왕복 조합 뷰 (/air/journey/ 및 메인 검색의 왕복 모드)
   가는 편·오는 편을 각각 선택해 공제량을 합산한다.
   F(일등석 통합)는 보너스/승급 구분이 불가능하므로 합계에서 제외하고 별도 표시한다. */
(() => {
  "use strict";

  const state = {
    origin: "",
    destination: "",
    outCabin: "economy",
    inCabin: "economy",
    outMonth: "",
    inMonth: "",
    outDate: "",
    inDate: "",
    rows: [],
    meta: null,
    mounted: false
  };

  let root = null;
  let options = {};

  const $ = id => document.getElementById(id);

  function legRows(direction) {
    const origin = direction === "out" ? state.origin : state.destination;
    const destination = direction === "out" ? state.destination : state.origin;
    const cabin = direction === "out" ? state.outCabin : state.inCabin;
    const month = direction === "out" ? state.outMonth : state.inMonth;

    return state.rows.filter(row =>
      row.origin === origin &&
      row.destination === destination &&
      (!cabin || row.cabinKey === cabin) &&
      (!month || row.month === month)
    );
  }

  function dateGroups(direction) {
    const rows = legRows(direction).filter(row => row.status === "available");

    const byDate = new Map();

    for (const row of rows) {
      if (!byDate.has(row.date)) byDate.set(row.date, []);
      byDate.get(row.date).push(row);
    }

    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, entries]) => ({ date, entries }));
  }

  function cabinSelect(id, label, value) {
    const select = Air.el("select", { class: "air-select", id });

    for (const cabin of Air.CABINS) {
      select.append(new Option(`${cabin.letter} · ${cabin.name}`, cabin.key));
    }

    select.value = value;

    select.addEventListener("change", event => {
      if (id === "air-journey-out-cabin") state.outCabin = event.target.value;
      else state.inCabin = event.target.value;
      render();
    });

    return Air.el("div", { class: "journey-leg__field" }, [
      Air.el("label", { for: id, text: label }),
      select
    ]);
  }

  function monthSelect(id, label, value) {
    const select = Air.el("select", { class: "air-select", id });
    select.append(new Option("전체 기간", ""));

    const months = [...new Set(state.rows.map(row => row.month))].sort();

    for (const month of months) {
      select.append(new Option(Air.fmtMonth(month), month));
    }

    select.value = value;

    select.addEventListener("change", event => {
      if (id === "air-journey-out-month") state.outMonth = event.target.value;
      else state.inMonth = event.target.value;
      render();
    });

    return Air.el("div", { class: "journey-leg__field" }, [
      Air.el("label", { for: id, text: label }),
      select
    ]);
  }

  function syncUrl() {
    const values = {
      jout: state.outDate,
      jin: state.inDate,
      jc2: state.inCabin,
      jm2: state.inMonth
    };

    if (!options.compact) {
      values.origin = state.origin;
      values.destination = state.destination;
    }

    Air.setParams(values);
  }

  function routeSelector() {
    const list = state.airportList || [];

    const makeSelect = (value, onChange, label, id) => {
      const select = Air.el("select", { class: "air-select", id });
      select.append(new Option("공항 선택", ""));

      for (const airport of list) {
        select.append(new Option(`${airport.name} (${airport.code})`, airport.code));
      }

      select.value = value;
      select.addEventListener("change", () => {
        onChange(select.value);
        state.outDate = "";
        state.inDate = "";
        render();
      });

      return Air.el("div", { class: "air-field" }, [
        Air.el("label", { for: id, text: label }),
        select
      ]);
    };

    const swap = Air.el("button", {
      type: "button",
      class: "air-btn air-btn--ghost air-btn--sm",
      text: "⇄ 출발·도착 바꾸기"
    });

    swap.addEventListener("click", () => {
      const origin = state.origin;
      state.origin = state.destination;
      state.destination = origin;
      state.outDate = "";
      state.inDate = "";
      render();
    });

    return Air.el("div", { class: "air-panel", style: "margin-bottom:16px" }, [
      Air.el("div", { class: "air-filters", style: "grid-template-columns:repeat(auto-fit,minmax(200px,1fr))" }, [
        makeSelect(state.origin, value => { state.origin = value; }, "출발 공항", "air-journey-origin"),
        makeSelect(state.destination, value => { state.destination = value; }, "도착 공항", "air-journey-destination")
      ]),
      Air.el("div", { class: "air-actions" }, [swap])
    ]);
  }

  function leg(direction) {    const isOut = direction === "out";
    const origin = isOut ? state.origin : state.destination;
    const destination = isOut ? state.destination : state.origin;

    const groups = dateGroups(direction);
    const selected = isOut ? state.outDate : state.inDate;

    const optionsList = Air.el("div", {
      class: "journey-leg__options",
      role: "radiogroup",
      "aria-label": `${isOut ? "가는 편" : "오는 편"} 날짜 선택`
    });

    if (!groups.length) {
      optionsList.append(Air.el("p", { class: "air-inline-note", text:
        "이 구간에서 확인된 좌석이 없습니다. 미조회이거나 좌석 표시가 없는 상태이며, 실제 매진을 의미하지 않습니다." }));
    }

    for (const group of groups) {
      const cabin = Air.CABIN_BY_KEY.get(isOut ? state.outCabin : state.inCabin);
      const row = group.entries.find(entry => entry.cabinKey === cabin.key) || group.entries[0];
      const price = Air.priceOf(row);
      const miles = Air.payableMiles(row);

      const priceLabel = price.kind === "combined" ? "공제량 미확인(F 통합)" :
        miles ? (price.kind === "estimate" ? "추정 " : "") + Air.fmtMiles(miles) :
        "공제량 미확인";

      const input = Air.el("input", {
        type: "radio",
        name: isOut ? "air-journey-out" : "air-journey-in",
        value: group.date,
        checked: group.date === selected
      });

      input.addEventListener("change", () => {
        if (isOut) state.outDate = group.date;
        else state.inDate = group.date;
        render();
      });

      optionsList.append(Air.el("label", { class: "journey-option" }, [
        input,
        Air.el("span", { class: "journey-option__date", text: Air.fmtDate(group.date) }),
        Air.cabinChip(row.cabinKey),
        Air.el("span", { class: "journey-option__meta", text: priceLabel })
      ]));
    }

    return Air.el("div", { class: "journey-leg" }, [
      Air.el("h3", null, [
        isOut ? "가는 편" : "오는 편",
        Air.el("span", { class: "flight-card__code", text: `${origin} → ${destination}` })
      ]),
      cabinSelect(
        isOut ? "air-journey-out-cabin" : "air-journey-in-cabin",
        `${isOut ? "가는 편" : "오는 편"} 좌석 등급`,
        isOut ? state.outCabin : state.inCabin
      ),
      monthSelect(
        isOut ? "air-journey-out-month" : "air-journey-in-month",
        `${isOut ? "가는 편" : "오는 편"} 탑승월`,
        isOut ? state.outMonth : state.inMonth
      ),
      optionsList
    ]);
  }

  function selectedRow(direction) {
    const date = direction === "out" ? state.outDate : state.inDate;
    if (!date) return null;

    const rows = legRows(direction).filter(row => row.date === date && row.status === "available");
    if (!rows.length) return null;

    return rows[0];
  }

  function summary() {
    const out = selectedRow("out");
    const back = selectedRow("in");

    const wrapper = Air.el("div", { class: "journey-summary" });
    wrapper.append(Air.el("h3", { text: "왕복 공제량" }));

    if (!state.origin || !state.destination) {
      wrapper.append(Air.el("p", {
        class: "air-inline-note",
        text: "출발 공항과 목적지를 먼저 선택해 주세요."
      }));
      return wrapper;
    }

    if (state.origin === state.destination) {
      wrapper.append(Air.el("p", { class: "air-inline-note", text: "출발지와 목적지가 같습니다." }));
      return wrapper;
    }

    const price = row => (row ? Air.priceOf(row) : { kind: "unknown" });
    const miles = row => Air.payableMiles(row);

    const outPrice = price(out);
    const backPrice = price(back);

    const show = (row, p) => {
      if (!row) return "미선택";
      if (p.kind === "combined") return "F 통합 · 구분 불가";
      if (p.kind === "unknown") return "미확인";
      const value = p.discounted || p.standard;
      return (p.kind === "estimate" ? "추정 " : "") + Air.fmtMiles(value);
    };

    wrapper.append(
      Air.el("div", { class: "journey-summary__row" }, [
        Air.el("span", { text: `가는 편 ${out ? Air.fmtDate(out.date) + " · " + out.cabin.letter : ""}` }),
        Air.el("b", { text: show(out, outPrice) })
      ]),
      Air.el("div", { class: "journey-summary__row" }, [
        Air.el("span", { text: `오는 편 ${back ? Air.fmtDate(back.date) + " · " + back.cabin.letter : ""}` }),
        Air.el("b", { text: show(back, backPrice) })
      ])
    );

    if (out && back && state.inDate < state.outDate) {
      wrapper.append(Air.el("p", {
        class: "air-inline-note",
        style: "color:#ffd9a8;margin-top:8px",
        text: "오는 편 날짜가 가는 편보다 빠릅니다. 날짜를 다시 선택해 주세요."
      }));
      return wrapper;
    }

    const totalEl = Air.el("div", { class: "journey-summary__total" });

    if (!out || !back) {
      totalEl.append(Air.el("span", { text: "합계" }), Air.el("span", { text: "날짜 선택 전" }));
      wrapper.append(totalEl);
      wrapper.append(Air.el("small", {
        text: "가는 편과 오는 편 날짜를 각각 선택하면 합계가 표시됩니다."
      }));
      return wrapper;
    }

    const combined = outPrice.kind === "combined" || backPrice.kind === "combined";
    const unknown = outPrice.kind === "unknown" || backPrice.kind === "unknown";
    const estimate = outPrice.kind === "estimate" || backPrice.kind === "estimate";

    if (combined) {
      const sumRows = [out, back].filter(row => Air.priceOf(row).kind !== "combined");
      const sumUnknown = sumRows.some(row => Air.priceOf(row).kind === "unknown");
      const sumEstimate = sumRows.some(row => Air.priceOf(row).kind === "estimate");
      const sum = sumRows.reduce((acc, row) => acc + (Air.payableMiles(row) || 0), 0);

      totalEl.append(
        Air.el("span", { text: "F 제외 구간 합계" }),
        Air.el("b", {
          text: sumUnknown || !sumRows.length
            ? "미확인"
            : (sumEstimate ? "추정 " : "") + Air.fmtMiles(sum)
        })
      );
      wrapper.append(totalEl);

      wrapper.append(Air.el("small", {
        text: "일등석(F)은 보너스 공제량과 좌석승급 공제량을 구분할 수 없어 왕복 합산에서 제외했습니다. " +
          "F 구간의 공제량은 대한항공 공식 채널에서 확인해 주세요."
      }));

      return wrapper;
    }

    if (unknown) {
      totalEl.append(Air.el("span", { text: "합계" }), Air.el("span", { text: "미확인" }));
      wrapper.append(totalEl);
      wrapper.append(Air.el("small", {
        text: "두 구간 중 공제량이 확인되지 않은 구간이 있어 합계를 계산하지 않습니다."
      }));
      return wrapper;
    }

    const total = miles(out) + miles(back);

    totalEl.append(Air.el("span", { text: "왕복 합계" }), Air.el("span", { text: Air.fmtMiles(total) }));
    wrapper.append(totalEl);

    wrapper.append(Air.el("small", {
      text: (estimate ? "추정 공제량 기준입니다. " : "") +
        "편도 공제량을 단순 합산한 값이며, 왕복 할인·성수기·세금·유류할증료는 별도입니다. " +
        "실제 공제량은 대한항공 공식 채널에서 확인해 주세요."
    }));

    return wrapper;
  }

  function render() {
    if (!root) return;

    const round = options.compact
      ? Air.el("h2", { class: "air-section-title", text: "왕복 조합" })
      : null;

    root.replaceChildren();

    if (!options.compact) {
      root.append(routeSelector());
    }

    if (!state.origin || !state.destination) {
      const empty = Air.emptyState(
        "출발 공항과 목적지를 선택해 주세요",
        "왕복 조합은 가는 편(출발→목적지)과 오는 편(목적지→출발)을 각각 선택해 공제량을 합산합니다."
      );

      if (options.compact) {
        empty.append(Air.el("p", { style: "margin-top:12px" }, [
          Air.el("a", {
            class: "air-btn air-btn--sm",
            href: Air.viewLink("journey/"),
            text: "왕복 화면에서 공항 선택"
          })
        ]));
      }

      root.append(empty);
      return;
    }

    if (round) root.append(round);

    root.append(
      Air.el("div", { class: "journey-legs" }, [leg("out"), leg("in")]),
      summary()
    );

    syncUrl();
  }

  async function init() {
    try {
      const payload = await Air.data({});
      state.rows = payload.rows;
      state.meta = await Air.manifestMeta();
    } catch (error) {
      root.replaceChildren(Air.emptyState(
        "좌석 데이터를 불러오지 못했습니다",
        "갱신현황 화면에서 데이터 상태를 확인해 주세요."
      ));
      return;
    }

    const months = [...new Set(state.rows.map(row => row.month))].sort();

    try {
      const airports = await Air.airports();
      state.airportList = [...airports.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } catch {
      state.airportList = [];
    }

    if (!state.outMonth && months.length) state.outMonth = months[0];
    if (!state.inMonth) state.inMonth = state.outMonth || months[0] || "";

    render();
  }

  Air.mountJourney = function mountJourney(container, config = {}) {
    root = container;
    options = config;

    const params = Air.params();

    state.origin = (config.origin || params.get("origin") || "").toUpperCase();
    state.destination = (config.destination || params.get("destination") || "").toUpperCase();
    state.outCabin = config.cabin || params.get("cabin") || "economy";
    state.inCabin = params.get("jc2") || state.outCabin;
    state.outMonth = config.month ?? params.get("month") ?? "";
    state.inMonth = params.get("jm2") ?? state.outMonth;
    state.outDate = params.get("jout") || "";
    state.inDate = params.get("jin") || "";

    if (!Air.CABIN_BY_KEY.has(state.outCabin)) state.outCabin = "economy";
    if (!Air.CABIN_BY_KEY.has(state.inCabin)) state.inCabin = state.outCabin;

    container.replaceChildren(Air.el("div", { class: "air-loading", text: "왕복 데이터를 준비하는 중" }));

    if (state.mounted) {
      init();
      return;
    }

    state.mounted = true;
    init();
  };

  /* /air/journey/ 페이지 자체 부트스트랩 */
  function bootPage() {
    if (Air.pageKey() !== "journey") return;

    const container = $("air-journey");
    if (!container) return;

    Air.mountChrome();
    Air.mountJourney(container, { compact: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootPage, { once: true });
  } else {
    bootPage();
  }
})();
