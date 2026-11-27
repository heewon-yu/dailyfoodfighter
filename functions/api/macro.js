/**
 * GET /api/macro — 경제지표지도 데이터 API.
 *
 * 흐름
 *  1) 같은 사이트의 정적 폴백 스냅샷(/macro/data/snapshot.json)을 먼저 읽는다(느리게 바뀌는 발표 일정·컨센서스용).
 *  2) 공개 API에서 실시간 값을 모아 스냅샷 위에 덮어쓴다.
 *  3) 실시간 수집이 실패한 지표는 스냅샷 값을 그대로 쓰고 stale 표시를 남긴다.
 */

import { collectMacro } from "../_shared/macro.js";

const CACHE_SECONDS = 300;

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=60, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300`,
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders,
    },
  });
}

async function loadSnapshot(request) {
  const url = new URL("/macro/data/snapshot.json", request.url);
  const res = await fetch(url.toString(), { cf: { cacheTtl: 600 } });
  if (!res.ok) throw new Error("snapshot HTTP " + res.status);
  return await res.json();
}

const METRIC_IDS = [
  "fear_greed", "vix", "yield10", "yield2", "spread", "hy_oas", "fed", "buffett",
  "sp500", "nasdaq", "kospi", "kosdaq", "usdkrw", "dxy", "wti", "gold", "btc",
];

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, { Allow: "GET" });
  }
  return handleGet(context);
}

async function handleGet(context) {
  const { request } = context;

  let snapshot = null;
  try {
    snapshot = await loadSnapshot(request);
  } catch (err) {
    snapshot = null;
  }

  let live = null;
  let liveError = null;
  try {
    live = await collectMacro();
  } catch (err) {
    liveError = String((err && err.message) || err);
  }

  const base = snapshot || { metrics: {}, calendar: null, generatedAt: null };
  const metrics = { ...(base.metrics || {}) };
  const sources = { ...(base.sources || {}) };
  const stale = [];

  // 발표 일정·컨센서스(스냅샷) 위에 BLS 공식 YoY 를 덮어쓴다.
  let calendar = base.calendar ? JSON.parse(JSON.stringify(base.calendar)) : null;
  if (live && live.metrics && live.metrics.prices && calendar) {
    const p = live.metrics.prices;
    const join = (block) => {
      if (!block) return;
      if (p.cpi && p.cpi.yoy != null) block.yoy = p.cpi.yoy;
      if (p.core && p.core.yoy != null) block.coreYoy = p.core.yoy;
      if (p.cpi && p.cpi.refMonth) block.refMonth = p.cpi.refMonth;
    };
    join(calendar.cpi);
    if (calendar.ppi && p.ppi && p.ppi.yoy != null) {
      calendar.ppi.yoy = p.ppi.yoy;
      if (p.ppi.refMonth) calendar.ppi.refMonth = p.ppi.refMonth;
    }
  }

  if (live) {
    for (const [key, value] of Object.entries(live.metrics)) {
      if (value === null || value === undefined) continue;
      // 버핏지수는 시총·GDP 조합이 모두 모였을 때만 교체한다.
      if (key === "buffett" && !value.ratioPct) continue;
      metrics[key] = value;
    }
    for (const [key, value] of Object.entries(live.sources)) {
      sources[key] = value;
    }
    // 실시간 수집이 비어 스냅샷 값을 그대로 쓰는 지표를 표시한다.
    for (const id of METRIC_IDS) {
      const liveValue = live.metrics[id];
      if (base.metrics && base.metrics[id] && (liveValue === null || liveValue === undefined)) {
        stale.push(id);
      }
    }
  }

  const body = {
    ok: Boolean(live) || Boolean(snapshot),
    generatedAt: (live && live.generatedAt) || (base && base.generatedAt) || null,
    marketAsOf: (live && live.marketAsOf) || (base && base.marketAsOf) || null,
    calendar,
    metrics,
    sources,
    degraded: !live,
    liveError,
    stale,
  };

  return jsonResponse(body);
}
