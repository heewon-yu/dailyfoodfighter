#!/usr/bin/env python3
"""배포 중인 좌석 스냅숏에서 일반석(E)·프리미엄석(R)을 걷어내고 P·F만 남긴다.

배경(2026-11-26 유희원 님 방침): 마일지도는 프레스티지(P)·일등석(F) 전용.
수집·export 파이프라인(`milemap-collector/app/export_live.py`)도 같은 규칙으로
바뀌었고, 이 스크립트는 이미 만들어진 정적 JSON을 같은 기준으로 다시 맞춘다.

- 대상: air/data/preview/index.json + snapshots/{snapshot}/{region}/{YYYY-MM}.json
- 규칙: cabin 이 business/first 가 아닌 행은 삭제, total 재계산, 정책 필드 추가
- 원본 스냅숏 해시는 유지한다(파일 경로가 매니페스트에 박혀 있다).

사용: python3 tools/apply_pf_only.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREVIEW = ROOT / "air" / "data" / "preview"
KEEP = {"business", "first"}

POLICY = {
    "cabin_policy": "PF_ONLY",
    "cabin_policy_note": "프레스티지석(P)·일등석(F) 전용 — 일반석(E)·프리미엄석(R)은 수집·표시에서 제외",
}


def main():
    index_path = PREVIEW / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))

    report = []

    for entry in index.get("files", []):
        path = PREVIEW / entry["path"]
        payload = json.loads(path.read_text(encoding="utf-8"))
        before = len(payload.get("items", []))
        items = [row for row in payload.get("items", []) if row.get("cabin") in KEEP]
        dropped = before - len(items)

        payload["items"] = items
        payload["total"] = len(items)
        payload.update(POLICY)

        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        entry["total"] = len(items)
        report.append((entry["region"], entry["month"], before, len(items), dropped))

    index["total"] = sum(entry.get("total", 0) for entry in index.get("files", []))
    index.update(POLICY)
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"index total = {index['total']}")
    for region, month, before, after, dropped in report:
        print(f"  {region:14s} {month} {before:4d} → {after:3d} (drop {dropped})")


if __name__ == "__main__":
    main()
