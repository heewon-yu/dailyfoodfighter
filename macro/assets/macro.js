/* 경제지표지도 — /api/macro 실시간 조회 → 실패 시 정적 스냅샷 폴백 */
(function () {
  "use strict";

  var API = "/api/macro";
  var SNAPSHOT = "/macro/data/snapshot.json";
  var REFRESH_MS = 5 * 60 * 1000;

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 숫자·시각 포맷 ---------- */
  function nf(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return "–";
    return Number(n).toLocaleString("ko-KR", {
      minimumFractionDigits: digits == null ? 0 : digits,
      maximumFractionDigits: digits == null ? 0 : digits,
    });
  }
  function signed(n, digits, suffix) {
    if (n === null || n === undefined || !isFinite(n)) return "–";
    var s = n > 0 ? "+" : n < 0 ? "−" : "";
    return s + nf(Math.abs(n), digits) + (suffix || "");
  }
  function arrow(n) {
    if (n === null || n === undefined || !isFinite(n) || n === 0) return "–";
    return n > 0 ? "▲" : "▼";
  }
  function moveClass(n) {
    if (n === null || n === undefined || !isFinite(n) || n === 0) return "flat";
    return n > 0 ? "up" : "down";
  }
  function kst(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    var p = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d).reduce(function (acc, x) { acc[x.type] = x.value; return acc; }, {});
    return (p.month || "") + "-" + (p.day || "") + " " + (p.hour || "") + ":" + (p.minute || "");
  }
  function kstDate(ymd) {
    if (!ymd || typeof ymd !== "string") return null;
    var m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[2] + "-" + m[3] : null;
  }
  function refMonth(released) {
    if (!released) return null;
    var d = new Date(released + "T00:00:00Z");
    if (isNaN(d.getTime())) return null;
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.getUTCFullYear() + "년 " + (d.getUTCMonth() + 1) + "월";
  }

  /* ---------- 공통 세터 ---------- */
  function set(id, html) {
    var el = $(id);
    if (el) el.innerHTML = html;
  }
  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }
  function badge(id, text, kind) {
    var el = $(id);
    if (!el) return;
    if (!text) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = text;
    el.className = "badge" + (kind ? " " + kind : "");
  }
  function setValue(id, main, suffix, small) {
    var el = $(id);
    if (!el) return;
    if (main == null || main === "–") {
      el.className = "mc__v na";
      el.textContent = "확인 불가";
      return;
    }
    el.className = "mc__v";
    el.innerHTML = main + (suffix ? '<small>' + suffix + "</small>" : "") + (small ? ' <small>' + small + "</small>" : "");
  }
  function setDelta(id, n, suffix, extra) {
    var el = $(id);
    if (!el) return;
    if (n === null || n === undefined || !isFinite(n)) {
      el.className = "mc__d flat";
      el.textContent = extra || "전일 비교 없음";
      return;
    }
    el.className = "mc__d " + moveClass(n);
    el.innerHTML = arrow(n) + " " + nf(Math.abs(n), suffix === "%" ? 2 : 2) + suffix +
      (extra ? ' <span style="color:var(--ink-3);font-weight:600">' + extra + "</span>" : "");
  }

  /* ---------- 지표별 렌더 ---------- */
  var FG_KO = {
    "extreme fear": ["극단적 공포", "bad"],
    fear: ["공포", "warn"],
    neutral: ["중립", "info"],
    greed: ["탐욕", "warn"],
    "extreme greed": ["극단적 탐욕", "bad"],
  };

  function renderFearGreed(m) {
    if (!m) return null;
    var score = Math.round(m.score);
    setValue("v-fear_greed", nf(score), " / 100");
    var k = FG_KO[String(m.rating || "").toLowerCase()] || ["–", ""];
    badge("b-fear_greed", k[0], k[1]);
    set("d-fear_greed", "전일 " + nf(m.prevClose, 1) + " · 1주 전 " + nf(m.prevWeek, 1) + " · 1달 전 " + nf(m.prevMonth, 1));
    setText("s-fear_greed", "CNN · " + (kst(m.asOf) || "–") + " 기준");
    setText("sum-fg", nf(score));
    setText("sum-fg-sub", k[0]);
    return score;
  }

  function renderVix(m) {
    if (!m) return null;
    setValue("v-vix", nf(m.price, 2));
    setDelta("d-vix", m.changePct, "%", " · 1개월 " + signed(m.monthPct, 1, "%"));
    setText("s-vix", "Yahoo Finance · " + (kst(m.asOf) || "–"));
    setText("sum-vix", nf(m.price, 1));
    setText("sum-vix-sub", arrow(m.changePct) + " " + nf(Math.abs(m.changePct || 0), 1) + "% 전일");
    return m.price;
  }

  function renderYield(id, m) {
    if (!m) return;
    setValue("v-" + id, nf(m.value, 2), "%");
    var diff = m.prev != null ? m.value - m.prev : null;
    setDelta("d-" + id, diff, "%p", " · " + (kstDate(m.date) || "") + " 기준");
    setText("s-" + id, "미 재무부 · " + (kstDate(m.date) || "–") + " 고시");
  }

  function renderSpread(m) {
    if (!m) return;
    setValue("v-spread", signed(m.value, 2, "%p"));
    var diff = m.prev != null ? m.value - m.prev : null;
    setDelta("d-spread", diff, "%p", " · 전일 " + signed(m.prev, 2, "%p"));
    if (m.value < 0) badge("b-spread", "역전", "bad");
    else if (m.value < 0.5) badge("b-spread", "평탄", "warn");
    else badge("b-spread", "정상", "good");
    setText("s-spread", "미 재무부 · " + (kstDate(m.date) || "–") + " 고시");
    setText("sum-spread", signed(m.value, 2, "%p"));
    setText("sum-spread-sub", m.value < 0 ? "장단기 역전" : "역전 아님");
  }

  function renderHyOas(m) {
    if (!m) return;
    setValue("v-hy_oas", nf(m.value, 2), "%p");
    var diff = m.prev != null ? m.value - m.prev : null;
    setDelta("d-hy_oas", diff, "%p", " · 1달 전 " + nf(m.prevMonth, 2) + "%p");
    var txt = "안정", kind = "good";
    if (m.value >= 7) { txt = "위험"; kind = "bad"; }
    else if (m.value >= 5) { txt = "경계"; kind = "warn"; }
    else if (m.value >= 3.5) { txt = "보통"; kind = "info"; }
    badge("b-hy_oas", txt, kind);
    var via = m.via && m.via.indexOf("Archive") >= 0 ? " (아카이브 스냅샷)" : "";
    setText("s-hy_oas", "FRED · " + (kstDate(m.date) || "–") + " 기준" + via);
  }

  function renderFed(m, fomcNext) {
    if (!m) return;
    if (m.low != null && m.high != null) {
      setValue("v-fed", nf(m.low, 2) + " ~ " + nf(m.high, 2), "%");
    }
    var sub = m.effr != null ? "실효금리(EFFR) " + nf(m.effr, 2) + "%" : "";
    set("d-fed", sub + (fomcNext ? ' <span style="color:var(--ink-3);font-weight:600">· 다음 FOMC ' + kstDate(fomcNext) + "</span>" : ""));
    setText("s-fed", "뉴욕 연은 · " + (kstDate(m.date) || "–") + " 기준");
  }

  function renderBuffett(m) {
    if (!m || m.ratioPct == null) return;
    setValue("v-buffett", nf(m.ratioPct, Math.abs(m.ratioPct) >= 100 ? 0 : 1), "%");
    set("d-buffett", "S&amp;P500 시총 " + usd(m.spCapUsd) + " ÷ GDP " + usd(m.gdpUsd) + "(" + m.gdpYear + ")");
    var kind = m.ratioPct >= 150 ? ["매우 높음", "bad"] : m.ratioPct >= 100 ? ["다소 높음", "warn"] : m.ratioPct >= 75 ? ["적정", "info"] : ["낮음", "good"];
    badge("b-buffett", kind[0], kind[1]);
    setText("s-buffett", "StockAnalysis · 세계은행 · " + (kstDate(m.asOf) || "–"));
  }

  function usd(v) {
    if (!isFinite(v)) return "–";
    if (v >= 1e12) return "$" + nf(v / 1e12, 2) + "T";
    if (v >= 1e9) return "$" + nf(v / 1e9, 1) + "B";
    return "$" + nf(v, 0);
  }

  function surprise(actual, cons) {
    if (actual == null || cons == null) return ["–", ""];
    if (Math.abs(actual - cons) < 0.001) return ["예상 부합", "info"];
    return actual > cons ? ["예상 상회", "bad"] : ["예상 하회", "good"];
  }

  function refLabel(block) {
    if (!block) return null;
    if (block.refMonth) {
      var m = String(block.refMonth).match(/^(\d{4})-(\d{2})/);
      if (m) return m[1] + "년 " + Number(m[2]) + "월";
    }
    return refMonth(block.released);
  }

  function renderCpi(c) {
    if (!c) {
      setValue("v-cpi", "–");
      setText("s-cpi", "발표 일정 확인 중");
      return;
    }
    if (c.yoy != null) setValue("v-cpi", nf(c.yoy, 1) + "%", " YoY", c.coreYoy != null ? "근원 " + nf(c.coreYoy, 1) + "%" : "");
    else setValue("v-cpi", "–");
    var s = surprise(c.mom, c.momCons);
    badge("b-cpi", s[0], s[1]);
    set("d-cpi", "전월비 " + signed(c.mom, 1, "%") + " (예상 " + signed(c.momCons, 1, "%") + ") · 근원 전월비 " + signed(c.coreMom, 1, "%"));
    setText("cpi-mom", c.mom != null ? signed(c.mom, 1, "%") : "–");
    setText("cpi-momcons", c.momCons != null ? signed(c.momCons, 1, "%") : "–");
    setText("cpi-coremom", c.coreMom != null ? signed(c.coreMom, 1, "%") : "–");
    setText("cpi-coremomcons", c.coreMomCons != null ? signed(c.coreMomCons, 1, "%") : "–");
    setText("s-cpi", "BLS · " + (refLabel(c) || "–") + "분 발표 " + (kstDate(c.released) || "–") +
      (c.next ? " · 다음 " + kstDate(c.next) : ""));
  }

  function renderPpi(c) {
    if (!c) {
      setValue("v-ppi", "–");
      setText("s-ppi", "발표 일정 확인 중");
      return;
    }
    if (c.yoy != null) setValue("v-ppi", nf(c.yoy, 1) + "%", " YoY", c.coreYoy != null ? "근원 " + nf(c.coreYoy, 1) + "%" : "");
    else setValue("v-ppi", "–");
    var s = surprise(c.yoy, c.yoyCons);
    if (s[0] === "–") s = surprise(c.mom, c.momCons);
    badge("b-ppi", s[0], s[1]);
    set("d-ppi", "예상 " + signed(c.yoyCons, 1, "%") + " · 전월비 " + signed(c.mom, 1, "%") + " (예상 " + signed(c.momCons, 1, "%") + ")");
    setText("ppi-mom", c.mom != null ? signed(c.mom, 1, "%") : "–");
    setText("ppi-momcons", c.momCons != null ? signed(c.momCons, 1, "%") : "–");
    setText("ppi-coreyoy", c.coreYoy != null ? nf(c.coreYoy, 1) + "%" : "–");
    setText("ppi-coreyoycons", c.coreYoyCons != null ? nf(c.coreYoyCons, 1) + "%" : "–");
    setText("s-ppi", "BLS · " + (refLabel(c) || "–") + "분 발표 " + (kstDate(c.released) || "–") +
      (c.next ? " · 다음 " + kstDate(c.next) : ""));
  }

  function renderIndex(id, m, digits) {
    if (!m) return;
    setValue("v-" + id, nf(m.price, digits == null ? 2 : digits));
    setDelta("d-" + id, m.changePct, "%", " · 1개월 " + signed(m.monthPct, 1, "%"));
    setText("s-" + id, "Yahoo Finance · " + (kst(m.asOf) || "–"));
  }

  function renderFx(id, m, prefix, digits) {
    if (!m) return;
    setValue("v-" + id, (prefix || "") + nf(m.price, digits == null ? 2 : digits));
    setDelta("d-" + id, m.changePct, "%", " · 1개월 " + signed(m.monthPct, 1, "%"));
    setText("s-" + id, "Yahoo Finance · " + (kst(m.asOf) || "–"));
  }

  function renderBtc(m) {
    if (!m) return;
    setValue("v-btc", "₩" + nf(m.krw, 0));
    setDelta("d-btc", m.changePct, "%", " · 업비트 24시간");
    setText("btc-usd", m.usd != null ? "$" + nf(m.usd, 0) : "–");
    setText("btc-fair", m.fairKrw != null ? "₩" + nf(m.fairKrw, 0) : "–");
    setText("btc-krw", "₩" + nf(m.krw, 0));
    setText("btc-kimchi", m.kimchiPct != null ? signed(m.kimchiPct, 2, "%") : "–");
    if (m.kimchiPct == null) badge("b-btc", null);
    else if (m.kimchiPct >= 5) badge("b-btc", "김프 높음", "warn");
    else if (m.kimchiPct >= 2) badge("b-btc", "김프 다소 높음", "info");
    else if (m.kimchiPct < 0) badge("b-btc", "역프리미엄", "info");
    else badge("b-btc", "김프 정상권", "good");
    setText("s-btc", "업비트 · " + (m.usdSource || "Coinbase") + " · 환율 " + nf(m.fxUsed, 2) + "원 · " + (kst(m.asOf) || "–"));
    setText("sum-kimchi", m.kimchiPct != null ? signed(m.kimchiPct, 2, "%") : "–");
    setText("sum-kimchi-sub", "₩" + nf(m.krw, 0));
  }

  /* ---------- 렌더 ---------- */
  function render(data) {
    var m = (data && data.metrics) || {};
    var cal = (data && data.calendar) || {};

    renderFearGreed(m.fear_greed);
    renderVix(m.vix);
    renderYield("yield10", m.yield10);
    renderYield("yield2", m.yield2);
    renderSpread(m.spread);
    renderHyOas(m.hy_oas);
    renderFed(m.fed, cal.fomcNext);
    renderBuffett(m.buffett);
    renderCpi(cal.cpi);
    renderPpi(cal.ppi);

    renderIndex("sp500", m.sp500);
    renderIndex("nasdaq", m.nasdaq);
    renderIndex("kospi", m.kospi, 2);
    renderIndex("kosdaq", m.kosdaq, 2);
    renderFx("usdkrw", m.usdkrw, "", 2);
    renderFx("dxy", m.dxy, "", 2);
    renderFx("wti", m.wti, "$", 2);
    renderFx("gold", m.gold, "$", 2);
    renderBtc(m.btc);

    var when = kst((data && data.generatedAt) || (data && data.snapshotBuiltAt));
    var us = m.sp500 && kst(m.sp500.asOf);
    setText("stamp", (when ? "갱신 " + when : "갱신 시각 확인 중") + (us ? " · 미국장 마감 " + us : ""));

    var missing = [];
    ["fear_greed", "vix", "yield10", "yield2", "spread", "hy_oas", "fed", "buffett", "sp500", "nasdaq", "kospi", "kosdaq", "usdkrw", "dxy", "wti", "gold", "btc"]
      .forEach(function (k) { if (!m[k]) missing.push(k); });

    var notice = $("notice");
    if (!notice) return;
    if (data && data.degraded) {
      notice.hidden = false;
      notice.textContent = "실시간 조회가 잠시 막혀 마지막으로 저장된 스냅샷 값을 보여주고 있습니다. 표시된 기준일을 확인해 주세요.";
    } else if (missing.length) {
      notice.hidden = false;
      notice.textContent = "일부 지표(" + missing.length + "개)를 지금 불러오지 못했습니다. 잠시 후 새로고침해 주세요.";
    } else {
      notice.hidden = true;
      notice.textContent = "";
    }
  }

  /* ---------- 로드 ---------- */
  var loading = false;

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error("timeout")); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  async function load() {
    if (loading) return;
    loading = true;
    var btn = $("refresh");
    if (btn) btn.disabled = true;
    try {
      var res = await withTimeout(fetch(API + "?t=" + Date.now(), { headers: { Accept: "application/json" } }), 15000);
      if (!res.ok) throw new Error("API " + res.status);
      var data = await res.json();
      if (!data || !data.metrics) throw new Error("empty");
      render(data);
      return;
    } catch (err) {
      /* 폴백: 정적 스냅샷 */
      try {
        var res2 = await withTimeout(fetch(SNAPSHOT + "?t=" + Date.now(), { cache: "no-store" }), 10000);
        if (!res2.ok) throw new Error("snapshot " + res2.status);
        var snap = await res2.json();
        snap.degraded = true;
        render(snap);
      } catch (err2) {
        var notice = $("notice");
        if (notice) {
          notice.hidden = false;
          notice.textContent = "지표를 불러오지 못했습니다. 잠시 후 새로고침 버튼을 눌러 주세요.";
        }
        setText("stamp", "연결 실패");
      }
    } finally {
      loading = false;
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = $("refresh");
    if (btn) btn.addEventListener("click", load);
    load();
    setInterval(function () {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
  });
})();
