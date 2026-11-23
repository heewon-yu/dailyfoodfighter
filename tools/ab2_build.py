#!/usr/bin/env python3
"""2차 확장: 검증된 후보에서 최종 수록 행을 만들고 map/abroads.js를 다시 쓴다.
- 기존 1차 70곳은 이름·영상·공식 링크를 그대로 두고 reviews만 보강한다.
- 새 호텔은 '브랜드 + 도시' 이름으로 추가한다 (영상 제목에서 브랜드·도시가 확인된 것만).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PICK = ROOT / "data" / "ab2_pick.json"
SUBS = ROOT / "data" / "ab2_subs.json"
VERIFY = ROOT / "data" / "ab2_verify.json"
SUBS2 = ROOT / "data" / "ab2_subs2.json"
OUT = ROOT / "map" / "abroads.js"

# 수록하지 않는 (브랜드|도시): 리뷰가 아닌 영상(뉴스·전시·식당·쇼핑)이거나 실제 지점이 불명확한 경우
SKIP = {
    "래플스|마카오", "리젠트|파타야", "리츠칼튼|두바이", "리츠칼튼|마카오", "리츠칼튼|오사카",
    "리츠칼튼|파리", "만다린 오리엔탈|파리", "불가리|베이징", "불가리|하노이", "불가리|도쿄",
    "식스센스|나트랑", "아만|다낭", "안다즈|도쿄", "에디션|교토", "에디션|마카오",
    "카펠라|마카오", "킴튼|뉴욕", "킴튼|바르셀로나", "킴튼|쑤저우", "페닌슐라|상하이",
    "페어몬트|하노이", "포시즌스|두바이", "호시노야|오키나와", "호시노야|하코네",
}

# 기존 카드에 리뷰로 붙일 (브랜드|도시) → 기존 이름
EXIST = {
    "리젠트|상하이": "리젠트 상하이 온더번드",
    "리젠트|타이베이": "리젠트 타이베이",
    "리젠트|푸꾸옥": "리젠트 푸꾸옥",
    "리젠트|홍콩": "리젠트 홍콩",
    "포시즌스|다낭": "포시즌스 리조트 남하이 호이안",
    "포시즌스|호이안": "포시즌스 리조트 남하이 호이안",
    "포시즌스|교토": "포시즌스 교토",
    "포시즌스|방콕": "포시즌스 방콕",
    "포시즌스|프라하": "포시즌스 프라하",
    "아만|항저우": "아만 파윤",
    "아만|뉴욕": "아만 뉴욕",
    "아만|도쿄": "아만 도쿄",
    "리츠칼튼|상하이": "리츠칼튼 상하이 푸동",
    "리츠칼튼|방콕": "리츠칼튼 방콕",
    "리츠칼튼|도하": "리츠칼튼 도하",
    "리츠칼튼|후쿠오카": "리츠칼튼 후쿠오카",
    "식스센스|발리": "식스센스 울루와뚜",
    "하얏트 리젠시|오키나와": "하얏트 리젠시 오키나와 세라가키",
    "하얏트 리젠시|파리": "하얏트 리젠시 파리 에투알",
    "그랜드 하얏트|타이베이": "그랜드 하얏트 타이베이",
    "그랜드 하얏트|후쿠오카": "그랜드 하얏트 후쿠오카",
    "만다린 오리엔탈|도쿄": "만다린 오리엔탈 도쿄",
    "만다린 오리엔탈|타이베이": "만다린 오리엔탈 타이베이",
    "만다린 오리엔탈|방콕": "만다린 오리엔탈 방콕",
    "만다린 오리엔탈|홍콩": "만다린 오리엔탈 홍콩",
    "로즈우드|미야코지마": "로즈우드 미야코지마",
    "로즈우드|홍콩": "로즈우드 홍콩",
    "안다즈|방콕": "안다즈 방콕",
    "인터컨티넨탈|다낭": "인터컨티넨탈 다낭",
    "인터컨티넨탈|벳푸": "인터컨티넨탈 벳푸",
    "인터컨티넨탈|상하이": "인터컨티넨탈 상하이 원더랜드",
    "인터컨티넨탈|치앙마이": "인터컨티넨탈 치앙마이 매핑",
    "카펠라|방콕": "카펠라 방콕",
    "콘래드|도쿄": "콘래드 도쿄",
    "파크 하얏트|뉴욕": "파크 하얏트 뉴욕",
    "파크 하얏트|방콕": "파크 하얏트 방콕",
    "페닌슐라|홍콩": "페닌슐라 홍콩",
    "페어몬트|방콕": "페어몬트 방콕 스쿰빗",
    "호시노야|도쿄": "호시노야 도쿄",
    "월도프 아스토리아|몰디브": "월도프 아스토리아 이타푸시",
    "세인트레지스|방콕": "세인트레지스 방콕",
    "세인트레지스|마카오": "세인트레지스 마카오",
    "JW 메리어트|푸꾸옥": "JW 메리어트 푸꾸옥",
    "소피텔|방콕": "소피텔 방콕",
    "파크 하얏트|방콕": "파크 하얏트 방콕",
    "포시즌스|발리": "포시즌스 리조트 발리",
}

# 표시 이름 (기본: 브랜드 + 도시)
NAME = {
    "JW 메리어트|나트랑": "JW 메리어트 깜란 나트랑",
    "JW 메리어트|몰디브": "JW 메리어트 카푸 아톨 몰디브",
    "LXR|교토": "ROKU KYOTO LXR",
    "LXR|발리": "우마나 발리 LXR",
    "래플스|몰디브": "래플스 몰디브",
    "래플스|발리": "래플스 발리",
    "럭셔리 컬렉션|뉴욕": "럭셔리 컬렉션 맨해튼 미드타운",
    "럭셔리 컬렉션|방콕": "더 아테네 럭셔리 컬렉션 방콕",
    "로즈우드|광저우": "로즈우드 광저우",
    "리젠트|발리": "리젠트 발리 칸구",
    "리츠칼튼|하와이": "리츠칼튼 와이키키",
    "리츠칼튼|싱가포르": "리츠칼튼 밀레니아 싱가포르",
    "만다린 오리엔탈|마카오": "만다린 오리엔탈 마카오",
    "만다린 오리엔탈|베이징": "만다린 오리엔탈 베이징 첸멘",
    "만다린 오리엔탈|싱가포르": "만다린 오리엔탈 싱가포르",
    "반얀트리|교토": "반얀트리 히가시야마 교토",
    "반얀트리|다낭": "반얀트리 랑코 다낭",
    "반얀트리|도하": "반얀트리 도하",
    "반얀트리|마카오": "반얀트리 마카오",
    "반얀트리|발리": "반얀트리 부아한 발리",
    "반얀트리|방콕": "반얀트리 방콕",
    "반얀트리|상하이": "반얀트리 상하이 온더번드",
    "반얀트리|싱가포르": "반얀트리 만다이 싱가포르",
    "반얀트리|푸켓": "반얀트리 푸켓",
    "벨몬드|발리": "벨몬드 짐바란 푸리 발리",
    "불가리|런던": "불가리 런던",
    "불가리|로마": "불가리 로마",
    "불가리|발리": "불가리 발리",
    "불가리|상하이": "불가리 상하이",
    "샹그릴라|도쿄": "샹그릴라 도쿄",
    "샹그릴라|두바이": "샹그릴라 두바이",
    "샹그릴라|방콕": "샹그릴라 방콕",
    "샹그릴라|상하이": "푸동 샹그릴라 상하이",
    "샹그릴라|세부": "샹그릴라 막탄 세부",
    "샹그릴라|시드니": "샹그릴라 시드니",
    "샹그릴라|싱가포르": "샹그릴라 싱가포르",
    "샹그릴라|아부다비": "샹그릴라 아부다비",
    "샹그릴라|치앙마이": "샹그릴라 치앙마이",
    "샹그릴라|칭다오": "샹그릴라 칭다오",
    "샹그릴라|타이베이": "샹그릴라 파 이스턴 타이베이",
    "샹그릴라|홍콩": "아일랜드 샹그릴라 홍콩",
    "세인트레지스|마이애미": "세인트레지스 마이애미",
    "세인트레지스|몰디브": "세인트레지스 보믈리 몰디브",
    "세인트레지스|발리": "세인트레지스 발리",
    "세인트레지스|베네치아": "세인트레지스 베네치아",
    "세인트레지스|상하이": "세인트레지스 상하이 온더번드",
    "세인트레지스|싱가포르": "세인트레지스 싱가포르",
    "세인트레지스|아부다비": "세인트레지스 아부다비",
    "세인트레지스|오사카": "세인트레지스 오사카",
    "세인트레지스|칭다오": "세인트레지스 칭다오",
    "세인트레지스|홍콩": "세인트레지스 홍콩",
    "소피텔|광저우": "소피텔 광저우",
    "소피텔|마닐라": "소피텔 마닐라 플라자",
    "소피텔|마카오": "소피텔 마카오 폰테 16",
    "소피텔|발리": "소피텔 발리 누사두아",
    "소피텔|상하이": "소피텔 상하이",
    "소피텔|시드니": "소피텔 시드니 달링하버",
    "소피텔|싱가포르": "소피텔 센토사 싱가포르",
    "소피텔|카이로": "소피텔 카이로",
    "소피텔|하노이": "소피텔 레전드 메트로폴 하노이",
    "식스센스|교토": "식스센스 교토",
    "아만|교토": "아만 교토",
    "아만|나트랑": "아만노이 나트랑",
    "아만|발리": "아만 발리",
    "아만|방콕": "아만 나이 럿 방콕",
    "아만|베이징": "아만 서머 팰리스 베이징",
    "아만|상하이": "아만양윤 상하이",
    "안다즈|마카오": "안다즈 마카오",
    "안다즈|발리": "안다즈 발리",
    "안다즈|빈": "안다즈 빈",
    "안다즈|싱가포르": "안다즈 싱가포르",
    "안다즈|파타야": "안다즈 파타야",
    "알릴라|몰디브": "알릴라 코타이파루 몰디브",
    "알릴라|발리": "알릴라 스미냑 발리",
    "알릴라|상하이": "알릴라 상하이",
    "에디션|도쿄": "에디션 도라노몬 도쿄",
    "에디션|두바이": "에디션 두바이",
    "에디션|방콕": "에디션 방콕",
    "에디션|상하이": "에디션 상하이",
    "에디션|싱가포르": "에디션 싱가포르",
    "월도프 아스토리아|뉴욕": "월도프 아스토리아 뉴욕",
    "월도프 아스토리아|방콕": "월도프 아스토리아 방콕",
    "월도프 아스토리아|상하이": "월도프 아스토리아 상하이 온더번드",
    "월도프 아스토리아|오사카": "월도프 아스토리아 오사카",
    "인터컨티넨탈|나트랑": "인터컨티넨탈 나트랑",
    "인터컨티넨탈|마이애미": "인터컨티넨탈 마이애미",
    "인터컨티넨탈|발리": "인터컨티넨탈 발리",
    "인터컨티넨탈|방콕": "인터컨티넨탈 방콕",
    "인터컨티넨탈|싱가포르": "인터컨티넨탈 싱가포르",
    "인터컨티넨탈|오사카": "인터컨티넨탈 오사카",
    "인터컨티넨탈|오키나와": "ANA 인터컨티넨탈 이시가키",
    "인터컨티넨탈|이스탄불": "인터컨티넨탈 이스탄불",
    "인터컨티넨탈|자카르타": "인터컨티넨탈 자카르타 폰독 인다",
    "인터컨티넨탈|푸꾸옥": "인터컨티넨탈 푸꾸옥",
    "인터컨티넨탈|푸켓": "인터컨티넨탈 푸켓",
    "인터컨티넨탈|하노이": "인터컨티넨탈 하노이",
    "인터컨티넨탈|홍콩": "인터컨티넨탈 그랜드 스탠포드 홍콩",
    "자누|도쿄": "자누 도쿄",
    "카펠라|교토": "카펠라 교토",
    "카펠라|상하이": "카펠라 상하이",
    "카펠라|시드니": "카펠라 시드니",
    "카펠라|싱가포르": "카펠라 싱가포르",
    "카펠라|타이베이": "카펠라 타이베이",
    "카펠라|하노이": "카펠라 하노이",
    "콘래드|두바이": "콘래드 두바이",
    "콘래드|마닐라": "콘래드 마닐라",
    "콘래드|마카오": "콘래드 마카오",
    "콘래드|발리": "콘래드 발리",
    "콘래드|방콕": "콘래드 방콕",
    "콘래드|베이징": "콘래드 베이징",
    "콘래드|상하이": "콘래드 상하이",
    "콘래드|싱가포르": "콘래드 싱가포르",
    "콘래드|오사카": "콘래드 오사카",
    "콘래드|이스탄불": "콘래드 이스탄불",
    "파크 하얏트|교토": "파크 하얏트 교토",
    "파크 하얏트|도쿄": "파크 하얏트 도쿄",
    "파크 하얏트|두바이": "파크 하얏트 두바이",
    "파크 하얏트|상하이": "파크 하얏트 상하이",
    "파크 하얏트|시드니": "파크 하얏트 시드니",
    "파크 하얏트|취리히": "파크 하얏트 취리히",
    "파크 하얏트|호치민": "파크 하얏트 사이공",
    "파크로얄|싱가포르": "파크로얄 컬렉션 마리나베이",
    "페닌슐라|다낭": "페닌슐라 다낭",
    "페닌슐라|도쿄": "페닌슐라 도쿄",
    "페닌슐라|방콕": "페닌슐라 방콕",
    "페닌슐라|베이징": "페닌슐라 베이징",
    "페어몬트|도쿄": "페어몬트 도쿄",
    "페어몬트|발리": "페어몬트 사누르 발리",
    "페어몬트|싱가포르": "페어몬트 싱가포르",
    "포시즌스|도쿄": "포시즌스 도쿄",
    "포시즌스|마카오": "포시즌스 마카오",
    "포시즌스|발리": "포시즌스 짐바란 발리",
    "포시즌스|베이징": "포시즌스 베이징",
    "포시즌스|상하이": "포시즌스 상하이",
    "포시즌스|오사카": "포시즌스 오사카",
    "포시즌스|쿠알라룸푸르": "포시즌스 쿠알라룸푸르",
    "포시즌스|항저우": "포시즌스 항저우",
    "포시즌스|홍콩": "포시즌스 홍콩",
    "하얏트 리젠시|괌": "하얏트 리젠시 괌",
    "하얏트 리젠시|교토": "하얏트 리젠시 교토",
    "하얏트 리젠시|나트랑": "하얏트 리젠시 나트랑",
    "하얏트 리젠시|다낭": "하얏트 리젠시 다낭",
    "하얏트 리젠시|도쿄": "하얏트 리젠시 도쿄베이",
    "하얏트 리젠시|발리": "하얏트 리젠시 발리",
    "호시노야|교토": "호시노야 교토",
    "호시노야|발리": "호시노야 발리",
    "호시노야|후쿠오카": "호시노 카이 유후인",
    "그랜드 하얏트|도쿄": "그랜드 하얏트 도쿄",
    "그랜드 하얏트|두바이": "그랜드 하얏트 두바이",
    "그랜드 하얏트|마닐라": "그랜드 하얏트 마닐라",
    "그랜드 하얏트|마카오": "그랜드 하얏트 마카오",
    "그랜드 하얏트|발리": "그랜드 하얏트 발리",
    "그랜드 하얏트|방콕": "그랜드 하얏트 에라완 방콕",
    "그랜드 하얏트|베이징": "그랜드 하얏트 베이징",
    "그랜드 하얏트|상하이": "그랜드 하얏트 상하이",
    "그랜드 하얏트|홍콩": "그랜드 하얏트 홍콩",
    "JW 메리어트|마카오": "JW 메리어트 마카오",
    "JW 메리어트|방콕": "JW 메리어트 방콕",
    "JW 메리어트|베이징": "JW 메리어트 베이징",
    "JW 메리어트|싱가포르": "JW 메리어트 싱가포르 사우스비치",
    "JW 메리어트|하노이": "JW 메리어트 하노이",
    "JW 메리어트|홍콩": "JW 메리어트 홍콩",
    "리츠칼튼|교토": "리츠칼튼 교토",
    "리츠칼튼|도쿄": "리츠칼튼 도쿄",
    "리츠칼튼|몰디브": "리츠칼튼 몰디브 파리 아일랜드",
    "리츠칼튼|발리": "리츠칼튼 발리",
    "리츠칼튼|싱가포르": "리츠칼튼 밀레니아 싱가포르",
    "리츠칼튼|이스탄불": "리츠칼튼 이스탄불",
    "리츠칼튼|자카르타": "리츠칼튼 자카르타 퍼시픽 플레이스",
    "리츠칼튼|홍콩": "리츠칼튼 홍콩",
    "리츠칼튼|하와이": "리츠칼튼 와이키키",
}

# 지역(권역/도시) 보정
AREA = {
    "샹그릴라|홍콩": ("중화권", "홍콩"),
    "샹그릴라|세부": ("동남아", "필리핀 세부"),
    "반얀트리|다낭": ("동남아", "베트남 다낭"),
    "포시즌스|다낭": ("동남아", "베트남 다낭·호이안"),
    "아만|나트랑": ("동남아", "베트남 나트랑"),
    "인터컨티넨탈|오키나와": ("일본", "일본 이시가키"),
    "호시노야|후쿠오카": ("일본", "일본 유후인"),
    "리젠트|발리": ("동남아", "인도네시아 발리"),
    "럭셔리 컬렉션|방콕": ("동남아", "태국 방콕"),
    "LXR|교토": ("일본", "일본 교토"),
    "LXR|발리": ("동남아", "인도네시아 발리"),
    "파크 하얏트|호치민": ("동남아", "베트남 호치민"),
    "세인트레지스|베네치아": ("유럽", "이탈리아 베네치아"),
    "안다즈|빈": ("유럽", "오스트리아 빈"),
    "콘래드|마카오": ("중화권", "마카오"),
    "카펠라|시드니": ("오세아니아", "호주 시드니"),
    "파크로얄|싱가포르": ("동남아", "싱가포르"),
    "반얀트리|도하": ("중동·기타", "카타르 도하"),
    "아만|베이징": ("중화권", "중국 베이징"),
    "아만|상하이": ("중화권", "중국 상하이"),
    "알릴라|몰디브": ("중동·기타", "몰디브"),
    "벨몬드|발리": ("동남아", "인도네시아 발리"),
}

SITE = {
    "리츠칼튼": "https://www.ritzcarlton.com/",
    "세인트레지스": "https://www.marriott.com/st-regis/",
    "JW 메리어트": "https://www.marriott.com/jw-marriott/",
    "메리어트": "https://www.marriott.com/",
    "웨스틴": "https://www.westin.com/",
    "쉐라톤": "https://www.sheraton.com/",
    "에디션": "https://edition-hotels.marriott.com/",
    "럭셔리 컬렉션": "https://www.luxurycollection.com/",
    "W": "https://www.marriott.com/w-hotels/",
    "불가리": "https://www.bulgarihotels.com/",
    "힐튼": "https://www.hilton.com/",
    "콘래드": "https://www.hilton.com/conrad/",
    "월도프 아스토리아": "https://www.hilton.com/waldorf-astoria/",
    "LXR": "https://www.hilton.com/lxr/",
    "하얏트": "https://www.hyatt.com/",
    "파크 하얏트": "https://www.hyatt.com/park-hyatt/",
    "그랜드 하얏트": "https://www.hyatt.com/grand-hyatt/",
    "안다즈": "https://www.hyatt.com/andaz/",
    "하얏트 리젠시": "https://www.hyatt.com/hyatt-regency/",
    "알릴라": "https://www.hyatt.com/alila/",
    "식스센스": "https://www.sixsenses.com/",
    "리젠트": "https://www.ihg.com/regent/",
    "인터컨티넨탈": "https://www.ihg.com/intercontinental/",
    "킴튼": "https://www.ihg.com/kimpton/",
    "래플스": "https://www.raffles.com/",
    "페어몬트": "https://www.fairmont.com/",
    "소피텔": "https://www.sofitel.com/",
    "반얀트리": "https://www.banyantree.com/",
    "아만": "https://www.aman.com/",
    "자누": "https://www.aman.com/janu/",
    "포시즌스": "https://www.fourseasons.com/",
    "만다린 오리엔탈": "https://www.mandarinoriental.com/",
    "로즈우드": "https://www.rosewoodhotels.com/",
    "카펠라": "https://capellahotels.com/",
    "샹그릴라": "https://www.shangri-la.com/",
    "페닌슐라": "https://www.peninsula.com/",
    "호시노야": "https://hoshinoresorts.com/",
    "파크로얄": "https://www.panpacific.com/parkroyal/",
    "벨몬드": "https://www.belmond.com/",
    "오베로이": "https://www.oberoihotels.com/",
    "아틀란티스": "https://www.atlantis.com/",
    "주메이라": "https://www.jumeirah.com/",
    "마리나베이샌즈": "https://www.marinabaysands.com/",
}

CHAINS = {"리츠칼튼": "메리어트", "세인트레지스": "메리어트", "JW 메리어트": "메리어트",
          "에디션": "메리어트", "불가리": "메리어트", "럭셔리 컬렉션": "메리어트", "W": "메리어트",
          "콘래드": "힐튼", "월도프 아스토리아": "힐튼", "LXR": "힐튼",
          "파크 하얏트": "하얏트", "그랜드 하얏트": "하얏트", "안다즈": "하얏트",
          "하얏트 리젠시": "하얏트", "알릴라": "하얏트",
          "인터컨티넨탈": "IHG", "리젠트": "IHG", "식스센스": "IHG", "킴튼": "IHG",
          "소피텔": "아코르", "페어몬트": "아코르", "래플스": "아코르", "반얀트리": "아코르"}


# 설명에 호텔 이름이 직접 적힌 확인분 (검색 제목에 브랜드+도시가 없어 수동 추가)
EXTRA = [
    ("힐튼 오키나와 미야코", "일본", "일본 오키나와", "힐튼", "https://www.hilton.com/", "꾸준 kkujun", "_UYcfJXY3bw", "힐튼 오키나와 미야코 아일랜드 리조트 리뷰"),
    ("W 발리", "동남아", "인도네시아 발리", "메리어트", "https://www.marriott.com/w-hotels/", "숙소왕", "Pcqt1-XfIMY", "1박 100만 원 W 발리 리조트 리뷰"),
    ("라 페스타 푸꾸옥 큐리오 컬렉션", "동남아", "베트남 푸꾸옥", "힐튼", "https://www.hilton.com/curio/", "숙소왕", "XLFxv-EJbE0", "라 페스타 푸꾸옥 큐리오 컬렉션 바이 힐튼"),
    ("리츠칼튼 난징", "중화권", "중국 난징", "메리어트", "https://www.ritzcarlton.com/", "화송", "vpUnLyZ34vY", "리츠칼튼 난징 5성급 호텔 리뷰"),
    ("리츠칼튼 리저브 리사이밸리", "중화권", "중국 쓰촨 구채구", "메리어트", "https://www.ritzcarlton.com/", "화송", "MoPWiVwtjbQ", "리츠칼튼 리저브 리사이밸리 리뷰"),
    ("반얀트리 리장", "중화권", "중국 리장", "아코르", "https://www.banyantree.com/", "화송", "Xx41CdZzYMU", "반얀트리 리장 리조트 리뷰"),
    ("ANA 인터컨티넨탈 도쿄", "일본", "일본 도쿄", "IHG", "https://www.ihg.com/intercontinental/", "돈캣 PL\u2024EX", "cSAFja4ma9Y", "도쿄 아사쿠사 ANA 인터컨티넨탈 호텔 리뷰"),
]


def clean_review(title, name):
    t = re.sub(r"\[[^\]]{0,20}\]", " ", title)
    t = re.sub(r"\([^)]{0,20}\)", " ", t)
    t = re.sub(r"#\S+", " ", t)
    t = re.sub(r"[^\w\s가-힣·,.\-|]", " ", t)
    t = re.sub(r"\s+", " ", t).strip(" -|,")
    return (t[:46] + "…") if len(t) > 47 else t


def parse_existing():
    """1차 70곳은 이를 만든 tools/abroad_build.py의 ROWS에서 그대로 복원한다."""
    import sys
    sys.path.insert(0, str(ROOT / "tools"))
    import abroad_build
    chans = dict(abroad_build.CH)
    places, by = [], {}
    for name, chain, region, area, brand, channel, vid, review in abroad_build.ROWS:
        if name in by:
            by[name]["reviews"].append(dict(review=review, channel=channel, id=vid))
            continue
        p = dict(name=name, region=region, area=area, kind=chain, review=review,
                 channel=channel, id=vid, official=abroad_build.SITE[brand], reviews=[])
        by[name] = p
        places.append(p)
    return chans, places


def main():
    picks = json.loads(PICK.read_text())
    subs = json.loads(SUBS.read_text())
    subs2 = json.loads(SUBS2.read_text()) if SUBS2.exists() else {}
    name_subs2 = {v["name"]: v["subs"] for v in subs2.values() if v.get("name") and v.get("subs") is not None}
    ver = json.loads(VERIFY.read_text()) if VERIFY.exists() else {}
    dead = {k for k, v in ver.items() if v.get("status") == "dead"}
    kept_picks = []
    for p in picks:
        p["others"] = [o for o in p.get("others", []) if o["videoId"] not in dead]
        if p["videoId"] in dead:
            if not p["others"]:
                continue
            top = p["others"].pop(0)
            p.update(videoId=top["videoId"], channel=top["channel"], title=top["title"])
        kept_picks.append(p)
    picks = kept_picks
    chans, places = parse_existing()
    print("existing", len(places), "channels", len(chans))
    by_name = {p["name"]: p for p in places}
    used_ids = {p["id"] for p in places} | {r["id"] for p in places for r in p["reviews"]}
    added = reviews_added = 0
    for name, region, area_city, chain, official, channel, vid, review in EXTRA:
        if name in by_name or vid in dead:
            continue
        places.append(dict(name=name, region=region, area=area_city, kind=chain, review=review,
                           channel=channel, id=vid, official=official, reviews=[]))
        by_name[name] = places[-1]
        used_ids.add(vid)
        added += 1
    for p in picks:
        key = f"{p['brand']}|{p['city']}"
        if key in SKIP:
            continue
        target = EXIST.get(key)
        name = NAME.get(key) or f"{p['brand']} {p['city']}"
        region, area_city = AREA.get(key, (p["region"], p["city"] if p["country"] == p["city"] else p["country"] + " " + p["city"]))
        chain = CHAINS.get(p["brand"], p["chain"])
        official = SITE.get(p["brand"], "")
        if not official:
            print("NO SITE", p["brand"])
        vid = p["videoId"]
        review = clean_review(p["title"], name)
        others = [o for o in p.get("others", []) if o["videoId"] != vid][:6]
        if vid in dead:
            continue
        if target and target in by_name:
            place = by_name[target]
            for o in [dict(videoId=vid, channel=p["channel"], title=p["title"])] + others:
                if o["videoId"] in used_ids:
                    continue
                place["reviews"].append(dict(review=clean_review(o["title"], place["name"]),
                                             channel=o["channel"], id=o["videoId"]))
                used_ids.add(o["videoId"])
                reviews_added += 1
            continue
        if name in by_name:
            continue
        items = [dict(review=review, channel=p["channel"], id=vid)]
        for o in others:
            if o["videoId"] in used_ids:
                continue
            items.append(dict(review=clean_review(o["title"], name), channel=o["channel"], id=o["videoId"]))
        used_ids.add(vid)
        places.append(dict(name=name, region=region, area=area_city, kind=chain,
                           review=items[0]["review"], channel=items[0]["channel"], id=vid,
                           official=official, reviews=items[1:]))
        by_name[name] = places[-1]
        added += 1
    # 채널 구독자: 사용된 채널만, 확인된 값으로
    subs_by_name = {}
    for p in picks:
        if p.get("subs"):
            subs_by_name[p["channel"]] = max(subs_by_name.get(p["channel"], 0), p["subs"])
        for o in p.get("others", []):
            if o.get("subs"):
                subs_by_name[o["channel"]] = max(subs_by_name.get(o["channel"], 0), o["subs"])
    used = {}
    for p in places:
        for ch in [p["channel"]] + [r["channel"] for r in p["reviews"]]:
            used.setdefault(ch, None)
    for ch in used:
        if ch in chans:
            used[ch] = chans[ch]
    # 캐시에서 채널명 → 구독자 매핑
    name2subs = {}
    for cid, v in subs.items():
        if v.get("name") and v.get("subs") is not None:
            name2subs.setdefault(v["name"], v["subs"])
    missing = []
    for ch in used:
        if used[ch] is None:
            used[ch] = name_subs2.get(ch) or subs_by_name.get(ch) or name2subs.get(ch, 0)
        if used[ch] == 0:
            missing.append(ch)
    write(places, used)
    print("places", len(places), "added", added, "reviews_added", reviews_added,
          "channels", len(used), "zero_subs", missing[:10])


def write(places, chans):
    lines = ["// 해외지도 — 5대 글로벌 체인·하이엔드 호텔과 실제 확인한 유튜브 리뷰.",
             "// 영상 ID·호텔명·도시는 채널 영상 목록과 제목/설명에서 확인한 값만 수록했습니다.",
             "window.abroadCatalogue = {",
             "  channels: {"]
    for ch in sorted(chans, key=lambda c: -chans[c]):
        lines.append(f"    {json.dumps(ch, ensure_ascii=False)}: {chans[ch]},")
    lines.append("  },")
    lines.append("  places: [")
    for p in places:
        lines.append("    {")
        lines.append(f"      name:{json.dumps(p['name'], ensure_ascii=False)}, region:{json.dumps(p['region'], ensure_ascii=False)}, area:{json.dumps(p['area'], ensure_ascii=False)}, kind:{json.dumps(p['kind'], ensure_ascii=False)},")
        lines.append(f"      review:{json.dumps(p['review'], ensure_ascii=False)}, channel:{json.dumps(p['channel'], ensure_ascii=False)}, id:{json.dumps(p['id'])}, start:null,")
        lines.append(f"      official:{json.dumps(p['official'])},")
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


if __name__ == "__main__":
    main()
