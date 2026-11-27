"""Conservative full-catalog snapshot reconciliation for Government24.

Never infer deletion from a partial page, failed request or single missing scan.
State is local to the Docker named volume, not a user profile.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

MAX_TRACKED_IDS = 100_000


def load_snapshot(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"partial": [], "previous": [], "missing_once": [], "next_page": 1, "per_page": None}
    if not isinstance(payload, dict):
        raise ValueError("Invalid snapshot state")
    for key in ("partial", "previous", "missing_once"):
        values = payload.get(key)
        if not isinstance(values, list) or len(values) > MAX_TRACKED_IDS or any(
            not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value) or len(value) > 200
            for value in values
        ):
            raise ValueError("Invalid snapshot IDs")
        if len(values) != len(set(values)):
            raise ValueError("Duplicate snapshot IDs")
    page = payload.get("next_page", 1)
    if type(page) is not int or not 1 <= page <= 100000:
        raise ValueError("Invalid snapshot cursor")
    page_size = payload.get("per_page")
    if page_size is not None and (type(page_size) is not int or not 1 <= page_size <= 100):
        raise ValueError("Invalid snapshot page size")
    return {**{key: payload[key] for key in ("partial", "previous", "missing_once")}, "next_page": page, "per_page": page_size}


def reconcile(state: dict, ids: list[str], *, complete: bool) -> tuple[dict, list[str]]:
    """Return proposed new state and soft-archive IDs (NOT yet committed).

    Soft archive only when an ID is missing from two complete scans,
    and the latest scan isn't unexpectedly much smaller than the previous.
    """
    if any(not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value) for value in ids):
        raise ValueError("Invalid source catalog ID")
    if len(ids) > MAX_TRACKED_IDS:
        raise ValueError("Source catalog too large")
    current = set(state["partial"]) | set(ids)
    if len(current) > MAX_TRACKED_IDS:
        raise ValueError("Source catalog too large")
    if not complete:
        return {**state, "partial": sorted(current)}, []

    previous = set(state["previous"])
    missing_now = previous - current
    missing_once = set(state["missing_once"])
    safe_size = bool(current) and (not previous or len(current) * 100 >= len(previous) * 95)
    # A mass drop could be a failed/filtered API feed; archive NOTHING in that case.
    archived = sorted(missing_now & missing_once) if safe_size else []
    if safe_size:
        # Retain first-absence IDs as pending until the next completed scan.
        pending = missing_now - set(archived)
        tracked_previous = current | pending
    else:
        # A suspicious shrink is not reliable deletion evidence.
        pending = set()
        tracked_previous = current | previous
    return {
        "partial": [],
        "previous": sorted(tracked_previous),
        "missing_once": sorted(pending),
    }, archived


def persist_snapshot(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(state, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    temp.replace(path)
