/* 마일지도 AIR — 노선 지도 패널
   /air/calendar/ (`달력/지도`) 상단에서 쓰는 접기/펼치기 지도 패널이다.
   좌석 표시가 확인된 노선을 지도에 그리고, 노선·공항을 클릭하면
   같은 페이지 아래 달력의 출발지·도착지가 그 노선으로 바뀐다.
   (/air/map/ 은 /air/calendar/ 로 이동하므로 이 파일은 달력/지도 페이지에서만 쓰인다.) */
(() => {
  "use strict";

  const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

  const SELECTED_COLOR = "#0f2340";
  const ORIGIN_COLOR = "#183951";

  let leafletPromise = null;

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

  /** 공항 좌표 사전 (award.js 의 공항 목록) */
  function coordinates() {
    const map = new Map();
    const award = window.Air && Air.award;
    const entries = award && typeof award.airports === "function" ? award.airports() : [];

    for (const entry of entries) {
      if (Number.isFinite(entry.lat) && Number.isFinite(entry.lon)) {
        map.set(entry.code, [entry.lat, entry.lon]);
      }
    }

    return map;
  }

  /** 좌석 표시가 확인된 노선만 노선별로 묶는다. */
  function summarize(rows) {
    const routes = new Map();

    for (const row of rows) {
      if (row.status !== "available") continue;

      const key = `${row.origin}-${row.destination}`;

      if (!routes.has(key)) {
        routes.set(key, {
          origin: row.origin,
          destination: row.destination,
          month: row.month,
          dates: [],
          hasNew: false,
          hasPeak: false
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
      if (Air.award && Air.award.seasonOf(row.date, row.origin).peak) route.hasPeak = true;
    }

    for (const route of routes.values()) {
      route.dates.sort((a, b) => a.date.localeCompare(b.date));
      for (const entry of route.dates) entry.letters.sort();
    }

    return routes;
  }

  function popupContent(route) {
    const wrapper = Air.el("div", { class: "air-map-popup" });

    wrapper.append(Air.el("strong", {
      text: `${Air.airportShort(route.origin)} → ${Air.airportShort(route.destination)}`
    }));

    wrapper.append(Air.el("div", {
      class: "air-map-popup__meta",
      text: `${route.origin} → ${route.destination} · 좌석 표시 ${route.dates.length}일`
    }));

    const list = Air.el("ul");

    for (const entry of route.dates.slice(0, 6)) {
      const season = Air.award ? Air.award.seasonOf(entry.date, route.origin) : null;
      list.append(Air.el("li", {
        text: `${Air.fmtDate(entry.date)} · ${entry.letters.join(" ")}${season && season.peak ? " · 성수기" : ""}`
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

  /**
   * 지도 패널을 host 안에 그린다.
   * @param {HTMLElement} host 패널을 붙일 컨테이너
   * @param {Object} options
   *   rows: 전체 행 배열
   *   getSelection: () => ({origin, destination}) — 현재 달력의 선택 노선
   *   onSelect: (route) => void — 지도에서 노선을 골랐을 때
   *   collapsed: 처음부터 접어 둘지
   */
  function mount(host, options) {
    const opts = options || {};
    const rows = Array.isArray(opts.rows) ? opts.rows : [];

    let map = null;
    let layer = null;
    let coords = new Map();
    let layers = new Map();
    let fittedOnce = false;
    let started = false;
    let renderVersion = 0;
    let summary = null;

    const bodyId = "air-map-body";

    const toggle = Air.el("button", {
      type: "button",
      class: "air-btn air-btn--ghost air-btn--sm air-map-card__toggle",
      "aria-expanded": "true",
      "aria-controls": bodyId,
      text: "지도 접기"
    });

    const head = Air.el("div", { class: "air-map-card__head" }, [
      Air.el("div", { class: "air-map-card__title" }, [
        Air.el("h2", { id: "air-map-title", text: "노선 지도" }),
        Air.el("p", {
          text: "좌석 표시가 확인된 노선입니다. 지도에서 노선이나 목적지 공항을 누르면 아래 달력이 그 노선으로 바로 바뀝니다."
        })
      ]),
      toggle
    ]);

    const status = Air.el("p", { class: "air-map-note", id: "air-map-status", text: "지도를 준비하는 중입니다." });

    const legend = Air.el("div", { class: "air-legend" }, [
      Air.el("span", null, [Air.el("i", { style: "background:#3478bc" }), "좌석 표시 노선"]),
      Air.el("span", null, [Air.el("i", { style: "background:#e88b25" }), "성수기 좌석 포함"]),
      Air.el("span", null, [Air.el("i", { style: "background:#16965d" }), "신규 좌석 포함"]),
      Air.el("span", null, [Air.el("i", { style: "background:#183951" }), "출발 공항"])
    ]);

    const mapEl = Air.el("div", {
      id: "air-map",
      role: "application",
      "aria-label": "보너스 좌석 노선 지도"
    });

    const shell = Air.el("div", { class: "air-map-shell", id: "air-map-shell" }, [mapEl]);
    const body = Air.el("div", { class: "air-map-card__body", id: bodyId }, [shell, status, legend]);

    const panel = Air.el("section", { class: "air-map-card", "aria-labelledby": "air-map-title" }, [head, body]);

    host.append(panel);

    function selection() {
      return typeof opts.getSelection === "function" ? (opts.getSelection() || {}) : {};
    }

    function renderStatus() {
      if (!summary || !summary.total) {
        status.textContent = "지금은 좌석 표시가 확인된 노선이 없습니다. 아래 달력에서 출발지·도착지를 직접 골라 주세요.";
        return;
      }

      const current = selection();
      const selected = current.origin && current.destination
        ? ` · 지금 보고 있는 노선 ${Air.airportShort(current.origin)} ${current.origin} → ${Air.airportShort(current.destination)} ${current.destination}`
        : "";
      const missing = summary.missing ? ` · 좌표 미등록 ${summary.missing}개` : "";

      status.textContent = `좌석 표시 노선 ${summary.shown}개${missing}${selected}`;
    }

    /** 지금 달력이 보고 있는 노선을 지도에서 강조한다. */
    function paintSelection() {
      const current = selection();

      for (const entry of layers.values()) {
        const isSelected = current.origin === entry.route.origin &&
          current.destination === entry.route.destination;

        entry.line.setStyle({
          color: isSelected ? SELECTED_COLOR : entry.color,
          weight: isSelected ? 4.5 : 2,
          opacity: isSelected ? .95 : .72,
          dashArray: isSelected ? "" : "5 5"
        });

        entry.marker.setStyle({ radius: isSelected ? 9 : 7, weight: isSelected ? 3 : 2 });
        /* CircleMarker 에는 setZIndexOffset 이 없으므로 bringToFront 로만 앞쪽에 올린다. */
        if (isSelected && typeof entry.marker.bringToFront === "function") entry.marker.bringToFront();
      }

      renderStatus();
    }

    function focusRoute(route) {
      if (!map) return;

      const from = coords.get(route.origin);
      const to = coords.get(route.destination);
      if (!from || !to) return;

      map.fitBounds([from, to], { padding: [40, 40], maxZoom: 5 });
    }

    function select(route) {
      if (typeof opts.onSelect === "function") opts.onSelect(route);
      paintSelection();
      focusRoute(route);
    }

    function draw() {
      if (!map || !layer) return;

      const token = ++renderVersion;
      const routes = summarize(rows);

      if (token !== renderVersion) return;

      layer.clearLayers();
      layers = new Map();

      const bounds = [];
      const drawnOrigins = new Set();
      let missing = 0;

      for (const route of routes.values()) {
        const from = coords.get(route.origin);
        const to = coords.get(route.destination);

        if (!from || !to) { missing++; continue; }

        const color = route.hasNew ? "#16965d" : route.hasPeak ? "#e88b25" : "#3478bc";

        const line = L.polyline([from, to], {
          color, weight: 2, opacity: .72, dashArray: "5 5"
        }).addTo(layer);

        const marker = L.circleMarker(to, {
          radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1
        }).addTo(layer);

        marker.bindPopup(popupContent(route));

        const handler = () => select(route);
        marker.on("click", handler);
        line.on("click", handler);

        layers.set(`${route.origin}-${route.destination}`, { line, marker, route, color });

        if (!drawnOrigins.has(route.origin)) {
          L.circleMarker(from, {
            radius: 6, color: "#fff", weight: 2, fillColor: ORIGIN_COLOR, fillOpacity: 1
          }).bindTooltip(route.origin, { direction: "top" }).addTo(layer);

          drawnOrigins.add(route.origin);
        }

        bounds.push(from, to);
      }

      if (bounds.length && !fittedOnce) {
        /* 넓은 화면은 노선 전체가 들어오도록 맞추고,
           좁은 화면은 이 서비스의 출발 거점(인천) 중심 개요로 둔다. */
        if (map.getSize().x >= 720) {
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 5 });
        } else {
          map.setView(coords.get("ICN") || bounds[0], 2);
        }
        fittedOnce = true;
      }

      summary = {
        total: routes.size,
        shown: routes.size - missing,
        missing
      };

      paintSelection();
    }

    async function start() {
      if (started) return;
      started = true;

      try {
        await Promise.all([
          loadLeaflet(),
          window.Air && Air.airports ? Air.airports() : Promise.resolve()
        ]);

        coords = coordinates();

        if (!map) {
          map = L.map("air-map", { minZoom: 1, maxZoom: 9, worldCopyJump: true })
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
        started = false;
        status.textContent = "지도를 불러오지 못했습니다. 지도 없이 아래 달력에서 출발지·도착지를 직접 고를 수 있습니다.";
      }
    }

    function setCollapsed(collapsed) {
      body.hidden = collapsed;
      toggle.textContent = collapsed ? "지도 펼치기" : "지도 접기";
      toggle.setAttribute("aria-expanded", String(!collapsed));

      if (collapsed) return;

      if (!started) start();
      else if (map) setTimeout(() => map.invalidateSize(), 60);
    }

    toggle.addEventListener("click", () => setCollapsed(!body.hidden));

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          if (!body.hidden) start();
        }
      }, { rootMargin: "200px" });

      observer.observe(shell);
    } else if (!body.hidden) {
      start();
    }

    setCollapsed(opts.collapsed === true);

    return {
      refresh() { draw(); },
      paintSelection,
      setCollapsed,
      focusRoute
    };
  }

  Air.mapPanel = { mount };
})();
