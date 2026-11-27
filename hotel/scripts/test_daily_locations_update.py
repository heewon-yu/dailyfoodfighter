#!/usr/bin/env python3
"""daily_locations_update.py의 완전성 검증을 네트워크 없이 확인한다."""
from __future__ import annotations

import json
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


def main() -> int:
    expected = {"AAA", "BBB"}
    good = {
        "meta": {"halted": None, "pages": [{"page": i} for i in range(8)], "warnings": [],
                 "collectedAt": "2026-11-28T08:30:00+09:00"},
        "records": [
            {"code": "AAA", "observedAt": "2026-11-28T08:30:00+09:00"},
            {"code": "BBB", "observedAt": "2026-11-28T08:30:00+09:00"},
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

    print("TEST PASSED (일일 갱신 안전 정책 6항목)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
