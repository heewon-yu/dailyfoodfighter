#!/usr/bin/env python3
"""2차 확장: 호텔 브랜드·도시 검색으로 공개 영상 후보를 모은다 (검색 결과 = 존재/제목/채널 근거)."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "ab2_search.json"

BRANDS = [
    "리츠칼튼", "세인트레지스", "JW 메리어트", "메리어트", "웨스틴", "쉐라톤", "르메르디앙",
    "에디션", "W 호텔", "럭셔리 컬렉션", "불가리", "힐튼", "콘래드", "월도프 아스토리아",
    "하얏트", "파크 하얏트", "그랜드 하얏트", "안다즈", "하얏트 리젠시", "인터컨티넨탈",
    "리젠트", "킴튼", "식스센스", "아코르", "소피텔", "페어몬트", "래플스", "풀만",
    "노보텔", "머큐어", "반얀트리", "아만", "포시즌스", "만다린 오리엔탈", "로즈우드",
    "카펠라", "샹그릴라", "페닌슐라", "호시노야", "파크로얄",
]
CITIES = [
    "도쿄", "오사카", "교토", "후쿠오카", "오키나와", "삿포로", "나고야", "가나자와",
    "방콕", "치앙마이", "푸켓", "파타야", "다낭", "하노이", "호치민", "푸꾸옥", "나트랑",
    "발리", "싱가포르", "쿠알라룸푸르", "마닐라", "세부", "타이베이", "홍콩", "마카오",
    "상하이", "베이징", "하이난", "두바이", "도하", "이스탄불", "카이로", "몰디브",
    "파리", "런던", "로마", "프라하", "빈", "취리히", "뉴욕", "하와이", "괌", "사이판",
    "시드니", "쿠스코", "칸쿤",
]


def main():
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    queries = [f"{b} 호텔 리뷰" for b in BRANDS] + [f"{c} 5성급 호텔 리뷰" for c in CITIES]
    for q in queries:
        if q in data:
            continue
        try:
            data[q] = yt.search(q, 25)
        except Exception as e:
            print("ERR", q, e)
        time.sleep(0.2)
        print(q, len(data.get(q, [])))
        OUT.write_text(json.dumps(data, ensure_ascii=False))
    print("queries", len(data), "videos", sum(len(v) for v in data.values()))


if __name__ == "__main__":
    main()
