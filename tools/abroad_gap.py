#!/usr/bin/env python3
"""Gap-fill global searches for abroad map (city x brand combos)."""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "data"
OUT = DATA / "abroad_q2.json"

QUERIES = [
    "소피텔 방콕", "소피텔 파리", "소피텔 발리", "반얀트리 방콕", "반얀트리 푸켓", "반얀트리 발리",
    "풀만 방콕", "풀만 다낭", "페어몬트 몰디브", "페어몬트 발리", "노보텔 방콕", "머큐어 발리",
    "콘래드 홍콩", "콘래드 발리", "콘래드 도쿄", "월도프 아스토리아 방콕", "힐튼 하와이", "더블트리 발리",
    "인터컨티넨탈 발리", "인터컨티넨탈 다낭", "파크 하얏트 도쿄", "알릴라 발리", "리츠칼튼 도쿄",
    "리츠칼튼 오사카", "W 오사카", "세인트레지스 로마", "웨스틴 도쿄", "쉐라톤 발리", "르메르디앙 발리",
    "힐튼 파리", "그랜드 하얏트 발리", "안다즈 도쿄",
]


def main():
    out = json.loads(OUT.read_text()) if OUT.exists() else {}
    todo = [q for q in QUERIES if q not in out]

    def one(q):
        try:
            return q, yt.search(q, 25)
        except Exception as e:
            return q, []

    with ThreadPoolExecutor(max_workers=5) as ex:
        for q, rows in ex.map(one, todo):
            out[q] = rows
            print(f"{q}: {len(rows)}", flush=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
