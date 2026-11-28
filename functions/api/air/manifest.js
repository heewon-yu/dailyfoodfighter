/**
 * 마일지도 (MILEMAP · /air/) — D1 경량 매니페스트 (Cloudflare Pages Function)
 *
 * GET /api/air/manifest
 *   /air/ 프론트가 index.json 대신 읽는 D1 매니페스트.
 *   응답: { ok:true, source:"d1", mode:"production", schema_version:3,
 *           generated_at, total, snapshot:"d1",
 *           files:[{month, total}], months:[…], regions:[],
 *           source_updated_at, last_success_at, last_error:null,
 *           collection:{method, logged_in:false, routes:["ICN-NRT",…], months:[…]} }
 *
 *   파일 모양(files)은 정적 air/data/preview/index.json 과 같게 두되, D1 에는 권역 정보가
 *   없으므로 파일은 '월' 단위이고 region 은 넣지 않는다(프론트가 region 없이도 읽는다).
 *   실제 행은 GET /api/air/routes?month=YYYY-MM&limit=20000 (offset 으로 이어 읽기)로 읽는다.
 *
 *   노선-월 집계는 한 번의 GROUP BY 로 끝낸다(월 총계·노선 목록·최신 수집 시각을 동시에).
 *   이 GROUP BY 는 전체 행(약 4만)을 훑기 때문에 비싸다 — 응답은 엣지 캐시
 *   (caches.default, 데이터 세대별 키, TTL 1시간)로 감싸 같은 조회가 D1 에 반복해
 *   닿지 않게 한다. /air/ 프론트는 이제 정적 index.json 을 먼저 읽고, 이 엔드포인트는
 *   수집기 verify(upload_d1.py --verify)·점검(?data=d1)에서 주로 쓰인다.
 *   `?fresh=1` 또는 `_=난수`(수집기 verify)면 캐시를 건너뛴다.
 *
 * D1 바인딩(AIR_DB)이 없으면 503 database_unavailable.
 */

import { withEdgeCache } from '../../_lib/air-cache.js';

const SOURCE = 'KOREAN_AIR_PUBLIC_AWARD_CALENDAR';
const SOURCE_URL = 'https://www.koreanair.com/booking/book-and-manage/award-seat-availability';

function json(data, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache
    }
  });
}

export async function onRequestGet({ request, env }) {
  const db = env && env.AIR_DB;
  if (!db) return json({ ok: false, error: 'database_unavailable' }, 503);

  return withEdgeCache(request, env, {
    name: 'manifest',
    ttl: 3600,
    params: {},
    produce: async () => {
      try {
        const { results } = await db
          .prepare(
            `SELECT month, origin, destination,
                    COUNT(*) AS n,
                    MAX(collected_at) AS collected_max,
                    MIN(source_updated_at) AS source_min,
                    MAX(updated_at) AS updated_max
               FROM air_award_dates
              GROUP BY month, origin, destination
              ORDER BY month ASC, origin ASC, destination ASC`
          )
          .all();

        const rows = results || [];
        const months = new Map();
        const routes = new Set();
        let total = 0;
        let generated = null;
        let updated = null;
        let sourceMin = null;

        for (const row of rows) {
          total += row.n || 0;
          months.set(row.month, (months.get(row.month) || 0) + (row.n || 0));
          routes.add(`${row.origin}-${row.destination}`);
          if (row.collected_max && (!generated || row.collected_max > generated)) generated = row.collected_max;
          if (row.updated_max && (!updated || row.updated_max > updated)) updated = row.updated_max;
          if (row.source_min && (!sourceMin || row.source_min < sourceMin)) sourceMin = row.source_min;
        }

        const files = [...months.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
          .map(([month, count]) => ({ month, total: count }));

        return json(
          {
            ok: true,
            source: 'd1',
            mode: 'production',
            schema_version: 3,
            generated_at: generated,
            updated_at: updated,
            total,
            snapshot: 'd1',
            files,
            months: files.map(file => file.month),
            regions: [],
            source_name: SOURCE,
            source_url: SOURCE_URL,
            source_updated_at: sourceMin,
            last_success_at: generated,
            last_error: null,
            collection: {
              method: 'OFFICIAL_PUBLIC_MONTHLY_CALENDAR',
              logged_in: false,
              routes: [...routes].sort(),
              months: files.map(file => file.month)
            }
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
