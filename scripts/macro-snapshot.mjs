#!/usr/bin/env node
/**
 * 경제지표지도 폴백 스냅샷 생성기.
 *
 *   node scripts/macro-snapshot.mjs
 *
 * functions/_shared/macro.js 의 수집 로직으로 실시간 지표를 모으고,
 * 나스닥 경제캘린더에서 CPI·PPI 발표치/컨센서스/다음 발표일을 확인해
 * macro/data/snapshot.json 으로 저장한다. API가 죽어도 화면이 마지막 값으로 뜨게 하는 용도.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collectMacro } from "../functions/_shared/macro.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "macro", "data", "snapshot.json");

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

/** 나스닥 캘린더에 주말 날짜로 잡힌 발표는 직전 금요일로 보정한다. */
function shiftWeekend(date) {
  const d = new Date(date + "T00:00:00Z");
  const wd = d.getUTCDay();
  if (wd === 6) d.setUTCDate(d.getUTCDate() - 1);
  else if (wd === 0) d.setUTCDate(d.getUTCDate() - 2);
  return ymd(d);
}

function parsePct(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/&nbsp;/g, "").replace(/%/g, "").replace(/,/g, "").trim();
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

async function calendarDay(date) {
  const url = `https://api.nasdaq.com/api/calendar/economicevents?date=${date}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", Origin: "https://www.nasdaq.com" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return (data && data.data && data.data.rows) || [];
}

function usInflationRows(rows) {
  const names = new Set(["CPI", "Core CPI", "PPI", "Core PPI"]);
  return rows.filter((r) => {
    const c = String(r.country || "").trim().toUpperCase();
    return (c === "UNITED STATES" || c === "US" || c === "USA") && names.has(String(r.eventName || "").trim());
  });
}

/** 한 발표일의 이벤트를 {CPI:{mom:{act,cons,prev}, yoy:{...}}, ...} 형태로 정리 */
function summarize(rows) {
  const out = { CPI: [], "Core CPI": [], PPI: [], "Core PPI": [] };
  for (const r of usInflationRows(rows)) {
    const name = String(r.eventName).trim();
    out[name].push({
      act: parsePct(r.actual),
      cons: parsePct(r.consensus),
      prev: parsePct(r.previous),
      mom: null,
      yoy: null,
    });
  }
  const result = {};
  for (const [name, entries] of Object.entries(out)) {
    if (!entries.length) continue;
    const mom = entries.find((e) => e.act !== null && Math.abs(e.act) < 2) || entries.find((e) => Math.abs(e.cons || 9) < 2) || null;
    const yoy = entries.find((e) => e.act !== null && Math.abs(e.act) >= 2) || null;
    result[name] = { mom, yoy, entries };
  }
  return result;
}

async function main() {
  const now = new Date();
  const days = [];
  // 주말에도 캘린더 항목이 잡히는 경우가 있어 요일 구분 없이 훑는다.
  for (let i = -50; i <= 50; i += 1) {
    const d = new Date(now.getTime() + i * 86400000);
    days.push(ymd(d));
  }

  const perDay = {};
  const batch = 6;
  for (let i = 0; i < days.length; i += batch) {
    const slice = days.slice(i, i + batch);
    await Promise.all(
      slice.map(async (d) => {
        try {
          perDay[d] = await calendarDay(d);
        } catch (err) {
          perDay[d] = [];
      }
      })
    );
  }

  const cpiDays = [];
  const ppiDays = [];
  const fomcDays = [];
  for (const [date, rows] of Object.entries(perDay)) {
    const sum = summarize(rows);
    if (sum.CPI || sum["Core CPI"]) cpiDays.push({ date, sum });
    if (sum.PPI || sum["Core PPI"]) ppiDays.push({ date, sum });
    for (const r of rows) {
      const n = String(r.eventName || "");
      const c = String(r.country || "").toUpperCase();
      if ((c === "UNITED STATES" || c === "US") && /Fed Interest Rate Decision/.test(n)) fomcDays.push(date);
    }
  }
  cpiDays.sort((a, b) => (a.date < b.date ? -1 : 1));
  ppiDays.sort((a, b) => (a.date < b.date ? -1 : 1));
  fomcDays.sort();

  const today = ymd(now);

  function buildBlock(list, primary, secondary) {
    const released = list.filter((d) => {
      const p = d.sum[primary];
      const s = d.sum[secondary];
      return (p && p.mom && p.mom.act !== null) || (s && s.mom && s.mom.act !== null);
    });
    const upcoming = list.filter((d) => d.date > today && d.date > (released.length ? released[released.length - 1].date : ""));
    const last = released.length ? released[released.length - 1] : null;
    const next = upcoming.length ? upcoming[0] : null;
    if (!last) return null;

    const p = last.sum[primary] || {};
    const s = last.sum[secondary] || {};
    const nextP = next && next.sum[primary] ? next.sum[primary] : null;
    const nextS = next && next.sum[secondary] ? next.sum[secondary] : null;

    // YoY가 발표일에 없으면 다음 발표일 이벤트의 '직전치'가 그 값이다.
    const pickPrev = (block) => {
      if (!block || !Array.isArray(block.entries)) return null;
      const hit = block.entries.find((e) => e.prev !== null && Math.abs(e.prev) >= 1.5);
      return hit ? hit.prev : null;
    };
    const yoyPrev = !(p.yoy && p.yoy.act !== null) ? pickPrev(nextP) : null;
    const coreYoYPrev = !(s.yoy && s.yoy.act !== null) ? pickPrev(nextS) : null;

    return {
      released: shiftWeekend(last.date),
      releasedRaw: last.date,
      next: next ? shiftWeekend(next.date) : null,
      nextRaw: next ? next.date : null,
      mom: p.mom ? p.mom.act : null,
      momCons: p.mom ? p.mom.cons : null,
      momPrev: p.mom ? p.mom.prev : null,
      yoy: p.yoy && p.yoy.act !== null ? p.yoy.act : yoyPrev,
      yoyCons: p.yoy ? p.yoy.cons : null,
      coreMom: s.mom ? s.mom.act : null,
      coreMomCons: s.mom ? s.mom.cons : null,
      coreYoy: s.yoy && s.yoy.act !== null ? s.yoy.act : coreYoYPrev,
      coreYoyCons: s.yoy ? s.yoy.cons : null,
    };
  }

  const calendar = {
    cpi: buildBlock(cpiDays, "CPI", "Core CPI"),
    ppi: buildBlock(ppiDays, "PPI", "Core PPI"),
    fomcNext: fomcDays.find((d) => d >= today) || null,
    scannedFrom: days[0],
    scannedTo: days[days.length - 1],
  };

  const live = await collectMacro();

  // BLS 공식 YoY·기준월을 캘린더에 반영 (나스닥 캘린더에 없는 값 보충)
  const prices = live.metrics && live.metrics.prices;
  if (prices) {
    if (calendar.cpi) {
      if (prices.cpi && prices.cpi.yoy != null) calendar.cpi.yoy = prices.cpi.yoy;
      if (prices.core && prices.core.yoy != null) calendar.cpi.coreYoy = prices.core.yoy;
      if (prices.cpi && prices.cpi.refMonth) calendar.cpi.refMonth = prices.cpi.refMonth;
    }
    if (calendar.ppi) {
      if (prices.ppi && prices.ppi.yoy != null) calendar.ppi.yoy = prices.ppi.yoy;
      if (prices.ppi && prices.ppi.refMonth) calendar.ppi.refMonth = prices.ppi.refMonth;
    }
  }

  const snapshot = {
    ...live,
    calendar,
    snapshotBuiltAt: new Date().toISOString(),
  };

  await writeFile(OUT, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log("wrote", OUT);
  console.log("calendar", JSON.stringify(calendar));
  console.log("sources", JSON.stringify(live.sources));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
