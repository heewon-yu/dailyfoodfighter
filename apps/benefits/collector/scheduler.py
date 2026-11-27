"""iMac Docker public-notice collector, 10/12/14/16/18 KST daily.

At most one catch-up for the most recent elapsed slot, and no runs before 10.
Persistent quota and scheduler checkpoints survive container restarts.
"""
import datetime as dt
import os
from pathlib import Path
import time
from zoneinfo import ZoneInfo

from pipeline import run

KST = ZoneInfo("Asia/Seoul")
STATE_DIR = Path(os.getenv("STATE_DIR", "/state"))
SUCCESS_FILE = "last-success-date.txt"
RETRY_SECONDS = 30 * 60
POLL_SECONDS = 60


RUN_HOURS = (10, 12, 14, 16, 18)

def slot_at(now: dt.datetime) -> dt.datetime | None:
    """Most recent scheduled slot in KST; None before today's first slot."""
    local = now.astimezone(KST)
    hours = [hour for hour in RUN_HOURS if local.hour >= hour]
    if not hours:
        return None
    return local.replace(hour=hours[-1], minute=0, second=0, microsecond=0)

def next_run(now: dt.datetime) -> dt.datetime:
    local = now.astimezone(KST)
    for hour in RUN_HOURS:
        candidate=local.replace(hour=hour,minute=0,second=0,microsecond=0)
        if candidate>local:
            return candidate
    return (local+dt.timedelta(days=1)).replace(hour=RUN_HOURS[0],minute=0,second=0,microsecond=0)

def due_day(now: dt.datetime) -> dt.date:
    """Compatibility helper for date-only legacy state; actual runs are slot-based."""
    local=now.astimezone(KST)
    return local.date() if slot_at(local) else local.date()-dt.timedelta(days=1)

def last_success_slot(path: Path) -> dt.datetime | None:
    try:
        raw=path.read_text(encoding="utf8").strip()
    except FileNotFoundError:
        return None
    try:
        parsed=dt.datetime.fromisoformat(raw)
        if parsed.tzinfo is None:
            # Legacy date-only markers are intentionally not a completed slot.
            dt.date.fromisoformat(raw)
            return None
        return parsed.astimezone(KST)
    except ValueError:
        raise RuntimeError("Invalid collector success checkpoint") from None

def last_success(path: Path) -> dt.date | None:
    """Legacy helper; retained for callers that inspect the completed date."""
    value=last_success_slot(path)
    return value.date() if value else None

def needs_collection(now: dt.datetime, completed: dt.datetime | dt.date | None) -> bool:
    slot=slot_at(now)
    if slot is None:
        return False
    if completed is None or isinstance(completed,dt.date) and not isinstance(completed,dt.datetime):
        return True
    return completed.astimezone(KST)<slot

def ready() -> bool:
    source = os.getenv("COLLECTOR_SOURCE", "normalized_feed")
    if source == "bizinfo":
        configured = bool(os.getenv("BIZINFO_API_KEY"))
    elif source == "gov24":
        configured = bool(os.getenv("GOV24_API_KEY"))
    elif source == "all":
        configured = bool(os.getenv("BIZINFO_API_KEY")) and bool(os.getenv("GOV24_API_KEY"))
    elif source == "normalized_feed":
        configured = bool(os.getenv("SOURCE_FEED_URL"))
    else:
        return False
    if not configured or not os.getenv("INGEST_URL") or not os.getenv("INGEST_TOKEN"):
        return False
    from quota import quota_config
    if source in ("gov24", "all"):
        try: quota_config("GOV24")
        except RuntimeError: return False
    if source in ("bizinfo", "all"):
        try: quota_config("BIZINFO")
        except RuntimeError: return False
    return True


def run_collection(path: Path, now: dt.datetime | None = None) -> bool:
    """Run once if due; write success marker only on complete upload success."""
    current = (now or dt.datetime.now(KST)).astimezone(KST)
    if not ready():
        print("Official source or D1 ingest is not configured; no collection attempted.", flush=True)
        return False
    completed = last_success_slot(path)
    if not needs_collection(current, completed):
        return False

    print("Collecting public notices for KST slot", slot_at(current).isoformat(), flush=True)
    full_scan_file=STATE_DIR / "gov24-full-catalog-date.txt"
    # Scan the full catalog once per Korean calendar day, then use bounded
    # change-page sampling and detailed-record backfill in subsequent slots.
    # A partial scan never marks completion; the next slot resumes its cursor.
    try:
        full_scan_day=full_scan_file.read_text(encoding="utf8").strip()
    except FileNotFoundError:
        full_scan_day=""
    incremental = (
        os.getenv("GOV24_INCREMENTAL_ENABLED") == "YES" and
        os.getenv("GOV24_DAILY_FULL_CATALOG") == "YES" and
        os.getenv("COLLECTOR_SOURCE") in ("gov24", "all")
    )
    full_scan_due = full_scan_day != current.date().isoformat()
    if incremental and full_scan_day:
        elapsed_days = (current.date() - dt.date.fromisoformat(full_scan_day)).days
        full_scan_due = not 0 <= elapsed_days < 7
    requires_full_scan = (
        os.getenv("GOV24_DAILY_FULL_CATALOG") == "YES"
        and os.getenv("COLLECTOR_SOURCE") in ("gov24", "all")
        and full_scan_due
    )
    if requires_full_scan:
        # Explicit quota opt-in only. A completed *listing* scan is needed
        # before absence can be inferred; Gov24 details remain separately bounded.
        from bootstrap import bootstrap
        from quota import DailyQuotaExhausted
        try:
            gov = bootstrap()  # Requires CONFIRM_GOV24_BULK_QUOTA=YES.
        except DailyQuotaExhausted:
            # Gov24 budget exhaustion must not starve the separately approved
            # Bizinfo budget. Partial catalog page checkpoints are durable.
            print("Gov24 approved daily budget exhausted; resume next KST day.", flush=True)
            gov = {"complete": False, "fetched": 0, "changed": 0, "uploaded": 0}
        # A quota-bounded partial scan is a successful scheduled slice:
        # the verified catalog cursor continues in the next 2-hour slot.
        # Never starve Bizinfo while Gov24 still has older pages to inspect.
        if gov["complete"]:
            full_scan_file.parent.mkdir(parents=True, exist_ok=True)
            tmp_full=full_scan_file.with_suffix(".tmp")
            tmp_full.write_text(current.date().isoformat(), encoding="utf8")
            tmp_full.replace(full_scan_file)
        result = {"fetched": gov["fetched"], "changed": gov["changed"],
                  "uploaded": gov["uploaded"],
                  "gov24_full_scan_completed": gov["complete"]}
        if os.getenv("COLLECTOR_SOURCE") == "all":
            original = os.environ["COLLECTOR_SOURCE"]
            try:
                os.environ["COLLECTOR_SOURCE"] = "bizinfo"
                try:
                    business = run()
                except DailyQuotaExhausted:
                    print("Bizinfo approved daily budget exhausted; resume next KST day.", flush=True)
                    business = {"fetched": 0, "changed": 0, "uploaded": 0}
            finally:
                os.environ["COLLECTOR_SOURCE"] = original
            for field in ("fetched", "changed", "uploaded"):
                result[field] += business[field]
    elif incremental:
        # One day of overlap covers late source updates and same-day paging drift.
        last_day = completed.date() if completed else dt.date.fromisoformat(full_scan_day)
        since = min(last_day, current.date()) - dt.timedelta(days=1)
        result = run(gov24_since=since.isoformat())
    else:
        result = run()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(slot_at(current).isoformat(), encoding="utf-8")
    temp.replace(path)
    print({"fetched": result["fetched"], "changed": result["changed"],
           "uploaded": result["uploaded"], "completed_slot": slot_at(current).isoformat()}, flush=True)
    return True


def main() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint = STATE_DIR / SUCCESS_FILE
    next_attempt = dt.datetime.min.replace(tzinfo=KST)

    while True:
        now = dt.datetime.now(KST)
        if now >= next_attempt:
            try:
                run_collection(checkpoint, now)
                next_attempt = now + dt.timedelta(seconds=POLL_SECONDS)
            except Exception as exc:
                # Errors must not include credential-bearing remote URLs.
                print("Collection failed:", type(exc).__name__, flush=True)
                next_attempt = now + dt.timedelta(seconds=RETRY_SECONDS)
        seconds = max(1, min(POLL_SECONDS, (next_attempt - dt.datetime.now(KST)).total_seconds()))
        time.sleep(seconds)


if __name__ == "__main__":
    main()
