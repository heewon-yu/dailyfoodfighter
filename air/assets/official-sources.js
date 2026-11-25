(() => {
    "use strict";

    const $ = id => document.getElementById(id);

    if ($("official-sources")) return;

    const anchor =
        $("milemap") || $("results");

    if (!anchor) return;

    const section = document.createElement("details");
    section.id = "official-sources";

    const summary = document.createElement("summary");
    summary.textContent = "항공사 공식 좌석·할인 정보";

    section.append(summary);

    const links = [
        [
            "KE_SKYPASS",
            "대한항공 보너스 좌석",
            "https://www.koreanair.com/booking/book-and-manage/award-seat-availability"
        ],
        [
            "KE_SKYPASS",
            "대한항공 보너스 핫픽",
            "https://www.koreanair.com/contents/promotion/list/2026/26winterhotpick"
        ],
        [
            "OZ_ASIANA_CLUB",
            "아시아나 마일리지 좌석",
            "https://flyasiana.com/I/KR/KO/MileageSeatSearch.do"
        ],
        [
            "OZ_ASIANA_CLUB",
            "아시아나 마일리지 나우",
            "https://flyasiana.com/C/KR/KO/contents/mileage-tickets?tabId=mileagenow"
        ]
    ];

    const grid = document.createElement("div");
    grid.className = "official-source-grid";

    for (const [program, label, url] of links) {

        const a = document.createElement("a");

        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.dataset.program = program;
        a.textContent = label;

        grid.append(a);
    }

    const note = document.createElement("p");

    note.textContent =
        "현재 마일지도는 테스트 운영 중입니다. " +
        "실제 좌석과 할인 조건은 항공사에서 확인하세요.";

    section.append(grid, note);
    anchor.after(section);

    function refresh() {

        const program = $("program")?.value || "";

        for (const a of grid.children) {
            a.hidden = Boolean(
                program &&
                !["all", "ALL", "*"].includes(program) &&
                a.dataset.program !== program
            );
        }
    }

    $("program")?.addEventListener("change", refresh);
    $("search")?.addEventListener("click", refresh);

    refresh();

    console.log("OFFICIAL SOURCES: CONNECTED");
})();
