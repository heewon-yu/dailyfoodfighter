#!/usr/bin/env python3
"""Second sweep: brand-scoped channel search for brief-named creators + subscriber lookup."""
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "data"
CH = DATA / "abroad_ch.json"
SUBS = DATA / "abroad_subs.json"

# creators the brief names that produced no brand hit with the generic "호텔" query
SECOND = {
    "여락이들_": "UCgDlijNPh7yHQNv0YdL11fQ",
    "꾸준 kkujun": "UCxgeEPgtd5Aw7HgoEUXCauA",
    "숙소왕": "UCjqiy656dmN1RhLi_eOdD0A",
    "유리소리TV": "UCgfQlzdYhPWRRS05Ld99HwQ",
    "여행가 제이": "UCxU8QX7IRRIW0VLuoWWoxbw",
    "빠니보틀": "UCNhofiqfw5nl-NeDJkXtPvw",
    "원지의하루": "UC9gxOp_-R78phMHmv2bW_sg",
    "채코제": "UCaoqDZPllYXLAH_5OBRLLrw",
    "쏘이": "UCugz3-UlkX2P77PtK1Ju0RA",
    "노마드션": "UCfCOEG2kjX_x4KAdWX-YUcA",
    "모칠레로": "UCUcy82tGagXlj4t1p2todeQ",
    "제이치": "UCrBAMAnRYqG_EuD7TVzkQLQ",
    "테디": "UCewTkRux7toL0N9dR9igLKg",
    "침착맨": "UCUj6rrhMTR9pipbAWBAMvUQ",
    "공부왕찐천재 홍진경": "UCkxbPwdaV74Erdxt97Nt23w",
    "안녕하세요 최화정이에요": "UCA9kvKQdNxslWm5IKZgXS_A",
    "김숙티비": "UCvAewWPqooIUgQUsjhTmUVw",
    "이영자 TV": "UC-js9KxuyRoB0b9zlKCgsCg",
    "정준하하하": "UC8dFtyqgm7UqLcJD_sYVJ4w",
    "성시경 SUNG SI KYUNG": "UCl23-Cci_SMqyGXE1T_LYUg",
}

QUERIES = ["리츠칼튼", "콘래드", "힐튼", "하얏트", "인터컨티넨탈", "메리어트",
           "소피텔", "쉐라톤", "웨스틴", "노보텔", "호텔 리뷰 해외", "럭셔리 호텔"]


def main():
    ch = json.loads(CH.read_text())
    for label, cid in SECOND.items():
        cur = ch.setdefault(label, dict(channelId=cid, videos=[]))
        cur["channelId"] = cid
        have = {v["videoId"] for v in cur["videos"]}

        def one(q):
            try:
                return q, yt.channel_search(cid, q, 12)
            except Exception as e:
                return q, []

        added = 0
        with ThreadPoolExecutor(max_workers=6) as ex:
            for q, rows in ex.map(one, QUERIES):
                for v in rows:
                    if v["videoId"] not in have:
                        have.add(v["videoId"])
                        cur["videos"].append(v)
                        added += 1
        print(f"{label}: +{added} -> {len(cur['videos'])}", flush=True)
    CH.write_text(json.dumps(ch, ensure_ascii=False))

    # subscriber lookup for every channel seen so far
    subs = json.loads(SUBS.read_text()) if SUBS.exists() else {}
    pool = {}
    for label, d in ch.items():
        if d["videos"]:
            pool.setdefault(label, (d["channelId"], d["videos"][0]["videoId"]))
    qs = json.loads((DATA / "abroad_q.json").read_text())
    for lst in qs.values():
        for v in lst:
            if v.get("channel") and v.get("channelId"):
                pool.setdefault(v["channel"], (v["channelId"], v["videoId"]))

    todo = [(k, v) for k, v in pool.items() if k not in subs]

    def look(item):
        label, (cid, vid) = item
        try:
            d = yt.video(vid)
            return label, dict(channelId=cid, subs=d.get("subs"), subsText=d.get("subsText", ""),
                               name=d.get("channel", ""), handle=d.get("handle", ""))
        except Exception as e:
            return label, dict(channelId=cid, subs=None, subsText="", err=str(e))

    with ThreadPoolExecutor(max_workers=6) as ex:
        for label, info in ex.map(look, todo):
            subs[label] = info
    SUBS.write_text(json.dumps(subs, ensure_ascii=False))
    ok = sum(1 for v in subs.values() if (v.get("subs") or 0) >= 100000)
    print(f"subs resolved={len(subs)} ge100k={ok}")


if __name__ == "__main__":
    main()
