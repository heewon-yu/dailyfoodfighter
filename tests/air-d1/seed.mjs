/**
 * 테스트 시드 — 실제 저장소의 정적 스냅숏(air/data/preview)을 D1(SQLite)에 그대로 적재한다.
 *  · air_award_dates  : 스냅숏 item 1:1 (약 4만 행)
 *  · air_ingest_runs  : 노선-월 업로드 이력(배치 1건 = 1행)을 시각과 함께 재구성
 *
 * collected_at 이 스냅숏 generated_at 보다 이른 행은 '이미 스냅숏에 있는 데이터'다.
 * 테스트에서는 스냅숏 이후 업로드(runs)를 추가해 /api/air/changes 동작을 확인한다.
 */
import fs from 'node:fs';
import path from 'node:path';

export function loadIndex(repoRoot) {
  const file = path.join(repoRoot, 'air/data/preview/index.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadSnapshotItems(repoRoot, index) {
  const base = path.join(repoRoot, 'air/data/preview');
  const out = [];
  for (const entry of index.files) {
    const file = path.join(base, entry.path);
    if (!fs.existsSync(file)) continue;
    const part = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const item of part.items || []) out.push({ item, region: entry.region, month: entry.month });
  }
  return out;
}

export function seed(d1, repoRoot, options = {}) {
  const schema = fs.readFileSync(path.join(repoRoot, 'functions/api/air/schema.sql'), 'utf8');
  d1.exec(schema);

  const index = loadIndex(repoRoot);
  const rows = loadSnapshotItems(repoRoot, index);

  const insert = d1.db.prepare(`
    INSERT INTO air_award_dates
      (program, origin, destination, departure_date, month, cabin, status, seat_count, points,
       first_combined, operating_status, availability_type, source, source_updated_at,
       collected_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (program, origin, destination, departure_date, cabin) DO UPDATE SET
      status = excluded.status, collected_at = excluded.collected_at, updated_at = excluded.updated_at
  `);

  d1.db.exec('BEGIN');
  for (const { item } of rows) {
    insert.run(
      item.program || 'KE_SKYPASS',
      item.origin,
      item.destination,
      item.departure_date,
      String(item.departure_date).slice(0, 7),
      item.cabin,
      item.status,
      item.seat_count ?? null,
      item.points ?? null,
      item.first_combined ? 1 : 0,
      item.operating_status || null,
      item.availability_type || null,
      item.source || 'KOREAN_AIR_PUBLIC_AWARD_CALENDAR',
      item.source_updated_at || null,
      item.collected_at || index.generated_at,
      index.generated_at
    );
  }
  d1.db.exec('COMMIT');

  /* 스냅숏을 만든 배치 이력 — 스냅숏 이전 업로드는 changes 대상이 아니다. */
  const scopes = new Map();
  for (const { item } of rows) {
    const key = `${item.origin}-${item.destination}-${item.month || String(item.departure_date).slice(0, 7)}`;
    const month = String(item.departure_date).slice(0, 7);
    const collected = item.collected_at || index.generated_at;
    const current = scopes.get(key);
    if (!current || String(collected) > String(current.collected_at)) {
      scopes.set(key, {
        origin: item.origin,
        destination: item.destination,
        month,
        collected_at: collected
      });
    }
  }

  const run = d1.db.prepare(`
    INSERT INTO air_ingest_runs
      (program, origin, destination, month, upserted, pruned, collected_at, received_at, actor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let order = 0;
  const since = Date.parse(index.generated_at);
  d1.db.exec('BEGIN');
  for (const scope of scopes.values()) {
    order += 1;
    const received = new Date(since - 3600e3 + order * 1000).toISOString();
    run.run('KE_SKYPASS', scope.origin, scope.destination, scope.month, 62, 0, scope.collected_at, received, 'seed');
  }
  d1.db.exec('COMMIT');

  return { index, rowCount: rows.length, scopeCount: scopes.size };
}

/** 스냅숏 이후 한 노선-월이 다시 올라온 상황을 만든다(웹 재조회 큐가 올린 것과 같은 모양). */
export function addRefreshUpload(d1, { origin, destination, month, collected_at, status = 'available' }) {
  const dates = [];
  const [year, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  for (let day = 1; day <= days; day += 1) {
    dates.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  const now = new Date().toISOString();
  const insert = d1.db.prepare(`
    INSERT INTO air_award_dates
      (program, origin, destination, departure_date, month, cabin, status, seat_count, points,
       first_combined, operating_status, availability_type, source, source_updated_at,
       collected_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 'OPERATED', 'PUBLIC_INDICATOR',
            'KOREAN_AIR_PUBLIC_AWARD_CALENDAR', NULL, ?, ?)
    ON CONFLICT (program, origin, destination, departure_date, cabin) DO UPDATE SET
      status = excluded.status, collected_at = excluded.collected_at, updated_at = excluded.updated_at
  `);
  d1.db.exec('BEGIN');
  for (const date of dates) {
    for (const cabin of ['business', 'first']) {
      insert.run('KE_SKYPASS', origin, destination, date, month, cabin, status, collected_at, now);
    }
  }
  d1.prepare(`
    INSERT INTO air_ingest_runs
      (program, origin, destination, month, upserted, pruned, collected_at, received_at, actor)
    VALUES ('KE_SKYPASS', ?, ?, ?, ?, 0, ?, ?, 'test')
  `).bind(origin, destination, month, dates.length * 2, collected_at, now).run();
  d1.db.exec('COMMIT');
  return dates.length * 2;
}
