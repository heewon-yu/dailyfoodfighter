#!/usr/bin/env python3
"""Collect upload lists per channel (videos tab, paginated) into data/channel_videos.json."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STORE = DATA / "channel_videos.json"
TARGETS = DATA / "targets67.json"


def lockups(o, out):
    if isinstance(o, dict):
        if "lockupViewModel" in o:
            out.append(o["lockupViewModel"])
        for v in o.values():
            lockups(v, out)
    elif isinstance(o, list):
        for v in o:
            lockups(v, out)


def parse_page(j):
    s = json.dumps(j, ensure_ascii=False)
    items = []
    lv = []
    lockups(j, lv)
    for x in lv:
        vid = x.get("contentId")
        if not vid or not re.fullmatch(r"[\w-]{11}", vid):
            continue
        md = x.get("metadata", {}).get("lockupMetadataViewModel", {})
        title = md.get("title", {}).get("content", "")
        meta = json.dumps(md.get("metadata", {}), ensure_ascii=False)
        views = ""
        m = re.search(r"조회수 ([^\"\\\\]+)", meta)
        if m:
            views = m.group(1)
        items.append(dict(videoId=vid, title=title, views=views))
    tok = None
    m = re.search(r'"continuationCommand":\s*\{"token":\s*"((?:[^"\\\\]|\\\\.)*)"', s)
    if m:
        tok = json.loads('"' + m.group(1) + '"')
    return items, tok


def channel_videos(cid, max_pages=4):
    out = []
    try:
        j = yt._post("browse", {"context": yt.CTX, "browseId": cid,
                                "params": "EgZ2aWRlb3PyBgQKAjoA"})
    except Exception as e:
        print("  browse err", e)
        return out
    for p in range(max_pages):
        items, tok = parse_page(j)
        out.extend(items)
        if not tok or not items:
            break
        time.sleep(0.5)
        try:
            j = yt._post("browse", {"context": yt.CTX, "continuation": tok})
        except Exception as e:
            print("  cont err", e)
            break
    # dedupe preserving order
    seen, uniq = set(), []
    for it in out:
        if it["videoId"] in seen:
            continue
        seen.add(it["videoId"])
        uniq.append(it)
    return uniq


def main():
    targets = json.loads(TARGETS.read_text())
    targets["백종원 · 님아 그 시장을 가오"] = {"subs": 5810000,
                                        "channelId": "UCyn-K7rZLXjGl7VXGweIlcA"}
    targets["재슐랭가이드"] = {"subs": 336000, "channelId": "UCzgpOnor-MzT-1iflZil2GQ"}
    targets["일상이여행 Everyday travel"] = {"subs": 315000,
                                        "channelId": "UCgSGT3WawT1QwUnMbjk8S2A"}
    TARGETS.write_text(json.dumps(targets, ensure_ascii=False, indent=1))

    store = json.loads(STORE.read_text()) if STORE.exists() else {}
    names = [n for n in sorted(targets, key=lambda k: -targets[k]["subs"])]
    lo = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    hi = int(sys.argv[2]) if len(sys.argv) > 2 else len(names)
    pages = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    t0 = time.time()
    for i, name in enumerate(names[lo:hi], start=lo):
        if time.time() - t0 > 275:
            print("time budget reached at", i, name, flush=True)
            break
        cid = targets[name]["channelId"]
        if not cid:
            print(f"{i:2d} {name}: NO CHANNEL ID", flush=True)
            continue
        cur = store.get(name, {})
        if cur.get("done") and cur.get("channelId") == cid:
            print(f"{i:2d} {name}: cached {len(cur['videos'])}", flush=True)
            continue
        vids = channel_videos(cid, max_pages=pages)
        store[name] = dict(channelId=cid, subs=targets[name]["subs"], videos=vids, done=True)
        print(f"{i:2d} {name}: {len(vids)} videos", flush=True)
        STORE.write_text(json.dumps(store, ensure_ascii=False))
    tot = sum(len(v["videos"]) for v in store.values())
    print(f"channels stored={len(store)} total videos={tot}")


if __name__ == "__main__":
    main()
