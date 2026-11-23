#!/usr/bin/env python3
"""수록된 모든 채널의 구독자 수를 채널 홈(browse)에서 다시 확인해 channels 블록을 고친다."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "map" / "abroads.js"
CACHE = ROOT / "data" / "ab2_subs2.json"


def resolve(cid):
    j = yt._post("browse", {"context": yt.CTX, "browseId": cid})
    s = json.dumps(j, ensure_ascii=False)
    m = re.search(r'구독자 ([\d.,]+[만천억]?)명', s)
    mm = re.search(r'"channelMetadataRenderer":\{"title":"((?:[^"\\]|\\.)*)"', s)
    name = json.loads('"' + mm.group(1) + '"') if mm else ""
    return {"name": name, "subs": yt.parse_kr(m.group(1)) if m else None,
            "subsText": ("구독자 " + m.group(1) + "명") if m else ""}


def main():
    s = MAP.read_text()
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    cand = json.loads((ROOT / "data" / "ab2_cand2.json").read_text())
    ch = json.loads((ROOT / "data" / "abroad_ch.json").read_text())
    abroad_subs = json.loads((ROOT / "data" / "abroad_subs.json").read_text())
    vid2cid = {c["videoId"]: c["channelId"] for c in cand}
    name2cid = {n: v["channelId"] for n, v in abroad_subs.items() if v.get("channelId")}
    for name, v in ch.items():
        for it in v.get("videos", []):
            vid2cid.setdefault(it["videoId"], v.get("channelId"))
    pairs = re.findall(r'channel:"((?:[^"\\]|\\.)*)", id:"([^"]*)", start:null', s)
    chan_cid = {}
    for name, vid in pairs:
        cid = vid2cid.get(vid) or name2cid.get(name)
        if cid and name not in chan_cid:
            chan_cid[name] = cid
    todo = [c for c in chan_cid.values() if c not in cache]
    print("channels", len(chan_cid), "todo", len(todo))
    for i, cid in enumerate(todo):
        try:
            cache[cid] = resolve(cid)
        except Exception as e:
            cache[cid] = {"name": "", "subs": None, "error": str(e)}
        time.sleep(0.08)
        if i % 40 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0))
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0))

    # channels 블록 재작성
    def val(name):
        cid = chan_cid.get(name)
        if cid and cache.get(cid, {}).get("subs") is not None:
            return cache[cid]["subs"]
        old = re.search(r'^    "%s": (\d+),$' % re.escape(name), s, re.M)
        return int(old.group(1)) if old else 0

    existing_keys = re.findall(r'^    "(.+?)": \d+,$', s, re.M)
    all_names = list(dict.fromkeys(list(chan_cid) + existing_keys))
    names = sorted(all_names, key=lambda n: -val(n))
    lines = ["  channels: {"]
    for n in names:
        lines.append(f"    {json.dumps(n, ensure_ascii=False)}: {val(n)},")
    lines.append("  },")
    block = "\n".join(lines)
    s = re.sub(r"  channels: \{.*?\n  \},", block, s, count=1, flags=re.S)
    MAP.write_text(s)
    zeros = [n for n in names if val(n) == 0]
    print("zeros", len(zeros), zeros)
    print("verified", sum(1 for n in names if cache.get(chan_cid.get(n), {}).get("subs") is not None))


if __name__ == "__main__":
    main()
