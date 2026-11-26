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
      if (state.direction !== "all" && directionOf(row) !== state.direction) continue;
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

  /* ------------------------------------------------------- 묶음 공유·복사 */

  const SHARE_URL = "https://dailyfoodfighter.com/air/first/";

  const weekdayFormat = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short"
  });

  /** 출발일 → "월" 같은 요일 한 글자. 잘못된 값이면 빈 문자열. */
  function weekday(iso) {
    const date = new Date(`${String(iso).slice(0, 10)}T00:00:00+09:00`);
    if (Number.isNaN(date.getTime())) return "";
    return weekdayFormat.format(date).replace(/요일$/, "");
  }

  /** 묶음 텍스트에 쓰는 노선 표기 — 인천·김포는 짧게, 나머지는 공항명. */
  function routeName(code) {
    if (code === "ICN") return "인천";
    if (code === "GMP") return "김포";
    return Air.airportShort(code);
  }

  /**
   * 현재 화면에 보이는 리스트를 카카오톡에 붙여넣을 하나의 텍스트로 묶는다.
   * 노선별로 묶고, 노선 안에서는 출발일이 빠른 순서로 적는다.
   */
  function shareText(rows) {
    const lines = [`👑 대한항공 일등석(F) 좌석 모음 (총 ${rows.length}건)`];

    const latest = rows
      .map(row => lastChecked(row))
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;
    const checked = stamp(latest);

    lines.push(checked ? `최종 조회 ${checked} KST` : "최종 조회 시각 없음");

    if (state.direction !== "all" || state.airport) {
      const condition = [DIRECTION_LABEL[state.direction]];
      if (state.airport) condition.push(`${Air.airportShort(state.airport)}(${state.airport})`);
      lines.push(`조건 ${condition.join(" · ")}`);
    }

    lines.push("");

    const groups = new Map();

    for (const row of rows) {
      const key = `${row.origin}→${row.destination}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const ordered = [...groups.values()]
      .map(list => list.slice().sort((a, b) => a.date.localeCompare(b.date)))
      .sort((a, b) => a[0].date.localeCompare(b[0].date) || a[0].origin.localeCompare(b[0].origin));

    let combined = false;

    for (const list of ordered) {
      const { origin, destination } = list[0];
      lines.push(`${routeName(origin)} → ${routeName(destination)} (${origin}→${destination})`);

      for (const row of list) {
        const price = Air.priceOf(row);
        const bits = [`· ${Air.fmtDate(row.date)} (${weekday(row.date)})`];

        if (price.kind === "official") {
          const otherSeason = price.season.peak ? "평수기" : "성수기";
          const otherMiles = price.season.peak ? price.offpeak : price.peak;
          bits.push(`${Air.milesText(price.miles)} (${price.season.label})`);
          bits.push(`${otherSeason} ${Air.milesText(otherMiles)}`);
        } else {
          bits.push("공제량 확인 중");
        }

        if (row.firstCombined) {
          bits.push("F 통합");
          combined = true;
        }

        lines.push(bits.join(" · "));
      }

      lines.push("");
    }

    if (combined) {
      lines.push("※ F 통합 = 공식 조회 화면에서 보너스 좌석과 좌석승급이 하나의 일등석(F)으로 함께 표시된 건");
      lines.push("");
    }

    lines.push(SHARE_URL);

    return lines.join("\n");
  }

  /** 클립보드 복사 — 최신 API가 막힌 환경(구형·비보안 컨텍스트)은 임시 textarea로 대체한다. */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      /* 아래 대체 경로로 넘어간다 */
    }

    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      area.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch (error) {
      return false;
    }
  }

  const COPY_DONE = count => `전체 ${count}건 묶음 복사 완료! 카카오톡에 붙여넣기 하세요`;
  const COPY_FAIL = "복사가 제한되었습니다. '카톡용 묶음 복사'를 한 번 더 누르거나 텍스트를 직접 선택해 주세요.";

  /** 터치 기기(모바일·태블릿)에서만 네이티브 공유 시트를 쓴다. PC는 붙여넣기용 복사로 바로 안내한다. */
  function canNativeShare() {
    if (typeof navigator.share !== "function") return false;
    if ((navigator.maxTouchPoints || 0) > 0) return true;
    return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  }

  function shareBar(rows) {
    const status = Air.el("p", { class: "air-share__status", role: "status", "aria-live": "polite" });
    const empty = rows.length === 0;

    const setStatus = (text, tone) => {
      status.textContent = text;
      status.dataset.tone = tone || "";
    };

    const copyButton = Air.el("button", {
      type: "button",
      class: "air-btn air-btn--ghost",
      id: "air-first-copy",
      text: "카톡용 묶음 복사"
    });

    const shareButton = Air.el("button", {
      type: "button",
      class: "air-btn air-btn--navy",
      id: "air-first-share",
      text: "전체 공유하기"
    });

    copyButton.disabled = empty;
    shareButton.disabled = empty;

    copyButton.addEventListener("click", async () => {
      if (!rows.length) return;
      const ok = await copyText(shareText(rows));
      setStatus(ok ? COPY_DONE(rows.length) : COPY_FAIL, ok ? "ok" : "warn");
    });

    shareButton.addEventListener("click", async () => {
      if (!rows.length) return;

      const text = shareText(rows);

      if (canNativeShare()) {
        try {
          await navigator.share({ title: "대한항공 일등석(F) 좌석 모음", text });
          setStatus("공유 창을 열었습니다. 카카오톡을 선택해 보내세요.", "ok");
          return;
        } catch (error) {
          if (error && error.name === "AbortError") {
            setStatus("공유를 취소했습니다.", "");
            return;
          }
          /* 공유 시트가 실패하면 복사로 대체한다 */
        }
      }

      const ok = await copyText(text);
      setStatus(ok ? COPY_DONE(rows.length) : COPY_FAIL, ok ? "ok" : "warn");
    });

    return Air.el("div", { class: "air-share" }, [
      Air.el("div", { class: "air-share__head" }, [
        Air.el("div", { class: "air-share__text" }, [
          Air.el("strong", { text: "일등석 목록 한 번에 공유" }),
          Air.el("span", {
            text: empty
              ? "공유할 일등석 좌석이 없습니다."
              : `화면에 보이는 ${rows.length}건을 하나의 묶음으로 — 모바일은 공유 시트, PC는 붙여넣기용 복사`
          })
        ]),
        Air.el("div", { class: "air-share__actions" }, [shareButton, copyButton])
      ]),
      status
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
          Air.el("a", {
            class: "flight-card__link",
            href: Air.KE_AWARD_URL,
            target: "_blank",
            rel: "noopener noreferrer",
            text: "공식 조회 ↗"
          })
        ])
      ]),
      Air.el("p", {
        class: "flight-card__observed",
        style: "margin:0;display:flex;align-items:center;justify-content:space-between;gap:8px;" +
          "border-top:1px solid var(--line-2);padding-top:8px;font-size:11.5px;color:var(--ink-3)"
      }, [
        Air.el("span", null, [
          Air.el("b", { text: "최종 조회 " }),
          checked ? `${checked} KST` : "조회 시각 없음"
        ]),
        Air.el("span", { text: "공식 월별 현황 수집" })
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
    root.append(shareBar(rows));

    root.append(Air.el("div", { class: "air-results-head" }, [
      Air.el("h2", { text: "일등석 예약 가능" }),
      Air.el("p", { class: "air-results-summary" }, [
        Air.el("span", null, [Air.el("b", { text: String(rows.length) }), "건"]),
        Air.el("span", { text: DIRECTION_LABEL[state.direction] + (state.airport ? ` · ${Air.airportShort(state.airport)} (${state.airport})` : "") }),
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
