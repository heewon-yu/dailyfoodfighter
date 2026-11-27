"""Resumable read-only Gov24 serviceDetail + supportConditions downloader.

Only original official GET endpoints. Shares existing Docker /state quota ledger.
Does not mutate scheduler checkpoints, D1, Worker, or original LIST files.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
from gov24 import request_data
from quota import DailyQuotaExhausted
from read_only_full_catalog import save_json, source_id


def listing(root):
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if not manifest.get("complete") or not manifest.get("paging_finished"):
        raise RuntimeError("Gov24 original LIST is incomplete")
    rows = []
    ids = set()
    for path in sorted(root.glob("page-*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for row in data["rows"]:
            sid = source_id("gov24", row)
            if sid in ids:
                raise RuntimeError("Duplicated Gov24 ID in original LIST")
            ids.add(sid)
            rows.append((sid, row))
    if len(rows) != manifest.get("reported_total"):
        raise RuntimeError("Gov24 original LIST has inconsistent row count")
    return rows


def valid_saved(path, source_id, kind):
    if not path.is_file():
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return False
    rows = data.get("rows")
    return (data.get("source_id") == source_id
            and data.get("endpoint") == kind
            and isinstance(rows, list) and bool(rows)
            and all(isinstance(item, dict)
                    and str(item.get("서비스ID", "")) == source_id
                    for item in rows))


def summary(root, calls=0, failures=0):
    rows = listing(root)
    folder = root / "details"
    counts = {}
    for kind in ("detail", "conditions"):
        counts[kind] = sum(valid_saved(folder / sid / (kind + ".json"), sid, kind) for sid, _ in rows)
    both = sum(all(valid_saved(folder / sid / (kind + ".json"), sid, kind)
                   for kind in ("detail", "conditions")) for sid, _ in rows)
    report = {
        "source": "gov24", "list_total": len(rows),
        "detail_saved": counts["detail"],
        "conditions_saved": counts["conditions"],
        "both_saved": both, "remaining": len(rows) - both,
        "calls_this_run": calls, "failures_this_run": failures,
        "details_complete": both == len(rows)
    }
    save_json(root / "detail-verification.json", report)
    print(json.dumps(report, ensure_ascii=False), flush=True)
    return report


def collect(root, max_calls, priority_national=True, retry_invalid=False):
    rows = listing(root)
    if priority_national:
        # Processing priority only: ministry name is NOT proof of nationwide eligibility.
        ministries = ("부", "처", "청", "위원회")
        rows.sort(key=lambda x: (
            0 if str(x[1].get("소관기관명") or "").strip().endswith(ministries) else 1,
            x[0]))
    attempts = 0
    failures = 0
    for sid, _ in rows:
        if attempts >= max_calls:
            break
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", sid):
            raise ValueError("Invalid service ID")
        folder = root / "details" / sid
        for kind in ("detail", "conditions"):
            path = folder / (kind + ".json")
            if valid_saved(path, sid, kind):
                continue
            if path.exists() and not retry_invalid:
                continue  # Already attempted with an empty/mismatched response: manual review.
            if attempts >= max_calls:
                break
            try:
                result, total = request_data(kind, page=1, per_page=10, service_id=sid)
            except DailyQuotaExhausted:
                print("Approved API quota exhausted; resume next available window", flush=True)
                return summary(root, attempts, failures)
            except (RuntimeError, ValueError):
                failures += 1
                attempts += 1
                print("Official endpoint failed:", sid, kind, flush=True)
                # A transient fault should not block later IDs forever, but
                # do not repeatedly retry the same failed ID within this run.
                break
            attempts += 1
            if not result or any(str(item.get("서비스ID", "")) != sid for item in result):
                failures += 1
                print("Official endpoint returned empty or mismatched rows:", sid, kind, flush=True)
            save_json(path, {
                "source_id": sid, "endpoint": kind, "reported_total": total,
                "rows": result, "retrieved_at": datetime.now(timezone.utc).isoformat()
            })
    return summary(root, attempts, failures)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-calls", type=int, default=200)
    parser.add_argument("--summary-only", action="store_true")
    parser.add_argument("--original-order", action="store_true")
    parser.add_argument("--retry-invalid", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.max_calls <= 2000:
        parser.error("--max-calls must be within 1..2000")
    root = Path(os.getenv("STATE_DIR", "/state")) / "read-only-catalog" / "gov24"
    if args.summary_only:
        summary(root)
    else:
        collect(root, args.max_calls, not args.original_order, args.retry_invalid)


if __name__ == "__main__":
    main()
