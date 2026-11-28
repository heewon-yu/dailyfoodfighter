/**
 * 마일지도 (MILEMAP · /air/) — D1 보너스 좌석 달력 API (Cloudflare Pages Function)
 *
 * GET  /api/air/routes?origin=ICN&destination=ORD&month=2026-12&cabin=business
 *      선택 필터: origin, destination, month(YYYY-MM), cabin(business|first),
 *                status, from(YYYY-MM-DD), to(YYYY-MM-DD), limit(기본 3000 / 최대 20000),
 *                offset(기본 0 — 20,000행을 넘는 달은 offset 으로 이어 읽는다)
 *      응답: { ok:true, source:"d1", total, returned, limit, offset, items:[ {program, origin,
 *              destination, departure_date, month, cabin, status, seat_count, points,
 *              first_combined, source_updated_at, collected_at, updated_at} ] }
 *
 * GET  /api/air/routes?scopes=ICN-ORD-2026-12,GMP-HND-2026-11
 *      여러 노선-월을 한 번에(최대 50개) 읽는다. 프론트가 정적 스냅숏 위에
 *      바뀐 노선-월만 겹쳐 그릴 때 쓴다. 행은 노선-월당 한 달 전체(수십 행)라
 *      전체 4만 행을 긁지 않는다.
 *
 *      두 GET 모두 Cloudflare 엣지 캐시(caches.default, 데이터 세대별 키)로 감싼다.
 *      같은 조회는 D1 에 닿지 않는다 — 자세한 규칙은 ../_lib/air-cache.js 참고.
 *      `?fresh=1` 또는 `_=난수`(수집기 verify)는 캐시를 건너뛰고 D1 을 직접 읽는다.
 *
 * POST /api/air/routes   (Authorization: Bearer $AIR_INGEST_TOKEN)
 *      body: { origin:"ICN", destination:"SIN", month:"2027-05",
 *              collected_at?: "2027-05-01T04:20:00+09:00",
 *              items:[ {departure_date, cabin, status, seat_count?, points?,
 *                       first_combined?, source_updated_at?, collected_at?} ] }
 *      해당 (program, origin, destination, month) 범위만 트랜잭션으로 upsert 하고,
 *      그 범위에서 더 이상 오지 않은 출발일 행만 정리한다. 다른 노선·월의 행과
 *      그들의 collected_at 은 건드리지 않는다.
 *
 * D1 바인딩(AIR_DB)이 없으면 503 database_unavailable.
 * 스키마는 같은 폴더의 schema.sql 참고.
 */

import { withEdgeCache } from '../../_lib/air-cache.js';

const PROGRAM_DEFAULT = 'KE_SKYPASS';
const CABINS = new Set(['business', 'first']);
const STATUSES = new Set(['available', 'unavailable', 'unknown']);
const WRITE_LIMIT = 1000;
const READ_LIMIT_DEFAULT = 3000;
const READ_LIMIT_MAX = 20000;
const SCOPES_MAX = 50;
const SCOPES_ROW_LIMIT = 20000;

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

function isoDate(value) {
  const v = String(value || '').trim();
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) ? v : null;
}

function intOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function boolInt(value) {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function rowToItem(row) {
  return {
    program: row.program,
    origin: row.origin,
    destination: row.destination,
    departure_date: row.departure_date,
    month: row.month,
    cabin: row.cabin,
    status: row.status,
    seat_count: row.seat_count,
    points: row.points,
    first_combined: row.first_combined === 1,
    operating_status: row.operating_status || null,
    availability_type: row.availability_type || null,
    source: row.source || null,
    source_updated_at: row.source_updated_at || null,
    collected_at: row.collected_at,
    updated_at: row.updated_at
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const origin = url.searchParams.get('origin');
  const destination = url.searchParams.get('destination');
  const month = url.searchParams.get('month');
  const cabin = url.searchParams.get('cabin');
  const status = url.searchParams.get('status');
  const program = url.searchParams.get('program');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const where = [];
  const args = [];

  if (origin) {
    const v = iata(origin);
    if (!v) return json({ ok: false, error: 'invalid_origin' }, 400);
    where.push('origin = ?');
    args.push(v);
  }
  if (destination) {
    const v = iata(destination);
    if (!v) return json({ ok: false, error: 'invalid_destination' }, 400);
    where.push('destination = ?');
    args.push(v);
  }
  if (month) {
    const v = isoMonth(month);
    if (!v) return json({ ok: false, error: 'invalid_month' }, 400);
    where.push('month = ?');
    args.push(v);
  }
  if (cabin) {
    const v = String(cabin).trim().toLowerCase();
    if (!CABINS.has(v)) return json({ ok: false, error: 'invalid_cabin' }, 400);
    where.push('cabin = ?');
    args.push(v);
  }
  if (status) {
    const v = String(status).trim().toLowerCase();
    if (!STATUSES.has(v)) return json({ ok: false, error: 'invalid_status' }, 400);
    where.push('status = ?');
    args.push(v);
  }
  if (program) {
    where.push('program = ?');
    args.push(String(program).trim().toUpperCase());
  }
  if (from) {
    const v = isoDate(from);
    if (!v) return json({ ok: false, error: 'invalid_from' }, 400);
    where.push('departure_date >= ?');
    args.push(v);
  }
  if (to) {
    const v = isoDate(to);
    if (!v) return json({ ok: false, error: 'invalid_to' }, 400);
    where.push('departure_date <= ?');
    args.push(v);
  }

  let limit = Number.parseInt(url.searchParams.get('limit'), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = READ_LIMIT_DEFAULT;
  if (limit > READ_LIMIT_MAX) limit = READ_LIMIT_MAX;

  let offset = Number.parseInt(url.searchParams.get('offset'), 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  const db = env.AIR_DB;
  if (!db) return json({ ok: false, error: 'database_unavailable' }, 503);

  const scopesParam = url.searchParams.get('scopes');
  if (scopesParam) return scopedGet(request, env, scopesParam);

  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  return withEdgeCache(request, env, {
    name: 'routes',
    ttl: 300,
    params: { origin, destination, month, cabin, status, program, from, to, limit, offset },
    produce: async () => {
      try {
        const [{ results }, countRow] = await Promise.all([
          db
            .prepare(
              `SELECT * FROM air_award_dates${clause}
               ORDER BY departure_date ASC, origin ASC, destination ASC,
                        CASE cabin WHEN 'business' THEN 0 ELSE 1 END
               LIMIT ? OFFSET ?`
            )
            .bind(...args, limit, offset)
            .all(),
          db.prepare(`SELECT COUNT(*) AS n FROM air_award_dates${clause}`).bind(...args).first()
        ]);

        return json(
          {
            ok: true,
            source: 'd1',
            total: countRow ? countRow.n : (results || []).length,
            returned: (results || []).length,
            limit,
            offset,
            items: (results || []).map(rowToItem)
          },
          200,
          'public, max-age=60'
        );
      } catch (err) {
        return json({ ok: false, error: 'query_failed', detail: String(err).slice(0, 200) }, 500);
      }
    }
  });
}

/** scopes=ICN-ORD-2026-12,GMP-HND-2026-11 — 여러 노선-월을 한 번에 읽는다. */
function parseScopes(raw) {
  const list = [];
  for (const part of String(raw || '').split(',')) {
    const value = part.trim().toUpperCase();
    if (!value) continue;
    const match = /^([A-Z]{3})-([A-Z]{3})-(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(value);
    if (!match) return { error: 'invalid_scopes', value: part };
    if (match[1] === match[2]) return { error: 'invalid_scopes', value: part };
    list.push({ origin: match[1], destination: match[2], month: match[3] });
  }
  return { list };
}

function scopedGet(request, env, raw) {
  const parsed = parseScopes(raw);
  if (parsed.error) return json({ ok: false, error: 'invalid_scopes', value: parsed.value }, 400);
  const scopes = parsed.list;
  if (!scopes.length) return json({ ok: false, error: 'scopes_required' }, 400);
  if (scopes.length > SCOPES_MAX) return json({ ok: false, error: 'too_many_scopes', limit: SCOPES_MAX }, 400);

  const db = env.AIR_DB;
  if (!db) return json({ ok: false, error: 'database_unavailable' }, 503);

  const clause = scopes.map(() => '(origin = ? AND destination = ? AND month = ?)').join(' OR ');
  const args = [];
  for (const scope of scopes) args.push(scope.origin, scope.destination, scope.month);

  return withEdgeCache(request, env, {
    name: 'routes-scopes',
    ttl: 300,
    params: { scopes: scopes.map(scope => `${scope.origin}-${scope.destination}-${scope.month}`).join(',') },
    produce: async () => {
      try {
        const { results } = await db
          .prepare(
            `SELECT * FROM air_award_dates
              WHERE ${clause}
              ORDER BY month ASC, origin ASC, destination ASC, departure_date ASC,
                       CASE cabin WHEN 'business' THEN 0 ELSE 1 END
              LIMIT ?`
          )
          .bind(...args, SCOPES_ROW_LIMIT)
          .all();

        const items = (results || []).map(rowToItem);
        return json(
          {
            ok: true,
            source: 'd1',
            scopes: scopes.map(scope => `${scope.origin}-${scope.destination}-${scope.month}`),
            total: items.length,
            returned: items.length,
            items
          },
          200,
          'public, max-age=60'
        );
      } catch (err) {
        return json({ ok: false, error: 'query_failed', detail: String(err).slice(0, 200) }, 500);
      }
    }
  });
}

function bearer(request) {
  const header = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

export async function onRequestPost({ request, env }) {
  const expected = env.AIR_INGEST_TOKEN;
  // 토큰이 설정돼 있지 않으면 쓰기를 열지 않는다(무단 외부 쓰기 차단).
  if (!expected) return json({ ok: false, error: 'ingest_token_not_configured' }, 503);

  const provided = bearer(request);
  if (!provided) return json({ ok: false, error: 'unauthorized' }, 401);
  if (provided.length !== expected.length) return json({ ok: false, error: 'forbidden' }, 403);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return json({ ok: false, error: 'forbidden' }, 403);

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const origin = iata(body.origin);
  const destination = iata(body.destination);
  const month = isoMonth(body.month);
  const program = String(body.program || PROGRAM_DEFAULT).trim().toUpperCase();
  const actor = String(body.actor || request.headers.get('CF-Connecting-IP') || 'api').slice(0, 120);

  if (!origin) return json({ ok: false, error: 'invalid_origin' }, 400);
  if (!destination) return json({ ok: false, error: 'invalid_destination' }, 400);
  if (!month) return json({ ok: false, error: 'invalid_month' }, 400);
  if (origin === destination) return json({ ok: false, error: 'same_origin_destination' }, 400);

  const items = Array.isArray(body.items) ? body.items : null;
  if (!items || items.length === 0) return json({ ok: false, error: 'items_required' }, 400);
  if (items.length > WRITE_LIMIT) {
    return json({ ok: false, error: 'too_many_items', limit: WRITE_LIMIT }, 413);
  }

  const nowIso = new Date().toISOString();
  const rows = [];
  for (const [i, raw] of items.entries()) {
    if (!raw || typeof raw !== 'object') {
      return json({ ok: false, error: 'invalid_item', index: i }, 400);
    }
    const departureDate = isoDate(raw.departure_date || raw.departureDate || raw.date);
    if (!departureDate) return json({ ok: false, error: 'invalid_departure_date', index: i }, 400);
    if (departureDate.slice(0, 7) !== month) {
      return json({ ok: false, error: 'departure_date_outside_month', index: i, departure_date: departureDate }, 400);
    }
    const cabin = String(raw.cabin || '').trim().toLowerCase();
    if (!CABINS.has(cabin)) return json({ ok: false, error: 'invalid_cabin', index: i }, 400);
    const status = String(raw.status || '').trim().toLowerCase();
    if (!STATUSES.has(status)) return json({ ok: false, error: 'invalid_status', index: i }, 400);
    const rowOrigin = raw.origin ? iata(raw.origin) : origin;
    const rowDestination = raw.destination ? iata(raw.destination) : destination;
    if (rowOrigin !== origin || rowDestination !== destination) {
      return json({ ok: false, error: 'item_route_mismatch', index: i }, 400);
    }
    const collectedAt = String(raw.collected_at || raw.collectedAt || body.collected_at || '').trim();
    rows.push({
      program,
      origin,
      destination,
      departure_date: departureDate,
      month,
      cabin,
      status,
      seat_count: intOrNull(raw.seat_count ?? raw.seatCount),
      points: intOrNull(raw.points),
      first_combined: boolInt(raw.first_combined ?? raw.firstCombined),
      operating_status: raw.operating_status ? String(raw.operating_status).slice(0, 40) : null,
      availability_type: raw.availability_type ? String(raw.availability_type).slice(0, 60) : null,
      source: String(raw.source || body.source || 'KOREAN_AIR_PUBLIC_AWARD_CALENDAR').slice(0, 80),
      source_updated_at: raw.source_updated_at || body.source_updated_at || null,
      collected_at: collectedAt || nowIso,
      updated_at: nowIso
    });
  }

  const db = env.AIR_DB;
  if (!db) return json({ ok: false, error: 'database_unavailable' }, 503);

  const insertSql = `INSERT INTO air_award_dates
      (program, origin, destination, departure_date, month, cabin, status, seat_count, points,
       first_combined, operating_status, availability_type, source, source_updated_at,
       collected_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (program, origin, destination, departure_date, cabin) DO UPDATE SET
      month = excluded.month,
      status = excluded.status,
      seat_count = excluded.seat_count,
      points = excluded.points,
      first_combined = excluded.first_combined,
      operating_status = excluded.operating_status,
      availability_type = excluded.availability_type,
      source = excluded.source,
      source_updated_at = excluded.source_updated_at,
      collected_at = excluded.collected_at,
      updated_at = excluded.updated_at`;

  const dates = [...new Set(rows.map(r => r.departure_date))];
  const collectedAt = rows[0].collected_at;

  const statements = rows.map(r =>
    db
      .prepare(insertSql)
      .bind(
        r.program,
        r.origin,
        r.destination,
        r.departure_date,
        r.month,
        r.cabin,
        r.status,
        r.seat_count,
        r.points,
        r.first_combined,
        r.operating_status,
        r.availability_type,
        r.source,
        r.source_updated_at,
        r.collected_at,
        r.updated_at
      )
  );

  // 같은 노선-월 안에서, 이번에 오지 않은 출발일 행만 정리한다(범위 밖은 손대지 않음).
  const pruneSql = `DELETE FROM air_award_dates
     WHERE program = ? AND origin = ? AND destination = ? AND month = ?
       AND departure_date NOT IN (${dates.map(() => '?').join(',')})`;
  statements.push(db.prepare(pruneSql).bind(program, origin, destination, month, ...dates));

  statements.push(
    db
      .prepare(
        `INSERT INTO air_ingest_runs
           (program, origin, destination, month, upserted, pruned, collected_at, received_at, actor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(program, origin, destination, month, rows.length, 0, collectedAt, nowIso, actor)
  );

  try {
    const results = await db.batch(statements);
    const pruneResult = results[results.length - 2];
    return json(
      {
        ok: true,
        source: 'd1',
        scope: { program, origin, destination, month },
        upserted: rows.length,
        pruned: (pruneResult && pruneResult.meta && pruneResult.meta.changes) || 0,
        collected_at: collectedAt,
        updated_at: nowIso
      },
      200,
      'no-store'
    );
  } catch (err) {
    return json({ ok: false, error: 'write_failed', detail: String(err).slice(0, 300) }, 500);
  }
}

export async function onRequest({ request, env }) {
  const method = request.method.toUpperCase();
  if (method === 'GET') return onRequestGet({ request, env });
  if (method === 'POST') return onRequestPost({ request, env });
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
