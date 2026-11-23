#!/usr/bin/env python3
"""채널 홈 헤더에서 구독자 수를 정확히 읽는다 (사이드바 추천 채널 값과 섞이지 않게 헤더만 사용)."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "map" / "abroads.js"
CACHE = ROOT / "data" / "ab2_subs3.json"
VIDEOS_TAB = "EgZ2aWRlb3PyBgQKAjoA"


def header_subs(cid):
    j = yt._post("browse", {"context": yt.CTX, "browseId": cid, "params": VIDEOS_TAB})
    s = json.dumps(j, ensure_ascii=False)
    head = s[:60000]
    m = re.search(r'"metadataParts":\s*\[\{"text":\s*\{"content":\s*"구독자 ([\d.,]+[만천억]?)명"', s)
    if not m:
        m = re.search(r'"content":\s*"구독자 ([\d.,]+[만천억]?)명"', head)
    name = ""
    mm = re.search(r'"channelMetadataRenderer":\{"title":"((?:[^"\\]|\\.)*)"', s)
    if mm:
        name = json.loads('"' + mm.group(1) + '"')
    return {"name": name, "subs": yt.parse_kr(m.group(1)) if m else None,
            "subsText": ("구독자 " + m.group(1) + "명") if m else ""}


def main():
    s = MAP.read_text()
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    cand = json.loads((ROOT / "data" / "ab2_cand2.json").read_text())
    abroad_subs = json.loads((ROOT / "data" / "abroad_subs.json").read_text())
    abroad_ch = json.loads((ROOT / "data" / "abroad_ch.json").read_text())
    vid2cid = {c["videoId"]: c["channelId"] for c in cand if c.get("channelId")}
    name2cid = {n: v["channelId"] for n, v in abroad_subs.items() if v.get("channelId")}
    for name, v in abroad_ch.items():
        for it in v.get("videos", []):
            if v.get("channelId"):
                vid2cid.setdefault(it["videoId"], v["channelId"])
        if v.get("channelId"):
            name2cid.setdefault(name, v["channelId"])

    pairs = re.findall(r'channel:"((?:[^"\\]|\\.)*)", id:"([^"]*)", start:null', s)
    chan_cid = {}
    for name, vid in pairs:
        cid = vid2cid.get(vid) or name2cid.get(name)
        if cid:
            chan_cid.setdefault(name, cid)
    todo = [c for c in chan_cid.values() if c not in cache]
    print("channels", len(chan_cid), "todo", len(todo))
    for i, cid in enumerate(todo):
        try:
            cache[cid] = header_subs(cid)
        except Exception as e:
            cache[cid] = {"name": "", "subs": None, "error": str(e)}
        time.sleep(0.05)
        if i % 30 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0))
            print(i, cid, cache[cid], flush=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0))

    # 채널 이름 합치기 (짧은 이름 유지)
    names = list(chan_cid)
    norm = lambda x: re.sub(r"[^0-9a-z가-힣]", "", x.lower())
    rename, used = {}, set()
    for a in sorted(names, key=len, reverse=True):
        if a in used or not norm(a):
            continue
        group = [b for b in names if b != a and b not in used and norm(b) and
                 (norm(b) in norm(a) or norm(a) in norm(b)) and min(len(norm(a)), len(norm(b))) >= 4]
        if group:
            keep = min([a] + group, key=len)
            for g in [a] + group:
                if g != keep:
                    rename[g] = keep
                    used.add(g)
            used.add(keep)
    for old, new in rename.items():
        s = s.replace(f'channel:"{old}"', f'channel:"{new}"')
        if old in chan_cid:
            chan_cid.setdefault(new, chan_cid[old])

    # 채널 블록: 헤더에서 확인한 값 우선, 없으면 기존 값 유지
    old_subs = {k: int(v) for k, v in re.findall(r'^    "(.+?)": (\d+),$', s, re.M)}
    out = {}
    for nm, cid in chan_cid.items():
        val = cache.get(cid, {}).get("subs") or old_subs.get(nm, 0)
        out[nm] = val
    lines = ["  channels: {"]
    for nm in sorted(out, key=lambda n: -out[nm]):
        lines.append(f"    {json.dumps(nm, ensure_ascii=False)}: {out[nm]},")
    lines.append("  },")
    s = re.sub(r"  channels: \{.*?\n  \},", "\n".join(lines), s, count=1, flags=re.S)
    MAP.write_text(s)
    zeros = [n for n, v in out.items() if not v]
    print("renamed", len(rename), list(rename.items())[:5])
    print("channels", len(out), "zeros", zeros)
    print("ddoddunam", out.get("또 떠나는 남자"), "chomad", out.get("초마드"))


if __name__ == "__main__":
    main()
