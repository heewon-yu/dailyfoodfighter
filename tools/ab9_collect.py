#!/usr/bin/env python3
"""List videos of the nine required channels and flag 5-chain / luxury brand hits."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ab_yt  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "data"
OUT = DATA / "ab9_channels.json"

NINE = {
    "또 떠나는 남자": "UCldwUablgk8KPcFPQlKnB-w",
    "손놈": "UC1OA0PWgSL3boEj-bkbnj1A",
    "여니버스": "UC98aniwMMryBGhwOsvmsqQQ",
    "큰손 노희영": "UCqnYeCdELqXQulBZuK2y7sA",
    "반지하 유정수": "UCpxeSKncIk1Dv0UJbyx7G6Q",
    "탤스테이": "UCtwlzaAqllshehrT48vnTag",
    "아일랜드트래블": "UCwF77i_Ks5M4Dpx9ULT0_Sw",
    "비밀이야": "UCaKQ7_GT0k8u_sL0nE2tgkA",
}

BRANDS = [
    ("메리어트", ["리츠칼튼", "리츠 칼튼", "ritz", "세인트레지스", "세인트 레지스", "st.regis", "st regis",
                 "jw메리어트", "jw 메리어트", "jw marriott", "w호텔", "w 호텔", "w hotel", "에디션", "edition",
                 "럭셔리컬렉션", "럭셔리 컬렉션", "luxury collection", "불가리", "bulgari", "bvlgari",
                 "웨스틴", "westin", "르메르디앙", "르 메르디앙", "le meridien", "쉐라톤", "sheraton",
                 "코트야드", "courtyard", "메리어트", "marriott"]),
    ("힐튼", ["월도프", "waldorf", "콘래드", "conrad", "lxr", "카노피", "canopy", "힐튼", "hilton",
             "큐리오", "curio", "더블트리", "더블 트리", "doubletree"]),
    ("하얏트", ["파크하얏트", "파크 하얏트", "park hyatt", "안다즈", "andaz", "알릴라", "alila",
               "그랜드하얏트", "그랜드 하얏트", "grand hyatt", "톰슨", "thompson",
               "하얏트리젠시", "하얏트 리젠시", "hyatt regency", "하얏트센트릭", "하얏트 센트릭",
               "hyatt centric", "하얏트", "hyatt"]),
    ("IHG", ["식스센스", "식스 센스", "six senses", "리젠트", "regent", "인터컨티넨탈", "intercontinental",
             "킴튼", "kimpton", "인디고", "indigo", "크라운플라자", "크라운 플라자", "crowne plaza"]),
    ("아코르", ["래플스", "raffles", "페어몬트", "fairmont", "소피텔", "sofitel", "반얀트리", "banyan tree",
               "풀만", "pullman", "노보텔", "novotel", "머큐어", "mercure"]),
    ("하이엔드·독립", ["아만", "aman", "아만기리", "amanpuri", "포시즌스", "four seasons", "로즈우드", "rosewood",
                    "만다린", "mandarin oriental", "카펠라", "capella", "샹그릴라", "shangri-la", "peninsula",
                    "페닌슐라", "호시노야", "hoshinoya", "파크로얄", "parkroyal", "벨몬드", "belmond",
                    "오벨로이", "oberoi"]),
]


def brand_of(text):
    t = text.lower().replace(" ", "")
    best = (None, None)
    for chain, words in BRANDS:
        for w in words:
            if w.replace(" ", "") in t:
                # prefer the longest alias (more specific brand)
                if not best[1] or len(w) > len(best[1]):
                    best = (chain, w)
    return best


def main():
    store = json.loads(OUT.read_text()) if OUT.exists() else {}
    pages = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    for label, cid in NINE.items():
        if store.get(label, {}).get("done"):
            print(f"{label}: cached {len(store[label]['videos'])}")
            continue
        try:
            d = ab_yt.channel(cid, pages=pages)
        except Exception as e:
            print(f"{label}: ERR {e}")
            continue
        store[label] = dict(channelId=cid, subs=d["subs"], subsText=d["subsText"],
                            name=d["name"], videos=d["videos"], done=True)
        hits = [v for v in d["videos"] if brand_of(v["title"])[0]]
        print(f"{label}: {len(d['videos'])} videos, brand-hits={len(hits)} ({d['subsText']})", flush=True)
        OUT.write_text(json.dumps(store, ensure_ascii=False))


if __name__ == "__main__":
    main()
