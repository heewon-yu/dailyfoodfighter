"""Public-program collector pipeline.

Reads normalized JSON records from a configured official API adapter feed.
No source is configured by default; no crawling takes place until URL and
authorization terms are validated. Public notice data only, no user profiles.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

TIMEOUT = 20
CLIENT_USER_AGENT = "PolicyBenefitMatcher-Collector/1.0"


def valid_url(url: str) -> bool:
    try:
        p = urlsplit(url)
        return p.scheme == "https" and bool(p.hostname) and not p.username and not p.password
    except ValueError:
        return False


def read_source_feed() -> list[dict[str, Any]]:
    """Temporary normalized JSON adapter. Requires explicitly approved HTTPS feed."""
    url = os.getenv("SOURCE_FEED_URL", "")
    if not valid_url(url):
        raise RuntimeError("SOURCE_FEED_URL must be an approved HTTPS normalized JSON feed")
    with urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": "PolicyBenefitMatcher/0.1"}),
        timeout=TIMEOUT,
    ) as response:
        raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError("feed exceeds 2 MB limit")
    items = json.loads(raw)
    if not isinstance(items, list) or len(items) > 500:
        raise ValueError("feed must be a JSON array with <=500 records")
    return items


def normalize(raw: dict[str, Any]) -> dict[str, Any]:
    required = ("source", "source_id", "category", "title", "apply_url")
    if not isinstance(raw, dict) or any(not isinstance(raw.get(k), str) or not raw[k].strip() for k in required):
        raise ValueError("missing required public notice attributes")
    if raw["category"] not in ("FUND", "WELFARE") or not valid_url(raw["apply_url"]):
        raise ValueError("invalid category or apply_url")
    allowed = (
        *required, "agency", "summary", "support_amount", "amount_type",
        "target_types", "region_sido", "region_sigungu", "min_age", "max_age",
        "max_business_years", "income_limit_percent", "start_date", "end_date",
        "application_type", "needs_review", "eligibility_json", "status"
    )
    record = {k: raw[k] for k in allowed if k in raw}
    if not isinstance(record.get("target_types", []), list):
        raise ValueError("target_types must be list")
    record["needs_review"] = bool(record.get("needs_review", True))
    digest = json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    record["content_hash"] = hashlib.sha256(digest.encode("utf-8")).hexdigest()
    return record


def ollama_extract(text: str) -> dict[str, Any]:
    """Extract public eligibility hints; never treat model claims as final eligibility."""
    model = os.getenv("OLLAMA_MODEL", "").strip()
    if not model:
        return {}
    endpoint = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/") + "/api/generate"
    prompt = ("Extract explicit eligibility conditions ONLY from the following Korean public funding notice. "
              "Never guess missing facts. Return one JSON object with fields: min_age, max_age, "
              "max_business_years, income_limit_percent, region_sido, region_sigungu. "
              "For unknown values use null. Notice:\n" + text[:5000])
    body = json.dumps({"model": model, "prompt": prompt, "stream": False, "format": "json"}).encode()
    req = urllib.request.Request(endpoint, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.load(resp)
    obj = json.loads(payload.get("response", "{}"))
    if not isinstance(obj, dict):
        raise ValueError("Ollama response must be object")
    allowed = ("min_age", "max_age", "max_business_years", "income_limit_percent", "region_sido", "region_sigungu")
    result = {}
    for key in allowed:
        value = obj.get(key)
        if value is None:
            continue
        if key in allowed[:4] and type(value) is int and 0 <= value <= 1000:
            result[key] = value
        elif key in allowed[4:] and isinstance(value, str) and len(value) <= 80:
            result[key] = value
    return result


def changed_records(records: list[dict[str, Any]], endpoint: str, token: str) -> list[dict[str, Any]]:
    """Check content hashes against D1 before costly inference or writes.

    A failed check is fatal; never assume that a backend error means all changed.
    """
    check_endpoint = endpoint.removesuffix("/api/ingest") + "/api/ingest/check"
    by_id = {(r["source"], r["source_id"]): r for r in records}
    changed: list[dict[str, Any]] = []
    for offset in range(0, len(records), 40):
        chunk = records[offset:offset + 40]
        refs = [{k: r[k] for k in ("source", "source_id", "content_hash")} for r in chunk]
        request = urllib.request.Request(
            check_endpoint,
            data=json.dumps(refs, ensure_ascii=False).encode("utf-8"),
            method="POST",
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                     "User-Agent": CLIENT_USER_AGENT}
        )
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            payload = json.load(response)
        keys = payload.get("changed")
        if not isinstance(keys, list):
            raise ValueError("D1 change-check response missing changed list")
        expected = {(x["source"], x["source_id"]) for x in refs}
        selected = set()
        for item in keys:
            if not isinstance(item, dict):
                raise ValueError("D1 change-check returned invalid item")
            key = (item.get("source"), item.get("source_id"))
            if key not in expected or key in selected:
                raise ValueError("D1 change-check returned unknown or duplicate ID")
            selected.add(key)
            changed.append(by_id[key])
    return changed


def read_current_gov24_capture(state: Path, source_id: str, kind: str, modified: str | None) -> list[dict] | None:
    """Reuse verified manual captures only when the source freshness is known."""
    if not modified:
        return None
    path = state / "read-only-catalog" / "gov24" / "details" / source_id / (kind + ".json")
    try:
        source_time = datetime.strptime(modified, "%Y%m%d%H%M%S").replace(tzinfo=ZoneInfo("Asia/Seoul"))
        with path.open(encoding="utf8") as file:
            capture = json.load(file)
        captured_at = datetime.fromisoformat(capture.get("retrieved_at", ""))
        rows = capture.get("rows")
        if (captured_at.tzinfo is None or captured_at < source_time
                or capture.get("source_id") != source_id or capture.get("endpoint") != kind
                or not isinstance(rows, list) or not rows
                or any(not isinstance(x, dict) or str(x.get("서비스ID")) != source_id for x in rows)):
            return None
        return rows
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def enrich_pending_gov24(endpoint: str, token: str) -> int:
    """Backfill official detail+conditions for D1 catalog items not yet enriched.

    This runs AFTER successful list ingest, so even newly seen IDs can be
    enriched. A persisted cursor prevents repeatedly enriching the first
    handful of incomplete records. All official requests share the daily
    quota ledger and count toward the same 80–90% budget.
    """
    if os.getenv("GOV24_BACKFILL_ENABLED", "NO") != "YES":
        return 0
    limit = int(os.getenv("GOV24_DETAIL_LIMIT", "20"))
    if not 0 <= limit <= 50:
        raise RuntimeError("GOV24_DETAIL_LIMIT must be between 0 and 50")
    if not limit:
        return 0
    state = Path(os.getenv("STATE_DIR", "/state"))
    cursor_file = state / "gov24-detail-offset.txt"
    try:
        offset = int(cursor_file.read_text(encoding="utf8").strip())
    except FileNotFoundError:
        offset = 0
    except ValueError:
        raise RuntimeError("Gov24 detail cursor invalid") from None
    if offset < 0 or offset > 100000:
        raise RuntimeError("Gov24 detail cursor invalid")
    request = urllib.request.Request(
        endpoint.removesuffix("/api/ingest") +
        "/api/ingest/pending?limit=" + str(limit) + "&offset=" + str(offset),
        headers={"Authorization": "Bearer " + token, "User-Agent": CLIENT_USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        pending = json.load(response)
    items = pending.get("items")
    if not isinstance(items, list) or len(items) > limit:
        raise RuntimeError("Gov24 pending backlog returned an invalid response")
    if not items and offset:
        # The list may shrink as enrichment progresses; begin from the front.
        offset = 0
        request = urllib.request.Request(
            endpoint.removesuffix("/api/ingest") +
            "/api/ingest/pending?limit=" + str(limit) + "&offset=0",
            headers={"Authorization": "Bearer " + token, "User-Agent": CLIENT_USER_AGENT},
        )
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            pending = json.load(response)
        items = pending.get("items")
        if not isinstance(items, list) or len(items) > limit:
            raise RuntimeError("Gov24 pending backlog returned an invalid response")
    from gov24 import request_data, normalize_service
    enriched = 0
    for record in items:
        source_id = record.get("source_id")
        if not isinstance(source_id, str) or not __import__("re").fullmatch(r"[A-Za-z0-9_-]{1,200}", source_id):
            raise RuntimeError("Gov24 pending backlog returned an unsafe ID")
        # Errors (including quota exhaustion) intentionally abort the run.
        # This prevents the next 2-hour slot from repeating a half-done batch
        # without a durable cursor.
        modified = record.get("source_modified_at")
        details = read_current_gov24_capture(state, source_id, "detail", modified)
        conditions = read_current_gov24_capture(state, source_id, "conditions", modified)
        if details is None:
            details, _ = request_data("detail", service_id=source_id)
        if conditions is None:
            conditions, _ = request_data("conditions", service_id=source_id)
        detail = next((x for x in details if x.get("서비스ID") == source_id), {})
        condition = next((x for x in conditions if x.get("서비스ID") == source_id), {})
        if not detail:
            # Do not claim enrichment without an actual official detail response.
            continue
        stub = {
            "서비스ID": source_id,
            "수정일시": modified,
            "서비스명": record.get("title"),
            "소관기관명": record.get("agency"),
            "서비스목적요약": record.get("summary"),
            "상세조회URL": record.get("apply_url"),
        }
        normalized = normalize(normalize_service(stub, detail, condition))
        # The Worker stores one fingerprint for the LIST payload. Detail
        # backfill must not replace it with a different DETAIL payload hash:
        # otherwise the next identical listing is misclassified as changed,
        # causing a needless D1 update and discarding API budget/CPU time.
        listing_hash = record.get("content_hash")
        if isinstance(listing_hash, str) and __import__("re").fullmatch(r"[a-f0-9]{64}", listing_hash):
            normalized["content_hash"] = listing_hash
        payload = json.dumps([normalized], ensure_ascii=False).encode("utf8")
        ingest_request = urllib.request.Request(
            endpoint, data=payload, method="POST",
            headers={"Authorization": "Bearer " + token,
                     "Content-Type": "application/json", "User-Agent": CLIENT_USER_AGENT},
        )
        with urllib.request.urlopen(ingest_request, timeout=TIMEOUT) as response:
            result = json.load(response)
        enriched += int(result["imported"])
    # Re-query backlog in next slot. After successfully enriching an item it
    # disappears from the pending set, so cursor does not always advance;
    # skip past permanently incomplete responses only when none were enriched.
    next_offset = 0 if enriched else offset + len(items)
    state.mkdir(parents=True, exist_ok=True)
    temporary = cursor_file.with_suffix(".tmp")
    temporary.write_text(str(next_offset), encoding="utf8")
    temporary.replace(cursor_file)
    return enriched


def run(*, gov24_since: str | None = None) -> dict[str, Any]:
    endpoint = os.getenv("INGEST_URL", "")
    token = os.getenv("INGEST_TOKEN", "")
    if not valid_url(endpoint) or not endpoint.endswith("/api/ingest") or not token:
        raise RuntimeError("INGEST_URL and INGEST_TOKEN must be configured before collection")
    source = os.getenv("COLLECTOR_SOURCE", "normalized_feed")
    bizinfo_state = None
    bizinfo_next = None
    if source in ("bizinfo", "all"):
        from bizinfo import fetch_notices
        bizinfo_state = Path(os.getenv("STATE_DIR", "/state")) / "bizinfo-next-page.txt"
        try:
            cursor = int(bizinfo_state.read_text(encoding="utf8").strip())
        except FileNotFoundError:
            cursor = 1
        except ValueError:
            raise RuntimeError("Invalid Bizinfo page checkpoint") from None
        if not 1 <= cursor <= 100000:
            raise RuntimeError("Invalid Bizinfo page checkpoint")
        bizinfo_progress = {}
        raw_records = fetch_notices(start_page=cursor, progress=bizinfo_progress)
        bizinfo_next = bizinfo_progress.get("next_page", 1)
    else:
        raw_records = []
    gov24_progress: dict[str, Any] | None = None
    state_path: Path | None = None
    snapshot_state: dict | None = None
    page_ids: list[str] = []
    if source in ("gov24", "all") and gov24_since is not None:
        from gov24 import fetch_changed_services
        raw_records.extend(fetch_changed_services(gov24_since))
    elif source in ("gov24", "all"):
        from gov24 import fetch_services
        from snapshot import load_snapshot
        state_path = Path(os.getenv("STATE_DIR", "/state")) / "gov24-catalog-state.json"
        snapshot_state = load_snapshot(state_path)
        page_size = int(os.getenv("GOV24_PER_PAGE", "10"))
        if snapshot_state["per_page"] != page_size:
            # Page indices depend on page size. A 3-row test followed by a
            # 100-row full scan must restart from page 1 without losing D1 data.
            snapshot_state = {**snapshot_state, "partial": [],
                              "missing_once": [], "next_page": 1,
                              "per_page": page_size}
        gov24_progress = {}
        gov24_records = fetch_services(
            max_pages=int(os.getenv("GOV24_MAX_PAGES", "1")),
            per_page=page_size,
            detail_limit=(0 if os.getenv("GOV24_BACKFILL_ENABLED", "NO") == "YES"
                          else int(os.getenv("GOV24_DETAIL_LIMIT", "5"))),
            start_page=snapshot_state["next_page"],
            progress=gov24_progress,
        )
        page_ids = list(dict.fromkeys(gov24_progress.get("seen_ids", [])))
        print("Gov24 official-link coverage:", {
            "listed_ids": len(page_ids),
            "normalized": len(gov24_records),
            "skipped_without_verified_link": gov24_progress.get("skipped_missing_official_link", 0),
            "other_invalid": gov24_progress.get("skipped_other", 0),
        }, flush=True)
        raw_records.extend(gov24_records)
    if source == "normalized_feed":
        raw_records = read_source_feed()
    if source not in ("normalized_feed", "bizinfo", "gov24", "all"):
        raise ValueError("COLLECTOR_SOURCE must be normalized_feed, bizinfo, gov24 or all")
    records = [normalize(x) for x in raw_records]
    # De-duplicate exact source IDs inside the same collection run.
    records = list({(r["source"], r["source_id"]): r for r in records}.values())
    all_count = len(records)
    # This is operational observability only: no additional official API
    # requests. It distinguishes first-time Bizinfo imports from Gov24 refreshes.
    from collections import Counter
    before_by_source = Counter(r["source"] for r in records)
    records = changed_records(records, endpoint, token)
    after_by_source = Counter(r["source"] for r in records)
    print("Change-check by source:", {
        source: {"scanned": before_by_source[source],
                 "changed": after_by_source[source],
                 "unchanged": before_by_source[source]-after_by_source[source]}
        for source in sorted(before_by_source)
    }, flush=True)
    # Public notices are always marked review-required when AI contributes.
    # The local model took ~155 seconds for one notice on the tested iMac.
    # Never apply AI to every collected notice by default.
    ai_limit = min(3, max(0, int(os.getenv("OLLAMA_MAX_RECORDS", "0"))))
    ai_used = 0
    for record in records:
        if ai_used < ai_limit and os.getenv("OLLAMA_MODEL") and record.get("summary") and record.get("needs_review"):
            ai_used += 1
            try:
                hints = ollama_extract(record["summary"])
                record["eligibility_json"] = {**record.get("eligibility_json", {}), "suggested": hints, "method": "ollama-unverified"}
                record["needs_review"] = True
            except (ValueError, KeyError, urllib.error.URLError, TimeoutError) as exc:
                print(f"Ollama parse skipped for {record['source_id']}: {type(exc).__name__}", flush=True)
    imported = 0
    for idx in range(0, len(records), 25):
        batch = json.dumps(records[idx:idx+25], ensure_ascii=False).encode()
        request = urllib.request.Request(
            endpoint, data=batch, method="POST",
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": CLIENT_USER_AGENT}
        )
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            result = json.load(response)
        imported += int(result["imported"])
    enriched = (enrich_pending_gov24(endpoint, token)
                if source in ("gov24", "all") else 0)
    # A partial Gov24 scan can NEVER trigger deletion. Two independent complete
    # catalog scans must miss the same ID before reversible archive is permitted.
    archived_count = 0
    full_scan_completed = False
    if state_path is not None and gov24_progress is not None and snapshot_state is not None:
        from snapshot import reconcile, persist_snapshot
        next_page = gov24_progress.get("next_page", 1)
        full_scan_completed = next_page == 1
        if full_scan_completed:
            # A truncated or duplicate-heavy source listing is not deletion
            # evidence. Do not commit its cursor or reconcile missing IDs.
            all_seen = set(snapshot_state["partial"]) | set(page_ids)
            reported_total = gov24_progress.get("reported_total")
            if reported_total is None or len(all_seen) != reported_total:
                raise RuntimeError("Gov24 full scan count mismatch; archive and checkpoint blocked")
        next_state, to_archive = reconcile(
            snapshot_state, page_ids, complete=full_scan_completed
        )
        for idx in range(0, len(to_archive), 25):
            request = urllib.request.Request(
                endpoint.removesuffix("/api/ingest") + "/api/ingest/archive",
                data=json.dumps({"source": "GOV24", "ids": to_archive[idx:idx + 25]}).encode(),
                method="POST",
                headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": CLIENT_USER_AGENT},
            )
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                result = json.load(response)
            archived_count += int(result["archived"])
        next_state["next_page"] = next_page
        next_state["per_page"] = page_size
        # One atomic file contains both catalog IDs and its position.
        persist_snapshot(state_path, next_state)
    # Officially withdrawn Bizinfo IDs are deleted only when two independent,
    # complete, matching-size catalog scans confirm absence. Never extrapolate
    # deletion from a bounded page window, partial API response or transient 429.
    bizinfo_withdrawn_deleted = 0
    if bizinfo_state is not None and bizinfo_next is not None:
        from snapshot import load_snapshot, reconcile, persist_snapshot
        snapshot_path = bizinfo_state.parent / "bizinfo-catalog-state.json"
        old_snapshot = load_snapshot(snapshot_path)
        seen_ids = list(dict.fromkeys(bizinfo_progress.get("seen_ids", [])))
        completed = bool(bizinfo_progress.get("full_scan_completed"))
        confirmed_total = bizinfo_progress.get("reported_total")
        if completed:
            all_seen = set(old_snapshot["partial"]) | set(seen_ids)
            if confirmed_total is None or len(all_seen) != confirmed_total:
                # API pagination and item counts can drift during scans. Keep
                # scanned rows but never delete on incomplete evidence.
                completed = False
        next_snapshot, withdrawn = reconcile(old_snapshot, seen_ids, complete=completed)
        for idx in range(0, len(withdrawn), 25):
            request = urllib.request.Request(
                endpoint.removesuffix("/api/ingest") + "/api/ingest/archive",
                data=json.dumps({"source": "BIZINFO", "ids": withdrawn[idx:idx + 25]}).encode(),
                method="POST",
                headers={"Authorization": "Bearer " + token,
                         "Content-Type": "application/json", "User-Agent": CLIENT_USER_AGENT},
            )
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                outcome = json.load(response)
            bizinfo_withdrawn_deleted += int(outcome["archived"])
        next_snapshot["next_page"] = bizinfo_next
        next_snapshot["per_page"] = 100
        persist_snapshot(snapshot_path, next_snapshot)
    # Advance Bizinfo page cursor only after D1 changes have been successfully
    # uploaded; a failed run retries the same page window next time.
    if bizinfo_state is not None and bizinfo_next is not None:
        bizinfo_state.parent.mkdir(parents=True, exist_ok=True)
        tmp = bizinfo_state.with_suffix(".tmp")
        tmp.write_text(str(bizinfo_next), encoding="utf8")
        tmp.replace(bizinfo_state)
    return {"fetched": all_count, "changed": len(records), "uploaded": imported,
            "archived": archived_count, "bizinfo_withdrawn_deleted": bizinfo_withdrawn_deleted,
            "details_enriched": enriched,
            "gov24_full_scan_completed": full_scan_completed,
            "gov24_next_page": gov24_progress.get("next_page") if gov24_progress is not None else None,
            "completed_at": datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False))
