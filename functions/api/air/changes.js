/**
 * 마일지도(MILEMAP · /air/) — 정적 스냅숏 이후의 D1 변경분 목록 (Cloudflare Pages Function)
 *
 * GET /api/air/changes?since=2026-11-28T02:24:40+00:00&limit=60
 *      선택: month=YYYY-MM, origin=ICN, destination=ORD, span=최근 스캔 행 상한(기본 2000)
 *   응답: { ok:true, source:"d1", generation, since, count, truncated,
 *           scanned:{from,max}, scopes:[ {origin, destination, month,
 *                                      collected_at, received_at, upserted, pruned, runs} ] }
 *
 * 쓰임새
 *   /air/ 프론트는 기본 데이터를 정적 스냅숏(air/data/preview/index.json + snapshots,
 *   D1 0행)으로 읽는다. 그 스냅숏의 generated_at 이후에 D1 에 새로 들어온 노선-월이
 *   있으면(=웹 재조회 큐가 그 노선-월만 다시 올린 경우) 이 목록으로 알려 주고,
 *   프론트가 그 노선-월 행만 D1 에서 읽어 겹쳐 그린다.
 *
 * 규칙
 *   · `air_ingest_runs` 는 노선-월 업로드 1건당 1행인 변경 로그다. 업로드 경로가
 *     upload_d1.py 배치든 웹 재조회 큐(queue_worker.py)든 모두 여기에 남는다.
 *   · collected_at(수집 시각)이 since 보다 큰 노선-월만 돌려준다. 즉 '스냅숏보다
 *     새로운 데이터'만 대상이라, 이미 스냅숏에 있는 노선-월을 불필요하게 다시 읽지 않는다.
 *     ISO 문자열의 시간대(+09:00 / Z)가 섞여 있으므로 SQLite datetime() 으로 UTC 정규화해 비교한다.
 *   · 스캔은 최근 span 행(기본 2000)으로 자른다 — 변경 로그가 아무리 커져도 1회 조회가
 *     그 이상을 훑지 않는다. 창 끝까지 변경이 남아 있으면 truncated:true 로 알리고,
 *     프론트는 그때만 D1 전체 조회로 되돌아간다(정확성 우선).
 *   · 엣지 캐시 TTL 120초(데이터 세대별 키). 장애 시 D1 을 그대로 읽는다.
 *
 * D1 바인딩(AIR_DB)이 없으면 503 database_unavailable.
 */

import { withEdgeCache } from '../../_lib/air-cache.js';

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 400;
const DEFAULT_SPAN = 2000;
const MAX_SPAN = 8000;

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

function isoStamp(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  const since = isoStamp(url.searchParams.get('since'));
  if (!since) return json({ ok: false, error: 'invalid_since' }, 400);

  const limit = clampInt(url.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const span = clampInt(url.searchParams.get('span'), DEFAULT_SPAN, 50, MAX_SPAN);

  const monthParam = url.searchParams.get('month');
  const month = monthParam ? isoMonth(monthParam) : null;
  if (monthParam && !month) return json({ ok: false, error: 'invalid_month' }, 400);

  const originParam = url.searchParams.get('origin');
  const origin = originParam ? iata(originParam) : null;
  if (originParam && !origin) return json({ ok: false, error: 'invalid_origin' }, 400);

  const destinationParam = url.searchParams.get('destination');
  const destination = destinationParam ? iata(destinationParam) : null;
  if (destinationParam && !destination) return json({ ok: false, error: 'invalid_destination' }, 400);

  const db = env && env.AIR_DB;
  if (!db) return json({ ok: false, error: 'database_unavailable' }, 503);

  return withEdgeCache(request, env, {
    name: 'changes',
    ttl: 120,
    params: { since, limit, span, month, origin, destination },
    produce: async () => {
      try {
        const head = await db.prepare('SELECT MIN(id) AS min_id, MAX(id) AS max_id FROM air_ingest_runs').first();
        const maxId = head && Number.isFinite(head.max_id) ? head.max_id : 0;
        const minId = head && Number.isFinite(head.min_id) ? head.min_id : 0;
        const windowStart = Math.max(0, maxId - span);

        const where = ['id > ?', 'datetime(collected_at) > datetime(?)'];
        const args = [windowStart, since];
        if (origin) {
          where.push('origin = ?');
          args.push(origin);
        }
        if (destination) {
          where.push('destination = ?');
          args.push(destination);
        }
        if (month) {
          where.push('month = ?');
          args.push(month);
        }

        const { results } = await db
          .prepare(
            `SELECT origin, destination, month,
                    MAX(collected_at) AS collected_at,
                    MAX(received_at) AS received_at,
                    SUM(upserted) AS upserted,
                    SUM(pruned) AS pruned,
                    COUNT(*) AS runs,
                    MIN(id) AS first_id
               FROM air_ingest_runs
              WHERE ${where.join(' AND ')}
              GROUP BY origin, destination, month
              ORDER BY received_at DESC
              LIMIT ?`
          )
          .bind(...args, limit + 1)
          .all();

        const rows = results || [];
        const scopes = rows.slice(0, limit).map(row => ({
          origin: row.origin,
          destination: row.destination,
          month: row.month,
          collected_at: row.collected_at || null,
          received_at: row.received_at || null,
          upserted: Number.isFinite(row.upserted) ? row.upserted : 0,
          pruned: Number.isFinite(row.pruned) ? row.pruned : 0,
          runs: Number.isFinite(row.runs) ? row.runs : 0
        }));

        let truncated = rows.length > limit;

        /* 스캔 창의 가장 오래된 행도 since 이후라면, 창 밖에 더 오래된 변경이 남아 있다. */
        if (!truncated && windowStart > 0 && windowStart >= (Number.isFinite(minId) ? minId : 0)) {
          const edge = await db
            .prepare('SELECT collected_at FROM air_ingest_runs WHERE id = ?')
            .bind(windowStart + 1)
            .first();
          if (edge && edge.collected_at &&
              Date.parse(edge.collected_at) > Date.parse(since)) {
            truncated = true;
          }
        }

        return json(
          {
            ok: true,
            source: 'd1',
            since,
            count: scopes.length,
            truncated,
            scanned: { from: windowStart, max: maxId, span },
            scopes
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

export async function onRequest({ request, env }) {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return onRequestGet({ request, env });
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
