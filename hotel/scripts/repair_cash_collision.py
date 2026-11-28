#!/usr/bin/env python3
"""현금가가 포인트와 같아진 레코드(2026-11-28 #28 오염)를 직전 정상 커밋의 현금가로 복원한다.

수집기(`collect_locations.py`)와 일일 갱신 가드가 고쳐졌더라도, 이미 배포된 스냅숏의
오염된 58곳은 그대로 남는다. 이 스크립트는 `git show <ref>:hotel/data/hotels.json` 에서
같은 호텔의 **검증된 현금가**를 가져와 `hotel/scripts/data/observed_locations.json` 의
해당 레코드만 채우고, `build_hotel_data.py` 로 앱 데이터를 다시 만든 뒤 0건을 확인한다.
포인트·관측시각은 오늘 수집값을 유지하고, 현금가의 출처는 `cashObservedAt` 으로 남긴다.

    python3 hotel/scripts/repair_cash_collision.py --from-ref 33e5175~1
    python3 hotel/scripts/repair_cash_collision.py --from-ref 33e5175~1 --dry-run
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DATA = HERE / "data"
OBSERVED = DATA / "observed_locations.json"
APP = REPO / "hotel" / "data" / "hotels.json"
KST = timezone(timedelta(hours=9))
TOL = 10
COUNTER = re.compile(r"^\d+\s*/\s*\d+$")


def collisions(records) -> list[dict]:
    hits = []
    for r in records:
        points, cash = r.get("points"), r.get("cashAmount")
        if points and cash and abs(int(cash) - int(points)) < TOL:
            hits.append(r)
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description="현금가=포인트 오염 레코드 복원")
    ap.add_argument("--from-ref", required=True, help="정상 현금가가 있는 git ref(예: 33e5175~1)")
    ap.add_argument("--observed", default=str(OBSERVED))
    ap.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 복원 계획만 출력")
    ap.add_argument("--no-build", action="store_true", help="build_hotel_data.py 재실행 생략")
    args = ap.parse_args()

    observed_path = Path(args.observed)
    payload = json.loads(observed_path.read_text(encoding="utf-8"))
    records = payload.get("records") or []
    bad = collisions(records)

    with tempfile.NamedTemporaryFile("w+", suffix=".json", delete=False) as tmp:
        tmp_path = tmp.name
    subprocess.run(["git", "show", f"{args.from_ref}:hotel/data/hotels.json"], cwd=REPO,
                   check=True, stdout=open(tmp_path, "w", encoding="utf-8"))
    prev = {h["code"]: h for h in json.loads(Path(tmp_path).read_text(encoding="utf-8"))["hotels"]}
    Path(tmp_path).unlink(missing_ok=True)

    # 2026-11-28 실측: 카드 innerText 가 사진 캐러셀 카운터('1 / 12')로 시작해 119건 전부 이름이 '1 / 12' 였다.
    # 수집기는 고쳤고, 이미 저장된 이름은 마스터 이름으로 되돌린다(앱 표시는 마스터를 쓰므로 사용자 영향은 없음).
    renamed = []
    for rec in records:
        if not COUNTER.match(str(rec.get("name") or "")):
            continue
        master = prev.get(str(rec.get("code") or "").upper())
        if master and master.get("name"):
            rec["name"] = master["name"]
            renamed.append(rec["code"])

    if not bad and not renamed:
        print("변경 없음 — 현금가=포인트 0건 · 이름 정정 대상 0건")
        return 0

    restored, skipped, changed_points = [], [], []
    for rec in bad:
        code = str(rec.get("code") or "").upper()
        p = prev.get(code)
        cash = (p or {}).get("cashAmount")
        cur = (p or {}).get("cashCurrency")
        if not p or not cash or not cur or abs(int(cash) - int(p.get("points") or 0)) < TOL:
            skipped.append(code)
            continue
        if p.get("points") != rec.get("points"):
            changed_points.append((code, p.get("points"), rec.get("points")))
        rec["cashAmount"] = cash
        rec["cashCurrency"] = cur
        rec["cashBasis"] = (f"직전 정상 스냅숏({p.get('observedAtLabel')}) 현금가 복원 — "
                            f"2026-11-28 자동 수집 오염분 대체")
        rec["cashObservedAt"] = p.get("observedAt")
        rec["cashObservedAtLabel"] = p.get("observedAtLabel")
        restored.append(code)

    if restored:
        payload.setdefault("meta", {})["cashRecovered"] = {
            "count": len(restored),
            "codes": sorted(restored),
            "from": f"{args.from_ref} (hotel/data/hotels.json)",
            "reason": "2026-11-28 06:51 자동 수집이 Use Points 해제 직후 포인트 숫자를 현금가로 읽어 58곳이 cashAmount=points(1.0원/P)로 오염",
            "recoveredAt": datetime.now(KST).isoformat(timespec="seconds"),
            "note": "현금가는 직전 정상 스냅숏 값, 포인트·관측시각은 2026-11-28 수집값. 다음 정상 수집에서 전면 교체된다.",
        }

    print(json.dumps({"restored": len(restored), "skipped": skipped, "renamed": len(renamed),
                      "pointsChanged": changed_points[:12], "pointsChangedCount": len(changed_points),
                      "dryRun": args.dry_run}, ensure_ascii=False, indent=1))
    if args.dry_run:
        return 0

    observed_path.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if not args.no_build:
        subprocess.run([sys.executable, str(HERE / "build_hotel_data.py"),
                        "--observed", str(observed_path)], cwd=REPO, check=True)

    app = json.loads(APP.read_text(encoding="utf-8"))
    left = collisions([h for h in app["hotels"] if h.get("status") == "open"])
    if left:
        print(f"실패 — 앱 데이터에 오염 {len(left)}건 남음: {[h['code'] for h in left][:10]}", file=sys.stderr)
        return 1
    print(f"OK — {APP} 현금가=포인트 0건 (복원 {len(restored)}곳)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
