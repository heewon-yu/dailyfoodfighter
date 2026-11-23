#!/usr/bin/env python3
"""Stage 1: discover candidate YouTube channels from regional food searches."""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
CANDS = DATA / "candidates.json"

QUERIES = [
    # 강원 (사용자 요청 우선)
    "강릉 맛집", "속초 맛집", "양양 맛집", "강원도 맛집", "삼척 맛집", "동해 맛집",
    "원주 맛집", "춘천 맛집", "평창 맛집", "정선 맛집", "강릉 로컬 맛집", "속초 로컬 맛집",
    # 수도권
    "수원 맛집", "인천 맛집", "성남 맛집",
    # 충청
    "대전 맛집", "청주 맛집", "천안 맛집", "충주 맛집", "공주 맛집", "서산 맛집",
    # 호남
    "광주 맛집", "전주 맛집", "군산 맛집", "여수 맛집", "순천 맛집", "목포 맛집",
    "담양 맛집", "보성 맛집", "나주 맛집",
    # 영남
    "부산 맛집", "대구 맛집", "울산 맛집", "경주 맛집", "포항 맛집", "안동 맛집",
    "통영 맛집", "거제 맛집", "창원 맛집", "진주 맛집", "김해 맛집",
    # 제주
    "제주 맛집", "서귀포 맛집",
    # 전국 로컬
    "노포 맛집", "로컬 맛집 추천", "시장 맛집", "지역 맛집",
]


def main():
    cands = json.loads(CANDS.read_text()) if CANDS.exists() else {}
    for q in QUERIES:
        try:
            rs = yt.search(q, limit=30)
        except Exception as e:
            print("ERR", q, e)
            continue
        for r in rs:
            cid = r["channelId"]
            if not cid:
                continue
            c = cands.setdefault(cid, {"channel": r["channel"], "videos": [], "queries": []})
            if r["videoId"] not in c["videos"]:
                c["videos"].append(r["videoId"])
            if q not in c["queries"]:
                c["queries"].append(q)
        print(f"{q}: {len(rs)} results, {len(cands)} channels so far")
        time.sleep(0.3)
    CANDS.write_text(json.dumps(cands, ensure_ascii=False, indent=0))
    print("total channels", len(cands))


if __name__ == "__main__":
    main()
