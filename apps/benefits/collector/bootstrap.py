"""Optional bounded Gov24 full-list bootstrap; never runs unattended.

All government service LIST records are scanned through paginated batches.
Detailed eligibility is separately limited by the approved API call quota.
"""
from __future__ import annotations
import json
import os
import time
from pathlib import Path
from pipeline import run
from snapshot import load_snapshot

STATE_DIR = Path(os.getenv("STATE_DIR", "/state"))
STATE_FILE = STATE_DIR / "gov24-catalog-state.json"
MAX_BATCHES = 25


def bootstrap() -> dict:
    if os.getenv("CONFIRM_GOV24_BULK_QUOTA") != "YES":
        raise RuntimeError("Gov24 bulk scan disabled; confirm allowed daily quota before use")
    if not os.getenv("GOV24_API_KEY") or not os.getenv("INGEST_TOKEN"):
        raise RuntimeError("Gov24 key and authorized D1 ingest connection are required")
    # Small resumable batches; each progress checkpoint follows verified D1 upload.
    overrides = {
        "COLLECTOR_SOURCE": "gov24",
        "GOV24_PER_PAGE": "100",
        "GOV24_MAX_PAGES": "5",
        "GOV24_DETAIL_LIMIT": "0",
        "GOV24_BACKFILL_ENABLED": "NO",
        "OLLAMA_MAX_RECORDS": "0",
    }
    previous = {key: os.environ.get(key) for key in overrides}
    os.environ.update(overrides)
    try:
        result = {"batches": 0, "fetched": 0, "uploaded": 0, "changed": 0, "complete": False}
        for _ in range(MAX_BATCHES):
            before = load_snapshot(STATE_FILE)
            batch = run()
            result["batches"] += 1
            result["fetched"] += batch["fetched"]
            result["uploaded"] += batch["uploaded"]
            result["changed"] += batch["changed"]
            result["complete"] = bool(batch["gov24_full_scan_completed"])
            print("Batch", result["batches"], "fetched", batch["fetched"],
                  "uploaded", batch["uploaded"], "next_page", batch["gov24_next_page"], flush=True)
            if result["complete"]:
                break
            if load_snapshot(STATE_FILE)["next_page"] == before["next_page"]:
                raise RuntimeError("Gov24 cursor did not advance; stopping bulk scan")
            time.sleep(3)
        print("Gov24 listing bootstrap:", "complete" if result["complete"] else "partial", flush=True)
        return result
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


if __name__ == "__main__":
    print(json.dumps(bootstrap(), ensure_ascii=False))
