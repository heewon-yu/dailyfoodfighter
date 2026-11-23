#!/usr/bin/env python3
"""채널 구독자 수가 0으로 남은 항목을 영상 ID→채널 ID→구독자 캐시로 채운다."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "map" / "abroads.js"


def main():
    s = MAP.read_text()
    cand = json.loads((ROOT / "data" / "ab2_cand2.json").read_text())
    subs = json.loads((ROOT / "data" / "ab2_subs.json").read_text())
    vy = json.loads((ROOT / "data" / "ab2_verify.json").read_text())
    ch = json.loads((ROOT / "data" / "abroad_ch.json").read_text())
    abroad_subs = json.loads((ROOT / "data" / "abroad_subs.json").read_text())
    vid2cid = {c["videoId"]: c["channelId"] for c in cand}
    name2cid = {}
    for name, v in abroad_subs.items():
        if v.get("channelId"):
            name2cid[name] = v["channelId"]
    name2subs = {name: v["subs"] for name, v in abroad_subs.items() if v.get("subs")}
    # 영상 → 채널명 (검증 캐시)
    vid2name = {vid: v.get("channel", "") for vid, v in vy.items()}
    # 영상별 채널 ID: 후보 데이터 + 채널 목록
    for name, v in ch.items():
        for item in v.get("videos", []):
            vid2name.setdefault(item["videoId"], name)
            if name in name2cid:
                vid2cid.setdefault(item["videoId"], name2cid[name])

    pairs = re.findall(r'channel:"((?:[^"\\]|\\.)*)", id:"([^"]*)", start:null', s)
    changed = 0
    for channel, vid in pairs:
        if re.search(r'^    "%s": [1-9]' % re.escape(channel), s, re.M):
            continue
        val = name2subs.get(channel)
        if not val:
            cid = vid2cid.get(vid) or name2cid.get(channel)
            if cid and subs.get(cid, {}).get("subs"):
                val = subs[cid]["subs"]
        if val:
            s = re.sub(r'^    "%s": 0,$' % re.escape(channel), '    %s: %d,' % (json.dumps(channel, ensure_ascii=False), val), s, flags=re.M)
            changed += 1
    MAP.write_text(s)
    zeros = re.findall(r'^    "(.+?)": 0,$', s, re.M)
    print("filled", changed, "remaining zeros", len(zeros), zeros[:10])


if __name__ == "__main__":
    main()
