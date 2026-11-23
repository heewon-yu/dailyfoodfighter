#!/usr/bin/env python3
"""채널 구독자 수·채널 ID를 확인해 캐시에 채운다."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "ab2_subs.json"


def resolve(cid):
    d = yt._post("browse", {"context": yt.CTX, "browseId": cid, "params": "EgZ2aWRlb3PyBgQKAjoA"})
    s = json.dumps(d, ensure_ascii=False)
    m = re.search(r'구독자 ([\d.,]+[만천억]?)명', s)
    mm = re.search(r'"channelMetadataRenderer":\{"title":"((?:[^"\\]|\\.)*)"', s)
    name = json.loads('"' + mm.group(1) + '"') if mm else ""
    handle = ""
    mh = re.search(r'"canonicalBaseUrl":"/(@[\w.-]+)"', s)
    if mh:
        handle = mh.group(1)
    return {"name": name, "subs": yt.parse_kr(m.group(1)) if m else None,
            "subsText": ("구독자 " + m.group(1) + "명") if m else "", "handle": handle}


def main():
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    targets = []
    for f in ["ab2_pick.json"]:
        p = ROOT / "data" / f
        if not p.exists():
            continue
        for r in json.loads(p.read_text()):
            for it in [r] + r.get("others", []):
                if it.get("channelId") and it["channelId"] not in cache:
                    targets.append(it["channelId"])
    targets = list(dict.fromkeys(targets))
    print("todo", len(targets))
    for cid in targets:
        try:
            cache[cid] = resolve(cid)
        except Exception as e:
            cache[cid] = {"name": "", "subs": None, "error": str(e)}
        time.sleep(0.1)
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0))
    print("cache", len(cache))


if __name__ == "__main__":
    main()
