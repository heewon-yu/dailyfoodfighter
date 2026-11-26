/* 마일지도 AIR — 신규 좌석 뷰 (/air/new/)
   이전 갱신에서 '좌석 없음'이 확인된 뒤 '좌석 있음'으로 바뀐 기록 중
   프레스티지(P)·일등석(F)만 표시한다. 최초 수집·미조회 전환은 NEW가 아니다. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const NEW_CABINS = ["business", "first"];

  const state = {
    month: "",
    cabin: "",
    rows: [],
    stats: null,
    meta: null
  };

  function readUrl() {
    const params = Air.params();
    state.month = params.get("month") || "";
    state.cabin = params.get("cabin") || "";
    if (state.cabin && !NEW_CABINS.includes(state.cabin)) state.cabin = "";
  }

  function syncUrl() {
    Air.setParams({ month: state.month, cabin: state.cabin });
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

  function card(row) {
    return Air.el("article", { class: "flight-card" }, [
      Air.el("div", { class: "flight-card__top" }, [
        Air.el("div", null, [
          Air.el("a", {
            class: "flight-card__route",
            href: Air.ROOT + "route/?" + new URLSearchParams({
              origin: row.origin, destination: row.destination, month: row.month
            }).toString(),
            text: `${Air.airportShort(row.origin)} → ${Air.airportShort(row.destination)}`
          }),
          Air.el("span", { class: "flight-card__code", text: `${row.origin} → ${row.destination}` })
        ]),
        Air.el("span", { class: "badge badge--new", text: "NEW" })
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
          Air.el("span", { class: "flight-card__observed", text:
            row.collectedAt ? `관측 ${Air.fmtDateTime(row.collectedAt)}` : "관측 시각 없음" }),
          Air.el("span", { class: "flight-card__observed", text:
            row.previousStatus === "unavailable" ? "이전 조회: 좌석 없음" : "전환 근거: 확인됨" })
        ])
      ])
    ]);
  }

  function render() {
    const root = $("air-new-view");
    root.replaceChildren();

    syncUrl();

    const months = [...new Set(state.rows.map(row => row.month))].sort();

    root.append(Air.el("div", { class: "air-panel", style: "margin-bottom:16px" }, [
      Air.el("div", { class: "air-filters", style: "grid-template-columns:repeat(auto-fit,minmax(190px,1fr))" }, [
        selectField("air-new-month", "탑승월", state.month,
          months.map(month => ({ value: month, label: Air.fmtMonth(month) })),
          value => { state.month = value; }),
        selectField("air-new-cabin", "좌석 등급", state.cabin,
          NEW_CABINS.map(key => {
            const cabin = Air.CABIN_BY_KEY.get(key);
            return { value: key, label: `${cabin.letter} · ${cabin.name}` };
          }),
          value => { state.cabin = value; })
      ])
    ]));

    const rows = state.rows.filter(row => {
      if (!row.isNew) return false;
      if (!NEW_CABINS.includes(row.cabinKey)) return false;
      if (state.month && row.month !== state.month) return false;
      if (state.cabin && row.cabinKey !== state.cabin) return false;
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date) ||
      a.destination.localeCompare(b.destination));

    const head = Air.el("div", { class: "air-results-head" }, [
      Air.el("h2", { text: "신규 좌석" }),
      Air.el("p", { class: "air-results-summary" }, [
        Air.el("span", null, [Air.el("b", { text: String(rows.length) }), "건"]),
        Air.el("span", { text: "프레스티지·일등석" })
      ])
    ]);

    root.append(head);

    if (!rows.length) {
      root.append(Air.emptyState(
        "확인된 신규 프레스티지·일등석 좌석이 없습니다",
        "NEW는 이전 갱신에서 '좌석 없음'이 확인된 뒤 '좌석 있음'으로 바뀐 경우에만 표시합니다. " +
        "최초 수집된 날짜와 미조회 상태에서 바뀐 기록은 NEW로 표시하지 않습니다."
      ));
    } else {
      root.append(Air.el("div", { class: "air-result-grid" }, rows.map(card)));
    }

    if (state.stats && state.stats.newUnproven) {
      root.append(Air.el("div", { class: "air-notice air-notice--info", style: "margin-top:16px" }, [
        Air.el("span", { class: "air-notice__icon", text: "ℹ" }),
        Air.el("div", null, [
          Air.el("strong", { text: "전환 근거가 확인되지 않은 기록 " }),
          ` ${state.stats.newUnproven}건은 NEW로 표시하지 않았습니다. `,
          "이전 상태(previous_status)가 'unavailable'이거나 확인된 전환 근거가 있어야 신규 좌석으로 인정합니다."
        ])
      ]));
    }
  }

  async function init() {
    Air.mountChrome();
    readUrl();

    try {
      const payload = await Air.data({});
      state.rows = payload.rows;
      state.stats = payload.stats;
      state.meta = await Air.manifestMeta();

      const live = new Set();
      for (const route of state.meta.collectionRoutes || []) {
        for (const code of String(route).split("-")) {
          if (/^[A-Z]{3}$/.test(code)) live.add(code);
        }
      }
      if (live.size && Air.award && Air.award.setLiveRoutes) Air.award.setLiveRoutes([...live]);
    } catch (error) {
      $("air-new-view").replaceChildren(Air.emptyState(
        "좌석 데이터를 불러오지 못했습니다",
        "갱신현황 화면에서 데이터 상태를 확인해 주세요."
      ));
      return;
    }

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
