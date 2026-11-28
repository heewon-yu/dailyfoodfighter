/**
 * 테스트용 D1 호환 어댑터 — node:sqlite 위에 구현한다.
 *
 * Pages Function 코드는 env.AIR_DB 에 D1Database 모양(prepare/bind/all/first/run/batch)을
 * 기대하므로, 실제 SQLite(SQL 문법·인덱스·datetime() 동작 동일)로 그대로 돌려 검증한다.
 * 각 호출의 반환 행 수를 세어 'D1 이 몇 행을 돌려줬는지'를 측정한다.
 */
import { DatabaseSync } from 'node:sqlite';

export class MockD1 {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.stats = { queries: 0, rowsReturned: 0, rowsScanned: 0, log: [] };
  }

  exec(sql) {
    this.db.exec(sql);
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }

  async batch(statements) {
    const out = [];
    for (const statement of statements) {
      out.push(statement.__run ? statement.__run() : { meta: { changes: 0 } });
    }
    return out;
  }

  resetStats() {
    this.stats = { queries: 0, rowsReturned: 0, rowsScanned: 0, log: [] };
  }

  _tableRows(table) {
    try {
      const row = this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
      return row && Number.isFinite(row.n) ? row.n : 0;
    } catch (err) {
      return 0;
    }
  }

  /** WHERE ... 절만 뽑아 같은 조건의 행 수를 센다(인덱스 탐색이 읽는 행 수 추정). */
  _equalityRows(sql, args) {
    const match = /\bFROM\s+(\w+)([\s\S]*?)(?:\bGROUP\s+BY\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i.exec(sql);
    if (!match) return 0;
    const table = match[1];
    const tail = match[2] || '';
    const whereIndex = tail.search(/\bWHERE\b/i);
    if (whereIndex < 0) return 0;
    const where = tail.slice(whereIndex + 'WHERE'.length);
    const placeholders = (where.match(/\?/g) || []).length;
    try {
      const row = this.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...args.slice(0, placeholders));
      return row && Number.isFinite(row.n) ? row.n : 0;
    } catch (err) {
      return 0;
    }
  }

  /**
   * 실제 D1 과금 단위(읽은 행)에 가까운 추정치.
   *  · EXPLAIN QUERY PLAN 의 SCAN  → 그 테이블 전체 행
   *  · SEARCH(인덱스)              → 같은 WHERE 조건의 행 수
   */
  _scanRows(sql, args) {
    let total = 0;
    try {
      const plan = this.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args);
      for (const step of plan) {
        const detail = String(step.detail || '');
        const scan = /^SCAN (\w+)/.exec(detail);
        if (scan) {
          total += this._tableRows(scan[1]);
          continue;
        }
        if (/^SEARCH \w+/.test(detail)) total += this._equalityRows(sql, args);
      }
    } catch (err) {
      return 0;
    }
    return total;
  }

  _record(sql, rows, mode, args = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim().slice(0, 180);
    const scanned = mode === 'run' ? 0 : this._scanRows(sql, args);
    this.stats.queries += 1;
    this.stats.rowsReturned += rows;
    this.stats.rowsScanned += scanned;
    this.stats.log.push({ sql: normalized, rows, scanned, mode });
  }
}

class MockStatement {
  constructor(db, sql, args) {
    this.db = db;
    this.sql = sql;
    this.args = args || [];
    this.stmt = db.db.prepare(sql);
  }

  bind(...args) {
    return new MockStatement(this.db, this.sql, args);
  }

  all(...extra) {
    const args = extra.length ? extra : this.args;
    const rows = this.stmt.all(...args).map(row => ({ ...row }));
    this.db._record(this.sql, rows.length, 'all', args);
    return { results: rows, success: true, meta: {} };
  }

  first(...extra) {
    const args = extra.length ? extra : this.args;
    const row = this.stmt.get(...args);
    this.db._record(this.sql, row ? 1 : 0, 'first', args);
    return row ? { ...row } : null;
  }

  run(...extra) {
    return this.__run(extra.length ? extra : this.args);
  }

  __run(args) {
    const params = args && args.length ? args : this.args;
    const result = this.stmt.run(...params);
    this.db._record(this.sql, 1, 'run', params);
    return { success: true, meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}
