#!/usr/bin/env python3
"""2차 확장: 브랜드 × 도시 조합 검색으로 지점별 리뷰를 더 찾는다. (배치 실행용)"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "ab2_search2.json"

BRANDS = ["리츠칼튼", "세인트레지스", "JW 메리어트", "웨스틴", "쉐라톤", "에디션", "불가리",
          "콘래드", "월도프 아스토리아", "파크 하얏트", "그랜드 하얏트", "안다즈",
          "인터컨티넨탈", "리젠트", "식스센스", "소피텔", "페어몬트", "래플스", "반얀트리",
          "아만", "포시즌스", "만다린 오리엔탈", "로즈우드", "카펠라", "샹그릴라", "페닌슐라",
          "호시노야", "파크로얄", "알릴라", "LXR", "오베로이", "벨몬드", "자누"]
CITIES = ["도쿄", "오사카", "교토", "방콕", "싱가포르", "다낭", "하노이", "푸꾸옥", "나트랑",
          "발리", "타이베이", "홍콩", "마카오", "상하이", "베이징", "두바이", "오키나와", "후쿠오카"]


def main():
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    stop = int(sys.argv[2]) if len(sys.argv) > 2 else len(BRANDS)
    for b in BRANDS[start:stop]:
        for c in CITIES:
            q = f"{b} {c}"
            if q in data:
                continue
            try:
                data[q] = yt.search(q, 20)
            except Exception as e:
                print("ERR", q, e)
            time.sleep(0.15)
            OUT.write_text(json.dumps(data, ensure_ascii=False))
        print("done", b, "queries", len(data))
    print("queries", len(data), "videos", sum(len(v) for v in data.values()))


if __name__ == "__main__":
    main()
