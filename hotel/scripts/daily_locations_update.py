#!/usr/bin/env python3
"""매일 Hilton Locations 스냅숏을 검증한 뒤 GitHub main에 반영한다.

LLM/API 호출 없이 Python, 실제 Chrome, Git만 사용한다. 전체 8페이지와 영업 중
호텔 119곳이 모두 새로 관측된 경우에만 앱 JSON을 교체하고 커밋한다. 차단,
캡차, 부분 수집, Git 충돌이 있으면 기존 데이터와 원격 저장소를 그대로 둔다.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
REPO = SCRIPT_DIR.parent.parent
DATA = SCRIPT_DIR / "data"
EXPECTED_PAGES = 8
TRACKED_OUTPUTS = (
    Path("hotel/data/hotels.json"),
    Path("hotel/scripts/data/hotels_points_summary.json"),
    Path("hotel/scripts/data/observed_locations.json"),
)


class UpdateError(RuntimeError):
    pass


def run(cmd: list[str], *, cwd: Path = REPO, check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if check and proc.returncode:
        detail = (proc.stderr or proc.stdout or "").strip()[-2000:]
        raise UpdateError(f"명령 실패({proc.returncode}): {' '.join(cmd)}\n{detail}")
    return proc


def atomic_copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=target.name + ".", dir=target.parent)
    try:
        with os.fdopen(fd, "wb") as dst, source.open("rb") as src:
            shutil.copyfileobj(src, dst)
            dst.flush()
            os.fsync(dst.fileno())
        os.replace(tmp_name, target)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise UpdateError(f"JSON 읽기 실패: {path}: {exc}") from exc


def expected_open_codes() -> set[str]:
    master = load_json(DATA / "hotels_luxury.json")
    return {str(h["code"]).upper() for h in master["hotels"] if h.get("status") == "open"}


def master_codes() -> set[str]:
    master = load_json(DATA / "hotels_luxury.json")
    return {str(h["code"]).upper() for h in master["hotels"]}


def atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def validate_observation(path: Path, expected: set[str], known=None) -> dict:
    payload = load_json(path)
    meta = payload.get("meta") or {}
    if meta.get("halted"):
        raise UpdateError(f"수집 안전 중단: {meta['halted']}")
    pages = meta.get("pages") or []
    if len(pages) != EXPECTED_PAGES:
        raise UpdateError(f"부분 수집: 페이지 {len(pages)}/{EXPECTED_PAGES}")
    warnings = meta.get("warnings") or []
    bad = [w for w in warnings if str(w).startswith(("ERROR ", "HALT "))]
    if bad:
        raise UpdateError("수집 오류: " + " | ".join(bad[-3:]))

    records = payload.get("records") or []
    codes = {str(r.get("code") or "").upper() for r in records if r.get("code")}
    missing = sorted(expected - codes)
    unknown = sorted(codes - (known or expected))
    if missing or unknown:
        raise UpdateError(
            f"호텔 전수 검증 실패: records={len(records)} expected={len(expected)} "
            f"missing={missing[:8]} unknown={unknown[:8]}"
        )
    records = [r for r in records if str(r.get("code") or "").upper() in expected]
    if len(records) != len(expected):
        raise UpdateError(f"영업 호텔 레코드 수 불일치: {len(records)}/{len(expected)}")
    payload["records"] = records
    payload["meta"]["observedScope"] = f"브랜드 디렉터리 8페이지 자동 순회로 영업 중 {len(records)}곳 전수 관측"
    observed = {r.get("observedAt") for r in records}
    if None in observed or len(observed) != 1:
        raise UpdateError("모든 호텔의 관측시각이 이번 실행으로 일치하지 않음")
    return payload


def validate_app_data(path: Path, expected: set[str]) -> None:
    payload = load_json(path)
    meta = payload.get("meta") or {}
    counts = meta.get("counts") or {}
    if meta.get("masterCount") != len(expected):
        raise UpdateError("앱 데이터 masterCount 불일치")
    if counts.get("open") != len(expected) or counts.get("unobserved", 0) != 0:
        raise UpdateError(f"앱 데이터 전수 검증 실패: {counts}")
    hotels = [h for h in payload.get("hotels", []) if h.get("status") == "open"]
    if len(hotels) != len(expected) or any(not h.get("observedAt") for h in hotels):
        raise UpdateError("앱 데이터에 미관측 영업 호텔이 있음")


def ensure_clean_main() -> None:
    status = run(["git", "status", "--porcelain"]).stdout.strip()
    if status:
        raise UpdateError("전용 체크아웃이 깨끗하지 않아 중단: " + status[:500])
    branch = run(["git", "branch", "--show-current"]).stdout.strip()
    if branch != "main":
        raise UpdateError(f"main 브랜치가 아님: {branch}")
    run(["git", "fetch", "origin", "main"])
    local = run(["git", "rev-parse", "HEAD"]).stdout.strip()
    remote = run(["git", "rev-parse", "origin/main"]).stdout.strip()
    if local != remote:
        run(["git", "merge", "--ff-only", "origin/main"])


def changed_paths() -> set[Path]:
    lines = run(["git", "status", "--porcelain"]).stdout.splitlines()
    return {Path(line[3:]) for line in lines if len(line) > 3}


def write_status(path: Path, result: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(result, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def main() -> int:
    ap = argparse.ArgumentParser(description="Hilton Locations 일일 검증·GitHub 반영")
    ap.add_argument("--runtime-dir", required=True, help="잠금·로그·로컬 스냅숏 보관 폴더")
    ap.add_argument("--python", default=sys.executable, help="Playwright가 설치된 Python")
    ap.add_argument("--sleep", type=float, default=3.0)
    ap.add_argument("--no-push", action="store_true", help="검증용: 커밋·푸시하지 않음")
    args = ap.parse_args()

    runtime = Path(args.runtime_dir).expanduser().resolve()
    runtime.mkdir(parents=True, exist_ok=True)
    lock_path = runtime / "daily-update.lock"
    status_path = runtime / "last-status.json"
    started = datetime.now().astimezone().isoformat(timespec="seconds")

    with lock_path.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            write_status(status_path, {"ok": False, "startedAt": started, "error": "ALREADY_RUNNING"})
            return 4

        try:
            ensure_clean_main()
            run([args.python, str(SCRIPT_DIR / "collect_locations.py"), "--self-test"])
            expected = expected_open_codes()
            known = master_codes()
            with tempfile.TemporaryDirectory(prefix="hilton-daily-", dir=runtime) as tmp:
                observed_tmp = Path(tmp) / "observed_locations.json"
                collected = run([
                    args.python,
                    str(SCRIPT_DIR / "collect_locations.py"),
                    "--launch",
                    "--sleep", str(args.sleep),
                    "--out", str(observed_tmp),
                ], check=False)
                if collected.returncode:
                    detail = (collected.stderr or collected.stdout or "").strip()[-2000:]
                    raise UpdateError(f"수집기 중단({collected.returncode}): {detail}")
                payload = validate_observation(observed_tmp, expected, known)
                atomic_write_json(observed_tmp, payload)

                day = str(payload["meta"]["collectedAt"])[:10]
                snapshot = runtime / "snapshots" / f"{day}.json"
                atomic_copy(observed_tmp, snapshot)
                atomic_copy(observed_tmp, DATA / "observed_locations.json")

            run([
                args.python,
                str(SCRIPT_DIR / "build_hotel_data.py"),
                "--observed", str(DATA / "observed_locations.json"),
            ])
            validate_app_data(REPO / "hotel/data/hotels.json", expected)
            run(["git", "diff", "--check"])

            changed = changed_paths()
            allowed = set(TRACKED_OUTPUTS)
            if not changed:
                write_status(status_path, {"ok": True, "startedAt": started, "result": "NO_CHANGE"})
                return 0
            if not changed <= allowed:
                raise UpdateError(f"예상 밖 파일 변경: {sorted(map(str, changed - allowed))}")
            if args.no_push:
                write_status(status_path, {
                    "ok": True, "startedAt": started, "result": "VALIDATED_NO_PUSH",
                    "changed": sorted(map(str, changed)),
                })
                return 0

            run(["git", "add", *map(str, TRACKED_OUTPUTS)])
            run(["git", "commit", "-m", f"chore(hotel): refresh locations snapshot {day}"])
            run(["git", "push", "origin", "HEAD:main"])
            sha = run(["git", "rev-parse", "HEAD"]).stdout.strip()
            write_status(status_path, {
                "ok": True, "startedAt": started, "finishedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
                "result": "PUSHED", "date": day, "commit": sha,
            })
            return 0
        except Exception as exc:
            write_status(status_path, {
                "ok": False, "startedAt": started,
                "finishedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
                "error": f"{type(exc).__name__}: {exc}",
            })
            print(f"STOPPED — {exc}", file=sys.stderr)
            return 3


if __name__ == "__main__":
    raise SystemExit(main())
