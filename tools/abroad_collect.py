#!/usr/bin/env python3
"""Collect abroad-map candidates: per-channel hotel search + global brand searches."""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CH_OUT = DATA / "abroad_ch.json"
Q_OUT = DATA / "abroad_q.json"

CHANNELS = {
    # existing 한밤지도 creators
    "또 떠나는 남자": "UCldwUablgk8KPcFPQlKnB-w",
    "여락이들_": "UCgDlijNPh7yHQNv0YdL11fQ",
    "꾸준 kkujun": "UCxgeEPgtd5Aw7HgoEUXCauA",
    "돈캣 PL․EX": "UC-txiBjJRa4M371okO9Bjcw",
    "호텔사장 기먼성": "UC78Z8NqjKy2_hO7cv6zw17A",
    "숙소왕": "UCjqiy656dmN1RhLi_eOdD0A",
    "Travel with Nanajane": "UCZGYoRCH03Fk-LBiE9-BPSA",
    "일상이여행 Everyday travel": "UCgSGT3WawT1QwUnMbjk8S2A",
    "더들리": "UCmJEpV4hLzGWLU5rrdOHMhQ",
    "차박차박 Chabak": "UCcuFVzMsVtiNjo1bMc0NV7g",
    "유리소리TV": "UCgfQlzdYhPWRRS05Ld99HwQ",
    "여행가 제이": "UCxU8QX7IRRIW0VLuoWWoxbw",
    # overseas travel creators named in the brief
    "빠니보틀": "UCNhofiqfw5nl-NeDJkXtPvw",
    "원지의하루": "UC9gxOp_-R78phMHmv2bW_sg",
    "채코제": "UCaoqDZPllYXLAH_5OBRLLrw",
    "초마드": "UCvuwlY4fWkWMuzRkj5MAK9Q",
    "쏘이": "UCugz3-UlkX2P77PtK1Ju0RA",
    "노마드션": "UCfCOEG2kjX_x4KAdWX-YUcA",
    "모칠레로": "UCUcy82tGagXlj4t1p2todeQ",
    "제이치": "UCrBAMAnRYqG_EuD7TVzkQLQ",
    "테디": "UCewTkRux7toL0N9dR9igLKg",
    "유정수": "UCpxeSKncIk1Dv0UJbyx7G6Q",
    # entertainers already used by 한입지도
    "곽튜브": "UClRNDVO8093rmRTtLe4GEPw",
    "침착맨": "UCUj6rrhMTR9pipbAWBAMvUQ",
    "공부왕찐천재 홍진경": "UCkxbPwdaV74Erdxt97Nt23w",
    "안녕하세요 최화정이에요": "UCA9kvKQdNxslWm5IKZgXS_A",
    "김숙티비": "UCvAewWPqooIUgQUsjhTmUVw",
    "이영자 TV": "UC-js9KxuyRoB0b9zlKCgsCg",
    "정준하하하": "UC8dFtyqgm7UqLcJD_sYVJ4w",
    "성시경 SUNG SI KYUNG": "UCl23-Cci_SMqyGXE1T_LYUg",
}

QUERIES = [
    "리츠칼튼 호텔 리뷰", "세인트레지스 호텔 리뷰", "JW 메리어트 호텔 리뷰", "W 호텔 리뷰",
    "에디션 호텔 리뷰", "럭셔리 컬렉션 호텔", "불가리 호텔 리뷰", "웨스틴 호텔 리뷰",
    "르메르디앙 호텔 리뷰", "쉐라톤 호텔 리뷰", "코트야드 메리어트 리뷰", "메리어트 호텔 리뷰",
    "월도프 아스토리아 리뷰", "콘래드 호텔 리뷰", "LXR 호텔 리뷰", "카노피 바이 힐튼 리뷰",
    "힐튼 호텔 리뷰", "큐리오 컬렉션 호텔", "더블트리 힐튼 리뷰",
    "파크 하얏트 리뷰", "안다즈 호텔 리뷰", "알릴라 호텔 리뷰", "그랜드 하얏트 리뷰",
    "톰슨 호텔 리뷰", "하얏트 리젠시 리뷰", "하얏트 센트릭 리뷰",
    "식스센스 호텔 리뷰", "리젠트 호텔 리뷰", "인터컨티넨탈 호텔 리뷰", "킴튼 호텔 리뷰",
    "인디고 호텔 리뷰", "크라운 플라자 호텔 리뷰",
    "래플스 호텔 리뷰", "페어몬트 호텔 리뷰", "소피텔 호텔 리뷰", "반얀트리 호텔 리뷰",
    "풀만 호텔 리뷰", "노보텔 호텔 리뷰", "머큐어 호텔 리뷰",
]


def main():
    ch = json.loads(CH_OUT.read_text()) if CH_OUT.exists() else {}
    qs = json.loads(Q_OUT.read_text()) if Q_OUT.exists() else {}

    def do_ch(item):
        label, cid = item
        if ch.get(label, {}).get("videos"):
            return label, len(ch[label]["videos"]), "cached"
        try:
            vids = yt.channel_search(cid, "호텔", 30)
        except Exception as e:
            return label, 0, f"err {e}"
        ch[label] = dict(channelId=cid, videos=vids)
        return label, len(vids), "ok"

    with ThreadPoolExecutor(max_workers=5) as ex:
        for label, n, st in ex.map(do_ch, CHANNELS.items()):
            print(f"CH {label}: {n} ({st})", flush=True)
    CH_OUT.write_text(json.dumps(ch, ensure_ascii=False))

    def do_q(query):
        if qs.get(query):
            return query, len(qs[query]), "cached"
        for attempt in range(2):
            try:
                rows = yt.search(query, 25)
                qs[query] = rows
                return query, len(rows), "ok"
            except Exception as e:
                err = e
        return query, 0, f"err {err}"

    with ThreadPoolExecutor(max_workers=5) as ex:
        for query, n, st in ex.map(do_q, QUERIES):
            print(f"Q {query}: {n} ({st})", flush=True)
    Q_OUT.write_text(json.dumps(qs, ensure_ascii=False))
    print("done", len(ch), len(qs))


if __name__ == "__main__":
    main()
