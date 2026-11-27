#!/usr/bin/env python3
"""Build a disposable local search database from already saved official records."""
import argparse
from collections import Counter
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "collector"))
from bizinfo import normalize_notice
from gov24 import normalize_service
from pipeline import normalize


def first_row(capture):
    return capture["rows"][0] if capture else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=ROOT / "audit-artifacts/manual-full-data")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    # Prevent accidental overwrite of any existing state or live SQLite export.
    with args.output.open("xb"):
        pass
    totals = Counter()
    skipped = Counter()
    with sqlite3.connect(args.output) as db:
        for name in ("0001_initial.sql", "0002_browse_indexes.sql"):
            db.executescript((ROOT / "migrations" / name).read_text(encoding="utf-8"))
        columns = {row[1] for row in db.execute("PRAGMA table_info(programs)")}
        for source in ("gov24", "bizinfo"):
            records = json.loads((args.input_dir / (source + "-full-original.json")).read_text(encoding="utf-8"))
            for raw in records:
                try:
                    item = normalize(
                        normalize_service(raw["listing"], first_row(raw.get("detail")), first_row(raw.get("conditions")))
                        if source == "gov24" else normalize_notice(raw["listing"])
                    )
                except ValueError:
                    skipped[source] += 1
                    continue
                if raw["id"] != item["source"] + ":" + item["source_id"]:
                    raise ValueError("Public program and source identity mismatch")
                item["id"] = raw["id"]
                item["target_types"] = json.dumps(item.get("target_types", []), ensure_ascii=False)
                item["eligibility_json"] = json.dumps(item.get("eligibility_json", {}), ensure_ascii=False)
                if not item.keys() <= columns:
                    raise ValueError("Unexpected normalized program fields")
                db.execute(
                    "INSERT INTO programs (" + ",".join(item) + ") VALUES (" +
                    ",".join("?" for _ in item) + ")", tuple(item.values())
                )
                totals[source] += 1
    print(json.dumps({"search_snapshot": dict(totals), "not_normalized": dict(skipped)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
