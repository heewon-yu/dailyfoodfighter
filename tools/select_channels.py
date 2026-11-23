#!/usr/bin/env python3
"""Stage 2b: rate the 100k+ new channels on food-review fit and pick a final set."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# verdicts from inspecting sampled titles (food-travel review channels over news/official/misc)
KEEP = {
    # 강릉/속초/강원 first (사용자 요청)
    "우와한 비디오": "keep",          # 강릉 로컬 맛집
    "어썸코리아 Awesome Korea": "keep",  # 강릉 물회 등
    "더브라이언 The Brian": "keep",    # 강릉 로컬
    "재슐랭가이드": "keep",           # 속초 16곳
    "호텔사장 기먼성": "keep",         # 강릉
    "또 떠나는 남자 ddoddunam": "keep",  # 강원도 속초·강릉 정리
    "헬로라이프": "keep",             # 평창 산채정식 (어! 여기봐라)
    "에헤라 티비 : KBS LIFE": "keep",  # 양양 택시맛집
    "정슐랭": "keep",                 # 춘천
    "미선임파서블": "keep",           # 원주 시장
    "일상이여행 Everyday travel": "keep",  # 정선
    "우니의끼니 UNIII": "keep",        # 정선 (유명 먹방브이로거)
    "유리소리TV": "keep",             # 정선 아리랑시장
    "하나네집 beauty and figure": "keep",  # 동해
    "김영철 오리지널 ": "keep",        # 춘천
    "데프콘TV": "keep",               # 전주 1일1식가
    "순풍 선우용여": "keep",           # 여수
    "자유부인 한가인": "keep",         # 부산
    "찹찹대학(맛집리뷰학과)": "keep",   # 부산
    "풍류천재 조서형": "keep",         # 부산
    "오늘식탁  - Today Table": "keep",  # 공주
    "김아랑 Alang Kim": "keep",       # 공주
    "아일랜드 트래블러": "keep",        # 공주
    "김재환의 오재나": "keep",         # 천안
    "찐찐": "keep",                   # 청주
    "헤이유정 YUJUNG": "keep",         # 대전
    "둘시네아 dulcinea": "keep",       # 서산/군산
    "빠니보틀 Pani Bottle": "keep",    # 충주/전국 여행먹방
    "이재성 박사의 식탁보감": "keep",   # 식탐보감
    "박세리의 속사정": "keep",         # 양양 시장 먹방
    # drop: 뉴스/공식/경계
    "연합뉴스 Yonhapnews": "drop",
    "엠뚜루마뚜루 : MBC 공식 종합 채널": "drop",  # 예능 클립
    "KBS 교양": "drop",               # 방송 클립
    "채널S": "drop",                  # 방송 클립
    "전남광주통합특별시 공식 채널": "drop",
    "KBC 콘텐츠": "drop",             # 지역 방송
    "킴스트래블 Kim's Travel": "drop",  # 여행 다큐, 맛집 부수
    "ootb STUDIO": "drop",            # 예능
    # 미확인(제목 빈약) - 후보로 두고 확인
    "빅페이스 BIGFACE": "check",
    "MPLAY : 엠플레이": "check",
    "나나 Nanasserie": "check",
    "안수지의 여행의 발견": "check",
    "너도 가봤으면 해": "check",
    "다비교": "check",
    "살란다": "check",
}


def main():
    c = json.loads((DATA / "new_channels.json").read_text())
    out = {}
    for cid, v in c.items():
        verdict = KEEP.get(v["name"], "check")
        if verdict == "keep":
            out[cid] = v
    (DATA / "channels_selected.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"{len(out)} selected / {len(c)} candidates")
    unknown = [v["name"] for cid, v in c.items() if v["name"] not in KEEP]
    print("unchecked:", unknown)


if __name__ == "__main__":
    main()
