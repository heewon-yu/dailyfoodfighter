(() => {
    "use strict";

    const $ = id => document.getElementById(id);
    const month = $("month");
    const returning = $("return-month");

    if (!month || !returning) return;

    const now = new Date();

    const kst = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit"
    }).formatToParts(now);

    const year = Number(
        kst.find(p => p.type === "year").value
    );

    const startMonth = Number(
        kst.find(p => p.type === "month").value
    );

    const values = [];

    for (let i = 0; i < 13; i++) {

        const d = new Date(
            Date.UTC(year, startMonth - 1 + i, 1)
        );

        const y = d.getUTCFullYear();
        const m = d.getUTCMonth() + 1;

        values.push({
            value: y + "-" + String(m).padStart(2,"0"),
            label: y + "년 " + m + "월"
        });
    }

    const retSelect = document.createElement("select");
    retSelect.id = "return-month";

    returning.replaceWith(retSelect);

    function fill(select, earliest) {

        const previous = select.value;

        const options = [new Option("전체 기간", "")];

        for (const entry of values) {

            if (earliest && entry.value < earliest) continue;

            options.push(new Option(entry.label, entry.value));
        }

        select.replaceChildren(...options);

        if (options.some(o => o.value === previous)) {
            select.value = previous;
        }
    }

    function refreshReturn() {
        fill(retSelect, month.value);
    }

    // Wait for the original result filters to initialize.
    window.addEventListener("load", async () => {

        await window.AirData.load();

        fill(month);
        refreshReturn();

        const query = new URLSearchParams(location.search);

        if (values.some(v => v.value === query.get("month"))) {
            month.value = query.get("month");
        }

        refreshReturn();

        month.addEventListener("change", refreshReturn);

        $("trip-round")?.addEventListener(
            "click", refreshReturn
        );

        retSelect.addEventListener("change", () => {
            $("search")?.click();
        });

        console.log("BOOKING MONTH OPTIONS: READY");
    }, {once: true});
})();
