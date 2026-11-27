/* ==========================================================================
   힐튼포숙지도 (/hotel/) — 화면 로직
   탭1 포인트 숙박 조회 · 탭2 주말숙박권 조회 · 탭3 호텔 디렉터리 · 탭4 가이드
   데이터: /hotel/data/hotels.json (2026-11-27 디렉터리 관측 스냅샷)
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var WEEKEND_LABEL = "금·토·일";
  var WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

  var state = {
    data: null,
    hotels: [],
    cities: [],
    meta: null,
    fx: { KRW: 1 },
    tab: "points",
    points: { region: "한국", city: "Seoul", checkIn: "", checkOut: "", adults: "2" },
    weekend: { region: "한국", city: "Seoul", date: "", adults: "2" },
    dir: { brand: "", region: "", q: "", standardOnly: false, sort: "points-asc", limit: 24,
           checkIn: "", checkOut: "", adults: "2" },
    obs: { start: "", end: "" },
    live: {}
  };

  /* ---------------------------------------------------------------- utils */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function num(n) {
    if (n == null || !isFinite(n)) return "—";
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function won(n) {
    if (n == null || !isFinite(n)) return "—";
    return "₩" + num(n);
  }

  function parseNum(v) {
    var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : null;
  }

  function kstToday() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }

  function parts(iso) {
    var p = String(iso || "").split("-").map(Number);
    return { y: p[0] || 1970, m: p[1] || 1, d: p[2] || 1 };
  }

  function isoOf(t) {
    var d = new Date(t);
    return d.getUTCFullYear() + "-" + HotelApi.pad(d.getUTCMonth() + 1) + "-" + HotelApi.pad(d.getUTCDate());
  }

  function addDays(iso, days) {
    var p = parts(iso);
    return isoOf(Date.UTC(p.y, p.m - 1, p.d) + days * 86400000);
  }

  function weekday(iso) {
    var p = parts(iso);
    return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 5=금 6=토 0=일
  }

  function dateLabel(iso) {
    if (!iso) return "";
    var p = parts(iso);
    return p.m + "월 " + p.d + "일(" + WEEKDAY_KO[weekday(iso)] + ")";
  }

  /* 카드·힌트용 짧은 날짜: 올해면 12/27, 다른 해면 2027.2.13 */
  function shortDate(iso) {
    if (!iso) return "";
    var p = parts(iso);
    var thisYear = Number(kstToday().slice(0, 4));
    return p.y === thisYear ? p.m + "/" + p.d : p.y + "." + p.m + "." + p.d;
  }

  /* 관측일 기준 30일 창 — 디렉터리 카드가 보장하는 범위.
     예) 2026-11-27 관측 → 2026-11-27~2026-12-27 */
  function obsWindow(meta) {
    var start = String((meta && meta.observedAt) || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { start: "", end: "" };
    return { start: start, end: addDays(start, 30) };
  }

  function isWeekend(iso) {
    var w = weekday(iso);
    return w === 5 || w === 6 || w === 0;
  }

  function nextWeekend(iso) {
    var d = iso || kstToday();
    for (var i = 0; i < 8; i++) {
      if (isWeekend(d)) return d;
      d = addDays(d, 1);
    }
    return d;
  }

  function currencySymbol(cur) {
    var map = {
      KRW: "₩", USD: "$", JPY: "¥", EUR: "€", CNY: "¥", THB: "฿", SGD: "S$", HKD: "HK$",
      AED: "AED ", QAR: "QAR ", GBP: "£", AUD: "A$", KWD: "KWD ", OMR: "OMR ", MYR: "RM ",
      PHP: "₱", IDR: "Rp ", INR: "₹", MOP: "MOP ", MVR: "MVR ", SAR: "SAR ", TWD: "NT$"
    };
    return map[cur] || (cur + " ");
  }

  function cashText(amount, cur) {
    if (amount == null || !cur) return "";
    return currencySymbol(cur) + num(amount);
  }

  function krwOf(amount, cur, rates) {
    if (amount == null || !cur) return null;
    if (cur === "KRW") return amount;
    var r = rates && rates[cur];
    return r ? amount * r : null;
  }

  function badgeOf(h) {
    if (h.excluded) return { cls: "badge--excluded", text: "숙박권 제외 유형" };
    if (h.rewardType === "STANDARD") return { cls: "badge--standard", text: "숙박권 가능" };
    if (h.rewardType === "PREMIUM") return { cls: "badge--premium", text: "Premium만" };
    if (h.soldOut) return { cls: "badge--soldout", text: "매진" };
    if (h.rewardType === "NO_POINTS") return { cls: "badge--unknown", text: "포인트 없음" };
    return { cls: "badge--unknown", text: "포인트 정보 없음" };
  }

  /* --------------------------------------------------------------- data */

  function fillRegions(select, keepValue) {
    var regions = state.meta.regions || [];
    var counts = {};
    state.hotels.forEach(function (h) { counts[h.region] = (counts[h.region] || 0) + 1; });
    var html = '<option value="">전체 권역</option>';
    regions.forEach(function (r) {
      if (!counts[r]) return;
      html += '<option value="' + esc(r) + '">' + esc(r) + " (" + counts[r] + ")</option>";
    });
    select.innerHTML = html;
    if (keepValue != null) select.value = keepValue;
  }

  function fillCities(select, region, keepValue, standardOnly) {
    var list = state.cities.filter(function (c) {
      if (region && c.region !== region) return false;
      if (standardOnly && !c.standard) return false;
      return true;
    });
    var html = '<option value="">도시 선택</option>';
    list.forEach(function (c) {
      html += '<option value="' + esc(c.city) + '">' + esc(c.cityKo) +
        (c.cityKo !== c.city ? " " + esc(c.city) : "") +
        " · " + c.count + "곳" + (standardOnly ? " (숙박권 " + c.standard + ")" : "") + "</option>";
    });
    select.innerHTML = html;
    if (keepValue && list.some(function (c) { return c.city === keepValue; })) select.value = keepValue;
  }

  function hotelsInCity(city) {
    return state.hotels.filter(function (h) { return h.city === city; });
  }

  /* ---------------------------------------------------------- card render */

  function calcBlock(h, ctx) {
    var cur = h.cashCurrency || "KRW";
    var rate = cur === "KRW" ? 1 : (state.fx[cur] || "");
    var curOptions = ["KRW", "USD", "JPY", "EUR", "CNY", "THB", "SGD", "HKD", "AED", "QAR", "GBP", "AUD"];
    if (curOptions.indexOf(cur) === -1) curOptions.unshift(cur);
    var opts = curOptions.map(function (c) {
      return '<option value="' + c + '"' + (c === cur ? " selected" : "") + ">" + c + "</option>";
    }).join("");

    return '' +
      '<div class="calc" id="calc-' + esc(h.code) + '" hidden>' +
        '<div class="calc__head">' +
          '<span class="calc__title">1포인트 가치 계산</span>' +
          '<button type="button" class="btn--link" data-close="' + esc(h.code) + '">닫기</button>' +
        "</div>" +
        '<div class="calc__grid">' +
          '<div class="field"><label for="cash-' + esc(h.code) + '">세금 포함 현금가</label>' +
            '<input class="input" id="cash-' + esc(h.code) + '" inputmode="decimal" data-f="cash" value="' +
              (h.cashAmount != null ? esc(h.cashAmount) : "") + '" placeholder="예: 512706"></div>' +
          '<div class="field"><label for="cur-' + esc(h.code) + '">통화</label>' +
            '<select class="select" id="cur-' + esc(h.code) + '" data-f="cur">' + opts + "</select></div>" +
          '<div class="field" data-fxwrap' + (cur === "KRW" ? " hidden" : "") + '>' +
            '<label for="rate-' + esc(h.code) + '">환율 (1 ' + esc(cur) + ' = 원)</label>' +
            '<input class="input" id="rate-' + esc(h.code) + '" inputmode="decimal" data-f="rate" value="' +
              (rate || "") + '" placeholder="환율 입력"></div>' +
          '<div class="field"><label for="pts-' + esc(h.code) + '">필요 포인트</label>' +
            '<input class="input" id="pts-' + esc(h.code) + '" inputmode="numeric" data-f="points" value="' +
              (h.points != null ? esc(h.points) : "") + '" placeholder="예: 80000"></div>' +
          '<div class="field"><label for="extra-' + esc(h.code) + '">포인트 결제 추가비용 (원)</label>' +
            '<input class="input" id="extra-' + esc(h.code) + '" inputmode="decimal" data-f="extra" value="0"></div>' +
        "</div>" +
        '<div class="calc__out" data-out aria-live="polite"></div>' +
        '<p class="calc__note">값은 직접 입력·수정할 수 있습니다. 공식 예약 화면의 세금 포함 총액을 넣으면 실제 가치가 나옵니다.</p>' +
      "</div>";
  }

  function card(h, ctx) {
    var badge = badgeOf(h);
    var loc = (h.cityKo || h.city) + " · " + (h.countryKo || h.country);
    var pointsLine = h.points != null
      ? '<p class="hcard__points">' + num(h.points) + "<small>P</small></p>"
      : '<p class="hcard__points hcard__points--none">포인트 정보 없음</p>';
    var cashLine = h.cashAmount != null
      ? '<p class="hcard__cash">최저 현금가 ' + esc(cashText(h.cashAmount, h.cashCurrency)) +
        (h.cashKrw && h.cashCurrency !== "KRW" ? " ≈ " + won(h.cashKrw) : "") + "</p>"
      : '<p class="hcard__cash">현금가 미표시</p>';
    var vppLine = h.valuePerPoint != null
      ? '<p class="hcard__vpp">≈ ' + h.valuePerPoint.toFixed(2) + "원/P</p>"
      : "";

    var officialHref = h.url;
    var officialText = "호텔 페이지 ↗";
    if (ctx === "points" && state.points.checkIn) {
      officialHref = HotelApi.officialUrl(h.code, state.points.checkIn, state.points.checkOut, state.points.adults);
      officialText = "공식 날짜 조회 ↗";
    }
    if (ctx === "weekend") {
      officialHref = HotelApi.officialUrl(h.code, state.weekend.date,
        state.weekend.checkOut || addDays(state.weekend.date, 1), state.weekend.adults);
      officialText = "공식 날짜 조회 ↗";
    }
    if (ctx === "dir" && state.dir.checkIn && state.dir.checkOut) {
      officialHref = HotelApi.officialUrl(h.code, state.dir.checkIn, state.dir.checkOut, state.dir.adults);
      officialText = "공식 날짜 조회 ↗";
    }
    var cityHref = (ctx === "dir" && state.dir.checkIn && state.dir.checkOut && h.city)
      ? HotelApi.searchUrl(h.brand, h.city, h.country, state.dir.checkIn, state.dir.checkOut, state.dir.adults)
      : "";

    var saveLine = "";
    if (ctx === "weekend" && h.standardAvailable) {
      saveLine = h.cashKrw
        ? '<div class="hcard__save">숙박권 1장 사용 시 약 <b>' + won(h.cashKrw) + "</b> 절약 (Standard · " + WEEKEND_LABEL + " 숙박)</div>"
        : '<div class="hcard__save">가치 계산에서 현금가를 넣으면 절약액이 계산됩니다.</div>';
    }

    var obs = h.observedAtLabel
      ? "향후 30일 최저" + (state.obs.end ? "(" + shortDate(state.obs.end) + "까지)" : "")
      : "포인트 정보가 아직 없어요";

    var noteBits = [obs];
    if (h.note) noteBits.push(h.note);
    if (h.exclusionNote) noteBits.push(h.exclusionNote);

    return '' +
      '<article class="hcard" data-code="' + esc(h.code) + '">' +
        '<div class="hcard__top">' +
          '<span class="hcard__brand" data-brand="' + esc(h.brand) + '">' + esc(h.brandLabel) + "</span>" +
          '<span class="badge ' + badge.cls + '">' + esc(badge.text) + "</span>" +
        "</div>" +
        '<h3 class="hcard__name">' + esc(h.name) + "</h3>" +
        '<p class="hcard__loc">' + esc(loc) + "</p>" +
        '<div class="hcard__main">' +
          "<div>" + pointsLine + "</div>" +
          '<div class="hcard__side">' + cashLine + vppLine + "</div>" +
        "</div>" +
        saveLine +
        '<p class="hcard__note">' + esc(noteBits.join(" · ")) + "</p>" +
        '<div class="hcard__actions">' +
          '<a class="btn btn--sm" href="' + esc(officialHref) + '" target="_blank" rel="noopener noreferrer">' + officialText + "</a>" +
          (cityHref ? '<a class="btn btn--ghost btn--sm" href="' + esc(cityHref) + '" target="_blank" rel="noopener noreferrer">같은 도시 날짜 목록 ↗</a>' : "") +
          '<button type="button" class="btn btn--ghost btn--sm" data-calc="' + esc(h.code) + '">가치 계산</button>' +
        "</div>" +
        calcBlock(h, ctx) +
      "</article>";
  }

  /* -------------------------------------------------------- points query */

  function runPointsQuery(e) {
    if (e) e.preventDefault();
    var err = $("#points-error");
    err.hidden = true;
    var f = state.points;
    f.region = $("#p-region").value;
    f.city = $("#p-city").value;
    f.checkIn = $("#p-checkin").value;
    f.checkOut = $("#p-checkout").value;
    f.adults = $("#p-adults").value;

    if (!f.city) return showError(err, "도시를 선택해 주세요.");
    if (!f.checkIn || !f.checkOut) return showError(err, "체크인·체크아웃 날짜를 모두 선택해 주세요.");
    if (f.checkOut <= f.checkIn) return showError(err, "체크아웃 날짜는 체크인 다음 날 이후여야 합니다.");
    if (f.checkIn < kstToday()) return showError(err, "지난 날짜입니다. 오늘 이후 날짜를 선택해 주세요.");

    var list = hotelsInCity(f.city);
    var standard = list.filter(function (h) { return h.standardAvailable && !h.excluded; }).length;
    var pts = list.filter(function (h) { return h.points != null; }).map(function (h) { return h.points; });
    var minP = pts.length ? Math.min.apply(null, pts) : null;

    list.sort(function (a, b) {
      if (a.standardAvailable !== b.standardAvailable) return a.standardAvailable ? -1 : 1;
      if (a.points == null && b.points == null) return a.name.localeCompare(b.name);
      if (a.points == null) return 1;
      if (b.points == null) return -1;
      return a.points - b.points;
    });

    $("#points-result").hidden = false;
    $("#points-result").innerHTML = '' +
      '<div class="result__head">' +
        '<h2 class="result__title">' + esc(cityName(f.city)) + " 포인트 숙박</h2>" +
        '<p class="result__meta">' + esc(dateLabel(f.checkIn)) + " → " + esc(dateLabel(f.checkOut)) +
          " · 성인 " + esc(f.adults) + "명 · " + (f.checkOut ? nightCount(f.checkIn, f.checkOut) : 1) + "박</p>" +
      "</div>" +
      '<div class="result__summary">' +
        '<span class="sum-chip">하이엔드 <b>' + list.length + "</b>곳</span>" +
        '<span class="sum-chip">숙박권 가능(Standard) <b>' + standard + "</b>곳</span>" +
        (minP != null ? '<span class="sum-chip">최저 <b>' + num(minP) + "P</b></span>" : "") +
      "</div>" +
      '<div class="notice notice--amber"><span class="notice__icon" aria-hidden="true">!</span><div>' +
        "스탠다드룸 매진 시 프리미엄·매진으로 표시되며, 현금가 미표시는 별도 조회가 필요한 상태예요." +
      "</div></div>" +
      '<div class="cards' + (list.length === 1 ? " cards--single" : "") + '" id="points-cards">' +
        (list.length ? list.map(function (h) { return card(h, "points"); }).join("")
          : '<div class="empty"><b>이 도시에는 등록된 하이엔드 호텔이 없습니다.</b>다른 도시를 선택해 주세요.</div>') +
      "</div>";

    hydrateCalcs($("#points-result"));
    if (e) $("#points-result").scrollIntoView({ behavior: "smooth", block: "start" });

    if (HotelApi.config.mode === "live") {
      HotelApi.queryRates({
        city: f.city, checkIn: f.checkIn, checkOut: f.checkOut, adults: f.adults, rooms: 1
      }).then(function (res) {
        if (!res.ok || !res.records.length) return;
        applyLive(res.records, "points");
      });
    }
  }

  /* ------------------------------------------------------- weekend query */

  function runWeekendQuery(e) {
    if (e) e.preventDefault();
    var err = $("#weekend-error");
    err.hidden = true;
    var f = state.weekend;
    f.region = $("#w-region").value;
    f.city = $("#w-city").value;
    f.adults = $("#w-adults").value;

    if (!f.city) return showError(err, "도시를 선택해 주세요.");
    if (!f.date) return showError(err, "달력에서 금·토·일 날짜를 선택해 주세요.");
    if (!isWeekend(f.date)) {
      return showError(err, "주말숙박권은 " + WEEKEND_LABEL + " 숙박에만 사용할 수 있습니다.");
    }
    if (!f.checkOut || f.checkOut <= f.date) f.checkOut = addDays(f.date, 1);

    var all = hotelsInCity(f.city);
    var usable = all.filter(function (h) { return h.standardAvailable && !h.excluded; });
    var excluded = all.filter(function (h) { return h.excluded; });
    var savings = usable.map(function (h) { return h.cashKrw; }).filter(function (v) { return v != null; });
    var maxSave = savings.length ? Math.max.apply(null, savings) : null;

    usable.sort(function (a, b) {
      if (a.points == null && b.points == null) return 0;
      if (a.points == null) return 1;
      if (b.points == null) return -1;
      return a.points - b.points;
    });

    $("#weekend-result").hidden = false;
    $("#weekend-result").innerHTML = '' +
      '<div class="result__head">' +
        '<h2 class="result__title">' + esc(cityName(f.city)) + " 주말숙박권</h2>" +
        '<p class="result__meta">' + esc(dateLabel(f.date)) + " 체크인 · " + esc(dateLabel(f.checkOut)) +
          " 체크아웃 · " + nightCount(f.date, f.checkOut) + "박 · 성인 " + esc(f.adults) + "명</p>" +
      "</div>" +
      '<div class="result__summary">' +
        '<span class="sum-chip">사용 가능 <b>' + usable.length + "</b>곳</span>" +
        (maxSave != null ? '<span class="sum-chip">최대 절약 <b>' + won(maxSave) + "</b></span>" : "") +
        '<span class="sum-chip">기준 <b>Standard Room Reward</b></span>' +
      "</div>" +
      '<div class="cards' + (usable.length === 1 ? " cards--single" : "") + '" id="weekend-cards">' +
        (usable.length ? usable.map(function (h) { return card(h, "weekend"); }).join("")
          : '<div class="empty"><b>이 도시에는 선택한 날짜에 쓸 수 있는 Standard Room Reward 호텔이 없습니다.</b>' +
            "Premium Room Rewards만 열려 있거나, 아직 포인트를 조회하지 않은 상태입니다. " +
            "다른 도시를 선택하거나 공식 힐튼에서 날짜별 Standard 재고를 확인해 주세요.</div>") +
      "</div>" +
      (excluded.length
        ? '<p class="hint">올인클루시브 등 숙박권 제외 유형 ' + excluded.length + "곳은 목록에서 제외했습니다.</p>"
        : "") +
      '<p class="hint">절약액은 30일 최저 현금가 기준이에요. 리조트피·도시세는 별도입니다.</p>';

    hydrateCalcs($("#weekend-result"));
    if (e) $("#weekend-result").scrollIntoView({ behavior: "smooth", block: "start" });

    if (HotelApi.config.mode === "live") {
      HotelApi.queryRates({
        city: f.city, checkIn: f.date, checkOut: f.checkOut || addDays(f.date, 1),
        adults: f.adults, rooms: 1, weekendOnly: 1
      }).then(function (res) {
        if (!res.ok || !res.records.length) return;
        applyLive(res.records, "weekend");
      });
    }
  }

  function nightCount(a, b) {
    return Math.max(1, Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000));
  }

  function cityName(city) {
    var c = state.cities.filter(function (x) { return x.city === city; })[0];
    if (!c) return city;
    return c.cityKo === c.city ? c.city : (c.cityKo + " " + c.city);
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  /* ------------------------------------------------- live merge (D1 준비) */

  function applyLive(records, ctx) {
    var map = {};
    records.forEach(function (r) { map[r.hotelCode] = r; });
    var sel = ctx === "points" ? "#points-cards" : "#weekend-cards";
    var root = $(sel);
    if (!root) return;
    $$(".hcard", root).forEach(function (el) {
      var rec = map[el.getAttribute("data-code")];
      if (!rec) return;
      el.setAttribute("data-live", "1");
      var pts = $(".hcard__points", el);
      if (pts && rec.points != null) pts.innerHTML = num(rec.points) + "<small>P</small>";
      var side = $(".hcard__side", el);
      if (side && rec.cash != null) {
        var krw = krwOf(rec.cash, rec.currency, state.fx);
        side.innerHTML = '<p class="hcard__cash">세금 포함 ' + esc(cashText(rec.cash, rec.currency)) +
          (krw ? " ≈ " + won(krw) : "") + "</p>" +
          (krw && rec.points ? '<p class="hcard__vpp">≈ ' + (krw / rec.points).toFixed(2) + "원/P</p>" : "");
      }
    });
  }

  /* ------------------------------------------------------------ directory */

  function renderDirectory() {
    if (!state.meta) return;
    var d = state.dir;
    var q = d.q.trim().toLowerCase();
    var list = state.hotels.filter(function (h) {
      if (d.brand && h.brand !== d.brand) return false;
      if (d.region && h.region !== d.region) return false;
      if (d.standardOnly && !h.standardAvailable) return false;
      if (q) {
        var hay = [h.name, h.city, h.cityKo, h.country, h.countryKo, h.code, h.brandLabel].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    list.sort(function (a, b) {
      if (d.sort === "points-asc" || d.sort === "points-desc") {
        if (a.points == null && b.points == null) return a.name.localeCompare(b.name);
        if (a.points == null) return 1;
        if (b.points == null) return -1;
        return d.sort === "points-asc" ? a.points - b.points : b.points - a.points;
      }
      if (d.sort === "value-desc") {
        var av = a.valuePerPoint, bv = b.valuePerPoint;
        if (av == null && bv == null) return a.name.localeCompare(b.name);
        if (av == null) return 1;      // 미계산·Premium 전용·매진은 뒤로
        if (bv == null) return -1;
        if (bv !== av) return bv - av;
        if (a.points == null && b.points == null) return 0;
        if (a.points == null) return 1;
        if (b.points == null) return -1;
        return a.points - b.points;
      }
      if (d.sort === "name") return a.name.localeCompare(b.name);
      if (d.sort === "region") {
        var ri = (state.meta.regions || []).indexOf(a.region) - (state.meta.regions || []).indexOf(b.region);
        return ri !== 0 ? ri : a.city.localeCompare(b.city);
      }
      return 0;
    });

    $("#dir-count").textContent = list.length + "곳";
    var shown = list.slice(0, d.limit);
    $("#dir-grid").innerHTML = shown.length
      ? shown.map(function (h) { return card(h, "dir"); }).join("")
      : '<div class="empty"><b>조건에 맞는 호텔이 없습니다.</b>검색어나 필터를 바꿔 보세요.</div>';
    hydrateCalcs($("#dir-grid"));
    $("#dir-more-wrap").hidden = list.length <= d.limit;
  }

  function bindDirectory() {
    $$("[data-brand-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.dir.brand = btn.getAttribute("data-brand-filter");
        state.dir.limit = 24;
        $$("[data-brand-filter]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        renderDirectory();
      });
    });
    $("#dir-region").addEventListener("change", function () {
      state.dir.region = this.value; state.dir.limit = 24; renderDirectory();
    });
    var qTimer = null;
    $("#dir-q").addEventListener("input", function () {
      var v = this.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(function () { state.dir.q = v; state.dir.limit = 24; renderDirectory(); }, 180);
    });
    $("#dir-standard").addEventListener("click", function () {
      state.dir.standardOnly = !state.dir.standardOnly;
      this.setAttribute("aria-pressed", String(state.dir.standardOnly));
      state.dir.limit = 24;
      renderDirectory();
    });
    $("#dir-sort").value = state.dir.sort;   // 셀렉트 표시값을 실제 정렬 상태와 맞춘다
    $("#dir-sort").addEventListener("change", function () {
      state.dir.sort = this.value; renderDirectory();
    });
    $("#dir-more").addEventListener("click", function () {
      state.dir.limit += 24; renderDirectory();
    });

    /* 날짜를 고르면 디렉터리 카드의 '공식 날짜 조회'가 그 날짜의 예약 화면으로 바뀐다. */
    var ci = $("#dir-checkin");
    var co = $("#dir-checkout");
    if (ci && co) {
      var today = kstToday();
      ci.min = today;
      co.min = addDays(today, 1);
      ci.addEventListener("change", function () {
        co.min = this.value ? addDays(this.value, 1) : addDays(today, 1);
        if (this.value && (!co.value || co.value <= this.value)) co.value = addDays(this.value, 1);
        state.dir.checkIn = this.value;
        state.dir.checkOut = co.value;
        renderDirectory();
      });
      co.addEventListener("change", function () {
        state.dir.checkIn = ci.value;
        state.dir.checkOut = this.value;
        renderDirectory();
      });
      $("#dir-adults").addEventListener("change", function () {
        state.dir.adults = this.value; renderDirectory();
      });
      $("#dir-date-clear").addEventListener("click", function () {
        ci.value = ""; co.value = "";
        state.dir.checkIn = ""; state.dir.checkOut = "";
        renderDirectory();
      });
    }
  }

  /* -------------------------------------------------------------- calc */

  function hydrateCalcs(root) {
    $$(".calc", root).forEach(function (calcEl) {
      if (calcEl.getAttribute("data-bound") === "1") return;
      calcEl.setAttribute("data-bound", "1");
      calcEl.addEventListener("input", function (e) {
        if (e.target && e.target.getAttribute("data-f")) {
          if (e.target.getAttribute("data-f") === "cur") {
            var wrap = $("[data-fxwrap]", calcEl);
            var cur = e.target.value;
            if (wrap) wrap.hidden = cur === "KRW";
            var rateInput = $('[data-f="rate"]', calcEl);
            if (rateInput && cur !== "KRW" && !rateInput.value) rateInput.value = state.fx[cur] || "";
          }
          updateCalc(calcEl);
        }
      });
      calcEl.addEventListener("change", function () { updateCalc(calcEl); });
      updateCalc(calcEl);
    });
  }

  function updateCalc(calcEl) {
    var out = $("[data-out]", calcEl);
    if (!out) return;
    var cash = parseNum($('[data-f="cash"]', calcEl).value);
    var cur = $('[data-f="cur"]', calcEl).value;
    var rate = cur === "KRW" ? 1 : parseNum($('[data-f="rate"]', calcEl) ? $('[data-f="rate"]', calcEl).value : "");
    var points = parseNum($('[data-f="points"]', calcEl).value);
    var extra = parseNum($('[data-f="extra"]', calcEl).value) || 0;
    var cardEl = calcEl.closest(".hcard");
    var code = cardEl ? cardEl.getAttribute("data-code") : "";
    var hotel = state.hotels.filter(function (h) { return h.code === code; })[0] || {};

    if (cash == null || !points || points <= 0) {
      out.innerHTML = '<p class="calc__line">현금가와 필요 포인트를 입력하면 1포인트 가치가 계산됩니다.</p>';
      return;
    }
    if (cur !== "KRW" && !rate) {
      out.innerHTML = '<p class="calc__line">환율을 입력하면 원화 가치가 계산됩니다. (1 ' + esc(cur) + " = ? 원)</p>";
      return;
    }

    var cashKrw = cash * rate;
    var net = cashKrw - extra;
    var v = net / points;
    var grade, gradeCls;
    if (v >= 7) { grade = "대박 — 포인트로 결제하는 게 확실히 유리"; gradeCls = "great"; }
    else if (v >= 5) { grade = "양호 — 포인트 결제 추천"; gradeCls = "good"; }
    else if (v >= 3.5) { grade = "보통 — 현금·포인트 취향 차이"; gradeCls = "ok"; }
    else { grade = "현금 결제가 유리"; gradeCls = "cash"; }

    var fnr;
    if (hotel.excluded) {
      fnr = "이 호텔은 숙박권 제외 유형입니다.";
    } else if (hotel.rewardType === "PREMIUM") {
      fnr = "Premium Room Rewards만 열려 있어 숙박권을 쓸 수 없습니다.";
    } else if (hotel.rewardType === "STANDARD") {
      fnr = "숙박권 1장 사용 시 약 <b>" + won(Math.max(0, net)) + "</b> 절약 (Standard · " + WEEKEND_LABEL + " 숙박 기준)";
    } else {
      fnr = "Standard Room Reward 여부를 공식 조회에서 확인하면 숙박권 절약액을 계산할 수 있습니다.";
    }

    out.innerHTML = '' +
      '<div class="calc__value">' + v.toFixed(2) + "원/P</div>" +
      '<div class="calc__grade" data-grade="' + gradeCls + '">' + esc(grade) + "</div>" +
      '<div class="calc__line">세금 포함 현금가 <b>' + won(cashKrw) + "</b>" +
        (cur !== "KRW" ? " (" + esc(cashText(cash, cur)) + " × " + rate + "원)" : "") +
        " − 추가비용 " + won(extra) + " ÷ " + num(points) + "P</div>" +
      '<div class="calc__line">' + fnr + "</div>";
  }

  function bindCalcToggles() {
    document.addEventListener("click", function (e) {
      var openBtn = e.target.closest("[data-calc]");
      if (openBtn) {
        var code = openBtn.getAttribute("data-calc");
        var block = document.getElementById("calc-" + code);
        if (block) {
          block.hidden = !block.hidden;
          if (!block.hidden) {
            var input = $('[data-f="cash"]', block);
            if (input) setTimeout(function () { input.focus(); }, 40);
          }
        }
        return;
      }
      var closeBtn = e.target.closest("[data-close]");
      if (closeBtn) {
        var b = document.getElementById("calc-" + closeBtn.getAttribute("data-close"));
        if (b) b.hidden = true;
      }
    });
  }

  /* ---------------------------------------------------------------- tabs */

  function setTab(tab, push) {
    if (["points", "weekend", "directory", "guide"].indexOf(tab) === -1) tab = "points";
    state.tab = tab;
    $$(".hotel-tab").forEach(function (b) {
      var on = b.getAttribute("data-tab") === tab;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $("#panel-points").hidden = tab !== "points";
    $("#panel-weekend").hidden = tab !== "weekend";
    $("#panel-directory").hidden = tab !== "directory";
    $("#panel-guide").hidden = tab !== "guide";
    if (push !== false && location.hash !== "#" + tab) {
      try { history.replaceState(null, "", "#" + tab); } catch (err) { /* noop */ }
    }
    if (tab === "directory") renderDirectory();
  }

  function bindTabs() {
    $$(".hotel-tab").forEach(function (btn) {
      btn.addEventListener("click", function () { setTab(btn.getAttribute("data-tab")); });
      btn.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        var tabs = $$(".hotel-tab");
        var i = tabs.indexOf(btn) + (e.key === "ArrowRight" ? 1 : -1);
        var next = tabs[(i + tabs.length) % tabs.length];
        next.focus();
        setTab(next.getAttribute("data-tab"));
      });
    });
  }

  /* ---------------------------------------------------------------- init */

  function setDefaults() {
    var today = kstToday();
    var checkIn = addDays(today, 14);
    $("#p-checkin").value = checkIn;
    $("#p-checkin").min = today;
    $("#p-checkout").value = addDays(checkIn, 1);
    $("#p-checkout").min = addDays(today, 1);
    $("#p-checkin").addEventListener("change", function () {
      $("#p-checkout").min = addDays(this.value || today, 1);
      if (!$("#p-checkout").value || $("#p-checkout").value <= this.value) {
        $("#p-checkout").value = addDays(this.value || today, 1);
      }
    });

    var wd = nextWeekend(today);
    if (weekday(wd) === 0) wd = addDays(wd, 5);   // 일요일이면 다음 금요일로
    if (wd < today) wd = nextWeekend(today);
    setWeekendDate(wd);
    syncWeekendInputs();
    renderWeekendCalendar();
  }

  /* --------------------------------------------------- weekend calendar */
  /* 금·토·일만 고를 수 있는 달력. 체크아웃은 금→일(2박)·금→토·토→일·일→월만 허용. */
  function maxCheckout(iso) {
    var w = weekday(iso);
    if (w === 5) return addDays(iso, 2);   // 금 → 일요일 체크아웃(2박)
    return addDays(iso, 1);                // 토 → 일, 일 → 월
  }

  function setWeekendDate(iso) {
    if (!iso || !isWeekend(iso)) return;
    state.weekend.date = iso;
    state.weekend.checkOut = addDays(iso, 1);
  }

  function syncWeekendInputs() {
    var d = $("#w-date");
    var c = $("#w-checkout");
    if (d) d.value = state.weekend.date || "";
    if (c) c.value = state.weekend.checkOut || "";
  }

  function updateWeekendPicked() {
    var el = $("#w-picked");
    if (!el) return;
    var f = state.weekend;
    if (!f.date) { el.textContent = "날짜를 선택하세요"; return; }
    el.textContent = dateLabel(f.date) + " → " + dateLabel(f.checkOut) + " · " + nightCount(f.date, f.checkOut) + "박";
  }

  function renderWeekendCalendar() {
    var box = $("#w-cal-months");
    if (!box) return;
    var today = kstToday();
    var p = parts(today);
    var html = "";
    for (var i = 0; i < 12; i++) {         // 이번 달 포함 12개월 — 날짜 범위 제한 없이 선택
      var m = p.m + i, y = p.y;
      while (m > 12) { m -= 12; y += 1; }
      html += weekendMonth(y, m, today);
    }
    box.innerHTML = html;
    updateWeekendPicked();
  }

  function weekendMonth(y, m, today) {
    var first = isoOf(Date.UTC(y, m - 1, 1));
    var pad = weekday(first);                       // 0=일 … 6=토
    var days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var f = state.weekend;
    var cells = "";
    for (var i = 0; i < pad; i++) cells += '<span class="wcal__cell is-blank"></span>';
    for (var d = 1; d <= days; d++) {
      var iso = isoOf(Date.UTC(y, m - 1, d));
      var w = weekday(iso);
      var ok = (w === 5 || w === 6 || w === 0) && iso >= today;
      var cls = "wcal__cell" + (ok ? " is-weekend" : "") +
        (iso === f.date ? " is-on" : "") +
        (iso === f.checkOut ? " is-out" : "") +
        (f.date && iso > f.date && iso < (f.checkOut || "") ? " is-range" : "");
      cells += ok
        ? '<button type="button" class="' + cls + '" data-wday="' + iso + '" aria-label="' +
            m + "월 " + d + "일(" + WEEKDAY_KO[w] + ')">' + d + "</button>"
        : '<span class="' + cls + '">' + d + "</span>";
    }
    return '<div class="wcal__month">' +
      '<div class="wcal__mname">' + y + "년 " + m + "월</div>" +
      '<div class="wcal__grid">' +
        ["일", "월", "화", "수", "목", "금", "토"].map(function (n) {
          return '<span class="wcal__dow">' + n + "</span>";
        }).join("") +
        cells +
      "</div></div>";
  }

  function bindWeekendCalendar() {
    var box = $("#w-cal-months");
    if (!box) return;
    box.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-wday]");
      if (!btn) return;
      var iso = btn.getAttribute("data-wday");
      var f = state.weekend;
      // 이미 체크인을 고른 뒤 그 범위 안의 날짜를 누르면 체크아웃 변경
      if (f.date && iso > f.date && iso <= maxCheckout(f.date)) {
        f.checkOut = iso;
      } else {
        setWeekendDate(iso);
      }
      syncWeekendInputs();
      renderWeekendCalendar();
      var err = $("#weekend-error");
      if (err) err.hidden = true;
    });
  }

  function bindForms() {
    $("#form-points").addEventListener("submit", runPointsQuery);
    $("#form-weekend").addEventListener("submit", runWeekendQuery);

    $("#p-region").addEventListener("change", function () {
      fillCities($("#p-city"), this.value, "", false);
      $("#p-city").value = $("#p-city").options.length > 1 ? $("#p-city").options[1].value : "";
    });
    $("#w-region").addEventListener("change", function () {
      fillCities($("#w-city"), this.value, "", true);
      $("#w-city").value = $("#w-city").options.length > 1 ? $("#w-city").options[1].value : "";
    });
    $("#w-city").addEventListener("change", function () {
      // 도시를 바꾸면 가장 가까운 금요일로 다시 맞춘다
      var d = kstToday();
      for (var i = 0; i < 8; i++) {
        if (weekday(d) === 5) break;
        d = addDays(d, 1);
      }
      setWeekendDate(d);
      syncWeekendInputs();
      renderWeekendCalendar();
    });
  }

  function renderHeroStats() {
    var c = state.meta.counts || {};
    var el = $("#hero-stats");
    if (!el) return;
    el.innerHTML = '' +
      '<li><b>' + num(state.meta.masterCount || 119) + "</b>곳 하이엔드</li>" +
      '<li><b>' + num((c.standard || 0) + (c.premium || 0) + (c.other || 0)) + "</b>곳 포인트 확인</li>" +
      '<li><b>' + num(c.standard || 0) + "</b>곳 숙박권 가능</li>" +
      '<li><b>' + esc(String(state.meta.observedAt || "").slice(0, 10)) + "</b> 기준</li>";
  }

  /* 관측 창(30일) 표기 — '향후 30일'이 어느 날짜까지인지 화면에 명시한다. */
  function fillObsWindow() {
    var o = state.obs || { start: "", end: "" };
    if (!o.start) return;
    var range = o.start.replace(/-/g, ".") + "~" + o.end.replace(/-/g, ".");
    $$("[data-obs-window]").forEach(function (el) { el.textContent = "향후 30일(" + range + ")"; });
    $$("[data-obs-range]").forEach(function (el) { el.textContent = range; });
    $$("[data-obs-end]").forEach(function (el) { el.textContent = shortDate(o.end); });
    $$("[data-obs-start]").forEach(function (el) { el.textContent = shortDate(o.start); });
  }

  function init() {
    setDefaults();
    bindTabs();
    bindForms();
    bindDirectory();
    bindWeekendCalendar();
    bindCalcToggles();

    var hash = (location.hash || "").replace("#", "");
    setTab(hash || "points", false);

    HotelApi.loadHotels().then(function (data) {
      state.data = data;
      state.meta = data.meta || {};
      state.meta.counts = state.meta.counts || {};
      state.meta.regions = state.meta.regions || [];
      state.fx = Object.assign({ KRW: 1 }, (state.meta.fx && state.meta.fx.rates) || {});
      state.hotels = (data.hotels || []).filter(function (h) { return h.status === "open"; });
      state.cities = data.cities || [];

      renderHeroStats();
      state.obs = obsWindow(state.meta);
      fillObsWindow();
      fillRegions($("#p-region"), "한국");
      fillRegions($("#w-region"), "한국");
      fillRegions($("#dir-region"), "");
      fillCities($("#p-city"), "한국", "Seoul", false);
      fillCities($("#w-city"), "한국", "Seoul", true);
      if (!$("#p-city").value && $("#p-city").options.length > 1) $("#p-city").selectedIndex = 1;
      if (!$("#w-city").value && $("#w-city").options.length > 1) $("#w-city").selectedIndex = 1;
      renderDirectory();
      $("#data-status").textContent = (state.meta.observedAt ? String(state.meta.observedAt).slice(0, 10) : "") + " 기준";

      if (state.tab === "points") runPointsQuery();
      if (state.tab === "weekend") runWeekendQuery();
    }).catch(function (err) {
      $("#data-status").textContent = "데이터를 불러오지 못했습니다";
      var box = $("#load-error");
      if (box) {
        box.hidden = false;
        box.textContent = "호텔 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요. (" +
          String(err && err.message || err) + ")";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
