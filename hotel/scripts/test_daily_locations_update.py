#!/usr/bin/env python3
"""daily_locations_update.py의 안전 장치를 네트워크·GitHub 없이 확인한다.

  · 수집 전 `git pull --ff-only origin main` (깨끗한 main 만, 실패하면 중단)
  · 현금가=포인트 오염(cashAmount == points) 1건이라도 있으면 즉시 실패 — 2026-11-28 #28 회귀
  · 현금가 판독률이 지나치게 낮은 스냅숏도 중단
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

import daily_locations_update as daily


def dump(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value), encoding="utf-8")


def expect_error(name, fn) -> None:
    try:
        fn()
    except daily.UpdateError:
        print("  ok  ", name)
        return
    raise AssertionError(name)


def git(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *cmd], cwd=cwd, text=True, capture_output=True, check=True)


def commit(cwd: Path, message: str) -> None:
    git(["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", message], cwd)


def make_repos(tmp: Path):
    """bare origin + seed(작성자) + work(수집기 체크아웃) 저장소를 만든다."""
    origin = tmp / "origin.git"
    git(["init", "--bare", "-q", str(origin)], tmp)
    seed = tmp / "seed"
    git(["clone", "-q", str(origin), str(seed)], tmp)
    (seed / "a.txt").write_text("v1\n", encoding="utf-8")
    git(["add", "."], seed)
    commit(seed, "init")
    git(["push", "-q", "origin", "HEAD:main"], seed)
    work = tmp / "work"
    git(["clone", "-q", "-b", "main", str(origin), str(work)], tmp)
    return origin, seed, work


def test_pull() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        origin, seed, work = make_repos(Path(tmp))

        info = daily.pull_latest_main(work)
        assert info["updated"] is False, info
        print("  ok   최신 상태에서는 pull 없음")

        (seed / "a.txt").write_text("v2\n", encoding="utf-8")
        git(["add", "."], seed)
        commit(seed, "second")
        git(["push", "-q", "origin", "HEAD:main"], seed)
        info = daily.pull_latest_main(work)
        assert info["updated"] is True, info
        assert (work / "a.txt").read_text(encoding="utf-8") == "v2\n"
        assert git(["rev-parse", "HEAD"], work).stdout.strip() == git(["rev-parse", "origin/main"], work).stdout.strip()
        print("  ok   새 커밋을 fast-forward 로 받아옴")

        # 미커밋 변경(테스트 로그·산출물)이 남아 있으면 pull 하지 않는다
        (work / "dirty.log").write_text("x", encoding="utf-8")
        expect_error("미커밋 변경 시 중단", lambda: daily.pull_latest_main(work))
        (work / "dirty.log").unlink()

        # 로컬에 다른 커밋이 있으면 --ff-only 가 실패하므로 중단
        (work / "local.txt").write_text("local\n", encoding="utf-8")
        git(["add", "."], work)
        commit(work, "local only")
        (seed / "a.txt").write_text("v3\n", encoding="utf-8")
        git(["add", "."], seed)
        commit(seed, "third")
        git(["push", "-q", "origin", "HEAD:main"], seed)
        expect_error("fast-forward 불가 시 중단", lambda: daily.pull_latest_main(work))
        git(["reset", "--hard", "-q", "origin/main"], work)

        # main 브랜치가 아니면 중단
        git(["checkout", "-q", "-b", "side"], work)
        expect_error("main 이 아니면 중단", lambda: daily.pull_latest_main(work))
        git(["checkout", "-q", "main"], work)

        # origin 을 읽을 수 없으면 중단
        git(["remote", "set-url", "origin", str(Path(tmp) / "missing.git")], work)
        expect_error("fetch 실패 시 중단", lambda: daily.pull_latest_main(work))


def main() -> int:
    expected = {"AAA", "BBB"}
    good = {
        "meta": {"halted": None, "pages": [{"page": i} for i in range(8)], "warnings": [],
                 "collectedAt": "2026-11-28T08:30:00+09:00"},
        "records": [
            {"code": "AAA", "points": 80000, "cashAmount": 638000, "observedAt": "2026-11-28T08:30:00+09:00"},
            {"code": "BBB", "points": 120000, "cashAmount": 1300253, "observedAt": "2026-11-28T08:30:00+09:00"},
        ],
    }
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "observed.json"
        dump(path, good)
        daily.validate_observation(path, expected)
        print("  ok   전체 8페이지·전수 관측")

        known_non_open = json.loads(json.dumps(good))
        known_non_open["records"].append(
            {"code": "RES", "observedAt": "2026-11-28T08:30:00+09:00"}
        )
        dump(path, known_non_open)
        filtered = daily.validate_observation(path, expected, expected | {"RES"})
        assert {r["code"] for r in filtered["records"]} == expected
        print("  ok   비영업 마스터 카드 제외")

        partial = json.loads(json.dumps(good))
        partial["meta"]["pages"] = partial["meta"]["pages"][:7]
        dump(path, partial)
        expect_error("부분 페이지 중단", lambda: daily.validate_observation(path, expected))

        missing = json.loads(json.dumps(good))
        missing["records"] = missing["records"][:1]
        dump(path, missing)
        expect_error("호텔 누락 중단", lambda: daily.validate_observation(path, expected))

        mixed_time = json.loads(json.dumps(good))
        mixed_time["records"][1]["observedAt"] = "2026-11-27T08:30:00+09:00"
        dump(path, mixed_time)
        expect_error("이전 결과 혼합 중단", lambda: daily.validate_observation(path, expected))

        blocked = json.loads(json.dumps(good))
        blocked["meta"]["halted"] = {"kind": "HTTP_403"}
        dump(path, blocked)
        expect_error("403 안전 중단", lambda: daily.validate_observation(path, expected))

        # 2026-11-28 #28 회귀 — 현금가가 포인트와 같아진 스냅숏은 배포 금지
        polluted = json.loads(json.dumps(good))
        polluted["records"][0]["cashAmount"] = 80000
        dump(path, polluted)
        expect_error("현금가=포인트 오염 중단", lambda: daily.validate_observation(path, expected))

        near = json.loads(json.dumps(good))
        near["records"][0]["cashAmount"] = 80005
        dump(path, near)
        expect_error("현금가·포인트 근접(10 미만) 중단", lambda: daily.validate_observation(path, expected))

        no_cash = json.loads(json.dumps(good))
        for r in no_cash["records"]:
            r.pop("cashAmount", None)
        dump(path, no_cash)
        expect_error("현금가 전면 미판독 중단", lambda: daily.validate_observation(path, expected))

        half_cash = json.loads(json.dumps(good))
        half_cash["records"][1].pop("cashAmount", None)
        dump(path, half_cash)
        expect_error("현금가 판독률 저조 중단", lambda: daily.validate_observation(path, expected))

        collision = daily.find_cash_point_collisions(
            [{"code": "BERWAWA", "points": 80000, "cashAmount": 80000},
             {"code": "SELCICI", "points": 80000, "cashAmount": 485925}])
        assert collision == [("BERWAWA", 80000, 80000)], collision
        print("  ok   오염 레코드 탐지 helper")

    print("  -- git pull --ff-only")
    test_pull()

    print("TEST PASSED (일일 갱신 안전 정책 · 오염 가드 · 수집 전 pull)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
