import datetime as dt
import json
import os
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

JOB = os.environ["JOB"]
URL = os.environ["SERVICE_URL"].rstrip("/")
TOKEN = os.environ["MAINTENANCE_TOKEN"]
ALERT_URL = os.environ["ALERT_URL"]


def notify(message):
    print(message, flush=True)
    if ALERT_URL and urlsplit(ALERT_URL).scheme == "https":
        try:
            with urlopen(Request(ALERT_URL, data=message.encode(), method="POST"), timeout=8):
                pass
        except (HTTPError, URLError, TimeoutError):
            print("::warning::Scalping King alert destination unavailable")


def latest_runs():
    try:
        out = subprocess.run(
            ["gh", "api", f"repos/{os.environ['GITHUB_REPOSITORY']}/actions/workflows/scalping-maintenance.yml/runs?per_page=40"],
            capture_output=True, check=True, timeout=12,
        )
        return [run for run in json.loads(out.stdout)["workflow_runs"]
                if run["display_title"] == f"Scalping King DB ({JOB})" and run["status"] == "completed"]
    except (subprocess.SubprocessError, KeyError, ValueError):
        return []


def attempt():
    if not URL or not TOKEN or urlsplit(URL).scheme != "https":
        raise RuntimeError("maintenance configuration is missing")
    test = os.environ.get("VERIFY_FAILURE") == "true"
    token = "intentional-test-invalid-token" if test else TOKEN
    request = Request(URL + "/maintenance?" + urlencode({"job": JOB}), data=b"",
                      headers={"Authorization": "Bearer " + token}, method="POST")
    with urlopen(request, timeout=15) as response:
        data = json.load(response)
    if data.get("ok") is not True or data.get("job") != JOB or not data.get("at"):
        raise RuntimeError("database response did not confirm activity")
    return data


def main():
    data = None
    intentional = os.environ.get("VERIFY_FAILURE") == "true"
    for attempt_no in range(3):
        try:
            data = attempt()
            break
        except HTTPError as exc:
            reason = f"HTTP {exc.code}"
            if exc.code in (401, 403):
                break
        except (URLError, TimeoutError, ValueError, RuntimeError) as exc:
            reason = type(exc).__name__ if not isinstance(exc, RuntimeError) else str(exc)
        if attempt_no < 2:
            time.sleep(2 ** attempt_no)
    recent = latest_runs()
    if data is None:
        last = next((run for run in recent if run["conclusion"] == "success"), None)
        age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(last["updated_at"]) if last else None
        repeated = bool(recent and recent[0]["conclusion"] == "failure")
        warning = f"5분 단타왕 DB {JOB} 실패 ({reason})"
        if intentional or repeated or not age or age >= dt.timedelta(hours=48):
            notify(warning + (" · 경보 테스트" if intentional else " · 연속 실패 또는 최근 48시간 성공 기록 없음"))
        print("::error::" + warning)
        raise SystemExit(1)
    if intentional:
        raise SystemExit("Invalid maintenance token was accepted")
    print(json.dumps(data, ensure_ascii=False))
    if recent and recent[0]["conclusion"] == "failure":
        notify(f"5분 단타왕 DB {JOB} 복구")
    size = data["database_bytes"]
    if size >= 500_000_000 * .70:
        notify(f"5분 단타왕 DB 사용량 {'긴급' if size >= 500_000_000 * .85 else '주의'} · {size:,} bytes")
    if JOB == "cleanup" and data["deleted"] >= 500:
        print("::notice::Bounded cleanup removed at least one batch; check remaining data")


if __name__ == "__main__":
    main()
