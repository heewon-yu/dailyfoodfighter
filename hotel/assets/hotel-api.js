/* ==========================================================================
   힐튼포숙지도 — 데이터 접근 계층 (D1 실시간 API 대비)
   --------------------------------------------------------------------------
   지금은 mode: "static" 으로 /hotel/data/hotels.json 스냅샷(2026-11-27 관측)을
   쓴다. Cloudflare D1 + Pages Function(/api/hotel/rates)이 준비되면
   HOTEL_API_CONFIG.mode = "live" 한 줄만 바꾸면 날짜·도시별 실시간 레코드를
   같은 화면 코드로 그린다.

   [GET /api/hotel/rates] 요청 (live)
     ?city=Seoul&checkIn=2026-12-18&checkOut=2026-12-19&adults=2&weekendOnly=1
     &hotelCode=SELCICI            (도시 대신 특정 호텔만 조회할 때)
   응답 (live)
     { "ok": true,
       "source": "d1", "observedAt": "2026-12-01T09:00:00Z",
       "records": [{
         "hotelCode": "SELCICI", "city": "Seoul",
         "checkIn": "2026-12-18", "checkOut": "2026-12-19",
         "adults": 2, "rooms": 1,
         "status": "AVAILABLE",            // AVAILABLE | SOLD_OUT | NOT_QUERIED | STALE | FAILED
         "currency": "KRW", "cash": 638000, "extra": 0,
         "points": 80000, "rewardType": "STANDARD", // STANDARD | PREMIUM
         "roomCode": "KING1", "taxIncluded": true, "conditionsMatched": true,
         "source": "MANUAL", "observedAt": "2026-12-01T09:00:00Z"
       }] }
   실패 (live) 503 { "ok": false, "error": "database_unavailable" }
   ========================================================================== */
(function () {
  "use strict";

  var HOTEL_API_CONFIG = {
    mode: "static",                        // "static" | "live"
    hotelsUrl: "/hotel/data/hotels.json",
    ratesEndpoint: "/api/hotel/rates",
    timeoutMs: 8000,
    staleHours: 24                         // 관측 후 24시간 초과 → STALE
  };

  var STATUS = {
    AVAILABLE: "AVAILABLE",
    SOLD_OUT: "SOLD_OUT",
    NOT_QUERIED: "NOT_QUERIED",
    STALE: "STALE",
    FAILED: "FAILED"
  };

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function officialUrl(hotelCode, checkIn, checkOut, adults) {
    var code = String(hotelCode || "").toUpperCase();
    var q = "ctyhocn=" + encodeURIComponent(code) +
      "&arrivalDate=" + encodeURIComponent(checkIn) +
      "&departureDate=" + encodeURIComponent(checkOut) +
      "&redeemPts=true" +
      "&room1NumAdults=" + encodeURIComponent(adults || 2);
    return "https://www.hilton.com/en/book/reservation/rooms/?" + q;
  }

  function isStale(observedAt, now) {
    if (!observedAt) return true;
    var t = Date.parse(observedAt);
    if (!isFinite(t)) return true;
    return (now || Date.now()) - t > HOTEL_API_CONFIG.staleHours * 3600 * 1000;
  }

  function normalizeRecord(raw, now) {
    if (!raw || !raw.hotelCode) return null;
    var status = String(raw.status || "").toUpperCase();
    if (STATUS[status] === undefined) status = STATUS.NOT_QUERIED;
    if (status === STATUS.AVAILABLE && isStale(raw.observedAt, now)) status = STATUS.STALE;
    var available = status === STATUS.AVAILABLE || status === STATUS.STALE;
    var points = available && Number.isFinite(+raw.points) ? +raw.points : null;
    var cash = available && Number.isFinite(+raw.cash) ? +raw.cash : null;
    var extra = available && Number.isFinite(+raw.extra) ? +raw.extra : 0;
    return {
      hotelCode: String(raw.hotelCode).toUpperCase(),
      city: raw.city || null,
      checkIn: raw.checkIn || null,
      checkOut: raw.checkOut || null,
      adults: raw.adults != null ? +raw.adults : null,
      rooms: raw.rooms != null ? +raw.rooms : 1,
      status: status,
      currency: raw.currency || null,
      cash: cash,
      extra: extra,
      points: points,
      rewardType: raw.rewardType ? String(raw.rewardType).toUpperCase() : null,
      roomCode: raw.roomCode || null,
      taxIncluded: raw.taxIncluded === true,
      conditionsMatched: raw.conditionsMatched === true,
      source: raw.source || "D1",
      observedAt: raw.observedAt || null,
      valuePerPoint: (cash != null && points) ? (cash - extra) / points : null
    };
  }

  function withTimeout(url, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || HOTEL_API_CONFIG.timeoutMs);
    var opt = ctrl ? { signal: ctrl.signal, credentials: "same-origin" } : { credentials: "same-origin" };
    return fetch(url, opt).then(function (res) {
      clearTimeout(timer);
      return res;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function loadHotels() {
    return withTimeout(HOTEL_API_CONFIG.hotelsUrl, HOTEL_API_CONFIG.timeoutMs)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.hotels)) throw new Error("invalid hotels payload");
        return data;
      });
  }

  /* live 모드: D1 레코드. static 모드: 빈 배열(화면은 스냅샷을 그대로 사용). */
  function queryRates(params) {
    if (HOTEL_API_CONFIG.mode !== "live") {
      return Promise.resolve({ ok: true, source: "static", records: [] });
    }
    var qs = [];
    ["city", "hotelCode", "checkIn", "checkOut", "adults", "rooms", "weekendOnly"].forEach(function (key) {
      if (params && params[key] != null && params[key] !== "") {
        qs.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
      }
    });
    var url = HOTEL_API_CONFIG.ratesEndpoint + (qs.length ? "?" + qs.join("&") : "");
    return withTimeout(url, HOTEL_API_CONFIG.timeoutMs)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json || json.ok !== true || !Array.isArray(json.records)) {
          throw new Error((json && json.error) || "invalid rates payload");
        }
        var now = Date.now();
        return {
          ok: true,
          source: json.source || "d1",
          observedAt: json.observedAt || null,
          records: json.records.map(function (r) { return normalizeRecord(r, now); }).filter(Boolean)
        };
      })
      .catch(function (err) {
        return { ok: false, source: "live-failed", error: String(err && err.message || err), records: [] };
      });
  }

  window.HOTEL_API_CONFIG = HOTEL_API_CONFIG;
  window.HotelApi = {
    config: HOTEL_API_CONFIG,
    STATUS: STATUS,
    loadHotels: loadHotels,
    queryRates: queryRates,
    normalizeRecord: normalizeRecord,
    officialUrl: officialUrl,
    isStale: isStale,
    pad: pad
  };
})();
