(() => {
    "use strict";

    document.title =
        "마일지도 | 마일리지 항공권 검색";

    const heading = document.querySelector("h1");

    if (heading) {
        heading.textContent = "마일지도";
    }

    if (document.getElementById("milemap")) return;

    const results = document.getElementById("results");

    if (!results) {
        console.warn("MILEMAP: results container missing");
        return;
    }

    const details = document.createElement("details");
    details.id = "milemap";

    details.innerHTML = `
        <summary>🌐 마일리지 여행지도</summary>
        <div class="milemap-body">
            <div id="milemap-canvas"></div>
            <div class="milemap-legend">
                <span>🔵 테스트 좌석 표시</span>
                <span>🟠 할인 항공권</span>
                <span>🟢 신규 좌석</span>
                <span>⚫ 출발 공항</span>
            </div>
            <p id="milemap-status" class="milemap-note">
                지도를 펼치면 검색 결과를 표시합니다.
            </p>
            <p class="milemap-note">
                테스트 데이터이며 실제 예약 가능 여부는
                항공사에서 확인해야 합니다.
            </p>
        </div>
    `;

    const anchor =
        document.getElementById("award-calendar") ||
        results;

    anchor.before(details);

    // Initial coordinates for existing test routes.
    // Full airport coordinate catalog will be added separately.
    const coordinates = {
        ICN: [37.4602, 126.4407],
        GMP: [37.5583, 126.7906],
        PUS: [35.1795, 128.9382],
        CJU: [33.5113, 126.4930],
        NRT: [35.7720, 140.3929],
        HND: [35.5494, 139.7798],
        SIN: [1.3644, 103.9915],
        CDG: [49.0097, 2.5479],
        JFK: [40.6413, -73.7781],
        LAX: [33.9416, -118.4085],
        BKK: [13.6900, 100.7501],
        LHR: [51.4700, -0.4543],
        KIX: [34.4347, 135.2440],
        AMS: [52.3105, 4.7683],
        FCO: [41.8003, 12.2389]
    };

    
    let coordinatesReady;

    async function loadCoordinates() {

        if (!coordinatesReady) {
            coordinatesReady = fetch(
                "./data/airport-coordinates.json",
                {cache: "no-store"}
            ).then(async response => {

                if (!response.ok) {
                    throw new Error("AIRPORT LOAD FAILED");
                }

                const data = await response.json();

                for (const a of data.airports) {

                    if (
                        a.coordinate_status === "matched" &&
                        Number.isFinite(a.latitude) &&
                        Number.isFinite(a.longitude)
                    ) {
                        coordinates[a.code] = [
                            a.latitude,
                            a.longitude
                        ];
                    }
                }
            }).catch(error => {
                coordinatesReady = null;
                throw error;
            });
        }

        return coordinatesReady;
    }

    let map;

    let layer;
    let starting = false;
    let version = 0;
    let leafletPromise;

    const status = document.getElementById(
        "milemap-status"
    );

    function leaflet() {
        if (window.L) return Promise.resolve();

        if (leafletPromise) return leafletPromise;

        leafletPromise = new Promise((resolve, reject) => {
            const css = document.createElement("link");
            css.rel = "stylesheet";
            css.href =
                "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
            document.head.appendChild(css);

            const script = document.createElement("script");
            script.src =
                "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            script.onload = resolve;

            script.onerror = () => {
                script.remove();
                css.remove();
                leafletPromise = null;
                reject(new Error("지도 라이브러리 로딩 실패"));
            };

            document.head.appendChild(script);
        });

        return leafletPromise;
    }

    function value(id) {
        return document.getElementById(id)?.value || "";
    }

    function match(selected, actual) {
        return !selected ||
            ["all", "ALL", "*"].includes(selected) ||
            selected === actual;
    }

    async function refresh() {
        if (!map || !details.open) return;

        const currentVersion = ++version;

        const data = await window.AirData.load();

        if (currentVersion !== version) return;

        const items = data.items.filter(row =>
            row.test_data === 1 &&
            row.status === "available" &&
            window.AirAwardFilter.matches(row) &&
            match(value("origin"), row.origin) &&
            match(value("destination"), row.destination) &&
            match(value("program"), row.program) &&
            match(value("cabin"), row.cabin) &&
            match(value("month"), row.departure_date.slice(0,7))
        );

        layer.clearLayers();

        const routes = new Map();

        for (const row of items) {
            const key =
                row.origin + "-" + row.destination;

            if (!routes.has(key)) {
                routes.set(key, {
                    origin: row.origin,
                    destination: row.destination,
                    dates: new Set(),
                    discountDates: new Set(),
                    newDates: new Set()
                });
            }

            const route = routes.get(key);

            route.dates.add(row.departure_date);

            if (window.AirAwardFilter.discounted(row)) {
                route.discountDates.add(row.departure_date);
            }

            if (row.newly_available === true) {
                route.newDates.add(row.departure_date);
            }
        }

        const bounds = [];
        const drawn = new Set();
        let missing = 0;

        for (const route of routes.values()) {
            const from = coordinates[route.origin];
            const to = coordinates[route.destination];

            if (!from || !to) {
                missing++;
                continue;
            }

            const mode = window.AirAwardFilter.mode();

            const routeColor =
                mode === "new" ? "#16965d" :
                mode === "discount" ? "#e88b25" :
                route.discountDates.size ? "#e88b25" :
                route.newDates.size ? "#16965d" :
                "#3478bc";

            L.polyline([from, to], {
                color: routeColor,
                weight: 1.6,
                opacity: 0.7,
                dashArray: "5 5"
            }).addTo(layer);

            if (!drawn.has("from-" + route.origin)) {
                L.circleMarker(from, {
                    radius: 7,
                    color: "#ffffff",
                    weight: 2,
                    fillColor: "#183951",
                    fillOpacity: 1
                })
                .bindTooltip(route.origin)
                .addTo(layer);

                drawn.add("from-" + route.origin);
            }

            const label = document.createElement("div");
            label.textContent =
                route.origin + " → " + route.destination +
                " | 테스트 날짜 " + route.dates.size + "일" +
                " | 할인 " + route.discountDates.size + "일" +
                " | 신규 " + route.newDates.size + "일";

            const marker = L.circleMarker(to, {
                radius: 7,
                color: "#ffffff",
                weight: 2,
                fillColor: routeColor,
                fillOpacity: 1
            }).addTo(layer);

            marker.bindTooltip(label);

            marker.on("click", () => {
                for (const [id, code] of [
                    ["origin", route.origin],
                    ["destination", route.destination]
                ]) {
                    const select =
                        document.getElementById(id);

                    if (select && Array.from(select.options)
                        .some(o => o.value === code)) {
                        select.value = code;
                    }
                }

                document.getElementById("search")?.click();
            });

            bounds.push(from, to);
        }

        if (bounds.length) {
            map.fitBounds(bounds, {
                padding: [30,30],
                maxZoom: 5
            });
        }

        status.textContent =
            "지도 표시 노선 " +
            (routes.size - missing) + "개 · " +
            "좌표 미등록 노선 " + missing + "개";
    }

    function update() {
        refresh().catch(() => {
            status.textContent =
                "지도 데이터를 불러오지 못했습니다.";
        });
    }

    details.addEventListener("toggle", async () => {
        if (!details.open || starting) return;

        starting = true;

        try {
            await loadCoordinates();
            await leaflet();

            if (!map) {
                map = L.map("milemap-canvas", {
                    minZoom: 2,
                    maxZoom: 10
                }).setView([32, 100], 2);

                L.tileLayer(
                    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                    {
                        maxZoom: 19,
                        attribution:
                        '&copy; <a href="https://www.openstreetmap.org/copyright">' +
                        'OpenStreetMap</a> contributors'
                    }
                ).addTo(map);

                layer = L.layerGroup().addTo(map);
            }

            map.invalidateSize();
            await refresh();

        } catch (error) {
            status.textContent =
                "지도를 불러오지 못했습니다. 다시 펼쳐주세요.";
        } finally {
            starting = false;
        }
    });

    for (const id of [
        "origin", "destination", "program",
        "cabin", "month"
    ]) {
        document.getElementById(id)
            ?.addEventListener("change", update);
    }

    document.getElementById("search")
        ?.addEventListener("click", update);

    document.addEventListener(
        "air-award-filter-change", update
    );

    for (const id of ["trip-one", "trip-round"]) {
        document.getElementById(id)
            ?.addEventListener("click", () =>
                queueMicrotask(update)
            );
    }

    // FINAL_FILTER_SYNC_V1
    console.log("MILEMAP FILTER SYNC: READY");
})();
