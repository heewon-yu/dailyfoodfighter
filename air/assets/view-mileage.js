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
    const rows = regionRows.map(region => {
      const values = region.miles[cabin.letter];
      const all = [...new Set(region.destinations || [])]
        .map(code => Air.airport(code))
        .filter(Boolean);

      return {
        label: region.label,
        destinations: all.slice(0, 3).map(entry => entry.name).join(" · ") +
          (all.length > 3 ? ` 외 ${all.length - 3}곳` : ""),
        offpeakOne: values[0],
        peakOne: values[1],
        offpeakRound: values[0] * 2,
        peakRound: values[1] * 2
      };
    });

    const head = Air.el("thead", null, [
      Air.el("tr", null, [
        Air.el("th", { scope: "col", rowspan: "2", class: "chart-th-region", text: "권역" }),
        Air.el("th", { scope: "colgroup", colspan: "2", class: "chart-th-group", text: "평수기" }),
        Air.el("th", { scope: "colgroup", colspan: "2", class: "chart-th-group is-peak", text: "성수기" })
      ]),
      Air.el("tr", null, [
        Air.el("th", { scope: "col", class: "num", text: "편도" }),
        Air.el("th", { scope: "col", class: "num", text: "왕복" }),
        Air.el("th", { scope: "col", class: "num", text: "편도" }),
        Air.el("th", { scope: "col", class: "num", text: "왕복" })
      ])
    ]);

    const body = Air.el("tbody", null, rows.map(row =>
      Air.el("tr", null, [
        Air.el("th", { scope: "row", class: "chart-cell-region" }, [
          Air.el("span", { class: "chart-region", text: row.label }),
          Air.el("small", { class: "chart-region__dest", text: row.destinations })
        ]),
        Air.el("td", { class: "num", text: fmtMiles(row.offpeakOne) }),
        Air.el("td", { class: "num", text: fmtMiles(row.offpeakRound) }),
        Air.el("td", { class: "num is-peak", text: fmtMiles(row.peakOne) }),
        Air.el("td", { class: "num is-peak", text: fmtMiles(row.peakRound) })
      ])
    ));

    const cards = Air.el("div", { class: "chart-cards" }, rows.map(row =>
      Air.el("article", { class: "chart-card" }, [
        Air.el("div", { class: "chart-card__head" }, [
          Air.el("strong", { text: row.label }),
          Air.el("small", { text: row.destinations })
        ]),
        Air.el("div", { class: "chart-card__grid" }, [
          Air.el("div", { class: "chart-card__cell" }, [
            Air.el("span", { text: "평수기 편도" }),
            Air.el("b", { text: fmtMiles(row.offpeakOne) })
          ]),
          Air.el("div", { class: "chart-card__cell" }, [
            Air.el("span", { text: "평수기 왕복" }),
            Air.el("b", { text: fmtMiles(row.offpeakRound) })
          ]),
          Air.el("div", { class: "chart-card__cell is-peak" }, [
            Air.el("span", { text: "성수기 편도" }),
            Air.el("b", { text: fmtMiles(row.peakOne) })
          ]),
          Air.el("div", { class: "chart-card__cell is-peak" }, [
            Air.el("span", { text: "성수기 왕복" }),
            Air.el("b", { text: fmtMiles(row.peakRound) })
          ])
        ])
      ])
    ));

    return Air.el("div", { class: "chart-compact" }, [
      Air.el("div", { class: "air-table-wrap chart-table chart-table--compact" }, [
        Air.el("table", { class: "air-table air-table--chart" }, [head, body])
      ]),
      cards
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
          Air.el("span", { class: "air-count", text: "대한항공 SKYPASS · 국제선 · 단위 마일" })
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

  /* ------------------------------------------------------ 보너스 핫픽 */

  function hotpickRegionCount(region, cabinKey) {
    const cabin = (region.cabins || []).find(item => item.cabin === cabinKey);
    return cabin ? (cabin.routes || []).length : 0;
  }

  function hotpickSummary(meta) {
    const rows = Air.award ? Air.award.hotpickRegions() : [];

    const head = Air.el("thead", null, [
      Air.el("tr", null, [
        Air.el("th", { scope: "col", class: "chart-th-region", text: "권역" }),
        Air.el("th", { scope: "col", class: "num", text: "할인 편도" }),
        Air.el("th", { scope: "col", class: "num", text: "할인 왕복" }),
        Air.el("th", { scope: "col", class: "num", text: "일반석 대상" }),
        Air.el("th", { scope: "col", class: "num", text: "프레스티지 대상" })
      ])
    ]);

    const body = Air.el("tbody", null, rows.map(region => {
      const economy = hotpickRegionCount(region, "economy");
      const business = hotpickRegionCount(region, "business");

      return Air.el("tr", null, [
        Air.el("th", { scope: "row", class: "chart-cell-region" }, [
          Air.el("span", { class: "chart-region", text: region.label })
        ]),
        Air.el("td", { class: "num", text: fmtMiles(region.discount.oneway) }),
        Air.el("td", { class: "num", text: fmtMiles(region.discount.round) }),
        Air.el("td", { class: "num", text: economy ? `${economy}개 노선` : "—" }),
        Air.el("td", { class: "num", text: business ? `${business}개 노선` : "—" })
      ]);
    }));

    return Air.el("div", { class: "chart-compact" }, [
      Air.el("div", { class: "air-table-wrap chart-table chart-table--compact" }, [
        Air.el("table", { class: "air-table air-table--chart" }, [head, body])
      ]),
      Air.el("div", { class: "chart-cards" }, rows.map(region => {
        const economy = hotpickRegionCount(region, "economy");
        const business = hotpickRegionCount(region, "business");

        return Air.el("article", { class: "chart-card" }, [
          Air.el("div", { class: "chart-card__head" }, [
            Air.el("strong", { text: region.label }),
            Air.el("small", { text:
              `일반석 ${economy || 0}개 노선 · 프레스티지석 ${business ? business + "개 노선" : "없음"}` })
          ]),
          Air.el("div", { class: "chart-card__grid" }, [
            Air.el("div", { class: "chart-card__cell" }, [
              Air.el("span", { text: "편도 할인" }),
              Air.el("b", { text: `-${fmtMiles(region.discount.oneway)}` })
            ]),
            Air.el("div", { class: "chart-card__cell" }, [
              Air.el("span", { text: "왕복 할인" }),
              Air.el("b", { text: `-${fmtMiles(region.discount.round)}` })
            ])
          ])
        ]);
      }))
    ]);
  }

  function milesPair(route, key) {
    const base = route.base_miles;
    const discounted = route.discounted_miles;
    if (!base || !discounted) return null;
    return { base: base[key], discounted: discounted[key] };
  }

  function pairCell(route, key) {
    const pair = milesPair(route, key);
    if (!pair) return Air.el("td", { class: "num cell-muted", text: "공제표 확인 중" });

    return Air.el("td", { class: "num" }, [
      Air.el("span", { class: "hotpick-base", text: fmtMiles(pair.base) }),
      Air.el("span", { class: "hotpick-arrow", text: "→" }),
      Air.el("b", { class: "hotpick-deal", text: fmtMiles(pair.discounted) })
    ]);
  }

  function routeTable(routes) {
    const head = Air.el("thead", null, [
      Air.el("tr", null, [
        Air.el("th", { scope: "col", text: "구간" }),
        Air.el("th", { scope: "col", text: "대상 편명" }),
        Air.el("th", { scope: "col", text: "출발 기간" }),
        Air.el("th", { scope: "col", class: "num", text: "평수기 편도" }),
        Air.el("th", { scope: "col", class: "num", text: "성수기 편도" })
      ])
    ]);

    const body = Air.el("tbody", null, routes.map(route =>
      Air.el("tr", null, [
        Air.el("th", { scope: "row", text: route.label }),
        Air.el("td", { text: route.all_flights ? "전편" : route.flights.join(", ") }),
        Air.el("td", { text: route.period.label }),
        pairCell(route, "offpeak"),
        pairCell(route, "peak")
      ])
    ));

    return Air.el("div", { class: "air-table-wrap chart-table chart-table--compact" }, [
      Air.el("table", { class: "air-table air-table--chart hotpick-table" }, [head, body])
    ]);
  }

  function routeCards(routes) {
    return Air.el("div", { class: "chart-cards" }, routes.map(route => {
      const offpeak = milesPair(route, "offpeak");
      const peak = milesPair(route, "peak");

      return Air.el("article", { class: "chart-card" }, [
        Air.el("div", { class: "chart-card__head" }, [
          Air.el("strong", { text: route.label }),
          Air.el("small", { text: `${route.all_flights ? "전편" : route.flights.join(", ")} · 출발 ${route.period.label}` })
        ]),
        Air.el("div", { class: "chart-card__grid" }, [
          Air.el("div", { class: "chart-card__cell" }, [
            Air.el("span", { text: "평수기 편도" }),
            offpeak
              ? Air.el("b", null, [
                  Air.el("span", { class: "hotpick-base", text: fmtMiles(offpeak.base) }),
                  " → ",
                  Air.el("span", { class: "hotpick-deal", text: fmtMiles(offpeak.discounted) })
                ])
              : Air.el("b", { text: "확인 중" })
          ]),
          Air.el("div", { class: "chart-card__cell is-peak" }, [
            Air.el("span", { text: "성수기 편도" }),
            peak
              ? Air.el("b", null, [
                  Air.el("span", { class: "hotpick-base", text: fmtMiles(peak.base) }),
                  " → ",
                  Air.el("span", { class: "hotpick-deal", text: fmtMiles(peak.discounted) })
                ])
              : Air.el("b", { text: "확인 중" })
          ])
        ])
      ]);
    }));
  }

  function hotpickSection() {
    const award = Air.award;
    if (!award || typeof award.hotpickMeta !== "function") return null;

    const meta = award.hotpickMeta();
    const regions = award.hotpickRegions();
    if (!regions.length) return null;

    const purchase = meta.purchase ? meta.purchase.label : "";
    const window = meta.window ? meta.window.label : "";
    const excluded = meta.window && Array.isArray(meta.window.excluded)
      ? meta.window.excluded.map(item => item.label).join(", ") : "";

    const root = Air.el("section", { class: "air-section chart-block" });

    root.append(Air.el("div", { class: "chart-block__head" }, [
      Air.el("h2", null, [
        Air.el("span", { class: "badge badge--hotpick", text: "HOTPICK" }),
        Air.el("span", { text: "보너스 핫픽 — 마일리지 할인" })
      ]),
      Air.el("span", { class: "air-count", text: "대한항공 공식 · 단위 마일" })
    ]));

    root.append(Air.el("div", { class: "air-notice air-notice--hotpick" }, [
      Air.el("span", { class: "air-notice__icon", text: "%" }),
      Air.el("div", null, [
        Air.el("strong", { text: "보너스 항공권을 신규 구매할 때 마일리지가 할인되는 노선입니다. " }),
        `구매 기간 ${purchase}. 공식 출발 기간은 ${window}. 노선별 출발 기간은 그보다 짧을 수 있습니다. `,
        "아래 ‘핫픽 적용’ 값은 공식 공제표 금액에서 지역별 할인 마일을 뺀 편도 공제량입니다."
      ])
    ]));

    root.append(Air.el("div", { class: "hotpick-kv" }, [
      Air.el("div", { class: "hotpick-kv__cell" }, [
        Air.el("span", { text: "구매 기간" }),
        Air.el("b", { text: purchase })
      ]),
      Air.el("div", { class: "hotpick-kv__cell" }, [
        Air.el("span", { text: "출발 기간(공통)" }),
        Air.el("b", { text: window })
      ]),
      Air.el("div", { class: "hotpick-kv__cell" }, [
        Air.el("span", { text: "출발 제외 기간" }),
        Air.el("b", { text: excluded || "—" })
      ]),
      Air.el("div", { class: "hotpick-kv__cell" }, [
        Air.el("span", { text: "적용 등급" }),
        Air.el("b", { text: "일반석(X) · 프레스티지석(O)" })
      ])
    ]));

    root.append(hotpickSummary(meta));

    for (const [index, region] of regions.entries()) {
      const block = Air.el("details", { class: "hotpick-region", open: index === 0 ? "" : null });

      block.append(Air.el("summary", null, [
        Air.el("strong", { text: region.label }),
        Air.el("span", { class: "hotpick-region__discount", text:
          `편도 -${fmtMiles(region.discount.oneway)} · 왕복 -${fmtMiles(region.discount.round)}` })
      ]));

      for (const cabin of region.cabins || []) {
        if (!cabin.routes || !cabin.routes.length) continue;
        const cabinKey = cabin.cabin;
        const meta2 = Air.CABIN_BY_KEY.get(cabinKey);

        block.append(Air.el("div", { class: "hotpick-cabin" }, [
          Air.el("div", { class: "hotpick-cabin__head" }, [
            meta2 ? Air.cabinChip(cabinKey) : Air.el("span", { text: cabin.cabin }),
            Air.el("small", { text: `예약 등급 ${cabin.booking_class} · ${cabin.routes.length}개 노선` })
          ]),
          routeTable(cabin.routes),
          routeCards(cabin.routes)
        ]));
      }

      root.append(block);
    }

    const domestic = meta.domestic;
    const notes = Air.el("div", { class: "air-prose", style: "margin-top:12px" }, [
      Air.el("h3", { text: "주의사항" }),
      Air.el("ul", null, (meta.notes || []).map(note => Air.el("li", { text: note }))),
      domestic
        ? Air.el("li", { text:
            `국내선 탭에도 핫픽이 있습니다(편도 ${fmtMiles(domestic.discount.oneway)} · 왕복 ${fmtMiles(domestic.discount.round)}마일, 요일·시간 조건). 마일지도는 국제선만 다루므로 이 표에서는 빼 두었습니다.` })
        : null
    ]);

    root.append(notes);

    return root;
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
        Air.el("strong", { text: "공식 공제표 · 2026~2027 성수기 · 보너스 핫픽 반영. " }),
        "검색·달력·노선·신규 좌석 화면의 모든 공제 마일이 이 표를 기준으로 자동 계산됩니다."
      ])
    ]));

    $("air-mileage-chart").replaceChildren(chartSection());

    const hotpickSlot = $("air-mileage-hotpick");
    const hotpick = hotpickSection();
    if (hotpickSlot && hotpick) hotpickSlot.replaceChildren(hotpick);

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
