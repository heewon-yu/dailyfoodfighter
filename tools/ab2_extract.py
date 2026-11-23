#!/usr/bin/env python3
"""2차 확장: 검색 결과 제목에서 (브랜드, 도시)를 확인해 후보 행을 만든다.
- 영상 제목에 브랜드와 해외 도시가 함께 있는 것만 인정한다 (추측 금지).
- 국내 지점·여러 호텔 비교 영상은 제외한다.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SEARCHES = [ROOT / "data" / "ab2_search.json", ROOT / "data" / "ab2_search2.json"]
SUBSCACHE = ROOT / "data" / "ab2_subs.json"
OUT = ROOT / "data" / "ab2_cand.json"

# (표기 변형들, 표시 브랜드, 체인, 공식 사이트 키)
BRANDS = [
    (["월도프 아스토리아", "waldorf"], "월도프 아스토리아", "힐튼"),
    (["파크 하얏트", "park hyatt"], "파크 하얏트", "하얏트"),
    (["그랜드 하얏트", "grand hyatt"], "그랜드 하얏트", "하얏트"),
    (["하얏트 리젠시", "hyatt regency"], "하얏트 리젠시", "하얏트"),
    (["하얏트 센트릭", "hyatt centric"], "하얏트 센트릭", "하얏트"),
    (["JW 메리어트", "jw marriott"], "JW 메리어트", "메리어트"),
    (["만다린 오리엔탈", "mandarin oriental"], "만다린 오리엔탈", "하이엔드·독립"),
    (["세인트레지스", "세인트 레지스", "st. regis", "st regis"], "세인트레지스", "메리어트"),
    (["럭셔리 컬렉션", "luxury collection"], "럭셔리 컬렉션", "메리어트"),
    (["리츠칼튼", "리츠 칼튼", "리츠칼톤", "ritz-carlton", "ritz carlton", "ritz"], "리츠칼튼", "메리어트"),
    (["포시즌스", "포 시즌스", "four seasons"], "포시즌스", "하이엔드·독립"),
    (["인터컨티넨탈", "intercontinental"], "인터컨티넨탈", "IHG"),
    (["식스센스", "six senses"], "식스센스", "IHG"),
    (["반얀트리", "banyan tree"], "반얀트리", "아코르"),
    (["페어몬트", "fairmont"], "페어몬트", "아코르"),
    (["쉐라톤", "sheraton"], "쉐라톤", "메리어트"),
    (["르메르디앙", "le meridien"], "르메르디앙", "메리어트"),
    (["에디션", "edition"], "에디션", "메리어트"),
    (["불가리", "bulgari"], "불가리", "메리어트"),
    (["콘래드", "conrad"], "콘래드", "힐튼"),
    (["안다즈", "andaz"], "안다즈", "하얏트"),
    (["리젠트", "regent"], "리젠트", "IHG"),
    (["킴튼", "kimpton"], "킴튼", "IHG"),
    (["소피텔", "sofitel"], "소피텔", "아코르"),
    (["래플스", "raffles"], "래플스", "아코르"),
    (["풀만", "pullman"], "풀만", "아코르"),
    (["노보텔", "novotel"], "노보텔", "아코르"),
    (["머큐어", "mercure"], "머큐어", "아코르"),
    (["로즈우드", "rosewood"], "로즈우드", "하이엔드·독립"),
    (["카펠라", "capella"], "카펠라", "하이엔드·독립"),
    (["샹그릴라", "shangri-la", "shangri la"], "샹그릴라", "하이엔드·독립"),
    (["페닌슐라", "peninsula"], "페닌슐라", "하이엔드·독립"),
    (["호시노야", "호시노 카이", "호시노", "hoshinoya", "hoshino"], "호시노야", "하이엔드·독립"),
    (["파크로얄", "parkroyal", "park royal"], "파크로얄", "하이엔드·독립"),
    (["아틀란티스", "atlantis"], "아틀란티스", "하이엔드·독립"),
    (["주메이라 호텔", "버즈 알 아랍", "부르즈 알 아랍", "burj al arab", "jumeirah"], "주메이라", "하이엔드·독립"),
    (["마리나베이샌즈", "마리나 베이 샌즈", "marina bay sands"], "마리나베이샌즈", "하이엔드·독립"),
    (["알릴라", "alila"], "알릴라", "하이엔드·독립"),
    (["LXR", "lxr"], "LXR", "힐튼"),
    (["오베로이", "oberoi"], "오베로이", "하이엔드·독립"),
    (["벨몬드", "belmond"], "벨몬드", "하이엔드·독립"),
    (["자누", "janu"], "자누", "하이엔드·독립"),
    (["아만기리", "amangiri"], "아만", "하이엔드·독립"),
    (["아만", "aman "], "아만", "하이엔드·독립"),
    (["힐튼", "hilton"], "힐튼", "힐튼"),
    (["메리어트", "marriott"], "메리어트", "메리어트"),
    (["하얏트", "hyatt"], "하얏트", "하얏트"),
    (["아코르", "accor"], "아코르", "아코르"),
]
GENERIC = {"메리어트", "힐튼", "하얏트", "아코르"}

# 도시 표기 → (권역, 표시 도시, 국가)
CITIES = {
    "도쿄": ("일본", "도쿄", "일본"), "동경": ("일본", "도쿄", "일본"), "tokyo": ("일본", "도쿄", "일본"),
    "오사카": ("일본", "오사카", "일본"), "osaka": ("일본", "오사카", "일본"),
    "교토": ("일본", "교토", "일본"), "kyoto": ("일본", "교토", "일본"),
    "후쿠오카": ("일본", "후쿠오카", "일본"), "fukuoka": ("일본", "후쿠오카", "일본"),
    "오키나와": ("일본", "오키나와", "일본"), "okinawa": ("일본", "오키나와", "일본"),
    "삿포로": ("일본", "삿포로", "일본"), "sapporo": ("일본", "삿포로", "일본"),
    "나고야": ("일본", "나고야", "일본"), "nagoya": ("일본", "나고야", "일본"),
    "가나자와": ("일본", "가나자와", "일본"), "kanazawa": ("일본", "가나자와", "일본"),
    "미야코지마": ("일본", "미야코지마", "일본"), "벳푸": ("일본", "벳푸", "일본"),
    "하코네": ("일본", "하코네", "일본"), "니세코": ("일본", "니세코", "일본"),
    "방콕": ("동남아", "방콕", "태국"), "bangkok": ("동남아", "방콕", "태국"),
    "치앙마이": ("동남아", "치앙마이", "태국"), "chiang mai": ("동남아", "치앙마이", "태국"),
    "푸켓": ("동남아", "푸켓", "태국"), "phuket": ("동남아", "푸켓", "태국"),
    "파타야": ("동남아", "파타야", "태국"), "pattaya": ("동남아", "파타야", "태국"),
    "다낭": ("동남아", "다낭", "베트남"), "danang": ("동남아", "다낭", "베트남"), "da nang": ("동남아", "다낭", "베트남"),
    "하노이": ("동남아", "하노이", "베트남"), "hanoi": ("동남아", "하노이", "베트남"),
    "호치민": ("동남아", "호치민", "베트남"), "ho chi minh": ("동남아", "호치민", "베트남"), "사이공": ("동남아", "호치민", "베트남"),
    "푸꾸옥": ("동남아", "푸꾸옥", "베트남"), "phu quoc": ("동남아", "푸꾸옥", "베트남"),
    "나트랑": ("동남아", "나트랑", "베트남"), "nha trang": ("동남아", "나트랑", "베트남"),
    "호이안": ("동남아", "호이안", "베트남"), "hoi an": ("동남아", "호이안", "베트남"),
    "발리": ("동남아", "발리", "인도네시아"), "bali": ("동남아", "발리", "인도네시아"),
    "울루와뚜": ("동남아", "발리", "인도네시아"), "스미냑": ("동남아", "발리", "인도네시아"),
    "자카르타": ("동남아", "자카르타", "인도네시아"),
    "싱가포르": ("동남아", "싱가포르", "싱가포르"), "singapore": ("동남아", "싱가포르", "싱가포르"),
    "쿠알라룸푸르": ("동남아", "쿠알라룸푸르", "말레이시아"), "kuala lumpur": ("동남아", "쿠알라룸푸르", "말레이시아"),
    "마닐라": ("동남아", "마닐라", "필리핀"), "manila": ("동남아", "마닐라", "필리핀"),
    "세부": ("동남아", "세부", "필리핀"), "cebu": ("동남아", "세부", "필리핀"),
    "타이베이": ("중화권", "타이베이", "대만"), "대만": ("중화권", "타이베이", "대만"), "taipei": ("중화권", "타이베이", "대만"),
    "홍콩": ("중화권", "홍콩", "홍콩"), "hong kong": ("중화권", "홍콩", "홍콩"),
    "마카오": ("중화권", "마카오", "마카오"), "macau": ("중화권", "마카오", "마카오"), "macao": ("중화권", "마카오", "마카오"),
    "상하이": ("중화권", "상하이", "중국"), "shanghai": ("중화권", "상하이", "중국"),
    "베이징": ("중화권", "베이징", "중국"), "beijing": ("중화권", "베이징", "중국"),
    "하이난": ("중화권", "하이난 싼야", "중국"), "싼야": ("중화권", "하이난 싼야", "중국"), "sanya": ("중화권", "하이난 싼야", "중국"),
    "쑤저우": ("중화권", "쑤저우", "중국"), "suzhou": ("중화권", "쑤저우", "중국"),
    "항저우": ("중화권", "항저우", "중국"), "hangzhou": ("중화권", "항저우", "중국"),
    "광저우": ("중화권", "광저우", "중국"), "칭다오": ("중화권", "칭다오", "중국"),
    "두바이": ("중동·기타", "두바이", "아랍에미리트"), "dubai": ("중동·기타", "두바이", "아랍에미리트"),
    "도하": ("중동·기타", "도하", "카타르"), "doha": ("중동·기타", "도하", "카타르"),
    "아부다비": ("중동·기타", "아부다비", "아랍에미리트"),
    "아그라": ("중동·기타", "아그라", "인도"),
    "이스탄불": ("유럽", "이스탄불", "튀르키예"), "istanbul": ("유럽", "이스탄불", "튀르키예"),
    "카이로": ("중동·기타", "카이로", "이집트"), "cairo": ("중동·기타", "카이로", "이집트"),
    "몰디브": ("중동·기타", "몰디브", "몰디브"), "maldives": ("중동·기타", "몰디브", "몰디브"),
    "파리": ("유럽", "파리", "프랑스"), "paris": ("유럽", "파리", "프랑스"),
    "런던": ("유럽", "런던", "영국"), "london": ("유럽", "런던", "영국"),
    "로마": ("유럽", "로마", "이탈리아"), "rome": ("유럽", "로마", "이탈리아"),
    "밀라노": ("유럽", "밀라노", "이탈리아"), "milan": ("유럽", "밀라노", "이탈리아"),
    "베네치아": ("유럽", "베네치아", "이탈리아"), "venice": ("유럽", "베네치아", "이탈리아"),
    "피렌체": ("유럽", "피렌체", "이탈리아"), "프라하": ("유럽", "프라하", "체코"), "prague": ("유럽", "프라하", "체코"),
    "빈": ("유럽", "빈", "오스트리아"), "비엔나": ("유럽", "빈", "오스트리아"), "vienna": ("유럽", "빈", "오스트리아"),
    "취리히": ("유럽", "취리히", "스위스"), "zurich": ("유럽", "취리히", "스위스"),
    "제네바": ("유럽", "제네바", "스위스"), "샤모니": ("유럽", "샤모니", "프랑스"),
    "바르셀로나": ("유럽", "바르셀로나", "스페인"), "마드리드": ("유럽", "마드리드", "스페인"),
    "암스테르담": ("유럽", "암스테르담", "네덜란드"), "베를린": ("유럽", "베를린", "독일"),
    "뮌헨": ("유럽", "뮌헨", "독일"), "리스본": ("유럽", "리스본", "포르투갈"),
    "에든버러": ("유럽", "에든버러", "영국"), "부다페스트": ("유럽", "부다페스트", "헝가리"),
    "코펜하겐": ("유럽", "코펜하겐", "덴마크"), "스톡홀름": ("유럽", "스톡홀름", "스웨덴"),
    "뉴욕": ("미주", "뉴욕", "미국"), "new york": ("미주", "뉴욕", "미국"),
    "로스앤젤레스": ("미주", "로스앤젤레스", "미국"), "los angeles": ("미주", "로스앤젤레스", "미국"),
    "라스베이거스": ("미주", "라스베이거스", "미국"), "las vegas": ("미주", "라스베이거스", "미국"),
    "샌프란시스코": ("미주", "샌프란시스코", "미국"), "마이애미": ("미주", "마이애미", "미국"),
    "하와이": ("미주", "하와이", "미국"), "호놀룰루": ("미주", "하와이", "미국"), "hawaii": ("미주", "하와이", "미국"),
    "괌": ("오세아니아", "괌", "괌"), "guam": ("오세아니아", "괌", "괌"),
    "사이판": ("오세아니아", "사이판", "사이판"), "saipan": ("오세아니아", "사이판", "사이판"),
    "시드니": ("오세아니아", "시드니", "호주"), "sydney": ("오세아니아", "시드니", "호주"),
    "멜버른": ("오세아니아", "멜버른", "호주"), "오클랜드": ("오세아니아", "오클랜드", "뉴질랜드"),
    "쿠스코": ("미주", "쿠스코", "페루"), "cusco": ("미주", "쿠스코", "페루"),
    "칸쿤": ("미주", "칸쿤", "멕시코"), "cancun": ("미주", "칸쿤", "멕시코"),
}
DOMESTIC = re.compile(r"서울|부산|제주|인천|경주|속초|강릉|여수|수원|판교|용산|명동|해운대|평창|대구|광주광역|울산|전주|경복궁|송도|마곡|잠실|파르나스|시그니엘|조선호텔|신라호텔")
MULTI = re.compile(r"비교|모음|\d곳|베스트|순위|\bBEST\b|\bTop\b|톱\s?\d|\bVS\b|\bvs\b|풀버전|총정리")


def find_brand(title):
    low = title.lower()
    hits = []
    for variants, brand, chain in BRANDS:
        for v in variants:
            if v.lower() in low:
                hits.append((len(v), brand, chain, v))
                break
    if not hits:
        return None
    hits.sort(reverse=True)
    top = hits[0]
    # 서로 다른 브랜드가 겹쳐 나오면(비교/나열 영상) 제외
    others = [h for h in hits[1:] if h[2] != top[2] and h[1] not in top[1] and top[1] not in h[1]]
    if others:
        return None
    return top[1], top[2]


def find_city(title):
    low = title.lower()
    found = []
    for key, val in CITIES.items():
        if key in low:
            found.append((len(key), val))
    if not found:
        return None
    found.sort(reverse=True)
    cities = {f[1][1] for f in found}
    if len(cities) > 1:
        return None  # 도시가 여러 개면 어느 지점인지 확정할 수 없다
    return found[0][1]


def main():
    data = {}
    for f in SEARCHES:
        if f.exists():
            data.update(json.loads(f.read_text()))
    subs = json.loads(SUBSCACHE.read_text()) if SUBSCACHE.exists() else {}
    cand = []
    seen = set()
    for q, videos in data.items():
        for v in videos:
            vid = v["videoId"]
            if vid in seen:
                continue
            seen.add(vid)
            title = v["title"]
            if DOMESTIC.search(title) or MULTI.search(title):
                continue
            brand = find_brand(title)
            if not brand:
                continue
            if brand[0] in GENERIC:
                continue
            city = find_city(title)
            if not city:
                continue
            low = title.lower()
            bi = low.find(brand[0])
            ci = low.find(city[1].lower())
            if bi < 0 or ci < 0 or abs(bi - ci) > 24:
                continue
            cand.append(dict(videoId=vid, title=title, channel=v["channel"], channelId=v["channelId"],
                             views=v.get("views", ""), brand=brand[0], chain=brand[1],
                             region=city[0], city=city[1], country=city[2], query=q))
    # 채널 구독자 확인
    need = {c["channelId"] for c in cand if c["channelId"] not in subs}
    for cid in need:
        try:
            d = yt._post("browse", {"context": yt.CTX, "browseId": cid, "params": "EgZ2aWRlb3PyBgQKAjoA"})
            s = json.dumps(d, ensure_ascii=False)
            m = re.search(r'구독자 ([\d.,]+[만천억]?)명', s)
            name = ""
            mm = re.search(r'"channelMetadataRenderer":\{"title":"((?:[^"\\]|\\.)*)"', s)
            if mm:
                name = json.loads('"' + mm.group(1) + '"')
            subs[cid] = {"name": name, "subs": yt.parse_kr(m.group(1)) if m else None,
                         "subsText": ("구독자 " + m.group(1) + "명") if m else ""}
        except Exception as e:
            subs[cid] = {"name": "", "subs": None, "error": str(e)}
    SUBSCACHE.write_text(json.dumps(subs, ensure_ascii=False, indent=0))
    for c in cand:
        s = subs.get(c["channelId"], {})
        c["subs"] = s.get("subs")
        c["channel"] = c["channel"] or s.get("name", "")
    cand.sort(key=lambda c: (-(c["subs"] or 0), c["brand"], c["city"]))
    OUT.write_text(json.dumps(cand, ensure_ascii=False, indent=0))
    print("candidates", len(cand), "channels", len({c['channelId'] for c in cand}))
    for c in cand:
        print(f"{c['subs']:>8} {c['channel'][:20]:<20} {c['brand']} {c['city']:<8} {c['videoId']} {c['title'][:60]}")


if __name__ == "__main__":
    main()
