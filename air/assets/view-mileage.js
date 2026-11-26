/* 마일지도 AIR — 공제표 안내 (/air/mileage/)
   대한항공 공식 보너스 공제표(권역·등급별 평수기/성수기)와
   2026~2027 성수기 날짜를 편도·왕복으로 나눠 한 화면에 보여준다. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

  function fmtRange(range) {
    const [start, end] = String(range).split("~");
    const fmt = value => {
      const [month, day] = String(value).split("-");
      return `${Number(month)}/${Number(day)}`;
    };
    if (!start) return "";
    if (!end || end === start) return fmt(start);
    return `${fmt(start)}~${fmt(end)}`;
  }

  function fmtMiles(value) {
    return Number.isInteger(value) ? new Intl.NumberFormat("ko-KR").format(value) : "—";
  }

  /* ------------------------------------------------------ 권역별 공제표 */

  function cabinTable(regionRows, cabin) {
    const head = Air.el("thead", null, [
      Air.el("tr", null, [
        Air.el("th", { scope: "col", text: "권역" }),
        Air.el("th", { scope: "col", class: "num", text: "평수기 편도" }),
        Air.el("th", { scope: "col", class: "num", text: "성수기 편도" }),
        Air.el("th", { scope: "col", class: "num", text: "평수기 왕복" }),
        Air.el("th", { scope: "col", class: "num", text: "성수기 왕복" })
      ])
    ]);

    const body = Air.el("tbody", null, regionRows.map(region => {
      const values = region.miles[cabin.letter];
      const all = [...new Set(region.destinations || [])]
        .map(code => Air.airport(code))
        .filter(Boolean);

      const destinations = all.slice(0, 4).map(entry => entry.name);
      const count = all.length;

      return Air.el("tr", null, [
        Air.el("th", { scope: "row" }, [
          Air.el("div", { class: "chart-region", text: region.label }),
          Air.el("small", { class: "chart-region__dest", text:
            count > 4 ? `${destinations.join(" · ")} 외 ${count - 4}곳` : destinations.join(" · ") })
        ]),
        Air.el("td", { class: "num", text: fmtMiles(values[0]) }),
        Air.el("td", { class: "num", text: fmtMiles(values[1]) }),
        Air.el("td", { class: "num", text: fmtMiles(values[0] * 2) }),
        Air.el("td", { class: "num", text: fmtMiles(values[1] * 2) })
      ]);
    }));

    return Air.el("div", { class: "air-table-wrap chart-table" }, [
      Air.el("table", { class: "air-table" }, [head, body])
    ]);
  }

  function chartSection() {
    const regions = Air.award ? Air.award.regionTable() : [];
    const pending = Air.award ? Air.award.pendingRoutes() : [];

    const root = Air.el("div");

    root.append(Air.el("div", { class: "air-notice air-notice--info", style: "margin-bottom:16px" }, [
      Air.el("span", { class: "air-notice__icon", text: "ℹ" }),
      Air.el("div", null, [
        Air.el("strong", { text: "대한항공 공식 보너스 공제표를 그대로 옮겼습니다. " }),
        "모든 값은 마일 단위이며, 왕복은 편도 공제 마일의 2배로 계산합니다. 세금·유류할증료는 별도입니다. ",
        "일반석·프레스티지석·일등석만 표시합니다."
      ])
    ]));

    for (const cabin of Air.CABINS) {
      root.append(Air.el("section", { class: "air-section chart-block" }, [
        Air.el("div", { class: "chart-block__head" }, [
          Air.el("h2", null, [Air.cabinChip(cabin.key), Air.el("span", { text: cabin.name })]),
          Air.el("span", { class: "air-count", text: "대한항공 SKYPASS · 국제선" })
        ]),
        cabinTable(regions, cabin)
      ]));
    }

    if (pending.length) {
      root.append(Air.el("p", { class: "air-map-note", text:
        `· ${pending.map(item => `${item.name}(${item.code})`).join(", ")} 노선은 대한항공 공식 공제표에 구간 값이 아직 표기되어 있지 않아 표에서 제외했습니다.` }));
    }

    const notes = Air.el("div", { class: "air-prose", style: "margin-top:10px" }, [
      Air.el("ul", null, [
        Air.el("li", { text: "유럽과 중동은 대한항공 공제 구간이 같아 한 줄로 묶었습니다." }),
        Air.el("li", { text: "북미·대양주는 같은 공제 구간 값을 적용합니다." }),
        Air.el("li", { text: "성수기·평수기 구분은 대한항공 공식 성수기 기간표를 기준으로 탑승일로 판별합니다." }),
        Air.el("li", { text: "노선별 정확한 금액은 검색·달력·노선 화면에서 날짜를 고르면 자동 계산됩니다." })
      ])
    ]);

    root.append(notes);

    return root;
  }

  /* --------------------------------------------------------- 성수기 표 */

  function periodCell(year, month, periods) {
    const yearTable = periods[year];
    if (!yearTable) return Air.el("td", { class: "peak-cell cell-muted", text: "—" });

    const ranges = yearTable[String(month)] || [];
    if (!ranges.length) return Air.el("td", { class: "cell-muted", text: "성수기 없음" });

    return Air.el("td", { class: "peak-cell" }, ranges.map(range =>
      Air.el("span", { class: "peak-range", text: fmtRange(range) })
    ));
  }

  function peakTable(key, title, description) {
    const periods = Air.award ? Air.award.peakPeriodsAll()[key] || {} : {};
    const years = Object.keys(periods).sort();

    const head = Air.el("thead", null, [
      Air.el("tr", null, [
        Air.el("th", { scope: "col", text: "월" }),
        ...years.map(year => Air.el("th", { scope: "col", text: `${year}년` }))
      ])
    ]);

    const body = Air.el("tbody", null, MONTHS.map(month =>
      Air.el("tr", null, [
        Air.el("th", { scope: "row", text: `${month}월` }),
        ...years.map(year => periodCell(year, month, periods))
      ])
    ));

    return Air.el("section", { class: "air-section" }, [
      Air.el("h2", { text: title }),
      description ? Air.el("p", { class: "air-inline-note", style: "margin-bottom:8px", text: description }) : null,
      Air.el("div", { class: "air-table-wrap chart-table" }, [
        Air.el("table", { class: "air-table air-table--peak" }, [head, body])
      ])
    ]);
  }

  /* ------------------------------------------------------------- 등급 안내 */

  function cabinGuide() {
    const rows = [
      { key: "economy", desc: "일반석 보너스", note: "검색·공제 계산 대상" },
      { key: "business", desc: "프레스티지석(비즈니스) 보너스", note: "검색·공제 계산 대상" },
      { key: "first", desc: "일등석 보너스", note: "검색·공제 계산 대상 · 일등석 표식은 보너스/좌석승급이 통합되어 있을 수 있습니다" }
    ];

    return Air.el("div", { class: "air-table-wrap" }, [
      Air.el("table", { class: "air-table" }, [
        Air.el("thead", null, [
          Air.el("tr", null, [
            Air.el("th", { scope: "col", text: "등급" }),
            Air.el("th", { scope: "col", text: "구분" }),
            Air.el("th", { scope: "col", text: "마일지도 처리" })
          ])
        ]),
        Air.el("tbody", null, rows.map(row => Air.el("tr", null, [
          Air.el("th", { scope: "row" }, [Air.cabinChip(row.key)]),
          Air.el("td", { text: row.desc }),
          Air.el("td", { text: row.note })
        ])))
      ])
    ]);
  }

  /* ---------------------------------------------------------------- init */

  async function init() {
    Air.mountChrome();

    try {
      await Air.award.load();
      await Air.airports();
    } catch (error) {
      console.warn("AIR: award data unavailable", error);
    }

    const statusBox = $("air-mileage-status");
    statusBox.replaceChildren(Air.el("div", { class: "air-notice" }, [
      Air.el("span", { class: "air-notice__icon", text: "✓" }),
      Air.el("div", null, [
        Air.el("strong", { text: "공식 공제표 · 2026~2027 성수기 기간 반영. " }),
        "검색·달력·노선·신규 좌석 화면의 모든 공제 마일이 이 표를 기준으로 자동 계산됩니다."
      ])
    ]));

    $("air-mileage-chart").replaceChildren(chartSection());

    const tables = $("air-mileage-peak");
    tables.replaceChildren(
      peakTable(
        "국제선_미주출발외",
        "2026~2027 성수기 — 국제선(미주 출발 제외)",
        "대한민국 출발·도착 여정은 각 구간 탑승일 기준으로 성수기를 적용합니다. 표에 없는 달은 성수기가 없는 평수기입니다."
      ),
      peakTable(
        "국제선_미주출발",
        "2026~2027 성수기 — 국제선(미주 출발)",
        "미주 지역에서 출발하는 구간(예: 뉴욕→인천)은 이 표의 성수기 기간을 적용합니다."
      )
    );

    if (Air.award) {
      const rule = Air.award.peakRule();
      const note = Air.award.peakNote();
      $("air-mileage-rule").textContent = [rule, note].filter(Boolean).join(" ");
    }

    $("air-mileage-cabin-guide").replaceChildren(cabinGuide());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
