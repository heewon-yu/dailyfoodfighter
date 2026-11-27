#!/usr/bin/env python3
"""Apply the generated staging SQL twice in memory; never connect to D1."""
import json
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parents[1]
staging = root / "audit-artifacts/d1-staging"
manifest = json.loads((staging / "manifest.json").read_text())
files = [staging / name for name in manifest["files"]]
with sqlite3.connect(":memory:") as db:
    for name in ("0001_initial.sql", "0003_official_source_snapshots.sql"):
        db.executescript((root / "migrations" / name).read_text())
    db.execute("""INSERT INTO programs(id, source, source_id, category, title, apply_url)
                  VALUES ('GOV24:audit','GOV24','audit','WELFARE','audit','https://example.org')""")
    before = db.execute("SELECT * FROM programs").fetchall()
    passes = []
    for _ in range(2):
        start = db.total_changes
        for path in files:
            db.executescript(path.read_text(encoding="utf-8"))
        passes.append(db.total_changes - start)
    assert passes == [manifest["records"], 0], passes
    assert db.execute("SELECT * FROM programs").fetchall() == before
    data = db.execute("""SELECT source, count(*), sum(detail_complete), sum(conditions_complete),
        sum(detail_complete AND conditions_complete) FROM official_source_snapshots GROUP BY source""").fetchall()
    print(json.dumps({"local_pass_changes": passes, "source_rows_detail_conditions_both": data,
                      "public_programs_unchanged": True}, ensure_ascii=False))
