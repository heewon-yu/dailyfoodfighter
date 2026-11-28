/**
 * /api/air/* 단위·통합 테스트 — 실제 SQLite(D1 모양)로 돌린다.
 *   node tests/air-d1/test-api.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockD1 } from './fake-d1.mjs';
import { seed, addRefreshUpload, loadIndex } from './seed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const manifestHandler = await import(path.join(repoRoot, 'functions/api/air/manifest.js'));
const routesHandler = await import(path.join(repoRoot, 'functions/api/air/routes.js'));
const changesHandler = await import(path.join(repoRoot, 'functions/api/air/changes.js'));

let passed = 0;
const failures = [];

function ok(condition, message, detail) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push({ message, detail });
  console.error(`FAIL  ${message}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 400));
}

function eq(actual, expected, message) {
  ok(Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected), message, { actual, expected });
}

function get(url, init) {
  return new Request(url, init);
}

function installCaches() {
  const store = new Map();
  globalThis.caches = {
    default: {
      async match(request) {
        const key = typeof request === 'string' ? request : request.url;
        const hit = store.get(key);
        if (!hit) return undefined;
        return new Response(hit.body, { status: hit.status, headers: hit.headers });
      },
      async put(request, response) {
        const key = typeof request === 'string' ? request : request.url;
        const body = await response.text();
        store.set(key, { body, status: response.status, headers: Object.fromEntries(response.headers) });
      }
    }
  };
  return store;
}

async function callManifest(env, query = '') {
  const response = await manifestHandler.onRequestGet({ request: get(`https://dailyfoodfighter.com/api/air/manifest${query}`), env });
  const payload = await response.clone().json();
  return { response, payload, cache: response.headers.get('X-Air-Cache') };
}

async function callRoutes(env, query) {
  const response = await routesHandler.onRequestGet({ request: get(`https://dailyfoodfighter.com/api/air/routes?${query}`), env });
  const payload = await response.clone().json();
  return { response, payload, cache: response.headers.get('X-Air-Cache') };
}

async function callChanges(env, query) {
  const response = await changesHandler.onRequestGet({ request: get(`https://dailyfoodfighter.com/api/air/changes?${query}`), env });
  const payload = await response.clone().json();
  return { response, payload, cache: response.headers.get('X-Air-Cache') };
}

async function main() {
  installCaches();
  const d1 = new MockD1();
  const seeded = seed(d1, repoRoot);
  const index = loadIndex(repoRoot);
  const env = { AIR_DB: d1, AIR_INGEST_TOKEN: 'test-token-1234567890' };

  console.log(`시드: 스냅숏 ${index.snapshot} · 파일 ${index.files.length} · 행 ${seeded.rowCount.toLocaleString()} · 노선-월 ${seeded.scopeCount} · generated_at ${index.generated_at}`);

  /* ---------------------------------------------------------------- manifest */
  d1.resetStats();
  const first = await callManifest(env);
  ok(first.response.status === 200, 'manifest 200');
  ok(first.payload.ok === true && first.payload.source === 'd1', 'manifest ok/source');
  eq(first.payload.total, seeded.rowCount, 'manifest total == 시드 행 수');
  ok(first.payload.files.length > 0 && first.payload.months.length === first.payload.files.length, 'manifest files/months');
  const firstRows = d1.stats.rowsReturned;
  ok(first.cache === 'MISS', 'manifest 첫 호출은 MISS', first.cache);

  d1.resetStats();
  const second = await callManifest(env);
  ok(second.cache === 'HIT', 'manifest 두 번째 호출은 엣지 캐시 HIT', second.cache);
  eq(d1.stats.rowsReturned, 1, 'manifest 캐시 HIT 시 D1 읽기 = 세대 확인 1행');
  eq(second.payload.total, first.payload.total, 'manifest 캐시 응답 동일');

  d1.resetStats();
  const bypass = await callManifest(env, '?fresh=1');
  ok(bypass.cache === 'BYPASS', 'manifest ?fresh=1 은 캐시 우회', bypass.cache);
  ok(d1.stats.rowsReturned > 500, 'manifest 우회 시 전체 GROUP BY 재조회', d1.stats.rowsReturned);

  /* ------------------------------------------------------------------ routes */
  const month = index.files[0].month;
  d1.resetStats();
  const scopeQuery = `origin=ICN&destination=ORD&month=${month}&limit=20000`;
  const routes1 = await callRoutes(env, scopeQuery);
  ok(routes1.response.status === 200 && routes1.payload.ok === true, 'routes 200 ok');
  ok(Array.isArray(routes1.payload.items), 'routes items');
  ok(routes1.payload.total >= 0, 'routes total');

  d1.resetStats();
  const routes2 = await callRoutes(env, scopeQuery);
  ok(routes2.cache === 'HIT', 'routes 두 번째 호출은 HIT', routes2.cache);
  eq(d1.stats.rowsReturned, 1, 'routes 캐시 HIT 시 D1 읽기 = 1행');

  /* 수집기 verify 계약: `_=` 캐시버스터를 붙이면 항상 D1 직접 조회 */
  d1.resetStats();
  const verifyLike = await callRoutes(env, `${scopeQuery}&_=1732839000000123`);
  ok(verifyLike.cache === 'BYPASS', 'routes _= 캐시버스터는 BYPASS', verifyLike.cache);
  eq(verifyLike.payload.total, routes1.payload.total, '_= 우회 조회 total 동일');

  /* ------------------------------------------------------------- changes */
  const since = index.generated_at;
  d1.resetStats();
  const none = await callChanges(env, `since=${encodeURIComponent(since)}&limit=40`);
  ok(none.payload.ok === true, 'changes ok');
  eq(none.payload.count, 0, '스냅숏 직후 변경분 0');
  eq(none.payload.truncated, false, '변경분 0 이면 truncated=false');

  /* 웹 재조회 큐가 한 노선-월을 다시 올린 상황 */
  const refreshed = addRefreshUpload(d1, {
    origin: 'ICN',
    destination: 'ORD',
    month,
    collected_at: new Date(Date.parse(since) + 3600e3).toISOString()
  });

  d1.resetStats();
  const afterUpload = await callChanges(env, `since=${encodeURIComponent(since)}&limit=40`);
  ok(afterUpload.payload.ok === true, 'changes ok after upload');
  eq(afterUpload.payload.count, 1, '업로드한 노선-월 1건만 변경분');
  eq(afterUpload.payload.scopes[0].origin, 'ICN', '변경분 origin');
  eq(afterUpload.payload.scopes[0].destination, 'ORD', '변경분 destination');
  eq(afterUpload.payload.scopes[0].month, month, '변경분 month');
  ok(afterUpload.payload.scopes[0].upserted >= refreshed, '변경분 upserted');

  const scopesParam = `${afterUpload.payload.scopes[0].origin}-${afterUpload.payload.scopes[0].destination}-${afterUpload.payload.scopes[0].month}`;
  d1.resetStats();
  const scoped = await callRoutes(env, `scopes=${scopesParam}`);
  ok(scoped.response.status === 200 && scoped.payload.ok === true, 'routes scopes 200');
  eq(scoped.payload.total, refreshed, 'scopes 조회는 그 노선-월 행만 반환');
  ok(scoped.payload.items.every(item => item.origin === 'ICN' && item.destination === 'ORD'), 'scopes 행 범위');
  const scopeRows = d1.stats.rowsReturned;

  d1.resetStats();
  const scopedCached = await callRoutes(env, `scopes=${scopesParam}`);
  ok(scopedCached.cache === 'HIT', 'scopes 두 번째 호출은 HIT', scopedCached.cache);
  eq(d1.stats.rowsReturned, 1, 'scopes 캐시 HIT 시 1행');

  /* limit 보다 변경이 많으면 truncated */
  const many = ['GMP-HND-2026-12', 'ICN-SIN-2026-12', 'ICN-NRT-2026-12'];
  for (const value of many) {
    const [origin, destination, valueMonth] = value.split('-');
    addRefreshUpload(d1, {
      origin,
      destination,
      month: valueMonth,
      collected_at: new Date(Date.parse(since) + 7200e3).toISOString()
    });
  }
  const limited = await callChanges(env, `since=${encodeURIComponent(since)}&limit=2`);
  eq(limited.payload.count, 2, 'limit 2 → 2건');
  eq(limited.payload.truncated, true, 'limit 초과 시 truncated=true');

  /* 잘못된 인자 */
  const badSince = await callChanges(env, 'since=not-a-date');
  eq(badSince.response.status, 400, 'changes since 형식 오류 400');
  const badScopes = await callRoutes(env, 'scopes=ICN-ORD');
  eq(badScopes.response.status, 400, 'routes scopes 형식 오류 400');
  const tooMany = await callRoutes(env, `scopes=${Array.from({ length: 51 }, (_, i) => `ICN-${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}X-2026-12`).join(',')}`);
  eq(tooMany.response.status, 400, 'routes scopes 50개 초과 400');

  /* D1 미바인딩 */
  const noDbManifest = await callManifest({});
  eq(noDbManifest.response.status, 503, 'manifest D1 없음 503');
  const noDbChanges = await callChanges({}, `since=${encodeURIComponent(since)}`);
  eq(noDbChanges.response.status, 503, 'changes D1 없음 503');

  /* ------------------------------------------------- POST 업로드 → 캐시 무효화 */
  const body = {
    origin: 'ICN',
    destination: 'ORD',
    month,
    collected_at: new Date(Date.parse(since) + 10800e3).toISOString(),
    items: [
      { departure_date: `${month}-01`, cabin: 'business', status: 'available', first_combined: false },
      { departure_date: `${month}-01`, cabin: 'first', status: 'unknown', first_combined: false },
      { departure_date: `${month}-02`, cabin: 'business', status: 'unavailable', first_combined: false },
      { departure_date: `${month}-02`, cabin: 'first', status: 'unknown', first_combined: false }
    ].map(item => ({ ...item, collected_at: new Date(Date.parse(since) + 10800e3).toISOString() }))
  };
  const postResponse = await routesHandler.onRequestPost({
    request: new Request('https://dailyfoodfighter.com/api/air/routes', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token-1234567890', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  });
  const postPayload = await postResponse.json();
  ok(postResponse.status === 200 && postPayload.ok === true, 'POST 업로드 200', postPayload);

  const afterPost = await callRoutes(env, `origin=ICN&destination=ORD&month=${month}&limit=20000`);
  ok(afterPost.cache === 'MISS', '업로드 직후 세대가 바뀌어 캐시 MISS', afterPost.cache);
  eq(afterPost.payload.total, 4, '업로드 후 total 은 올린 노선-월 행 수(수집기 verify 계약)');
  ok(afterPost.payload.items.every(item => item.collected_at === body.collected_at), '업로드 후 collected_at 일치');

  /* verify 와 같은 조회(캐시버스터)도 같은 결과 */
  const verifyAfter = await callRoutes(env, `origin=ICN&destination=ORD&month=${month}&limit=20000&_=${Date.now()}`);
  eq(verifyAfter.payload.total, 4, 'verify 조회 total 4');
  ok(verifyAfter.payload.items.every(item => item.collected_at === body.collected_at), 'verify 조회 collected_at 일치');

  /* 스냅숏 이후 업로드도 changes 에 잡힌다 */
  const changesAfterPost = await callChanges(env, `since=${encodeURIComponent(index.generated_at)}&limit=40`);
  ok(changesAfterPost.payload.scopes.some(scope => scope.origin === 'ICN' && scope.destination === 'ORD'),
    'changes 에 POST 업로드 노선-월 포함');

  /* 권한 없는 업로드는 그대로 거부 */
  const unauthorized = await routesHandler.onRequestPost({
    request: new Request('https://dailyfoodfighter.com/api/air/routes', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  });
  eq(unauthorized.status, 403, '잘못된 토큰 403');

  /* ---------------------------------------------------- 접속 1회당 읽기 비교 */
  const months = [...new Set(index.files.map(file => file.month))];

  /* (구) 방식: 매니페스트 + 월별 전량을 D1 에서 매번 읽는다(캐시 없이). */
  d1.resetStats();
  await callManifest(env, '?_=legacy-manifest');
  for (const value of months) {
    await callRoutes(env, `month=${value}&limit=20000&_=legacy-${value}`);
  }
  const legacyScanned = d1.stats.rowsScanned;
  const legacyReturned = d1.stats.rowsReturned;

  /* (신) 방식: 정적 스냅숏(0행) + changes 1회(캐시 미스) + 바뀐 노선-월 scopes 1회(캐시 미스) */
  d1.resetStats();
  const coldChanges = await callChanges(env, `since=${encodeURIComponent(index.generated_at)}&limit=40&_=cold-${Date.now()}`);
  let scopeParam = '';
  if (coldChanges.payload.count) {
    scopeParam = coldChanges.payload.scopes
      .slice(0, 20)
      .map(scope => `${scope.origin}-${scope.destination}-${scope.month}`)
      .join(',');
    await callRoutes(env, `scopes=${scopeParam}&_=cold-${Date.now()}`);
  }
  const newScanned = d1.stats.rowsScanned;
  const newReturned = d1.stats.rowsReturned;
  const newRowsReturnedOfChanges = coldChanges.payload.count;

  /* 따뜻한 캐시(같은 세대·같은 조회 반복) */
  d1.resetStats();
  await callChanges(env, `since=${encodeURIComponent(index.generated_at)}&limit=40`);
  const warmScanned = d1.stats.rowsScanned;

  const pct = value => ((value / legacyScanned) * 100).toFixed(3);
  console.log('\n── D1 읽기 측정 (읽은 행 추정: EXPLAIN QUERY PLAN 기반) ──');
  console.log(`· (구) 접속 1회  : ${legacyScanned.toLocaleString()}행 읽음 · ${legacyReturned.toLocaleString()}행 반환 (매니페스트 + ${months.length}개월)`);
  console.log(`· (신) 접속 1회  : ${newScanned.toLocaleString()}행 읽음 · ${newReturned.toLocaleString()}행 반환 (changes ${coldChanges.cache} ${coldChanges.payload.count}건 + scopes)`);
  console.log(`· (신) 캐시 재사용: ${warmScanned.toLocaleString()}행 읽음`);
  console.log(`· 절감률        : ${(100 - Number(pct(newScanned))).toFixed(1)}%  (신/구 = ${pct(newScanned)}%)`);

  /* --------------------------------------------------------------- 결과 */
  if (failures.length) {
    console.error(`\n${failures.length}개 실패 / ${passed}개 통과`);
    for (const failure of failures) console.error(' -', failure.message, JSON.stringify(failure.detail || {}).slice(0, 300));
    process.exitCode = 1;
    return;
  }
  console.log(`\n전부 통과: ${passed}개 검사`);
}

await main();
