(() => {
    "use strict";

    const $ = id => document.getElementById(id);
    const results = $("results");
    const search = $("search");

    if (!results || !search || $("award-tabs")) return;

    const tabs = document.createElement("div");
    tabs.id = "award-tabs";

    const modes = [
        ["all", "전체 항공권"],
        ["discount", "할인 항공권"],
        ["new", "신규 좌석"]
    ];

    let mode = "all";
    let generation = 0;

    const buttons = new Map();

    for (const [key, label] of modes) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.setAttribute(
            "aria-pressed", String(key === mode)
        );

        button.addEventListener("click", () => {
            mode = key;

            for (const [k, b] of buttons) {
                b.setAttribute(
                    "aria-pressed", String(k === mode)
                );
            }

            render();
        });

        buttons.set(key, button);
        tabs.append(button);
    }

    const panel = document.createElement("section");
    panel.id = "award-enhanced-results";
    panel.hidden = true;

    const anchor =
        $("milemap") ||
        $("award-calendar") ||
        results;

    anchor.before(tabs);
    results.before(panel);

    const airlines = {
        KE_SKYPASS: "대한항공",
        OZ_ASIANA_CLUB: "아시아나"
    };

    const cabins = {
        economy: "일반석",
        premium: "프리미엄석",
        business: "비즈니스석"
    };

    const official = {
        KE_SKYPASS:
            "https://www.koreanair.com/booking/book-and-manage/award-seat-availability",
        OZ_ASIANA_CLUB:
            "https://flyasiana.com/I/KR/KO/MileageSeatSearch.do"
    };

    const value = id => $(id)?.value || "";

    const match = (selected, actual) =>
        !selected ||
        ["all", "ALL", "*"].includes(selected) ||
        selected === actual;

    const validMiles = n =>
        Number.isInteger(n) && n > 0;

    function discounted(row) {
        const p = row.pricing;

        return p &&
            p.status === "promotion_estimate" &&
            validMiles(p.standard_miles) &&
            validMiles(p.discounted_miles) &&
            p.discounted_miles < p.standard_miles;
    }

    function element(tag, text, cls) {
        const node = document.createElement(tag);
        node.textContent = text;

        if (cls) node.className = cls;

        return node;
    }

    function priceText(row) {
        const p = row.pricing;

        const box = document.createElement("div");
        box.className = "award-price";

        if (discounted(row)) {
            box.append(
                element("s",
                    p.standard_miles.toLocaleString("ko-KR")
                    + " 마일"
                ),
                element("strong",
                    p.discounted_miles.toLocaleString("ko-KR")
                    + " 마일"
                ),
                element("small",
                    (p.standard_miles - p.discounted_miles)
                        .toLocaleString("ko-KR")
                    + " 마일 절약",
                    "award-saving"
                )
            );
        } else if (
            p &&
            p.status === "standard_estimate" &&
            validMiles(p.standard_miles)
        ) {
            box.append(element(
                "strong",
                p.standard_miles.toLocaleString("ko-KR")
                + " 마일"
            ));
        } else {
            box.append(element(
                "small",
                "공제 마일리지 미확인"
            ));
        }

        return box;
    }

    function card(row) {
        const article = document.createElement("article");
        article.className = "award-result-card";

        article.append(element(
            "small",
            (airlines[row.program] || row.program)
            + " · " +
            (cabins[row.cabin] || row.cabin)
        ));

        article.append(element(
            "h3",
            row.origin + " → " + row.destination
        ));

        article.append(element(
            "p", row.departure_date
        ));

        if (row.newly_available === true) {
            article.append(element(
                "span", "NEW", "award-new"
            ));
        }

        if (discounted(row)) {
            article.append(element(
                "span",
                row.program === "KE_SKYPASS"
                    ? "할인 항공권 · 대한항공"
                    : "할인 항공권 · 아시아나",
                "award-saving"
            ));
        }

        article.append(priceText(row));

        if (official[row.program]) {
            const link = document.createElement("a");
            link.href = official[row.program];
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "항공사에서 확인";
            article.append(link);
        }

        return article;
    }

    async function render() {
        const current = ++generation;

        const round =
            $("trip-round")?.getAttribute(
                "aria-pressed"
            ) === "true";

        const calendarActive =
            $("calendar-view")?.getAttribute(
                "aria-pressed"
            ) === "true";

        const pagination = $("pagination");

        if (pagination) {
            pagination.hidden =
                round || calendarActive || mode !== "all";
        }

        if (round || mode === "all" || calendarActive) {
            panel.hidden = true;
            results.classList.remove(
                "award-filter-hidden"
            );
            return;
        }

        panel.hidden = false;

        results.classList.add(
            "award-filter-hidden"
        );

        panel.textContent = "검색 중";

        try {
            const data = await window.AirData.load();

            if (current !== generation) return;

            const rows = data.items.filter(row =>
                row.test_data === 1 &&
                row.status === "available" &&
                match(value("origin"), row.origin) &&
                match(value("destination"), row.destination) &&
                match(value("program"), row.program) &&
                match(value("cabin"), row.cabin) &&
                match(value("month"),
                    row.departure_date.slice(0, 7)
                ) &&
                (
                    mode === "discount"
                        ? discounted(row)
                        : row.newly_available === true
                )
            );

            rows.sort((a, b) =>
                a.departure_date.localeCompare(
                    b.departure_date
                )
            );

            panel.replaceChildren();

            panel.append(element(
                "p",
                "테스트 검색 결과 " + rows.length + "건"
            ));

            if (!rows.length) {
                panel.append(element(
                    "p",
                    mode === "discount"
                        ? "확인된 할인 항공권 정보가 없습니다."
                        : "확인된 신규 좌석 정보가 없습니다."
                ));
            }

            const grid = document.createElement("div");
            grid.className = "award-result-grid";

            for (const row of rows.slice(0, 100)) {
                grid.append(card(row));
            }

            panel.append(grid);

            if (rows.length > 100) {
                panel.append(element(
                    "p",
                    "최대 100건 표시 · 검색 조건을 좁혀주세요."
                ));
            }

        } catch {
            if (current === generation) {
                panel.textContent =
                    "항공권 정보를 불러오지 못했습니다.";
            }
        }
    }

    function resetMode() {
        mode = "all";

        for (const [key, button] of buttons) {
            button.setAttribute(
                "aria-pressed",
                String(key === "all")
            );
        }

        tabs.hidden =
            $("trip-round")?.getAttribute(
                "aria-pressed"
            ) === "true";

        render();
    }

    $("trip-one")?.addEventListener(
        "click", resetMode
    );

    $("trip-round")?.addEventListener(
        "click", resetMode
    );

    search.addEventListener("click", render);

    for (const id of [
        "origin", "destination",
        "program", "cabin", "month"
    ]) {
        $(id)?.addEventListener("change", render);
    }

    document.addEventListener(
        "air-view-change", () => queueMicrotask(render)
    );

    // FINAL_FILTER_SYNC_V1
    console.log("AWARD FILTER PANEL SYNC: READY");
})();
