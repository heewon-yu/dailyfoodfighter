#!/usr/bin/env python3
"""Review table: brand + city extraction from stored descriptions."""
import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
sys.path.insert(0, str(Path(__file__).parent))
from abroad_scan import brand_of, ALIASES  # noqa: E402

CITIES = {
    "일본": ["도쿄", "오사카", "교토", "삿포로", "오키나와", "나하", "후쿠오카", "요코하마", "나고야", "하코네",
             "유후인", "벳부", "고베", "히로시마", "가나자와", "니세코", "도쿄도", "긴자", "시부야", "신주쿠",
             "마이하마", "도쿄디즈니"],
    "동남아": ["방콕", "치앙마이", "푸켓", "사무이", "발리", "자카르타", "스미냑", "울루와뚜", "우붓", "나트랑",
              "호치민", "하노이", "다낭", "푸꾸옥", "하이퐁", "씨엠립", "프놈펜", "싱가포르", "쿠알라룸푸르",
              "랑카위", "코타키나발루", "마닐라", "세부", "보라카이", "파타야", "코사무이", "푸꾸옥섬",
              "호이안", "루앙프라방", "양곤", "자카르타"],
    "미주": ["뉴욕", "로스앤젤레스", "라스베이거스", "샌프란시스코", "시애틀", "하와이", "호놀룰루", "마우이",
             "오아후", "시카고", "마이애미", "밴쿠버", "토론토", "멕시코시티", "칸쿤", "보스턴", "워싱턴",
             "샌디에이고", "오렌지카운티", "뉴올리언스", "퀘벡", "몬트리올", "카리브", "아루바"],
    "유럽": ["파리", "런던", "로마", "밀라노", "베네치아", "피렌체", "바르셀로나", "마드리드", "리스본", "암스테르담",
             "베를린", "뮌헨", "프라하", "비엔나", "빈", "취리히", "제네바", "스톡홀름", "코펜하겐", "헬싱키",
             "오슬로", "더블린", "에든버러", "이스탄불", "아테네", "산토리니", "부다페스트", "바르샤바",
             "브뤼셀", "베네치아", "포르투", "니스", "칸", "몬테카를로", "레이캬비크", "리가", "탈린", "자그레브",
             "두브로브니크", "루체른", "잘츠부르크", "뮌헨", "함부르크", "프랑크푸르트", "켄싱턴", "소호"],
    "중화권": ["상하이", "베이징", "광저우", "선전", "청두", "항저우", "홍콩", "마카오", "타이베이", "타이중",
              "가오슝", "하이난", "싼야", "시안", "쑤저우", "칭다오"],
    "오세아니아": ["시드니", "멜버른", "브리즈번", "골드코스트", "오클랜드", "퀸스타운", "퍼스", "케언스",
                "애들레이드", "타즈매니아"],
    "중동·기타": ["두바이", "아부다비", "도하", "리야드", "무스카트", "텔아비브", "예루살렘", "카이로", "케이프타운",
                "몰디브", "말레", "요하네스버그", "마라케시", "이스탄불", "아부다비", "지다", "바레인", "쿠웨이트"],
}
DOMESTIC = ["서울", "부산", "인천", "대구", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남",
            "전북", "전남", "경북", "경남", "제주", "명동", "여의도", "해운대", "평창", "양양", "속초", "경주",
            "파주", "용산", "잠실", "송도", "중문", "서귀포", "판교", "마곡", "이스트폴", "삼성동", "강남",
            "압구정", "남산", "을지로", "보타닉", "타임스퀘어", "동대문", "홍대", "한국", "korea", "seoul"]


def cities_in(text, table=CITIES):
    hits = []
    for region, names in table.items():
        names = sorted(names, key=len, reverse=True)
        for n in names:
            if n in text and (region, n) not in hits:
                hits.append((region, n))
    return hits


def main():
    store = json.loads((DATA / "abroad_desc.json").read_text())
    rows = []
    for vid, d in store.items():
        if d.get("err") or not d.get("title"):
            continue
        text = d["title"] + " " + d.get("description", "")
        chain, word = brand_of(text)
        if not chain:
            continue
        ct = cities_in(d["title"])
        cd = cities_in(d.get("description", ""))
        dom = [x for x in DOMESTIC if x in d["title"] + d.get("description", "")]
        rows.append(dict(videoId=vid, chain=chain, hit=word, title=d["title"], channel=d["channel"],
                         subs=d.get("subs") or 0, ct=ct, cd=cd[:4], dom=dom[:3],
                         date=d.get("date", ""), desc=d.get("description", "")))
    print(f"rows={len(rows)} with-title-city={sum(1 for r in rows if r['ct'])}")
    (DATA / "abroad_rows.json").write_text(json.dumps(rows, ensure_ascii=False))
    # print compact view, title-city first, domestic noise marked
    for r in sorted(rows, key=lambda r: (not r["ct"], r["chain"], -r["subs"])):
        loc = ",".join(n for _reg, n in r["ct"]) or "-"
        flag = "★" if r["ct"] and not r["dom"] else ("dom" if r["dom"] else "?")
        print(f"{flag} [{r['chain'][:2]}] {r['subs']//1000:4d}k {r['channel'][:14]:14s} {loc:22s} "
              f"{r['videoId']} {r['title'][:58]}")


if __name__ == "__main__":
    main()
