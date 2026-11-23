// Cloudflare Pages Function for the public map's daily and cumulative visit counters.
// Bind a D1 database as MAP_VISITS_DB and apply docs/map-visitor-schema.sql.
// "Today" uses the Asia/Seoul calendar. A visitor counts once per map per KST day.
// The cumulative metric is the sum of deduplicated daily visits, not unique people.
const VIEWS = new Set(["food", "stay", "abroad"]);
const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

function koreaDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

async function stats(db, view, day) {
  const rows = await db.prepare(
    "SELECT period, visits FROM map_visit_counts WHERE view = ? AND period IN (?, 'all')"
  ).bind(view, day).all();
  const counts = Object.fromEntries((rows.results || []).map(row => [row.period, row.visits]));
  return { view, day, today: counts[day] || 0, total: counts.all || 0 };
}

export async function onRequestGet({ request, env }) {
  const view = new URL(request.url).searchParams.get("view");
  if (!VIEWS.has(view)) return json({ error: "Invalid map view" }, 400);
  if (!env.MAP_VISITS_DB) return json({ error: "Visitor statistics are not configured" }, 503);
  try {
    return json(await stats(env.MAP_VISITS_DB, view, koreaDay()));
  } catch {
    return json({ error: "Visitor statistics are unavailable" }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.MAP_VISITS_DB) return json({ error: "Visitor statistics are not configured" }, 503);
  // Same-origin browser interaction; don't accept arbitrary cross-site POSTs.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid origin" }, 403);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const view = payload && payload.view;
  const visitorId = payload && payload.visitorId;
  if (!VIEWS.has(view) || typeof visitorId !== "string" || !/^[a-f0-9-]{36}$/.test(visitorId)) {
    return json({ error: "Invalid visit" }, 400);
  }
  const day = koreaDay();
  try {
    // Store an irreversible, site-specific digest rather than the raw visitor identifier.
    const bytes = new TextEncoder().encode("dailyfoodfighter:map:v1:" + visitorId);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    const insert = await env.MAP_VISITS_DB.prepare(
      "INSERT OR IGNORE INTO map_visit_sessions (day, view, visitor_key) VALUES (?, ?, ?)"
    ).bind(day, view, key).run();
    if (insert.meta && insert.meta.changes === 1) {
      await env.MAP_VISITS_DB.batch([
        env.MAP_VISITS_DB.prepare(
          "INSERT INTO map_visit_counts (view, period, visits) VALUES (?, ?, 1) ON CONFLICT(view,period) DO UPDATE SET visits = visits + 1"
        ).bind(view, day),
        env.MAP_VISITS_DB.prepare(
          "INSERT INTO map_visit_counts (view, period, visits) VALUES (?, 'all', 1) ON CONFLICT(view,period) DO UPDATE SET visits = visits + 1"
        ).bind(view)
      ]);
    }
    return json(await stats(env.MAP_VISITS_DB, view, day));
  } catch {
    return json({ error: "Visitor statistics are unavailable" }, 503);
  }
}
