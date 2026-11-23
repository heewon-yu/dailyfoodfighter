#!/usr/bin/env python3
"""Build map/abroads.js from the verified 9-channel (8 collected) review table."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "map" / "abroads.js"

CH = {
    "또 떠나는 남자": 783000,
    "손놈": 159000,
    "여니버스": 114000,
    "큰손 노희영": 581000,
    "반지하 유정수": 82300,
    "탤스테이": 35000,
    "아일랜드 트래블러": 303000,
    "비밀이야": 616000,
    "초마드": 756000,
    "나나제인, 똑똑한 여행": 159000,
    "더들리": 1270000,
    "시나쓰 유튜브SHINASU": 64400,
}

SITE = {
    "리츠칼튼": "https://www.ritzcarlton.com/",
    "세인트레지스": "https://www.marriott.com/st-regis/",
    "JW 메리어트": "https://www.marriott.com/jw-marriott/",
    "메리어트": "https://www.marriott.com/",
    "웨스틴": "https://www.westin.com/",
    "쉐라톤": "https://www.sheraton.com/",
    "에디션": "https://edition-hotels.marriott.com/",
    "불가리": "https://www.bulgarihotels.com/",
    "힐튼": "https://www.hilton.com/",
    "콘래드": "https://www.hilton.com/conrad/",
    "월도프 아스토리아": "https://www.hilton.com/waldorf-astoria/",
    "하얏트": "https://www.hyatt.com/",
    "파크 하얏트": "https://www.hyatt.com/park-hyatt/",
    "안다즈": "https://www.hyatt.com/andaz/",
    "그랜드 하얏트": "https://www.hyatt.com/grand-hyatt/",
    "하얏트 리젠시": "https://www.hyatt.com/hyatt-regency/",
    "하얏트 센트릭": "https://www.hyatt.com/hyatt-centric/",
    "식스센스": "https://www.sixsenses.com/",
    "리젠트": "https://www.ihg.com/regent/",
    "인터컨티넨탈": "https://www.ihg.com/intercontinental/",
    "킴튼": "https://www.ihg.com/kimpton/",
    "래플스": "https://www.raffles.com/",
    "페어몬트": "https://www.fairmont.com/",
    "소피텔": "https://www.sofitel.com/",
    "SO/": "https://www.sofitel.com/",
    "머큐어": "https://www.mercure.com/",
    "아만": "https://www.aman.com/",
    "포시즌스": "https://www.fourseasons.com/",
    "만다린 오리엔탈": "https://www.mandarinoriental.com/",
    "로즈우드": "https://www.rosewoodhotels.com/",
    "카펠라": "https://capellahotels.com/",
    "샹그릴라": "https://www.shangri-la.com/",
    "페닌슐라": "https://www.peninsula.com/",
    "호시노야": "https://hoshinoresorts.com/",
    "호시노": "https://hoshinoresorts.com/",
}

# name, chain, region, area, brand, channel, video id, review
ROWS = [
    # ── 또 떠나는 남자
    ("아만 도쿄", "하이엔드·독립", "일본", "일본 도쿄", "아만", "또 떠나는 남자", "f1i8Yu0ima8", "도쿄에서 가장 비싼 호텔 리뷰"),
    ("호시노야 도쿄", "하이엔드·독립", "일본", "일본 도쿄", "호시노야", "또 떠나는 남자", "l74O3LGfBzM", "도쿄 도심 온천 료칸 리뷰"),
    ("불가리 도쿄", "메리어트", "일본", "일본 도쿄", "불가리", "또 떠나는 남자", "YE5AC_04xO0", "1박 200만 원대 호텔 리뷰"),
    ("리츠칼튼 후쿠오카", "메리어트", "일본", "일본 후쿠오카", "리츠칼튼", "또 떠나는 남자", "AZmScUVHLcM", "벳푸·후쿠오카 리조트 3곳"),
    ("인터컨티넨탈 벳푸", "IHG", "일본", "일본 벳푸", "인터컨티넨탈", "또 떠나는 남자", "AZmScUVHLcM", "벳푸·후쿠오카 리조트 3곳"),
    ("호시노 카이 벳푸", "하이엔드·독립", "일본", "일본 벳푸", "호시노", "또 떠나는 남자", "AZmScUVHLcM", "벳푸·후쿠오카 리조트 3곳"),
    ("호시노야 오키나와", "하이엔드·독립", "일본", "일본 오키나와", "호시노야", "또 떠나는 남자", "fqBt6aViGcs", "오키나와 리조트 리뷰"),
    ("포시즌스 교토", "하이엔드·독립", "일본", "일본 교토", "포시즌스", "또 떠나는 남자", "ITiJy2SQbV8", "교토 최고급 호텔 리뷰"),
    ("식스센스 닌반베이", "IHG", "동남아", "베트남 나트랑", "식스센스", "또 떠나는 남자", "XIrHts2-SOA", "나트랑 리조트 리뷰"),
    ("리젠트 푸꾸옥", "IHG", "동남아", "베트남 푸꾸옥", "리젠트", "또 떠나는 남자", "zo5KiTNpCRs", "푸꾸옥 리조트 리뷰"),
    ("JW 메리어트 푸꾸옥", "메리어트", "동남아", "베트남 푸꾸옥", "JW 메리어트", "또 떠나는 남자", "L3Wye1P4EWw", "푸꾸옥 최고 숙소 리뷰"),
    ("인터컨티넨탈 다낭", "IHG", "동남아", "베트남 다낭", "인터컨티넨탈", "또 떠나는 남자", "qX_NUH7J1dg", "다낭 리조트 리뷰"),
    ("포시즌스 리조트 남하이 호이안", "하이엔드·독립", "동남아", "베트남 다낭·호이안", "포시즌스", "또 떠나는 남자", "6fynfzohs_I", "최고급 풀빌라 리뷰"),
    ("리츠칼튼 방콕", "메리어트", "동남아", "태국 방콕", "리츠칼튼", "또 떠나는 남자", "Z67riSLxF4s", "방콕 럭셔리 신상 호텔 2곳"),
    ("만다린 오리엔탈 방콕", "하이엔드·독립", "동남아", "태국 방콕", "만다린 오리엔탈", "또 떠나는 남자", "EZEviocI-2A", "방콕 호텔 리뷰"),
    ("카펠라 방콕", "하이엔드·독립", "동남아", "태국 방콕", "카펠라", "또 떠나는 남자", "-rznK5_CT3E", "카펠라 방콕 리뷰"),
    ("포시즌스 방콕", "하이엔드·독립", "동남아", "태국 방콕", "포시즌스", "또 떠나는 남자", "05zHBNQLPJE", "방콕 최고 호텔 클래스"),
    ("만다린 오리엔탈 타이베이", "하이엔드·독립", "중화권", "대만 타이베이", "만다린 오리엔탈", "또 떠나는 남자", "b2Mi-R_Chhg", "대만 최고급 호텔 리뷰"),
    ("아만 뉴욕", "하이엔드·독립", "미주", "미국 뉴욕", "아만", "또 떠나는 남자", "Prd0FkEH99c", "뉴욕에서 가장 비싼 호텔 리뷰"),
    ("포시즌스 프라하", "하이엔드·독립", "유럽", "체코 프라하", "포시즌스", "또 떠나는 남자", "vaFY1fHOzU0", "포시즌스 프라하 리뷰"),
    # ── 손놈
    ("안다즈 도쿄", "하얏트", "일본", "일본 도쿄", "안다즈", "손놈", "NrqVhD_L4mI", "도쿄타워뷰 호텔 리뷰"),
    ("리젠트 타이베이", "IHG", "중화권", "대만 타이베이", "리젠트", "손놈", "n5gDpeScYik", "리젠트 타이베이 호텔 리뷰"),
    ("JW 메리어트 쿠스코", "메리어트", "미주", "페루 쿠스코", "JW 메리어트", "손놈", "L3FjZ1YXMaE", "쿠스코 호텔 리뷰"),
    ("메리어트 메나 하우스", "메리어트", "중동·기타", "이집트 카이로", "메리어트", "손놈", "elldXrzSrhc", "피라미드 직관뷰 호텔 리뷰"),
    ("메리어트 수라웡세 방콕", "메리어트", "동남아", "태국 방콕", "메리어트", "손놈", "fx5GqLWGvyc", "루프탑 수영장 호텔 리뷰"),
    ("샹그릴라 시드니", "하이엔드·독립", "오세아니아", "호주 시드니", "샹그릴라", "손놈", "59qKQOCkJH8", "오페라하우스뷰 클럽룸 리뷰"),
    ("리츠칼튼 도하", "메리어트", "중동·기타", "카타르 도하", "리츠칼튼", "손놈", "qoNJX46htb4", "클럽룸 1박 2일 리뷰"),
    ("쉐라톤 홍콩", "메리어트", "중화권", "홍콩", "쉐라톤", "손놈", "F-Fya2tmvaE", "하버뷰 리뉴얼 룸 리뷰"),
    ("웨스틴 괌", "메리어트", "오세아니아", "괌", "웨스틴", "손놈", "3zCoigOiyWU", "웨스틴 괌 풀코스 리뷰"),
    ("하얏트 리젠시 파리 에투알", "하얏트", "유럽", "프랑스 파리", "하얏트 리젠시", "손놈", "Cly-7BzSnNo", "에펠탑뷰 호텔 리뷰"),
    # ── 여니버스
    ("머큐어 샤모니 센터", "아코르", "유럽", "프랑스 샤모니", "머큐어", "여니버스", "UDNb3yZusfI", "샤모니 여행 호텔 리뷰"),
    # ── 큰손 노희영
    ("아만기리", "하이엔드·독립", "미주", "미국 유타", "아만", "큰손 노희영", "nuRqZ4n9Mhs", "사막 한복판 럭셔리 리조트"),
    # ── 반지하 유정수
    ("로즈우드 미야코지마", "하이엔드·독립", "일본", "일본 미야코지마", "로즈우드", "반지하 유정수", "3pq_zqGD34s", "초특급 리조트 로즈우드 리뷰"),
    # ── 탤스테이
    ("페어몬트 방콕 스쿰빗", "아코르", "동남아", "태국 방콕", "페어몬트", "탤스테이", "Jy4id1Fd9iE", "방콕 신상 호텔 리뷰"),
    ("안다즈 원 방콕", "하얏트", "동남아", "태국 방콕", "안다즈", "탤스테이", "wCUCTA1tZ9o", "안다즈 원 방콕 리뷰"),
    ("파크 하얏트 방콕", "하얏트", "동남아", "태국 방콕", "파크 하얏트", "탤스테이", "NEN6m6Nzes4", "파크 하얏트 방콕 리뷰"),
    ("인터컨티넨탈 치앙마이 매핑", "IHG", "동남아", "태국 치앙마이", "인터컨티넨탈", "탤스테이", "WJnAm7zbvrY", "치앙마이 리조트 리뷰"),
    ("하얏트 리젠시 방콕 스쿰빗", "하얏트", "동남아", "태국 방콕", "하얏트 리젠시", "탤스테이", "Rnuh5Ic3_UY", "아속역 호텔 리뷰"),
    ("만다린 오리엔탈 홍콩", "하이엔드·독립", "중화권", "홍콩", "만다린 오리엔탈", "탤스테이", "g9WZjQZaXnQ", "홍콩 초럭셔리 호텔 리뷰"),
    ("리젠트 홍콩", "IHG", "중화권", "홍콩", "리젠트", "탤스테이", "rPeCHxbXjx8", "야경 맛집 호텔 리뷰"),
    ("하얏트 리젠시 오키나와 세라가키", "하얏트", "일본", "일본 오키나와", "하얏트 리젠시", "탤스테이", "trjRRrKEor4", "산호섬 신상 리조트 리뷰"),
    ("로얄 오키드 쉐라톤 방콕", "메리어트", "동남아", "태국 방콕", "쉐라톤", "탤스테이", "Yqhb3I6qO7Q", "리버뷰 호텔 리뷰"),
    ("킴튼 말라이 방콕", "IHG", "동남아", "태국 방콕", "킴튼", "탤스테이", "DD-L7pSJwMA", "킴튼 말라이 가족여행 후기"),
    ("힐튼 파타야", "힐튼", "동남아", "태국 파타야", "힐튼", "탤스테이", "F5HQ74x-8ow", "힐튼 파타야 리뷰"),
    ("소피텔 방콕", "아코르", "동남아", "태국 방콕", "소피텔", "탤스테이", "TY57U7vGOVw", "소피텔 방콕 완벽분석"),
    # ── 아일랜드 트래블러
    ("포시즌스 리조트 발리", "하이엔드·독립", "동남아", "인도네시아 발리", "포시즌스", "아일랜드 트래블러", "uPwcrB6viAo", "발리 리조트 장단점 비교"),
    ("인터컨티넨탈 상하이 원더랜드", "IHG", "중화권", "중국 상하이", "인터컨티넨탈", "아일랜드 트래블러", "hin7zjnPxd8", "채석장에 지은 호텔 리뷰"),
    ("아만 파윤", "하이엔드·독립", "중화권", "중국 항저우", "아만", "아일랜드 트래블러", "NmnTXAtylds", "아만 파윤 리뷰"),
    ("SO/ 방콕", "아코르", "동남아", "태국 방콕", "SO/", "아일랜드 트래블러", "wWDu_9IUQaw", "방콕 호텔 중심 하루 일정"),
    ("월도프 아스토리아 이타푸시", "힐튼", "중동·기타", "몰디브", "월도프 아스토리아", "아일랜드 트래블러", "53f9oicJKBU", "몰디브 리조트 프리뷰"),
    # ── 비밀이야
    ("로즈우드 홍콩", "하이엔드·독립", "중화권", "홍콩", "로즈우드", "비밀이야", "KA8dU7c5jSc", "홍콩 고급 호텔 리뷰"),
    ("페닌슐라 홍콩", "하이엔드·독립", "중화권", "홍콩", "페닌슐라", "비밀이야", "gDJ9s-amZM8", "페닌슐라 홍콩 리뷰"),
    ("만다린 오리엔탈 도쿄", "하이엔드·독립", "일본", "일본 도쿄", "만다린 오리엔탈", "비밀이야", "1XZofgYeyUw", "호텔 고르는 꿀팁"),
    ("더 랜드마크 만다린 오리엔탈", "하이엔드·독립", "중화권", "홍콩", "만다린 오리엔탈", "비밀이야", "nvQ7IUg4UPk", "1박 100만 원대 호텔 리뷰"),
    # ── 추가 검증분 (초마드)
    ("세인트레지스 방콕", "메리어트", "동남아", "태국 방콕", "세인트레지스", "초마드", "bd9LHAK0w_4", "1박 50만 원대 호캉스 브이로그"),
    ("세인트레지스 마카오", "메리어트", "중화권", "마카오", "세인트레지스", "초마드", "voil4zymN6s", "마카오 영국감성 호캉스"),
    ("리츠칼튼 알와디", "메리어트", "중동·기타", "아랍에미리트 라스알카이마", "리츠칼튼", "초마드", "5ZediO0v9vI", "사막 리조트 브이로그"),
    ("리츠칼튼 상하이 푸동", "메리어트", "중화권", "중국 상하이", "리츠칼튼", "초마드", "6EMyx4ILF6E", "동방명주뷰 호텔 리뷰"),
    ("JW 메리어트 도쿄", "메리어트", "일본", "일본 도쿄", "JW 메리어트", "초마드", "IynIO6WLWCA", "도쿄 스위트룸 호캉스"),
    ("에디션 싼야", "메리어트", "중화권", "중국 하이난 싼야", "에디션", "초마드", "o12_oS6U3cg", "세계 최대 에디션 호텔"),
    ("안다즈 방콕", "하얏트", "동남아", "태국 방콕", "안다즈", "초마드", "NVunNe8QA08", "방콕 신상 럭셔리 호텔"),
    ("콘래드 도쿄", "힐튼", "일본", "일본 도쿄", "콘래드", "초마드", "ZWuJFn9QSAk", "콘래드 도쿄 호캉스 풀코스"),
    ("리젠트 상하이 온더번드", "IHG", "중화권", "중국 상하이", "리젠트", "초마드", "sNw0qRGXLDo", "상하이 럭셔리 호텔 리뷰"),
    ("타이베이 메리어트", "메리어트", "중화권", "대만 타이베이", "메리어트", "초마드", "T6aCT_FpSHc", "타이베이101뷰 호캉스"),
    # ── 추가 검증분 (나나제인 / 더들리 / 시나쓰)
    ("래플스 싱가포르", "아코르", "동남아", "싱가포르", "래플스", "나나제인, 똑똑한 여행", "GdJdbzz1Cts", "래플스 싱가포르 1박 리뷰"),
    ("식스센스 울루와뚜", "IHG", "동남아", "인도네시아 발리", "식스센스", "나나제인, 똑똑한 여행", "uv4LgPelu1g", "울루와뚜 절벽 리조트 리뷰"),
    ("파크 하얏트 뉴욕", "하얏트", "미주", "미국 뉴욕", "파크 하얏트", "더들리", "7Ku3GClOnRc", "파크 하얏트 뉴욕 리뷰"),
    ("그랜드 하얏트 후쿠오카", "하얏트", "일본", "일본 후쿠오카", "그랜드 하얏트", "시나쓰 유튜브SHINASU", "PiNHnIDyTAU", "후쿠오카 호텔 위치 리뷰"),
    ("그랜드 하얏트 타이베이", "하얏트", "중화권", "대만 타이베이", "그랜드 하얏트", "시나쓰 유튜브SHINASU", "TQa-u2hNV7I", "타이베이 최고급 호텔 리뷰"),
    ("하얏트 센트릭 가나자와", "하얏트", "일본", "일본 가나자와", "하얏트 센트릭", "시나쓰 유튜브SHINASU", "0x34WPISxYw", "가나자와 호텔 리뷰"),
    # ── 같은 호텔의 추가 리뷰 (대표 카드 1장 + 상세 화면에 함께 표시)
    ("만다린 오리엔탈 방콕", "하이엔드·독립", "동남아", "태국 방콕", "만다린 오리엔탈", "탤스테이", "twXuaWVdrlc", "효도여행으로 다녀온 만다린 오리엔탈 방콕"),
    ("포시즌스 방콕", "하이엔드·독립", "동남아", "태국 방콕", "포시즌스", "탤스테이", "WV9odqkAVtU", "1박 100만 원 포시즌스 방콕 후기"),
    ("카펠라 방콕", "하이엔드·독립", "동남아", "태국 방콕", "카펠라", "탤스테이", "DbWDsIaa1ao", "카펠라 방콕 수영장·조식 풀코스"),
    ("리젠트 푸꾸옥", "IHG", "동남아", "베트남 푸꾸옥", "리젠트", "나나제인, 똑똑한 여행", "89YrvKWxklM", "개인 수영장 풀빌라 리뷰"),
    ("안다즈 도쿄", "하얏트", "일본", "일본 도쿄", "안다즈", "나나제인, 똑똑한 여행", "5BEuckZhYm8", "안다즈 도쿄 리뷰"),
    ("메리어트 수라웡세 방콕", "메리어트", "동남아", "태국 방콕", "메리어트", "탤스테이", "9xGz9ZqGRT4", "메리어트 수라웡세 조식 리뷰"),
]


def main():
    order = []
    by_name = {}
    for name, chain, region, area, brand, channel, vid, review in ROWS:
        item = dict(name=name, chain=chain, region=region, area=area, brand=brand,
                    channel=channel, id=vid, review=review)
        if name not in by_name:
            by_name[name] = dict(item, reviews=[])
            order.append(name)
        else:
            cur = by_name[name]
            if chain != cur["chain"] or region != cur["region"]:
                raise SystemExit(f"conflicting chain/region for {name}")
            if cur["id"] != vid:
                cur["reviews"].append(dict(channel=channel, id=vid, review=review, start=None))
    CODES = {"메리어트": "M", "힐튼": "H", "하얏트": "Y", "IHG": "I", "아코르": "A", "하이엔드·독립": "L"}
    lines = ["// 해외지도 — 5대 글로벌 체인·하이엔드 호텔과 실제 확인한 유튜브 리뷰.",
             "// 영상 ID·호텔명·도시는 채널 영상 목록과 제목/설명에서 확인한 값만 수록했습니다.",
             "window.abroadCatalogue = {",
             "  channels: {"]
    used = {}
    for name in order:
        p = by_name[name]
        for ch in [p["channel"]] + [r["channel"] for r in p["reviews"]]:
            used[ch] = CH[ch]
    for ch in sorted(used, key=lambda c: -used[c]):
        lines.append(f"    {json.dumps(ch, ensure_ascii=False)}: {used[ch]},")
    lines.append("  },")
    lines.append("  places: [")
    for name in order:
        p = by_name[name]
        official = SITE[p["brand"]]
        lines.append("    {")
        lines.append(f"      name:{json.dumps(p['name'], ensure_ascii=False)}, region:{json.dumps(p['region'], ensure_ascii=False)}, area:{json.dumps(p['area'], ensure_ascii=False)}, kind:{json.dumps(p['chain'], ensure_ascii=False)},")
        lines.append(f"      review:{json.dumps(p['review'], ensure_ascii=False)}, channel:{json.dumps(p['channel'], ensure_ascii=False)}, id:{json.dumps(p['id'])}, start:null,")
        lines.append(f"      official:{json.dumps(official)},")
        if p["reviews"]:
            lines.append("      reviews: [")
            for r in p["reviews"]:
                lines.append(f"        {{review:{json.dumps(r['review'], ensure_ascii=False)}, channel:{json.dumps(r['channel'], ensure_ascii=False)}, id:{json.dumps(r['id'])}, start:null}},")
            lines.append("      ]")
        else:
            lines.append("      reviews: []")
        lines.append("    },")
    lines.append("  ]")
    lines.append("};")
    OUT.write_text("\n".join(lines) + "\n")
    print(f"places={len(order)} channels={len(used)}")
    from collections import Counter
    print(Counter(by_name[n]["chain"] for n in order))
    print(Counter(by_name[n]["region"] for n in order))


if __name__ == "__main__":
    main()
