(() => {
    "use strict";

    if (window.AirAwardFilter) return;

    function mode() {
        const buttons = Array.from(
            document.querySelectorAll("#award-tabs button")
        );

        const selected = buttons.findIndex(
            b => b.getAttribute("aria-pressed") === "true"
        );

        return ["all", "discount", "new"][selected]
            || "all";
    }

    function discounted(row) {
        const p = row.pricing;

        return Boolean(
            p &&
            p.status === "promotion_estimate" &&
            Number.isInteger(p.standard_miles) &&
            Number.isInteger(p.discounted_miles) &&
            p.discounted_miles > 0 &&
            p.standard_miles > p.discounted_miles
        );
    }

    function matches(row, selected = mode()) {

        if (selected === "all") return true;

        if (row.status !== "available") return false;

        if (selected === "discount") {
            return discounted(row);
        }

        if (selected === "new") {
            return row.newly_available === true;
        }

        return false;
    }

    window.AirAwardFilter = {
        mode,
        discounted,
        matches
    };

    document.addEventListener("click", event => {

        if (!event.target.closest("#award-tabs button")) {
            return;
        }

        queueMicrotask(() => {

            document.dispatchEvent(
                new CustomEvent("air-award-filter-change")
            );

            document.getElementById("search")?.click();

        });
    });

    console.log("SHARED AWARD FILTER: READY");
})();
