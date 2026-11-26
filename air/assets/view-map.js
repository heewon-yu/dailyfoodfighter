/* 마일지도 AIR — 세계지도 뷰 (/air/map/) */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

  const state = {
    origin: "",
    destination: "",
    cabin: "",
    month: "",
    rows: [],
    meta: null,
    coordinates: new Map(),
    airportList: []
  };

  let map = null;
  let layer = null;
  let leafletPromise = null;
  let renderVersion = 0;

  function readUrl() {
    const params = Air.params();
    state.origin = (params.get("origin") || "").toUpperCase();
    state.destination = (params.get("destination") || "").toUpperCase();
    state.cabin = params.get("cabin") || "";
    state.month = params.get("month") || "";
  }

  function syncUrl() {
    Air.setParams({
      origin: state.origin,
      destination: state.destination,
      cabin: state.cabin,
      month: state.month
    });
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve();

    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
        document.head.append(Air.el("link", { rel: "stylesheet", href: LEAFLET_CSS }));
      }

      const script = Air.el("script", { src: LEAFLET_JS });
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        leafletPromise = null;
        reject(new Error("LEAFLET_LOAD_FAILED"));
      };
      document.head.append(script);
    });

    return leafletPromise;
  }

  async function loadCoordinates() {
    try {
      const data = await (await fetch(Air.ROOT + "data/airport-coordinates.json", { cache: "no-store" })).json();
      for (const airport of data.airports || []) {
        if (Number.isFinite(airport.latitude) && Number.isFinite(airport.longitude)) {
          state.coordinates.set(airport.code, [airport.latitude, airport.longitude]);
        }
      }
    } catch {
      state.coordinates = new Map();
    }
  }

  function selectField(id, label, value, entries, onChange) {
    const select = Air.el("select", { class: "air-select", id });
    select.append(new Option("전체", ""));

    for (const entry of entries) {
      select.append(new Option(entry.label, entry.value));
    }

    select.value = value;
    select.addEventListener("change", () => {
      onChange(select.value);
      draw();
    });

    return Air.el("div", { class: "air-field" }, [
      Air.el("label", { for: id, text: label }),
      select
    ]);
  }

  function controls() {
    const airportEntries = state.airportList.map(airport => ({
      value: airport.code, label: `${airport.name} (${airport.code})`
    }));

    const months = [...new Set(state.rows.map(row => row.month))].sort();

    const collapse = Air.el("button", {
      type: "button",
      class: "air-btn air-btn--ghost air-btn--sm",
      "aria-expanded": "true",
      text: "지도 접기"
    });

    collapse.addEventListener("click", () => {
      const shell = $("air-map-shell");
      const collapsed = shell.classList.toggle("is-collapsed");
      collapse.textContent = collapsed ? "지도 펼치기" : "지도 접기";
      collapse.setAttribute("aria-expanded", String(!collapsed));
      if (!collapsed && map) setTimeout(() => map.invalidateSize(), 60);
    });

    return Air.el("div", { class: "air-panel", style: "margin-bottom:14px" }, [
      Air.el("div", { class: "air-filters", style: "grid-template-columns:repeat(auto-fit,minmax(180px,1fr))" }, [
        selectField("air-map-origin", "출발 공항", state.origin, airportEntries, value => { state.origin = value; }),
        selectField("air-map-destination", "도착 공항", state.destination, airportEntries, value => { state.destination = value; }),
        selectField("air-map-cabin", "좌석 등급", state.cabin,
          Air.CABINS.map(cabin => ({ value: cabin.key, label: `${cabin.letter} · ${cabin.name}` })),
          value => { state.cabin = value; }),
        selectField("air-map-month", "탑승월", state.month,
          months.map(month => ({ value: month, label: Air.fmtMonth(month) })),
          value => { state.month = value; })
      ]),
      Air.el("div", { class: "air-actions" }, [collapse])
    ]);
  }

  function filteredRows() {
    return state.rows.filter(row => {
      if (state.origin && row.origin !== state.origin) return false;
      if (state.destination && row.destination !== state.destination) return false;
      if (state.cabin && row.cabinKey !== state.cabin) return false;
      if (state.month && row.month !== state.month) return false;
      return row.status === "available";
    });
  }

  function popupContent(route) {
    const wrapper = Air.el("div", { class: "air-map-popup" });

    wrapper.append(Air.el("strong", {
      text: `${Air.airportShort(route.origin)} → ${Air.airportShort(route.destination)}`
    }));

    wrapper.append(Air.el("div", {
      style: "color:#64748b;font-size:12px;margin-bottom:6px",
      text: `${route.origin} → ${route.destination} · 좌석 표시 ${route.dates.length}일`
    }));

    const list = Air.el("ul");

    for (const entry of route.dates.slice(0, 6)) {
      list.append(Air.el("li", {
        text: `${Air.fmtDate(entry.date)} · ${entry.letters.join(" ")}`
      }));
    }

    if (route.dates.length > 6) {
      list.append(Air.el("li", { text: `외 ${route.dates.length - 6}일` }));
    }

    wrapper.append(list);

    wrapper.append(Air.el("a", {
      href: Air.ROOT + "route/?" + new URLSearchParams({
        origin: route.origin,
        destination: route.destination,
        month: route.month || ""
      }).toString(),
      text: "노선 상세 보기 →"
    }));

    return wrapper;
  }

  function summarize(rows) {
    const routes = new Map();

    for (const row of rows) {
      const key = `${row.origin}-${row.destination}`;

      if (!routes.has(key)) {
        routes.set(key, {
          origin: row.origin,
          destination: row.destination,
          month: row.month,
          dates: [],
          hasNew: false,
          hasDiscount: false
        });
      }

      const route = routes.get(key);
      const existing = route.dates.find(entry => entry.date === row.date);

      if (existing) {
        if (!existing.letters.includes(row.cabin.letter)) existing.letters.push(row.cabin.letter);
      } else {
        route.dates.push({ date: row.date, letters: [row.cabin.letter] });
      }

      if (row.isNew) route.hasNew = true;

      const price = Air.priceOf(row);
      if (price.kind === "verified" || price.kind === "estimate") {
        if ((price.discounted || price.standard) < price.standard) route.hasDiscount = true;
      }
    }

    for (const route of routes.values()) {
      route.dates.sort((a, b) => a.date.localeCompare(b.date));
      for (const entry of route.dates) entry.letters.sort();
    }

    return routes;
  }

  async function draw() {
    const status = $("air-map-status");
    const current = ++renderVersion;

    syncUrl();

    if (!map) return;

    const routes = summarize(filteredRows());

    if (current !== renderVersion) return;

    layer.clearLayers();

    const bounds = [];
    let missing = 0;
    const drawnOrigins = new Set();

    for (const route of routes.values()) {
      const from = state.coordinates.get(route.origin);
      const to = state.coordinates.get(route.destination);

      if (!from || !to) { missing++; continue; }

      const color = route.hasNew ? "#16965d" : route.hasDiscount ? "#e88b25" : "#3478bc";

      const line = L.polyline([from, to], {
        color, weight: 2, opacity: .75, dashArray: "5 5"
      }).addTo(layer);

      const marker = L.circleMarker(to, {
        radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1
      }).addTo(layer);

      const popup = popupContent(route);
      marker.bindPopup(popup);

      line.on("click", () => marker.openPopup());

      if (!drawnOrigins.has(route.origin)) {
        L.circleMarker(from, {
          radius: 6, color: "#fff", weight: 2, fillColor: "#183951", fillOpacity: 1
        }).bindTooltip(route.origin).addTo(layer);

        drawnOrigins.add(route.origin);
      }

      bounds.push(from, to);
    }

    if (bounds.length && !map.__fittedOnce) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 5 });
      map.__fittedOnce = true;
    }

    status.textContent = routes.size
      ? `좌석 표시 노선 ${routes.size - missing}개 표시 · 좌표 미등록 ${missing}개 · 좌석 없음·미조회 노선은 표시하지 않습니다.`
      : "선택한 조건에서 좌석 표시가 있는 노선이 없습니다. 좌석 없음·미조회와 구분해서 표시하지 않습니다.";
  }

  async function startMap() {
    const status = $("air-map-status");

    try {
      status.textContent = "지도를 준비하는 중입니다.";
      await Promise.all([loadCoordinates(), loadLeaflet(), Air.airports()]);

      if (!map) {
        map = L.map("air-map", { minZoom: 2, maxZoom: 9, worldCopyJump: true })
          .setView([30, 110], 2);

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        layer = L.layerGroup().addTo(map);
      }

      map.invalidateSize();
      draw();
    } catch (error) {
      status.textContent = "지도를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 새로고침해 주세요.";
    }
  }

  async function init() {
    Air.mountChrome();
    readUrl();

    const root = $("air-map-view");

    try {
      const payload = await Air.data({});
      state.rows = payload.rows;
      state.meta = await Air.manifestMeta();
    } catch (error) {
      root.replaceChildren(Air.emptyState(
        "좌석 데이터를 불러오지 못했습니다",
        "갱신현황 화면에서 데이터 상태를 확인해 주세요."
      ));
      return;
    }

    try {
      const airports = await Air.airports();
      const codes = new Set(state.rows.flatMap(row => [row.origin, row.destination]));
      state.airportList = [...airports.values()]
        .filter(airport => codes.has(airport.code))
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } catch {
      state.airportList = [];
    }

    root.prepend(controls());

    const shell = $("air-map-shell");
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          startMap();
        }
      }, { rootMargin: "200px" });

      observer.observe(shell);
    } else {
      startMap();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
