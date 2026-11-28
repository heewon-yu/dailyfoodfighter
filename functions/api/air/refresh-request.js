/**
 * 마일지도 (MILEMAP · /air/) — 웹 재조회 요청 큐 (요청 등록 / 상태 조회)
 *
 * POST /api/air/refresh-request        (공개 — 로그인 없이 호출)
 *   body: { origin:"ICN", destination:"ORD", month:"2026-12" }
 *   응답: { ok:true, status:"queued" | "deduped" | "fresh_enough" |
 *                   "failed_cooldown" | "daily_limit_reached" | "rate_limited",
 *           item:{id, origin, destination, month, status, requested_at,
 *                 started_at, finished_at, error_msg, attempts},
 *           fresh:{rows, collected_at, hours, fresh},
 *           queue:{pending, processing, requested_24h, daily_limit},
 *           retry_after_seconds? }
 *
 * GET /api/air/refresh-request?origin=ICN&destination=ORD&month=2026-12   (공개)
 *   프론트가 상태 배지를 갱신할 때 쓰는 상태 조회. 같은 모양(ok/status/item/fresh/queue)을
 *   돌려주되, 큐에 아무 요청도 없으면 status 는 "none" 이다.
 *
 * 안전장치 (Akamai 403 · D1 무료 한도 보호)
 *   · 그 노선-월의 D1 collected_at 이 FRESH_HOURS(2시간) 이내면 큐에 넣지 않는다(fresh_enough).
 *     데이터가 아예 없으면(rows 0) 신선하지 않은 것으로 보고 큐에 넣는다.
 *   · 같은 노선-월에 pending/processing 이 있으면 새로 넣지 않는다(deduped).
 *     부분 유니크 인덱스(idx_air_refresh_queue_active)가 동시 요청도 막는다.
 *   · 최근 FAILED_COOLDOWN_MINUTES(30분) 안에 실패한 요청이 있으면 다시 넣지 않는다.
 *     (같은 403/캡차를 반복 요청하지 않도록)
 *   · 24시간 전체 요청 상한 DAILY_REQUEST_LIMIT(40건) → daily_limit_reached.
 *   · 같은 요청자 상한 REQUESTER_DAILY_LIMIT(10건) → rate_limited.
 *     요청자는 원본 IP 가 아니라 IP 의 SHA-256 앞 12자만 저장한다.
 *
 * 스키마: 같은 폴더 schema.sql (테이블 air_refresh_queue)
 * D1 바인딩(AIR_DB)이 없으면 503 database_unavailable.
 */

const PROGRAM = 'KE_SKYPASS';
const FRESH_HOURS = 2;
const DAILY_REQUEST_LIMIT = 40;
const REQUESTER_DAILY_LIMIT = 10;
const FAILED_COOLDOWN_MINUTES = 30;

function json(data, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache
    }
  });
}

function iata(value) {
  const v = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(v) ? v : null;
}

function isoMonth(value) {
  const v = String(value || '').trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

function isoToMs(value) {
  if (!value) return null;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

function sinceIso(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

/** 요청자 구분값 — 원본 IP 는 저장하지 않고 해시 앞 12자만 쓴다. */
async function requesterId(request) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!ip) return 'anon';
  try {
    const data = new TextEncoder().encode('milemap-air-refresh:' + ip);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return 'ip:' + [...new Uint8Array(digest)]
      .slice(0, 6)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch (err) {
    return 'anon';
  }
}

function itemOf(row) {
  if (!row) return null;
  return {
    id: row.id,
    origin: row.origin,
    destination: row.destination,
    month: row.month,
    status: row.status,
    requested_at: row.requested_at || null,
    started_at: row.started_at || null,
    finished_at: row.finished_at || null,
    error_msg: row.error_msg || null,
    attempts: Number.isFinite(row.attempts) ? row.attempts : 0
  };
}

/** 그 노선-월의 D1 수집 시각과 신선도(2시간 이내인지). */
async function freshness(db, origin, destination, month) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n, MAX(collected_at) AS latest
         FROM air_award_dates
        WHERE program = ? AND origin = ? AND destination = ? AND month = ?`
    )
    .bind(PROGRAM, origin, destination, month)
    .first();

  const rows = row && Number.isFinite(row.n) ? row.n : 0;
  const collectedAt = (row && row.latest) || null;
  const at = isoToMs(collectedAt);
  const hours = at === null ? null : Math.round(((Date.now() - at) / 36e5) * 10) / 10;

  return {
    rows,
    collected_at: collectedAt,
    hours,
    fresh: rows > 0 && hours !== null && hours <= FRESH_HOURS
  };
}

async function queueSummary(db) {
  const windowStart = sinceIso(24 * 60);
  const [pending, processing, requested] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM air_refresh_queue WHERE status = 'pending'`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM air_refresh_queue WHERE status = 'processing'`).first(),
    db
      .prepare(`SELECT COUNT(*) AS n FROM air_refresh_queue WHERE requested_at >= ?`)
      .bind(windowStart)
      .first()
  ]);

  return {
    pending: pending && Number.isFinite(pending.n) ? pending.n : 0,
    processing: processing && Number.isFinite(processing.n) ? processing.n : 0,
    requested_24h: requested && Number.isFinite(requested.n) ? requested.n : 0,
    daily_limit: DAILY_REQUEST_LIMIT
  };
}

/** 같은 노선-월의 가장 최근 요청 1건(상태 무관). */
async function latestRequest(db, origin, destination, month) {
  return db
    .prepare(
      `SELECT * FROM air_refresh_queue
        WHERE origin = ? AND destination = ? AND month = ?
        ORDER BY id DESC LIMIT 1`
    )
    .bind(origin, destination, month)
    .first();
}

async function activeRequest(db, origin, destination, month) {
  return db
    .prepare(
      `SELECT * FROM air_refresh_queue
        WHERE origin = ? AND destination = ? AND month = ?
          AND status IN ('pending', 'processing')
        ORDER BY id DESC LIMIT 1`
    )
    .bind(origin, destination, month)
    .first();
}

function readScope(source) {
  const origin = iata(source.origin);
  const destination = iata(source.destination);
  const month = isoMonth(source.month);
  if (!origin) return { error: 'invalid_origin' };
  if (!destination) return { error: 'invalid_destination' };
  if (!month) return { error: 'invalid_month' };
  if (origin === destination) return { error: 'same_origin_destination' };
  return { origin, destination, month };
}

export async function onRequestPost({ request, env }) {
  const db = env.AIR_DB;
  if (!db) return json({ ok: false, error: 'database_unavailable' }, 503);

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const scope = readScope(body || {});
  if (scope.error) return json({ ok: false, error: scope.error }, 400);
  const { origin, destination, month } = scope;

  try {
    const fresh = await freshness(db, origin, destination, month);

    // 1) 이미 최신 — 큐에 넣지 않는다.
    if (fresh.fresh) {
      const current = await activeRequest(db, origin, destination, month);
      return json({
        ok: true,
        status: 'fresh_enough',
        item: itemOf(current),
        fresh,
        queue: await queueSummary(db),
        fresh_hours: FRESH_HOURS
      });
    }

    // 2) 이미 대기/처리 중 — 중복 적재하지 않는다.
    const active = await activeRequest(db, origin, destination, month);
    if (active) {
      return json({
        ok: true,
        status: 'deduped',
        item: itemOf(active),
        fresh,
        queue: await queueSummary(db),
        fresh_hours: FRESH_HOURS
      });
    }

    // 3) 최근 실패 — 같은 실패를 반복하지 않도록 잠시 쉰다.
    const latest = await latestRequest(db, origin, destination, month);
    const failedAt = latest && latest.status === 'failed' ? isoToMs(latest.finished_at || latest.requested_at) : null;
    if (failedAt !== null && Date.now() - failedAt < FAILED_COOLDOWN_MINUTES * 60 * 1000) {
      const retryAfter = Math.max(
        1,
        Math.ceil((FAILED_COOLDOWN_MINUTES * 60 * 1000 - (Date.now() - failedAt)) / 1000)
      );
      return json({
        ok: true,
        status: 'failed_cooldown',
        item: itemOf(latest),
        fresh,
        queue: await queueSummary(db),
        retry_after_seconds: retryAfter,
        fresh_hours: FRESH_HOURS
      });
    }

    // 4) 상한 확인 — 24시간 전체 40건, 같은 요청자 10건.
    const requester = await requesterId(request);
    const queue = await queueSummary(db);
    if (queue.requested_24h >= DAILY_REQUEST_LIMIT) {
      return json({
        ok: true,
        status: 'daily_limit_reached',
        item: null,
        fresh,
        queue,
        fresh_hours: FRESH_HOURS
      });
    }

    const mine = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM air_refresh_queue
          WHERE requester = ? AND requested_at >= ?`
      )
      .bind(requester, sinceIso(24 * 60))
      .first();
    const mineCount = mine && Number.isFinite(mine.n) ? mine.n : 0;
    if (mineCount >= REQUESTER_DAILY_LIMIT) {
      return json({
        ok: true,
        status: 'rate_limited',
        item: null,
        fresh,
        queue,
        fresh_hours: FRESH_HOURS
      });
    }

    // 5) 등록 — 부분 유니크 인덱스가 동시 요청의 중복을 막는다.
    const nowIso = new Date().toISOString();
    let inserted;
    try {
      inserted = await db
        .prepare(
          `INSERT INTO air_refresh_queue
             (origin, destination, month, status, requested_at, attempts, requester)
           VALUES (?, ?, ?, 'pending', ?, 0, ?)`
        )
        .bind(origin, destination, month, nowIso, requester)
        .run();
    } catch (err) {
      if (String(err).toUpperCase().includes('UNIQUE')) {
        const current = await activeRequest(db, origin, destination, month);
        return json({
          ok: true,
          status: 'deduped',
          item: itemOf(current),
          fresh,
          queue: await queueSummary(db),
          fresh_hours: FRESH_HOURS
        });
      }
      throw err;
    }

    const id = inserted && inserted.meta ? inserted.meta.last_row_id : null;
    const saved = id
      ? await db.prepare(`SELECT * FROM air_refresh_queue WHERE id = ?`).bind(id).first()
      : null;

    return json({
      ok: true,
      status: 'queued',
      item: itemOf(saved),
      fresh,
      queue: await queueSummary(db),
      fresh_hours: FRESH_HOURS
    });
  } catch (err) {
    return json({ ok: false, error: 'queue_unavailable', detail: String(err).slice(0, 200) }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  const db = env.AIR_DB;
  if (!db) return json({ ok: false, error: 'database_unavailable' }, 503);

  const url = new URL(request.url);
  const scope = readScope({
    origin: url.searchParams.get('origin'),
    destination: url.searchParams.get('destination'),
    month: url.searchParams.get('month')
  });
  if (scope.error) return json({ ok: false, error: scope.error }, 400);
  const { origin, destination, month } = scope;

  try {
    const fresh = await freshness(db, origin, destination, month);
    const latest = await latestRequest(db, origin, destination, month);
    const queue = await queueSummary(db);

    let status = 'none';
    if (latest) status = latest.status;

    return json({
      ok: true,
      status,
      item: itemOf(latest),
      fresh,
      queue,
      fresh_hours: FRESH_HOURS
    });
  } catch (err) {
    return json({ ok: false, error: 'queue_unavailable', detail: String(err).slice(0, 200) }, 500);
  }
}

export async function onRequest({ request, env }) {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return onRequestGet({ request, env });
  if (method === 'POST') return onRequestPost({ request, env });
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
