/**
 * 마일지도(/air/) — D1 읽기 절감 공용 모듈 (2026-11-28)
 *
 * 왜 필요한가
 *   무료 D1 은 하루 500만 행 읽기 한도가 있다. /air/ 는 접속 때마다
 *   매니페스트(전체 GROUP BY ≈ 4만 행) + 행 데이터(최대 4만 행)를 D1 에서 읽어
 *   하루 120회 접속만으로도 한도를 넘겼다. 이 모듈은 두 가지를 맡는다.
 *
 *   1) Edge Cache (caches.default)
 *      같은 조회를 Cloudflare 엣지가 대신 돌려준다(TTL 2~60분). 캐시에 맞으면
 *      D1 은 아래 '세대 확인' 1행만 읽는다.
 *   2) 데이터 세대(generation)
 *      `air_ingest_runs` 의 MAX(id). 수집기가 POST /api/air/routes 로 한 노선-월을
 *      올리면 이 값이 1 증가하므로, 캐시 키에 넣어 두면 업로드 즉시 모든 캐시가
 *      자동으로 무효화된다(별도 purge 호출 불필요). MAX(id) 는 rowid 인덱스라 1행 읽기다.
 *
 * 안전 규칙
 *   · caches.default 가 없는 런타임(로컬 테스트 등)에서는 조용히 캐시를 건너뛰고
 *     원래 조회를 그대로 수행한다.
 *   · 세대를 읽지 못하면(D1 장애·한도 초과) 캐시도 쓰지 않고 원래 조회를 수행한다.
 *     → 장애 때 낡은 데이터를 '최신'인 척 돌려주지 않는다.
 *   · 수집기 verify 는 URL 에 `_=난수`(캐시버스터)를 붙이므로 항상 D1 을 직접 읽는다.
 *     `?fresh=1` 로도 같은 효과를 낸다.
 *   · 응답 헤더 `X-Air-Cache: HIT|MISS|BYPASS|NOGEN|OFF` 로 캐시 동작을 확인할 수 있다.
 */

export const CACHE_VERSION = 'air-v1';

/** 캐시를 건너뛰어야 하는 요청인가 (verify·점검용 우회). */
export function cacheBypass(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('fresh') === '1') return true;
    if (url.searchParams.get('nocache') === '1') return true;
    if (url.searchParams.has('_')) return true; // 수집기 verify 의 캐시버스터
  } catch (err) {
    /* URL 파싱 실패는 우회로 본다(안전). */
    return true;
  }
  return false;
}

/** 데이터 세대 — air_ingest_runs 의 MAX(id). 실패하면 null. */
export async function dataGeneration(env) {
  const db = env && env.AIR_DB;
  if (!db) return null;
  try {
    const row = await db.prepare('SELECT MAX(id) AS id FROM air_ingest_runs').first();
    const id = row && row.id !== null && row.id !== undefined ? row.id : 0;
    return String(id);
  } catch (err) {
    return null;
  }
}

/** 캐시 키 URL — 사이트 오리진 아래 별도 경로를 써서 실제 라우트와 겹치지 않게 한다. */
export function cacheKeyUrl(request, name, gen, params) {
  let origin = 'https://air-cache.invalid';
  try {
    origin = new URL(request.url).origin;
  } catch (err) {
    /* 기본값 사용 */
  }
  const search = new URLSearchParams();
  const source = params || {};
  for (const key of Object.keys(source).sort()) {
    const value = source[key];
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  search.set('g', String(gen));
  return `${origin}/__air-cache/${CACHE_VERSION}/${name}?${search.toString()}`;
}

function edgeCache() {
  try {
    return typeof caches !== 'undefined' && caches && caches.default ? caches.default : null;
  } catch (err) {
    return null;
  }
}

async function edgeMatch(keyUrl) {
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(new Request(keyUrl));
    if (!hit) return null;
    const body = await hit.text();
    return { status: hit.status || 200, body };
  } catch (err) {
    return null;
  }
}

async function edgePut(keyUrl, body, ttl) {
  const cache = edgeCache();
  if (!cache) return false;
  try {
    const response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // TTL 은 저장되는 응답의 Cache-Control 로 정한다(CACHE_VERSION 으로 규격이 바뀌면 키도 바뀐다).
        'Cache-Control': `public, max-age=${Math.max(30, Number(ttl) || 120)}`
      }
    });
    await cache.put(new Request(keyUrl), response);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * GET 응답을 엣지 캐시로 감싼다.
 * @param {Request} request
 * @param {object} env
 * @param {{name:string, ttl:number, params:object, produce:() => Promise<Response>}} options
 * @returns {Promise<Response>}
 */
export async function withEdgeCache(request, env, options) {
  const name = options.name;
  const ttl = options.ttl;
  const produce = options.produce;

  if (cacheBypass(request)) return tag(await produce(), 'BYPASS');

  const gen = await dataGeneration(env);
  if (gen === null) return tag(await produce(), 'NOGEN');

  if (!edgeCache()) return tag(await produce(), 'OFF');

  const keyUrl = cacheKeyUrl(request, name, gen, options.params);
  const hit = await edgeMatch(keyUrl);
  if (hit) return replay(hit.body, hit.status, 'HIT');

  const response = await produce();
  if (!response || response.status !== 200) return tag(response, 'MISS');

  let body;
  try {
    body = await response.text();
  } catch (err) {
    return response;
  }
  await edgePut(keyUrl, body, ttl);
  return replay(body, response.status, 'MISS');
}

function replay(body, status, state) {
  return new Response(body, {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'X-Air-Cache': state
    }
  });
}

function tag(response, state) {
  if (!response) return response;
  try {
    const copy = new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
    copy.headers.set('X-Air-Cache', state);
    return copy;
  } catch (err) {
    return response;
  }
}
