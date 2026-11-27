#!/usr/bin/env python3
"""Generate idempotent D1 staging SQL from verified local official-API snapshots.

No API calls, no remote writes, and NO public programs modification.
Run after build-manual-full-data.py; review the manifest before Wrangler import.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    if not isinstance(value, str):
        raise TypeError("Only scalar SQL literals supported")
    return "'" + value.replace("'", "''") + "'"


def fingerprint(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest() if value is not None else None


def statement(record):
    source = record.get("source")
    sid = record.get("source_id")
    if source not in ("GOV24", "BIZINFO") or not isinstance(sid, str) or not sid:
        raise ValueError("Unexpected source or source ID")
    if record.get("id") != source + ":" + sid:
        raise ValueError("Snapshot identity mismatch")
    listing = record.get("listing")
    if not isinstance(listing, dict):
        raise ValueError("Missing listing API object")
    if source == "GOV24" and str(listing.get("서비스ID")) != sid:
        raise ValueError("Gov24 listing ID mismatch")
    if source == "BIZINFO" and str(listing.get("pblancId") or listing.get("seq") or "") != sid:
        raise ValueError("Bizinfo listing ID mismatch")
    detail = record.get("detail") if source == "GOV24" else None
    conditions = record.get("conditions") if source == "GOV24" else None
    if source == "GOV24":
        for name, value in (("detail", detail), ("conditions", conditions)):
            if value is None:
                continue
            rows = value.get("rows") if isinstance(value, dict) else None
            if (not isinstance(value, dict) or value.get("source_id") != sid or value.get("endpoint") != name
                    or not isinstance(rows, list) or not rows
                    or any(not isinstance(x, dict) or str(x.get("서비스ID")) != sid for x in rows)):
                raise ValueError("Gov24 " + name + " mismatch")
    dl, cl = (canonical(detail) if detail is not None else None,
              canonical(conditions) if conditions is not None else None)
    values = (source, sid, canonical(listing), dl, cl, fingerprint(listing),
              fingerprint(detail["rows"] if detail else None), fingerprint(conditions["rows"] if conditions else None), int(detail is not None),
              int(conditions is not None))
    columns = ("source,source_id,listing_json,detail_json,conditions_json,"
               "listing_sha256,detail_sha256,conditions_sha256,detail_complete,conditions_complete")
    # Keep already staged details when a subsequent local export has only LIST data.
    # Reset REVIEWED status when any raw evidence fingerprint changes.
    return ("INSERT INTO official_source_snapshots (" + columns + ") VALUES ("
            + ",".join(map(literal, values)) + ") ON CONFLICT(source,source_id) DO UPDATE SET "
            "listing_json=excluded.listing_json,listing_sha256=excluded.listing_sha256,"
            "detail_json=COALESCE(excluded.detail_json,official_source_snapshots.detail_json),"
            "conditions_json=COALESCE(excluded.conditions_json,official_source_snapshots.conditions_json),"
            "detail_sha256=COALESCE(excluded.detail_sha256,official_source_snapshots.detail_sha256),"
            "conditions_sha256=COALESCE(excluded.conditions_sha256,official_source_snapshots.conditions_sha256),"
            "detail_complete=MAX(official_source_snapshots.detail_complete,excluded.detail_complete),"
            "conditions_complete=MAX(official_source_snapshots.conditions_complete,excluded.conditions_complete),"
            "condition_review='PENDING',updated_at=CURRENT_TIMESTAMP "
            "WHERE official_source_snapshots.listing_sha256 IS NOT excluded.listing_sha256 "
            "OR (excluded.detail_sha256 IS NOT NULL AND official_source_snapshots.detail_sha256 IS NOT excluded.detail_sha256) "
            "OR (excluded.conditions_sha256 IS NOT NULL AND official_source_snapshots.conditions_sha256 IS NOT excluded.conditions_sha256);")


def generate(source_dir: Path, output_dir: Path, max_bytes: int = 180_000):
    if max_bytes < 20_000 or max_bytes > 500_000:
        raise ValueError("max_bytes must be 20000..500000")
    output_dir.mkdir(parents=True, exist_ok=True)
    for old in output_dir.glob("stage-*.sql"):
        old.unlink()
    count = 0
    files = []
    batch = []
    size = 0
    seen = set()
    totals = {}
    for source in ("gov24", "bizinfo"):
        path = source_dir / (source + "-full-original.json")
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Expected full snapshot JSON array")
        totals[source] = len(data)
        for record in data:
            identity = record.get("id")
            if identity in seen:
                raise ValueError("Duplicate snapshot ID")
            seen.add(identity)
            line = statement(record) + "\n"
            line_size = len(line.encode("utf-8"))
            if line_size > min(max_bytes, 100_000):
                raise ValueError("Single record exceeds max SQL batch size: " + str(identity))
            if size + line_size > max_bytes and batch:
                name = f"stage-{len(files)+1:04d}.sql"
                (output_dir / name).write_text("".join(batch), encoding="utf-8")
                files.append(name)
                batch = []
                size = 0
            batch.append(line)
            size += line_size
            count += 1
    if batch:
        name = f"stage-{len(files)+1:04d}.sql"
        (output_dir / name).write_text("".join(batch), encoding="utf-8")
        files.append(name)
    manifest = {"records": count, "sources": totals, "sql_chunks": len(files),
                "files": files, "target_table": "official_source_snapshots",
                "public_programs_unchanged": True,
                "warning": "Staging only. Application eligibility remains unverified."}
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2),
                                              encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default="audit-artifacts/manual-full-data")
    parser.add_argument("--output-dir", default="audit-artifacts/d1-staging")
    parser.add_argument("--max-bytes", type=int, default=180_000)
    args = parser.parse_args()
    print(json.dumps(generate(Path(args.input_dir), Path(args.output_dir),
                              args.max_bytes), ensure_ascii=False, indent=2))
