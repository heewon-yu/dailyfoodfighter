(() => {
    "use strict";

    const $ = id => document.getElementById(id);

    const valid = n =>
        Number.isInteger(n) && n > 0;

    const format = n =>
        n.toLocaleString("ko-KR") + " 마일";

    const cabins = {
        "일반석": "economy",
        "프리미엄석": "premium",
        "비즈니스석": "business",
        "프레스티지석": "business"
    };

    let records = [];

    function make(tag, text, cls) {
        const e = document.createElement(tag);
        e.textContent = text;
        if (cls) e.className = cls;
        return e;
    }

    function findRecord(text, reverse = false) {

        const date = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];

        if (!date) return null;

        const origin = reverse
            ? $("destination")?.value
            : $("origin")?.value;

        const destination = reverse
            ? $("origin")?.value
            : $("destination")?.value;

        const program = $("program")?.value;

        const cabin = reverse
            ? $("return-cabin")?.value
            : $("cabin")?.value;

        const candidates = records.filter(r => {

            if (r.status !== "available") return false;
            if (r.departure_date !== date) return false;

            const match = (selected, actual) =>
                !selected ||
                ["all", "ALL", "*"].includes(selected) ||
                selected === actual;

            if (!match(program, r.program)) return false;
            if (!match(origin, r.origin)) return false;
            if (!match(destination, r.destination)) return false;
            if (!match(cabin, r.cabin)) return false;

            if (text.includes("대한항공") &&
                r.program !== "KE_SKYPASS") return false;

            if (text.includes("아시아나") &&
                r.program !== "OZ_ASIANA_CLUB") return false;

            const route = text.match(
                /\b([A-Z]{3})\s*(?:→|–|-)\s*([A-Z]{3})\b/
            );

            if (route &&
                (r.origin !== route[1] ||
                 r.destination !== route[2])) return false;

            const detected = Object.entries(cabins)
                .sort((a,b) => b[0].length - a[0].length)
                .find(([label]) => text.includes(label));

            if (detected &&
                r.cabin !== detected[1]) return false;

            return true;
        });

        return candidates.length === 1
            ? candidates[0]
            : null;
    }

    function mileage(row) {

        const p = row?.pricing;

        if (!p) return null;

        if (
            p.status === "promotion_estimate" &&
            valid(p.standard_miles) &&
            valid(p.discounted_miles) &&
            p.discounted_miles < p.standard_miles
        ) return p.discounted_miles;

        if (
            p.status === "standard_estimate" &&
            valid(p.standard_miles)
        ) return p.standard_miles;

        return null;
    }

    function priceBox(row) {

        const box = document.createElement("div");
        box.className = "integrated-mileage";

        const p = row?.pricing;
        const amount = mileage(row);

        if (row?.newly_available === true) {
            box.append(make("span", "NEW", "mile-new"));
        }

        if (amount === null) {

            box.append(make(
                "small",
                "공제 마일리지 미확인"
            ));

            return box;
        }

        if (
            p.status === "promotion_estimate" &&
            p.standard_miles > amount
        ) {
            const saved = p.standard_miles - amount;
            const percent = (saved / p.standard_miles * 100).toFixed(1);

            box.append(
                make("s", format(p.standard_miles)),
                make("strong", format(amount)),
                make(
                    "small",
                    "일반 공제 대비 " + percent + "% 할인 · " +
                    format(saved) + " 절약",
                    "mile-saving"
                )
            );
        } else {

            box.append(make(
                "strong", format(amount)
            ));
        }

        box.append(make(
            "small",
            "예상 공제량 · 세금 및 유류할증료 별도"
        ));

        return box;
    }

    function updateCards() {

        document.querySelectorAll(
            "#results article"
        ).forEach(card => {

            const old = card.querySelector(
                ".integrated-mileage"
            );

            if (old) old.remove();

            const row = findRecord(card.textContent);

            card.append(priceBox(row));
        });
    }

    function updateRoundTrip() {

        const root = $("simple-round-results");

        if (!root) return;

        let summary = $("round-mileage-summary");

        if (!summary) {

            summary = document.createElement("div");
            summary.id = "round-mileage-summary";

            root.append(summary);
        }

        const selected = Array.from(
            root.querySelectorAll(
                'input[type="radio"]:checked'
            )
        );

        if (selected.length !== 2) {

            summary.textContent =
                "가는 편과 오는 편을 선택하면 " +
                "예상 마일리지 합계가 표시됩니다.";

            return;
        }

        const dates = selected.map(input => {

            const text =
                input.closest("label")?.textContent ||
                input.parentElement?.textContent ||
                "";

            return {
                text,
                date: text.match(/\d{4}-\d{2}-\d{2}/)?.[0]
            };
        });

        if (
            !dates[0].date ||
            !dates[1].date ||
            dates[1].date <= dates[0].date
        ) {
            summary.textContent =
                "가는 편과 오는 편의 날짜를 확인해주세요.";
            return;
        }

        const outbound = findRecord(dates[0].text);
        const inbound = findRecord(dates[1].text, true);

        const a = mileage(outbound);
        const b = mileage(inbound);

        summary.replaceChildren();

        summary.append(
            make("div",
                "가는 편: " +
                (a === null ? "미확인" : format(a))
            ),
            make("div",
                "오는 편: " +
                (b === null ? "미확인" : format(b))
            )
        );

        if (a === null || b === null ||
            outbound?.program !== inbound?.program) {

            summary.append(make(
                "strong", "합계 공제 마일리지 미확인"
            ));

            return;
        }

        summary.append(make(
            "strong",
            "왕복 예상 합계: " + format(a + b)
        ));

        summary.append(make(
            "small",
            "편도 공제량 합산 기준 · 실제 왕복 할인 별도 확인"
        ));
    }

    let timer;

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            updateCards();
            updateRoundTrip();
        }, 150);
    }

    async function init() {

        const data = await window.AirData.load();

        if (data.mode !== "test") {
            throw new Error("UNEXPECTED DATA MODE");
        }

        records = data.items;

        const results = $("results");
        const round = $("simple-round-results");

        const observer = new MutationObserver(changes => {

            const externalChange = changes.some(change => {

                const target = change.target;

                if (target.closest?.(
                    ".integrated-mileage," +
                    "#round-mileage-summary"
                )) return false;

                return [
                    ...change.addedNodes,
                    ...change.removedNodes
                ].some(node =>
                    node.nodeType !== 1 ||
                    !node.matches?.(
                        ".integrated-mileage," +
                        "#round-mileage-summary"
                    )
                );
            });

            if (externalChange) schedule();
        });

        if (results) observer.observe(results, {
            childList: true,
            subtree: true
        });

        if (round) {

            observer.observe(round, {
                childList: true,
                subtree: true
            });

            round.addEventListener(
                "change", updateRoundTrip
            );
        }

        for (const id of [
            "search",
            "trip-one",
            "trip-round"
        ]) {
            $(id)?.addEventListener("click", schedule);
        }

        schedule();

        console.log("MILEAGE INTEGRATION: READY");
    }

    init().catch(console.error);
})();
