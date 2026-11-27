"""Persistent, cross-process daily budgets for official API requests.

Values are the *approved quota for the actual credential*, not public defaults.
One reservation is permanently counted before each attempt, including failed calls.
The Linux Docker named volume survives restarts and concurrently started collectors.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
import fcntl
import json
import os

KST = ZoneInfo("Asia/Seoul")

class DailyQuotaExhausted(RuntimeError):
    pass

def quota_config(source: str) -> tuple[int,int]:
    if source not in ("GOV24", "BIZINFO"):
        raise ValueError("unsupported source")
    raw = os.getenv(source + "_APPROVED_DAILY_CALLS", "").strip()
    if not raw.isdecimal() or int(raw) < 1:
        raise RuntimeError(source + " approved API daily limit not configured; no external API request attempted")
    percent = os.getenv("API_BUDGET_PERCENT", "100").strip()
    if not percent.isdecimal() or not 80 <= int(percent) <= 100:
        raise RuntimeError("API_BUDGET_PERCENT must be 80 to 100")
    limit = int(raw)
    return limit, limit * int(percent) // 100

def reserve(source: str) -> tuple[int,int]:
    """Reserve one actual outgoing HTTP attempt; never overrun budget."""
    approved, ceiling = quota_config(source)
    if ceiling < 1:
        raise RuntimeError("approved quota too small for chosen safety percentage")
    state = Path(os.getenv("STATE_DIR", "/state"))
    state.mkdir(parents=True, exist_ok=True)
    path = state / "api-usage.json"
    lock = state / "api-usage.lock"
    now = datetime.now(timezone.utc)
    day_kst = now.astimezone(KST).date().isoformat()
    day_utc = now.date().isoformat()
    with lock.open("a+") as fp:
        fcntl.flock(fp, fcntl.LOCK_EX)
        try:
            try:
                ledger = json.loads(path.read_text(encoding="utf8"))
                if not isinstance(ledger, dict):
                    raise ValueError("invalid ledger")
            except FileNotFoundError:
                ledger = {}
            except ValueError:
                raise RuntimeError("API usage ledger invalid; stopping to prevent quota overrun")
            # Both KST and UTC windows protect accounts whose provider-specific
            # daily reset timezone has not been independently confirmed.
            keys = (day_kst + ":KST:" + source, day_utc + ":UTC:" + source)
            used = []
            for key in keys:
                current = ledger.get(key, 0)
                if type(current) is not int or current < 0:
                    raise RuntimeError("API usage ledger corrupted")
                used.append(current)
            if max(used) >= ceiling:
                raise DailyQuotaExhausted(source + " daily budget reached")
            # Preserve windows still in use; erase records older than 3 days,
            # never silently reset recent totals on a new process start.
            ledger = {
                key: value for key, value in ledger.items()
                if key.split(":")[0] >= (
                    now.astimezone(KST).date() - timedelta(days=3)
                ).isoformat()
            }
            for key, count in zip(keys, used):
                ledger[key] = count + 1
            temp = path.with_suffix(".tmp")
            temp.write_text(json.dumps(ledger,sort_keys=True),encoding="utf8")
            temp.replace(path)
            return max(used)+1, ceiling
        finally:
            fcntl.flock(fp, fcntl.LOCK_UN)
