#!/usr/bin/env python3
"""마일지도 한국 공항을 인천(ICN)·김포(GMP) 두 곳만 남긴다.

방침(2026-11-26 유희원 님):
  - 부산/김해(PUS)·제주(CJU)를 포함해 ICN·GMP 외 모든 한국 공항과 국내선 항목을 제외한다.
  - 데이터 수집도 하지 않는다(자동완성 사전·노선표·공제표·핫픽 모두).

대상
  - air/data/airports.json     : country == KR 인 공항 중 ICN·GMP 외 전부 제거
  - air/data/award-chart.json  : CJU·PUS 가 걸린 노선 제거, korea_airports/counts/excluded 갱신
  - air/data/route-catalog.json: CJU·PUS 공항·노선 제거

사용: python3 tools/apply_korea_icn_gmp_only.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "air" / "data"
KEEP_KR = {"ICN", "GMP"}
DROP_KR = {"PUS", "CJU"}
EXCLUDED_REASON = (
    "부산/김해(PUS)·제주(CJU)를 포함해 인천(ICN)·김포(GMP) 외 한국 공항과 "
    "국내선 노선은 제외 방침에 따라 수집·표시하지 않습니다."
)


def write(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path.stat().st_size


def prune_airports():
    path = DATA / "airports.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    before = len(data["airports"])
    data["airports"] = [
        entry for entry in data["airports"]
        if not (entry.get("country") == "KR" and entry["code"] not in KEEP_KR)
    ]
    data["total"] = len(data["airports"])
    data["korea_policy"] = "ICN·GMP 전용 — 부산(PUS)·제주(CJU) 포함 그 외 한국 공항 제외"
    write(path, data)
    print(f"airports.json: {before} → {data['total']}")


def prune_chart():
    path = DATA / "award-chart.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    before = len(data["routes"])
    data["routes"] = [
        route for route in data["routes"]
        if route["o"] not in DROP_KR and route["d"] not in DROP_KR
    ]
    data["korea_airports"] = ["ICN", "GMP"]
    data["excluded_airports"] = ["PUS", "CJU"]
    data["excluded_reason"] = EXCLUDED_REASON

    by_origin = {}
    for route in data["routes"]:
        if route["o"] in KEEP_KR:
            by_origin[route["o"]] = by_origin.get(route["o"], 0) + 1
    data["counts"] = {
        "city_pairs_total": len(data["routes"]),
        "directional_legs_total": len(data["routes"]) * 2,
        "by_origin": dict(sorted(by_origin.items())),
        "excluded_origins": ["PUS", "CJU"],
    }
    write(path, data)
    print(f"award-chart.json routes: {before} → {len(data['routes'])} · {data['counts']}")


def prune_catalog():
    path = DATA / "route-catalog.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    ab = len(data["airports"])
    rb = len(data["routes"])
    data["airports"] = [
        entry for entry in data["airports"]
        if not (entry.get("region") == "대한민국" and entry["code"] not in KEEP_KR)
    ]
    data["routes"] = [
        route for route in data["routes"]
        if route["origin"] not in DROP_KR and route["destination"] not in DROP_KR
    ]
    data["korea_policy"] = "ICN·GMP 전용 — 부산(PUS)·제주(CJU) 포함 그 외 한국 공항 제외"
    write(path, data)
    print(f"route-catalog.json airports: {ab} → {len(data['airports'])}, routes: {rb} → {len(data['routes'])}")


if __name__ == "__main__":
    prune_airports()
    prune_chart()
    prune_catalog()
