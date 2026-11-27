#!/usr/bin/env python3
"""Export a read-only independent reference inventory from a LOCAL D1 SQLite copy.
Never connects to the production D1 and never exports personal profiles.
Usage: python3 scripts/export-audit-snapshot.py /path/to/local-d1.sqlite audit-artifacts/snapshot.json
"""
import datetime
import json
import pathlib
import sqlite3
import sys

def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python3 scripts/export-audit-snapshot.py LOCAL_DB.sqlite OUTPUT.json")
    source = pathlib.Path(sys.argv[1]).expanduser().resolve(strict=True)
    destination = pathlib.Path(sys.argv[2]).expanduser().resolve()
    if not source.is_file() or not destination.name.endswith(".json"):
        raise SystemExit("Expected existing local SQLite file and JSON output path")
    if source == destination:
        raise SystemExit("Input and output must differ")
    # SQLite's URI mode=ro avoids writes and accidental creation of a database.
    db = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    try:
        check = db.execute("PRAGMA integrity_check").fetchone()[0]
        if check != "ok":
            raise RuntimeError("SQLite integrity check failed: " + str(check))
        today = (datetime.datetime.now(datetime.timezone.utc) +
                 datetime.timedelta(hours=9)).date().isoformat()
        rows = db.execute("""
          SELECT id, source, category, title, agency, summary, region_sido,
                 region_sigungu, min_age, max_age, income_limit_percent,
                 start_date, end_date, application_type, apply_url, needs_review,
                 target_types, eligibility_json
          FROM programs
          WHERE status NOT IN ('ARCHIVED','CLOSED')
            AND (end_date IS NULL OR end_date >= ?)
          ORDER BY created_at DESC, id DESC
        """, (today,)).fetchall()
        programs = []
        for item in rows:
            record = dict(item)
            record["target_types"] = json.loads(record.pop("target_types") or "[]")
            eligibility = json.loads(record.pop("eligibility_json") or "{}")
            record["condition_flags"] = eligibility.get("condition_flags", {})
            programs.append(record)
        document = {
            "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "asOfKstDate": today,
            "source": "local-read-only-sqlite",
            "programs": programs,
            "scenarios": []
        }
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            raise SystemExit("Refusing to overwrite existing baseline: " + str(destination))
        destination.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Saved {len(programs)} distinct active/review rows to {destination}")
        print("Populate scenarios[].expectedIds independently before filtered scenario audits.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
