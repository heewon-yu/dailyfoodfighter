/* 마일지도 AIR — 공제량 안내 (/air/mileage/)
   검증된 공식 공제표가 있을 때만 수치를 표시한다. 추정치·미검증 값은 '검증 전'으로 표시. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  function priceRange(rows) {
    const values = [];

    for (const row of rows) {
      const price = Air.priceOf(row);
      if (price.kind !== "verified") continue;
      values.push(price.discounted || price.standard);
    }

    if (!values.length) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);

    return min === max ? Air.fmtMiles(min) : `${Air.fmtMiles(min)} ~ ${Air.fmtMiles(max)}`;
  }

  async function init() {
    Air.mountChrome();

    const root = $("air-mileage-view");

    let rows = [];

    try {
      const payload = await Air.data({});
      rows = payload.rows;
    } catch {
      rows = [];
    }

    const verifiedRows = rows.filter(row => Air.priceOf(row).kind === "verified");
    const estimateRows = rows.filter(row => Air.priceOf(row).kind === "estimate");

    const statusBox = $("air-mileage-status");

    statusBox.replaceChildren();

    if (!verifiedRows.length) {
      statusBox.append(Air.el("div", { class: "air-notice air-notice--info" }, [
        Air.el("span", { class: "air-notice__icon", text: "ℹ" }),
        Air.el("div", null, [
          Air.el("strong", { text: "검증된 공제표가 아직 없습니다. " }),
          "마일지도는 대한항공 공식 공제표와 적용 기간·방향을 확인한 뒤에만 공제량 수치를 표시합니다. ",
          `현재 데이터 ${rows.length}건 중 검증된 공제량 0건, 추정치 ${estimateRows.length}건이며, `,
          "검색 결과에는 수치 대신 '공제량 미확인'으로 표시됩니다."
        ])
      ]));
    } else {
      statusBox.append(Air.el("div", { class: "air-notice" }, [
        Air.el("span", { class: "air-notice__icon", text: "✓" }),
        Air.el("div", null, [
          Air.el("strong", { text: `검증된 공제량 ${verifiedRows.length}건. ` }),
          "검증된 공식 표 기준으로 표시하며, 세금·유류할증료는 별도입니다."
        ])
      ]));
    }

    /* 지역·등급별 검증 현황 */
    const regions = [...new Set(rows.map(row => row.region || "").filter(Boolean))].sort();

    const table = Air.el("table", { class: "air-table" }, [
      Air.el("thead", null, [
        Air.el("tr", null, [
          Air.el("th", { scope: "col", text: "지역" }),
          ...Air.CABINS.map(cabin => Air.el("th", { scope: "col" }, [
            Air.el("span", { class: `cabin-chip ${cabin.cls}` }, [
              Air.el("span", { text: cabin.letter }),
              Air.el("span", { text: cabin.short })
            ])
          ]))
        ])
      ]),
      Air.el("tbody", null, regions.map(region =>
        Air.el("tr", null, [
          Air.el("th", { scope: "row", text: Air.regionLabel(region) }),
          ...Air.CABINS.map(cabin => {
            const cellRows = rows.filter(row => (row.region || "") === region && row.cabinKey === cabin.key);
            const range = priceRange(cellRows);

            if (cabin.combined) {
              return Air.el("td", { class: "cell-muted", text: "구분 불가" });
            }

            if (!range) {
              return Air.el("td", {
                class: "cell-muted",
                text: cellRows.length ? "검증 전" : "기록 없음"
              });
            }

            return Air.el("td", { class: "num", text: range });
          })
        ])
      ))
    ]);

    $("air-mileage-table").replaceChildren(
      regions.length ? Air.el("div", { class: "air-table-wrap" }, [table]) :
        Air.emptyState("표시할 지역 데이터가 없습니다", "데이터 수집 후 지역별 공제표가 표시됩니다.")
    );

    $("air-mileage-count").textContent =
      `조회 기록 ${rows.length}건 · 지역 ${regions.length}개 · 검증된 공제량 ${verifiedRows.length}건`;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
