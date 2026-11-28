/**
 * /air/ 프론트(app.js) 데이터 계층 통합 테스트.
 *   실제 app.js 를 그대로 로드해, 정적 스냅숏 + D1 변경분 오버레이가
 *   화면에 넘기는 행을 만들고 D1 읽기량을 잰다.
 *   node tests/air-d1/test-frontend.mjs
 */
import fs from 'node:fs';
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
  if (condition) { passed += 1; return; }
  failures.push({ message, detail });
  console.error(`FAIL  ${message}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 400));
}

function eq(actual, expected, message) {
  ok(actual === expected, message, { actual, expected });
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

const MIME = {
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

/**
 * 브라우저 fetch 대역 — /api/air/* 는 실제 Pages Function 핸들러로, 나머지는 저장소 파일로 응답한다.
 */
function makeFetch(env, options = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const target = new URL(String(input), 'https://dailyfoodfighter.test');
    calls.push(target.pathname + target.search);

    if (options.failD1 && target.pathname.startsWith('/api/air/')) {
      return new Response(JSON.stringify({ ok: false, error: 'database_unavailable' }), {
        status: 503, headers: { 'content-type': 'application/json' }
      });
    }

    if (target.pathname === '/api/air/manifest') {
      return manifestHandler.onRequestGet({ request: new Request(target.href), env });
    }
    if (target.pathname === '/api/air/routes') {
      return routesHandler.onRequestGet({ request: new Request(target.href), env });
    }
    if (target.pathname === '/api/air/changes') {
      return changesHandler.onRequestGet({ request: new Request(target.href), env });
    }
    if (target.pathname === '/api/air/refresh-request') {
      return new Response(JSON.stringify({ ok: false, error: 'skipped_in_test' }), { status: 503, headers: { 'content-type': 'application/json' } });
    }

    if (options.failStatic && target.pathname.startsWith('/air/data/')) {
      return new Response('not found', { status: 404 });
    }

    const file = path.join(repoRoot, decodeURIComponent(target.pathname));
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('not found', { status: 404 });
    const ext = path.extname(file);
    return new Response(fs.readFileSync(file), {
      status: 200,
      headers: { 'content-type': MIME[ext] || 'application/octet-stream' }
    });
  };
  return { fetchImpl, calls };
}

function installBrowserGlobals(fetchImpl, search = '') {
  const listeners = new Map();
  globalThis.window = globalThis;
  globalThis.location = {
    origin: 'https://dailyfoodfighter.test',
    href: `https://dailyfoodfighter.test/air/${search}`,
    search,
    pathname: '/air/'
  };
  globalThis.document = {
    readyState: 'loading',
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        children: [],
        append() {}, appendChild() {}, replaceChildren() {}, remove() {},
        setAttribute() {}, getAttribute() { return null; },
        addEventListener() {}, removeEventListener() {},
        insertBefore() {}
      };
    }
  };
  const storage = new Map();
  globalThis.sessionStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  globalThis.fetch = fetchImpl;
  globalThis.history = { replaceState() {}, pushState() {} };
}

async function loadApp() {
  /* 캐시된 모듈 없이 매번 새로 평가한다. */
  const file = path.join(repoRoot, 'air/assets/app.js');
  const code = fs.readFileSync(file, 'utf8');
  const vm = await import('node:vm');
  const context = vm.createContext(globalThis);
  vm.runInContext(code, context, { filename: 'air/assets/app.js' });
  return globalThis.window.Air;
}

async function main() {
  installCaches();
  const d1 = new MockD1();
  const seeded = seed(d1, repoRoot);
  const index = loadIndex(repoRoot);
  const env = { AIR_DB: d1, AIR_INGEST_TOKEN: 'test-token-1234567890' };

  /* ---------------------------------------------------- 1) 정적 스냅숏 우선 */
  {
    const { fetchImpl, calls } = makeFetch(env);
    installBrowserGlobals(fetchImpl, '');
    const Air = await loadApp();

    d1.resetStats();
    const payload = await Air.loadRows({});
    const d1Rows = d1.stats.rowsReturned;

    eq(payload.rows.length, seeded.rowCount, '정적 스냅숏 전체 행 수 유지');
    eq(Air.dataSource(), 'static', '기본 데이터 출처는 정적 스냅숏');
    ok(d1Rows < 200, 'D1 읽기 수백 행 이하(변경분 확인만)', d1Rows);
    ok(!calls.some(url => url.startsWith('/api/air/manifest')), 'D1 매니페스트는 호출하지 않는다', calls.filter(u => u.includes('manifest')));
    ok(calls.some(url => url.startsWith('/api/air/changes')), 'changes 는 호출한다');

    const meta = await Air.manifestMeta();
    eq(meta.dataSource, 'static', 'manifestMeta dataSource=static');
    ok(meta.generatedAt === index.generated_at, '기준 시각은 스냅숏 generated_at');

    console.log(`[1] 정적 우선: 행 ${payload.rows.length.toLocaleString()} · D1 ${d1Rows}행 · 요청 ${calls.length}건`);
  }

  /* -------------------------------- 2) 재조회 큐가 한 노선-월을 D1 에만 올린 경우 */
  {
    const target = { origin: 'ICN', destination: 'ORD', month: '2026-12' };

    /* 먼저 스냅숏만으로 그 노선-월의 행 수를 센다(교체 전 기준). */
    installCaches();
    const snapshotOnly = makeFetch(env, { failD1: true });
    installBrowserGlobals(snapshotOnly.fetchImpl, '');
    const SnapshotAir = await loadApp();
    const before = await SnapshotAir.loadRows({});
    const staticScoped = before.rows.filter(row =>
      row.origin === target.origin && row.destination === target.destination && row.month === target.month).length;

    const collectedAt = new Date(Date.parse(index.generated_at) + 3 * 3600e3).toISOString();
    addRefreshUpload(d1, { ...target, collected_at: collectedAt, status: 'available' });

    installCaches();
    const { fetchImpl } = makeFetch(env);
    installBrowserGlobals(fetchImpl, '');
    const Air = await loadApp();

    d1.resetStats();
    const payload = await Air.loadRows({});
    const d1Rows = d1.stats.rowsReturned;

    const scoped = payload.rows.filter(row =>
      row.origin === target.origin && row.destination === target.destination && row.month === target.month);

    eq(scoped.length, 62, '오버레이한 노선-월 행 수(31일 × 2등급)');
    ok(scoped.every(row => row.status === 'available'), '오버레이 행은 D1 상태를 따른다');
    ok(scoped.every(row => row.collectedAt === collectedAt), '오버레이 행은 D1 수집 시각을 따른다');
    ok(payload.rows.some(row => row.origin === 'ICN' && row.destination === 'ORD' && row.month === '2026-11'),
      '같은 노선의 다른 달(스냅숏) 행은 유지');
    eq(payload.rows.length, seeded.rowCount - staticScoped + 62,
      `다른 노선-월은 스냅숏 그대로(교체 ${staticScoped} → 62행)`);
    ok(d1Rows < 400, '오버레이 포함 D1 읽기 수백 행 이하', d1Rows);

    console.log(`[2] 오버레이: ${target.origin}-${target.destination}-${target.month} 62행 교체 · 총 ${payload.rows.length.toLocaleString()}행 · D1 ${d1Rows}행`);
  }

  /* --------------------------------------------- 3) D1 장애 — 스냅숏만으로 동작 */
  {
    installCaches();
    const { fetchImpl } = makeFetch(env, { failD1: true });
    installBrowserGlobals(fetchImpl, '');
    const Air = await loadApp();

    const payload = await Air.loadRows({});
    eq(payload.rows.length, seeded.rowCount, 'D1 장애에도 스냅숏 전체 행을 보여 준다');
    eq(Air.dataSource(), 'static', 'D1 장애 시 출처 static');
  }

  /* ------------------------------------- 4) 정적 파일 장애 — D1 전체 경로로 폴백 */
  {
    installCaches();
    const { fetchImpl } = makeFetch(env, { failStatic: true });
    installBrowserGlobals(fetchImpl, '');
    const Air = await loadApp();

    d1.resetStats();
    const payload = await Air.loadRows({});
    ok(payload.rows.length > 1000, '정적 장애 시 D1 에서 읽어 화면을 채운다', payload.rows.length);
    eq(Air.dataSource(), 'd1', '폴백 시 출처 d1');
  }

  /* ------------------------------------- 5) ?data=static — D1 을 한 번도 부르지 않는다 */
  {
    installCaches();
    const { fetchImpl, calls } = makeFetch(env);
    installBrowserGlobals(fetchImpl, '?data=static');
    const Air = await loadApp();

    await Air.loadRows({});
    ok(!calls.some(url => url.startsWith('/api/air/')), '?data=static 은 D1 API 호출 0', calls);
  }

  /* ------------------------------- 6) 오래된 스냅숏 — D1 매니페스트·전체 조회로 전환 */
  {
    installCaches();
    const staleIndex = { ...index, generated_at: new Date(Date.now() - 30 * 3600e3).toISOString() };
    const { fetchImpl } = makeFetch(env);
    globalThis.fetch = async (input, init) => {
      const target = new URL(String(input), 'https://dailyfoodfighter.test');
      if (target.pathname === '/air/data/preview/index.json') {
        return new Response(JSON.stringify(staleIndex), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return fetchImpl(input, init);
    };
    installBrowserGlobals(globalThis.fetch, '');
    const Air = await loadApp();

    d1.resetStats();
    const payload = await Air.loadRows({});
    eq(Air.dataSource(), 'd1', '오래된 스냅숏은 D1 우선');
    ok(payload.rows.length > 1000, 'D1 에서 행을 읽는다', payload.rows.length);
  }

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
