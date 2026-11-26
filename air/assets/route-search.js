(() => {

    const $ = id => document.getElementById(id);

    async function init() {

        const origin = $("origin");
        const destination = $("destination");
        const program = $("program");

        if (!origin || !destination || !program) return;

        const response = await fetch(
            "./data/route-catalog.json",
            {cache: "no-store"}
        );

        if (!response.ok) {
            throw new Error("CATALOG LOAD FAILED");
        }

        const data = await response.json();

        if (data.mode !== "schedule_catalog") {
            throw new Error("INVALID CATALOG");
        }

        await window.AirData.load();

        const airports = new Map(
            data.airports.map(a => [a.code, a])
        );

        const query = new URLSearchParams(location.search);

        const matchProgram = r =>
            !program.value ||
            ["all", "ALL", "*"].includes(program.value) ||
            r.program === program.value;

        function fill(select, codes, previous, label) {

            const options = [
                new Option(label, "")
            ];

            for (const code of [...new Set(codes)].sort(
                (a,b) => (
                    airports.get(a)?.name || a
                ).localeCompare(
                    airports.get(b)?.name || b, "ko"
                )
            )) {
                const name = airports.get(code)?.name || code;

                options.push(
                    new Option(
                        name + " (" + code + ")", code
                    )
                );
            }

            select.replaceChildren(...options);

            if (options.some(o => o.value === previous)) {
                select.value = previous;
            }
        }

        function destinations(previous = destination.value) {

            const routes = data.routes.filter(r =>
                matchProgram(r) &&
                (!origin.value || r.origin === origin.value)
            );

            fill(
                destination,
                routes.map(r => r.destination),
                previous,
                "전체 목적지"
            );
        }

        function origins(previous = origin.value) {

            const routes = data.routes.filter(matchProgram);

            fill(
                origin,
                routes.map(r => r.origin),
                previous,
                "전체 출발 공항"
            );

            destinations();
        }

        origins(query.get("origin") || origin.value);

        destinations(
            query.get("destination") || destination.value
        );

        program.addEventListener("change", () => {
            origins();
            $("search")?.click();
        });

        origin.addEventListener("change", () => {
            destinations();
            $("search")?.click();
        });

        console.log("FULL ROUTE CATALOG: CONNECTED");
        console.log("AIRPORTS:", data.airports.length);
        console.log("ROUTES:", data.routes.length);
    }

    window.addEventListener("load", () => {
        init().catch(error => {
            console.error("ROUTE CATALOG:", error.message);
        });
    }, {once: true});

})();
