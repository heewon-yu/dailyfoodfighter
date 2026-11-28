/**
 * 마일지도 (MILEMAP · /air/) — 재조회 큐 워커용 엔드포인트 (집 PC 전용)
 *
 * GET /api/air/refresh-queue            (Authorization: Bearer $AIR_INGEST_TOKEN)
 *   pending 중 가장 오래된 1건을 원자적으로 가져간다(status → processing, attempts +1).
 *   응답: { ok:true,
 *           item:{id, origin, destination, month, requested_at, attempts} | null,
 *           fresh:{rows, collected_at, hours, fresh},   ← 이미 최신이면 수집 없이 done 보고
 *           counts:{pending, processing, done_24h, failed_24h},
 *           stale_recovered }
 *
 * GET /api/air/refresh-queue?peek=1&limit=5
 *   가져가지 않고 대기 목록만 본다(점검·모니터링용).
 *
 * POST /api/air/refresh-queue           (Authorization: Bearer $AIR_INGEST_TOKEN)
 *   body: { id:12, status:"done"|"failed", error_msg?:"…", collected_at?:"…", note?:"…" }
 *   워커가 수집·D1 업서트를 마친 뒤 결과를 보고한다.
 *   응답: { ok:true, item:{…} } / 404 not_found / 409 not_processing
 *
 * 규칙
 *   · AIR_INGEST_TOKEN(Pages 시크릿)이 없으면 503 — 무인증 큐 조작을 열지 않는다.
 *   · processing 인 채 STALE_PROCESSING_MINUTES(30분)를 넘긴 행은 다시 pending 으로 돌린다
 *     (워커가 꺼지거나 크롤 도중 죽었을 때 큐가 막히지 않도록). 회수 사유는 error_msg 에 남긴다.
 *   · 토큰 비교는 길이와 무관하게 전체 바이트를 비교한다(조기 종료 없음).
 *
 * 스키마: 같은 폴더 schema.sql (테이블 air_refresh_queue)
 */

const PROGRAM = 'KE_SKYPASS';
const STALE_PROCESSING_MINUTES = 30;
const CLAIM_ATTEMPTS = 3;
const REPORT_STATUSES = new Set(['done', 'failed']);

function json(data, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache
    }
  });
}

function bearer(request) {
  const header = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

function authorized(request, env) {
  const expected = env.AIR_INGEST_TOKEN;
  if (!expected) return { response: json({ ok: false, error: 'ingest_token_not_configured' }, 503) };

  const provided = bearer(request);
  if (!provided) return { response: json({ ok: false, error: 'unauthorized' }, 401) };
  if (provided.length !== expected.length) return { response: json({ ok: false, error: 'forbidden' }, 403) };

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return { response: json({ ok: false, error: 'forbidden' }, 403) };
  return {};
}

function isoToMs(value) {
  if (!value) return null;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

function sinceIso(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
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
    note: row.note || null,
    attempts: Number.isFinite(row.attempts) ? row.attempts : 0
  };
}

async function counts(db) {
  const windowStart = sinceIso(24 * 60);
  const [pending, processing, done, failed] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM air_refresh_queue WHERE status = 'pending'`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM air_refresh_queue WHERE status = 'processing'`).first(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM air_refresh_queue
          WHERE status = 'done' AND finished_at >= ?`
      )
      .bind(windowStart)
      .first(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM air_refresh_queue
          WHERE status = 'failed' AND finished_at >= ?`
      )
      .bind(windowStart)
      .first()
  ]);

  const number = row => (row && Number.isFinite(row.n) ? row.n : 0);
  return {
    pending: number(pending),
    processing: number(processing),
    done_24h: number(done),
    failed_24h: number(failed)
  };
}

/** 그 노선-월의 D1 수집 시각 — 이미 최신이면 워커가 수집을 건너뛴다. */
async function freshness(db, origin, destination, month) {
  try {
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
    return { rows, collected_at: collectedAt, hours, fresh: rows > 0 && hours !== null && hours <= 2 };
  } catch (err) {
    return { rows: null, collected_at: null, hours: null, fresh: null };
  }
}

/** 30분 넘게 processing 인 행을 pending 으로 되돌린다(워커 중단 복구). */
async function recoverStale(db) {
  const cutoff = sinceIso(STALE_PROCESSING_MINUTES);
  try {
    const result = await db
      .prepare(
        `UPDATE air_refresh_queue
            SET status = 'pending', started_at = NULL,
                error_msg = COALESCE(error_msg, 'STALE_PROCESSING_REQUEUED')
          WHERE status = 'processing' AND started_at IS NOT NULL AND started_at < ?`
      )
      .bind(cutoff)
      .run();
    return (result && result.meta && result.meta.changes) || 0;
  } catch (err) {
    return 0;
  }
}

export async function onRequestGet({ request, env }) {
  const db = env.AIR_DB;
  if (!db) return json({ ok: false, error: 'database_unavailable' }, 503);

  const auth = authorized(request, env);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const peek = ['1', 'true', 'yes'].includes(String(url.searchParams.get('peek') || '').toLowerCase());
  let limit = Number.parseInt(url.searchParams.get('limit'), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 5;
  if (limit > 50) limit = 50;

  try {
    if (peek) {
      const { results } = await db
        .prepare(
          `SELECT * FROM air_refresh_queue
            WHERE status = 'pending'
            ORDER BY requested_at ASC, id ASC
            LIMIT ?`
        )
        .bind(limit)
        .all();
      return json({
        ok: true,
        mode: 'peek',
        item: null,
        pending: (results || []).map(itemOf),
        counts: await counts(db)
      });
    }

    const staleRecovered = await recoverStale(db);

    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
      const candidate = await db
        .prepare(
          `SELECT * FROM air_refresh_queue
            WHERE status = 'pending'
            ORDER BY requested_at ASC, id ASC
            LIMIT 1`
        )
        .first();

      if (!candidate) {
        return json({
          ok: true,
          item: null,
          fresh: null,
          counts: await counts(db),
          stale_recovered: staleRecovered
        });
      }

      const nowIso = new Date().toISOString();
      const claimed = await db
        .prepare(
          `UPDATE air_refresh_queue
              SET status = 'processing', started_at = ?, attempts = attempts + 1, error_msg = NULL
            WHERE id = ? AND status = 'pending'`
        )
        .bind(nowIso, candidate.id)
        .run();

      const changes = (claimed && claimed.meta && claimed.meta.changes) || 0;
      if (!changes) continue; // 다른 워커가 먼저 가져갔다 — 다음 후보로.

      const row = await db.prepare(`SELECT * FROM air_refresh_queue WHERE id = ?`).bind(candidate.id).first();
      return json({
        ok: true,
        item: itemOf(row),
        fresh: await freshness(db, row.origin, row.destination, row.month),
        counts: await counts(db),
        stale_recovered: staleRecovered
      });
    }

    return json({
      ok: true,
      item: null,
      fresh: null,
      counts: await counts(db),
      stale_recovered: staleRecovered
    });
  } catch (err) {
    return json({ ok: false, error: 'queue_unavailable', detail: String(err).slice(0, 200) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const db = env.AIR_DB;
  if (!db) return json({ ok: false, error: 'database_unavailable' }, 503);

  const auth = authorized(request, env);
  if (auth.response) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const id = Number.parseInt(body && body.id, 10);
  if (!Number.isFinite(id) || id < 1) return json({ ok: false, error: 'invalid_id' }, 400);

  const status = String((body && body.status) || '').trim().toLowerCase();
  if (!REPORT_STATUSES.has(status)) return json({ ok: false, error: 'invalid_status' }, 400);

  const errorMsg = body.error_msg ? String(body.error_msg).slice(0, 300) : null;
  const note = body.note ? String(body.note).slice(0, 300) : null;

  try {
    const row = await db.prepare(`SELECT * FROM air_refresh_queue WHERE id = ?`).bind(id).first();
    if (!row) return json({ ok: false, error: 'not_found' }, 404);
    if (row.status !== 'processing') {
      return json({ ok: false, error: 'not_processing', item: itemOf(row) }, 409);
    }

    const nowIso = new Date().toISOString();
    await db
      .prepare(
        `UPDATE air_refresh_queue
            SET status = ?, finished_at = ?, error_msg = ?, note = ?
          WHERE id = ? AND status = 'processing'`
      )
      .bind(status, nowIso, errorMsg, note, id)
      .run();

    const saved = await db.prepare(`SELECT * FROM air_refresh_queue WHERE id = ?`).bind(id).first();
    return json({ ok: true, item: itemOf(saved), counts: await counts(db) });
  } catch (err) {
    return json({ ok: false, error: 'report_failed', detail: String(err).slice(0, 200) }, 500);
  }
}

export async function onRequest({ request, env }) {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return onRequestGet({ request, env });
  if (method === 'POST') return onRequestPost({ request, env });
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
