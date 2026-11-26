/* 마일지도 AIR — 데이터 갱신 현황 (/air/status/)
   데이터의 최신성·범위·상태만 보여준다. 비밀값·API 키·운영 로그는 표시하지 않는다. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  function tile(label, value, sub) {
    return Air.el("div", { class: "air-tile" }, [
      Air.el("div", { class: "air-tile__label", text: label }),
      Air.el("div", { class: "air-tile__value", text: value }),
      sub ? Air.el("div", { class: "air-tile__sub", text: sub }) : null
    ]);
  }

  function statusPill(meta) {
    if (!meta.generatedAt) {
      return Air.el("span", { class: "badge badge--unknown", text: "생성 시각 미확인" });
    }

    if (meta.stale) {
      return Air.el("span", { class: "badge badge--stale", text: "오래된 데이터" });
    }

    return Air.el("span", { class: "badge badge--available", text: "최신 상태" });
  }

  async function init() {
    Air.mountChrome();

    const root = $("air-status-view");

    let payload;
    let meta;

    try {
      [payload, meta] = await Promise.all([Air.data({}), Air.manifestMeta()]);
    } catch (error) {
      root.replaceChildren(Air.emptyState(
        "데이터 상태를 확인할 수 없습니다",
        "매니페스트 또는 지역·월별 JSON 을 읽지 못했습니다. 배포와 데이터 경로를 확인해야 합니다."
      ));
      return;
    }

    const rows = payload.rows;
    const stats = payload.stats;

    const byStatus = { available: 0, unavailable: 0, unknown: 0 };
    const byCabin = {};
    const routes = new Set();
    const dates = new Set();

    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      byCabin[row.cabinKey] = (byCabin[row.cabinKey] || 0) + 1;
      routes.add(`${row.origin}-${row.destination}`);
      dates.add(row.date);
    }

    const newVerified = rows.filter(row => row.isNew).length;

    root.replaceChildren();

    /* 상단 요약 */
    root.append(Air.el("div", { class: "air-tiles", style: "margin-bottom:18px" }, [
      tile("마지막 데이터 생성", meta.generatedLabel ? meta.generatedLabel.replace(" KST", "") : "미확인",
        meta.ageLabel ? `${meta.ageLabel} · Asia/Seoul` : "생성 시각 없음"),
      tile("조회된 노선", String(routes.size), "출발·도착 방향 기준"),
      tile("조회된 날짜", String(dates.size), "좌석 상태가 기록된 날짜"),
      tile("기록 수", String(rows.length), `${payload.stats.files.length}개 지역·월 파일`)
    ]));

    root.append(Air.el("div", { class: "air-card", style: "margin-bottom:16px" }, [
      Air.el("div", { style: "display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between" }, [
        Air.el("h2", { style: "font-size:17px", text: "데이터 상태" }),
        statusPill(meta)
      ]),
      Air.el("dl", { class: "air-kv", style: "margin-top:12px" }, [
        Air.el("dt", { text: "데이터 모드" }),
        Air.el("dd", { text: meta.mode === "test"
          ? "테스트(preview) — 실제 자동 수집 결과가 아닌 검증용 데이터"
          : `운영(production) · 대한항공 공식 조회 화면 월별 좌석 현황 · 기준 시각 ${meta.sourceUpdatedLabel || "미표기"}` }),
        Air.el("dt", { text: "스키마 버전" }),
        Air.el("dd", { text: meta.schemaVersion ? `v${meta.schemaVersion}` : "미표기" }),
        Air.el("dt", { text: "스냅샷" }),
        Air.el("dd", { text: meta.snapshot || "미표기" }),
        Air.el("dt", { text: "마지막 성공 시각" }),
        Air.el("dd", { text: meta.lastSuccess || "데이터 파일에서 제공되지 않음" }),
        Air.el("dt", { text: "마지막 실패·오류" }),
        Air.el("dd", { text: meta.lastError || "제공되지 않음" }),
        Air.el("dt", { text: "자동 수집 상태" }),
        Air.el("dd", { text: "대한항공 공식 보너스 좌석 조회 화면에서 노선·월 단위로 직접 조회해 수집합니다. 매일 1회 공지되는 좌석 현황 기준이며, 수집 범위는 위 지역·월 파일과 같습니다." })
      ])
    ]));

    /* 좌석 상태 분포 */
    root.append(Air.el("section", { class: "air-section" }, [
      Air.el("h2", { text: "좌석 상태 분포" }),
      Air.el("div", { class: "air-tiles" }, [
        tile("좌석 있음", String(byStatus.available), "available"),
        tile("좌석 없음", String(byStatus.unavailable), "unavailable · 매진 아님"),
        tile("미조회", String(byStatus.unknown), "unknown · 데이터 없음"),
        tile("확인된 NEW", String(newVerified), "unavailable→available 전환")
      ])
    ]));

    /* 등급별 */
    root.append(Air.el("section", { class: "air-section" }, [
      Air.el("h2", { text: "좌석 등급별 기록" }),
      Air.el("div", { class: "air-table-wrap" }, [
        Air.el("table", { class: "air-table" }, [
          Air.el("thead", null, [
            Air.el("tr", null, [
              Air.el("th", { scope: "col", text: "등급" }),
              Air.el("th", { scope: "col", text: "기록 수" }),
              Air.el("th", { scope: "col", text: "처리" })
            ])
          ]),
          Air.el("tbody", null, Air.CABINS.map(cabin =>
            Air.el("tr", null, [
              Air.el("th", { scope: "row" }, [Air.cabinChip(cabin.key)]),
              Air.el("td", { class: "num", text: String(byCabin[cabin.key] || 0) }),
              Air.el("td", {
                class: "cell-muted",
                text: cabin.combined
                  ? "일등석 보너스/좌석승급 통합"
                  : cabin.key === "business"
                    ? "프레스티지 보너스(P) · 승급 전용 U 제외"
                    : cabin.key === "first"
                      ? "일등석(F) · 공제표 일등석 값 적용"
                      : "일반석 보너스(E)"
              })
            ])
          ))
        ])
      ])
    ]));

    /* 수집 범위 */
    root.append(Air.el("section", { class: "air-section" }, [
      Air.el("h2", { text: "수집 범위(파일 단위)" }),
      Air.el("div", { class: "air-table-wrap" }, [
        Air.el("table", { class: "air-table" }, [
          Air.el("thead", null, [
            Air.el("tr", null, [
              Air.el("th", { scope: "col", text: "수집 구분" }),
              Air.el("th", { scope: "col", text: "탑승월" }),
              Air.el("th", { scope: "col", text: "매니페스트 건수" }),
              Air.el("th", { scope: "col", text: "실제 반영" })
            ])
          ]),
          Air.el("tbody", null, stats.files.map(file => {
            const actual = rows.filter(row => row.month === file.month && row.region === file.region).length;
            return Air.el("tr", null, [
              Air.el("td", { text: `${Air.regionLabel(file.region)} 묶음` }),
              Air.el("td", { class: "num", text: Air.fmtMonth(file.month) }),
              Air.el("td", { class: "num", text: String(file.total) }),
              Air.el("td", {
                class: actual === file.total ? "num" : "num cell-muted",
                text: actual === file.total ? `${actual}건` : `${actual}건 (제외 ${file.total - actual})`
              })
            ]);
          }))
        ])
      ])
    ]));

    /* 제외·주의 */
    root.append(Air.el("section", { class: "air-section" }, [
      Air.el("h2", { text: "제외·검증 필요 항목" }),
      Air.el("div", { class: "air-table-wrap" }, [
        Air.el("table", { class: "air-table" }, [
          Air.el("thead", null, [
            Air.el("tr", null, [
              Air.el("th", { scope: "col", text: "항목" }),
              Air.el("th", { scope: "col", text: "건수" }),
              Air.el("th", { scope: "col", text: "처리 기준" })
            ])
          ]),
          Air.el("tbody", null, [
            Air.el("tr", null, [
              Air.el("td", { text: "대한항공 외 프로그램" }),
              Air.el("td", { class: "num", text: String(stats.excludedProgram) }),
              Air.el("td", { class: "cell-muted", text: "표시·검색에서 제외 (KE 전용)" })
            ]),
            Air.el("tr", null, [
              Air.el("td", { text: "승급 전용 좌석(G·U)" }),
              Air.el("td", { class: "num", text: String(stats.excludedCabin) }),
              Air.el("td", { class: "cell-muted", text: "표시·검색에서 제외" })
            ]),
            Air.el("tr", null, [
              Air.el("td", { text: "형식 오류·fixture 혼입" }),
              Air.el("td", { class: "num", text: String(stats.invalid) }),
              Air.el("td", { class: "cell-muted", text: "표시하지 않음" })
            ]),
            Air.el("tr", null, [
              Air.el("td", { text: "NEW 전환 근거 없음" }),
              Air.el("td", { class: "num", text: String(stats.newUnproven) }),
              Air.el("td", { class: "cell-muted", text: "NEW 로 표시하지 않음" })
            ])
          ])
        ])
      ])
    ]));

    root.append(Air.el("div", { class: "air-notice air-notice--info", style: "margin-top:20px" }, [
      Air.el("span", { class: "air-notice__icon", text: "ℹ" }),
      Air.el("div", null, [
        Air.el("strong", { text: "이 화면은 데이터 상태만 보여줍니다. " }),
        "API 키, 쿠키, 개인정보, 수집 원문 로그는 표시하지 않습니다. 데이터 이상 여부는 이 화면의 제외 건수와 함께 확인하세요."
      ])
    ]));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
