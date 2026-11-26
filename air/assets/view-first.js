/* 마일지도 AIR — 일등석(F) 전용 뷰 (/air/first/)
   index.json 에 등록된 전체 월별 JSON 을 읽어 cabin === "first" 이고 status === "available" 인
   건만 날짜순으로 모아 보여준다. 화면을 막는 입력은 없고, 처음 열면 일등석 전체가 바로 보인다.
   건마다 해당 레코드의 collected_at(없으면 source_updated_at)을 한국 시간으로 표시한다. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const KOREA = new Set(["ICN", "GMP"]);

  const DIRECTION_LABEL = {
    all: "전체",
    out: "한국 출발",
    in: "한국 귀국"
  };

  const state = {
    rows: [],
    stats: null,
    meta: null,
    direction: "all",
    airport: ""
  };

  /* ------------------------------------------------------------ 날짜 표기 */

  const stampFormat = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });

  /** ISO 문자열 → "YYYY.MM.DD HH:mm" (한국 시간). 값이 없거나 잘못되면 null. */
  function stamp(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;

    const parts = stampFormat.formatToParts(date);
    const part = type => (parts.find(entry => entry.type === type) || {}).value || "";

    return `${part("year")}.${part("month")}.${part("day")} ${part("hour")}:${part("minute")}`;
  }

  /** 레코드의 최종 조회 일자 — collected_at 우선, 없으면 source_updated_at. */
  function lastChecked(row) {
    return row.collectedAt || row.sourceUpdatedAt || null;
  }

  /* --------------------------------------------------------------- 필터 UI */

  function readUrl() {
    const params = Air.params();
    const direction = params.get("dir") || "all";
    state.direction = Object.prototype.hasOwnProperty.call(DIRECTION_LABEL, direction) ? direction : "all";
    state.airport = (params.get("airport") || "").toUpperCase();
  }

  function syncUrl() {
    Air.setParams({ dir: state.direction, airport: state.airport });
  }

  function directionOf(row) {
    if (KOREA.has(row.origin)) return "out";
    if (KOREA.has(row.destination)) return "in";
    return "out";
  }

  function airportCodes() {
    const counts = new Map();

    for (const row of state.rows) {
      for (const code of [row.origin, row.destination]) {
        if (KOREA.has(code)) continue;
        counts.set(code, (counts.get(code) || 0) + 1);
      }
    }

    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderFilters(root) {
    const seg = Air.el("div", { class: "air-seg air-seg--trip", role: "group", "aria-label": "방향" });

    for (const [key, label] of Object.entries(DIRECTION_LABEL)) {
      const button = Air.el("button", {
        type: "button",
        "aria-pressed": String(state.direction === key),
        text: label
      });

      button.addEventListener("click", () => {
        state.direction = key;
        render();
      });

      seg.append(button);
    }

    const select = Air.el("select", { class: "air-select", id: "air-first-airport" });
    select.append(new Option("전체 공항", ""));

    const codes = airportCodes();

    for (const [code, count] of codes) {
      select.append(new Option(`${Air.airportShort(code)} (${code}) · ${count}건`, code));
    }

    if (state.airport && !codes.some(([code]) => code === state.airport)) state.airport = "";

    select.value = state.airport;
    select.addEventListener("change", () => {
      state.airport = select.value;
      render();
    });

    root.append(Air.el("div", { class: "air-panel", style: "margin-bottom:16px" }, [
      Air.el("div", {
        class: "air-filters",
        style: "grid-template-columns:repeat(auto-fit,minmax(190px,1fr))"
      }, [
        Air.el("div", { class: "air-field" }, [
          Air.el("span", { class: "air-field__label", text: "방향" }),
          seg
        ]),
        Air.el("div", { class: "air-field" }, [
          Air.el("label", { for: "air-first-airport", text: "공항" }),
          select
        ])
      ])
    ]));
  }

  /* --------------------------------------------------------------- 요약 */

  function summary(rows) {
    const latest = rows
      .map(row => lastChecked(row))
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;

    const routes = new Set(rows.map(row => `${row.origin}-${row.destination}`));

    const marked = { style: "font-size:16px;line-height:1.3;letter-spacing:-.01em;word-break:keep-all" };

    const tile = (label, value, sub, props) => Air.el("div", { class: "air-tile" }, [
      Air.el("p", { class: "air-tile__label", text: label }),
      Air.el("p", Object.assign({ class: "air-tile__value", text: value }, props || null)),
      sub ? Air.el("p", { class: "air-tile__sub", text: sub }) : null
    ]);

    return Air.el("div", { class: "air-tiles", style: "margin-bottom:16px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))" }, [
      tile("일등석 예약 가능", `${rows.length}건`,
        (state.direction !== "all" || state.airport) ? "선택 조건 기준" : "전체 수집 기준"),
      tile("노선", `${routes.size}개`, "방향별 집계"),
      tile("최종 조회 일자", stamp(latest) || "미확인", latest ? "한국 시간(KST)" : "", marked),
      tile("데이터 생성", stamp(state.meta && state.meta.generatedAt) || "미확인",
        state.meta && state.meta.ageLabel ? state.meta.ageLabel : "", marked)
    ]);
  }

  /* ---------------------------------------------------------------- 카드 */

  function card(row) {
    const checked = stamp(lastChecked(row));
    const stale = state.meta ? Air.isStaleRow(row, state.meta.generatedAt) : false;

    return Air.el("article", {
      class: "flight-card",
      "aria-label": `${row.origin} ${row.destination} ${row.date} 일등석 좌석 있음`
    }, [
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
        Air.el("div", { style: "display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end" }, [
          Air.el("span", { class: "badge badge--available", text: "좌석 있음" }),
          row.firstCombined
            ? Air.el("span", {
                class: "badge badge--combined",
                title: "공식 조회 화면에서 보너스 좌석과 좌석승급이 하나의 일등석(F)으로 함께 표시된 건입니다. 공식 페이지에서 최종 확인하세요.",
                text: "F 통합"
              })
            : null,
          stale
            ? Air.el("span", { class: "badge badge--stale", text: "오래된 데이터" })
            : null
        ])
      ]),
      Air.el("div", { class: "flight-card__meta" }, [
        Air.el("span", { class: "flight-card__date", text: Air.fmtDate(row.date) }),
        Air.seasonBadge(row.origin, row.date),
        Air.hotpickBadge(row),
        Air.el("span", { text: "·" }),
        Air.cabinChip(row.cabinKey)
      ]),
      Air.el("div", { class: "flight-card__bottom" }, [
        Air.priceNode(row),
        Air.el("div", { class: "flight-card__side" }, [
          Air.el("span", { class: "flight-card__observed" }, [
            Air.el("b", { text: "최종 조회 " }),
            checked
              ? `${checked} KST`
              : (row.collectedAt ? Air.fmtDateTime(row.collectedAt) : "조회 시각 없음")
          ]),
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

  /* --------------------------------------------------------------- 렌더 */

  function render() {
    const root = $("air-first-view");
    if (!root) return;

    root.replaceChildren();
    syncUrl();

    renderFilters(root);

    const rows = state.rows
      .filter(row => state.direction === "all" ? true : directionOf(row) === state.direction)
      .filter(row => !state.airport ||
        row.origin === state.airport || row.destination === state.airport)
      .sort((a, b) => a.date.localeCompare(b.date)
        || a.origin.localeCompare(b.origin)
        || a.destination.localeCompare(b.destination));

    root.append(summary(rows));

    root.append(Air.el("div", { class: "air-results-head" }, [
      Air.el("h2", { text: "일등석 예약 가능" }),
      Air.el("p", { class: "air-results-summary" }, [
        Air.el("span", null, [Air.el("b", { text: String(rows.length) }), "건"]),
        Air.el("span", { text: DIRECTION_LABEL[state.direction] + (state.airport ? ` · ${state.airport}` : "") }),
        Air.el("span", { class: "air-results-summary__date", text: "출발일 빠른 순" })
      ])
    ]));

    if (!rows.length) {
      root.append(Air.emptyState(
        "해당 조건의 일등석 예약 가능 좌석이 없습니다",
        "방향·공항 조건을 '전체'로 되돌리면 수집된 일등석 좌석을 모두 볼 수 있습니다. " +
        "좌석이 없는 날짜와 아직 조회하지 않은 날짜는 이 화면에 표시하지 않습니다."
      ));
    } else {
      root.append(Air.el("div", { class: "air-result-grid" }, rows.map(card)));
    }

    const collected = (state.stats && state.stats.firstTotal) || 0;
    const scope = state.stats && state.stats.raw ? state.stats.raw : null;

    root.append(Air.el("div", { class: "air-notice air-notice--info", style: "margin-top:16px" }, [
      Air.el("span", { class: "air-notice__icon", "aria-hidden": "true", text: "ℹ" }),
      Air.el("div", null, [
        Air.el("strong", { text: "이 화면에 담긴 범위 · " }),
        `수집된 일등석 기록 ${collected.toLocaleString("ko-KR")}건 가운데 좌석 있음 ` +
        `${(state.stats && state.stats.firstAvailable) || 0}건만 표시합니다. `,
        scope ? `전체 수집 ${scope.toLocaleString("ko-KR")}행 · ` : "",
        "수집 범위는 인천(ICN)·김포(GMP) 출발·귀국 직항 노선이며, 새 배치가 반영되면 자동으로 늘어납니다. " +
        "좌석 수는 제공하지 않고, 실제 발권 전 공식 채널에서 확인해야 합니다."
      ])
    ]));
  }

  /* ---------------------------------------------------------------- init */

  async function init() {
    Air.mountChrome();
    readUrl();

    const root = $("air-first-view");
    if (root) root.replaceChildren(Air.el("p", { class: "air-inline-note", text: "일등석 좌석을 불러오는 중입니다…" }));

    try {
      await Air.airports();

      const payload = await Air.data({});
      const firstRows = payload.rows.filter(row => row.cabinKey === "first");
      state.rows = firstRows.filter(row => row.status === "available");
      state.stats = Object.assign({}, payload.stats, {
        firstTotal: firstRows.length,
        firstAvailable: state.rows.length
      });
      state.meta = await Air.manifestMeta();

      const live = new Set();
      for (const route of state.meta.collectionRoutes || []) {
        for (const code of String(route).split("-")) {
          if (/^[A-Z]{3}$/.test(code)) live.add(code);
        }
      }
      if (live.size && Air.award && Air.award.setLiveRoutes) Air.award.setLiveRoutes([...live]);
    } catch (error) {
      if (root) {
        root.replaceChildren(Air.emptyState(
          "일등석 좌석 데이터를 불러오지 못했습니다",
          "잠시 후 새로고침해 주세요."
        ));
      }
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
