"""READ ONLY full listing collector. No ingestion, deletion or scheduler mutation.

Runs inside existing docker compose collector container, shares its quota ledger.
Stores immutable per-page JSON in /state/read-only-catalog/{source}/ and a
separate resumable checkpoint. It never touches the scheduled catalog cursors.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys

from gov24 import request_data
from bizinfo import ENDPOINT, MAX_BYTES, items_from_response
from quota import DailyQuotaExhausted, reserve


def save_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def source_id(source, row):
    value = row.get("서비스ID") if source == "gov24" else (row.get("pblancId") or row.get("seq"))
    value = str(value or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value):
        raise ValueError("Source returned invalid or missing ID")
    return value


def bizinfo_page(page, size):
    import urllib.parse
    import urllib.request
    key = os.getenv("BIZINFO_API_KEY", "").strip()
    if not key:
        raise RuntimeError("BIZINFO_API_KEY missing")
    params = urllib.parse.urlencode({
        "crtfcKey": key, "dataType": "json", "searchCnt": size,
        "pageUnit": size, "pageIndex": page
    })
    request = urllib.request.Request(
        ENDPOINT + "?" + params, headers={"User-Agent":"PolicyBenefitMatcher/0.1"})
    reserve("BIZINFO")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read(MAX_BYTES + 1)
    except Exception:
        raise RuntimeError("Bizinfo API request failed; credentials withheld") from None
    if len(body) > MAX_BYTES:
        raise ValueError("Bizinfo response exceeds safety size")
    return items_from_response(json.loads(body))


def scan(source, max_pages):
    if source not in ("gov24", "bizinfo"):
        raise ValueError("unknown source")
    root = Path(os.getenv("STATE_DIR", "/state")) / "read-only-catalog" / source
    manifest = root / "manifest.json"
    page_size = 100
    if manifest.exists():
        state = json.loads(manifest.read_text(encoding="utf-8"))
    else:
        state = {
            "source": source, "next_page": 1, "page_size": page_size,
            "reported_total": None, "complete": False,
            "started_at": datetime.now(timezone.utc).isoformat()
        }
    if state["complete"]:
        print(source, "already complete: no API requests made", flush=True)
        return state
    if state["page_size"] != page_size:
        raise RuntimeError("Page size changed; cannot safely resume")
    for _ in range(max_pages):
        page = state["next_page"]
        if page > 100000:
            raise RuntimeError("Page safety maximum reached")
        try:
            rows, total = (request_data("list", page=page, per_page=page_size)
                           if source == "gov24" else bizinfo_page(page, page_size))
        except DailyQuotaExhausted:
            print(source, "quota exhausted; resume later", flush=True)
            break
        if state["reported_total"] is not None and total is not None and total != state["reported_total"]:
            raise RuntimeError("Source total changed mid-scan; stop for review, do not declare complete")
        if state["reported_total"] is None:
            state["reported_total"] = total
        ids = [source_id(source, row) for row in rows]
        if len(ids) != len(set(ids)):
            raise RuntimeError("Duplicate IDs within page; scan stopped")
        page_file = root / f"page-{page:06d}.json"
        if page_file.exists():
            raise RuntimeError("Page already stored but checkpoint not advanced; manual audit required")
        # All rows retained as source records; never silently discard a missing link.
        save_json(page_file, {"source":source, "page":page, "ids":ids, "rows":rows})
        state["next_page"] = page + 1
        state["last_page_count"] = len(rows)
        state["last_saved_at"] = datetime.now(timezone.utc).isoformat()
        # Empty/short last page is enough to stop paging, but absence of
        # source reported_total is NOT enough to claim full source parity.
        is_final = len(rows) < page_size or (
            total is not None and page * page_size >= total)
        state["complete"] = bool(is_final and total is not None)
        state["paging_finished"] = bool(is_final)
        save_json(manifest, state)
        print(f"{source} saved page={page} count={len(rows)} total={total}", flush=True)
        if is_final:
            break
    return state


def verify(source):
    root = Path(os.getenv("STATE_DIR", "/state")) / "read-only-catalog" / source
    state = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    ids = []
    ids_seen = set()
    duplicates = set()
    files = sorted(root.glob("page-*.json"))
    for index, path in enumerate(files, 1):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data["page"] != index:
            raise ValueError("Missing or unexpected source page")
        for row in data["rows"]:
            rid = source_id(source,row)
            if rid in ids_seen:
                duplicates.add(rid)
            ids.append(rid)
            ids_seen.add(rid)
    count = len(set(ids))
    expected = state.get("reported_total")
    complete = bool(state.get("paging_finished") and state.get("complete")
                    and not duplicates and expected is not None and count == expected
                    and len(files) == state["next_page"] - 1)
    result = {
        "source":source, "pages_saved":len(files),
        "rows":len(ids), "unique_ids":count,
        "duplicates":len(duplicates),
        "reported_total":expected, "source_complete":complete,
        "data_path":str(root)
    }
    save_json(root / "verification.json", result)
    print(json.dumps(result,ensure_ascii=False), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source",choices=("gov24","bizinfo"),required=True)
    parser.add_argument("--max-pages",type=int,default=25)
    parser.add_argument("--verify-only",action="store_true")
    args = parser.parse_args()
    if not 1 <= args.max_pages <= 100:
        parser.error("--max-pages must be 1..100")
    if not args.verify_only:
        scan(args.source,args.max_pages)
    result = verify(args.source)
    if not result["source_complete"]:
        print("INCOMPLETE: keep saved pages and resume. No D1 changes.",flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Avoid leaking URLs containing service keys through exception messages.
        print("Collection stopped:", type(exc).__name__,str(exc) if isinstance(exc,(ValueError,RuntimeError,FileNotFoundError)) else "see local audit",file=sys.stderr)
        raise SystemExit(1)
