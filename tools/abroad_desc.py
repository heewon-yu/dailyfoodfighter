#!/usr/bin/env python3
"""Fetch title/description/subs via watch-page HTML (fast, threaded)."""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "data"
STORE = DATA / "abroad_desc.json"


def fetch(vid):
    for attempt in range(3):
        try:
            h = yt._get("https://www.youtube.com/watch?v=%s&hl=ko" % vid)
            d = yt._video_from_html(vid, h)
            return dict(title=d.get("title", ""), channel=d.get("channel", ""),
                        subs=d.get("subs"), subsText=d.get("subsText", ""),
                        handle=d.get("handle", ""), date=d.get("date", ""),
                        description=(d.get("description") or "")[:3000])
        except Exception as e:
            why = str(e)[:80]
            if "429" in why:
                time.sleep(6 * (attempt + 1))
                continue
            return dict(err=True, title="", channel="", subs=None, description="", why=why)
    return dict(err=True, title="", channel="", subs=None, description="", why="429 retry exhausted")


def main():
    budget = float(sys.argv[1]) if len(sys.argv) > 1 else 250.0
    only = sys.argv[2] if len(sys.argv) > 2 else "hits"
    ch = json.loads((DATA / "abroad_ch.json").read_text())
    ids = [v["videoId"] for d in ch.values() for v in d["videos"]]
    if only == "hits":
        from abroad_scan import brand_of  # noqa: E402
        qs = json.loads((DATA / "abroad_q.json").read_text())
        # keep only channel videos whose title hits a brand, plus all global hits
        keep = []
        for lbl, d in ch.items():
            for v in d["videos"]:
                if brand_of(v["title"])[0]:
                    keep.append(v["videoId"])
        for lst in qs.values():
            for v in lst:
                keep.append(v["videoId"])
        ids = list(dict.fromkeys(keep))
    ids = list(dict.fromkeys(ids))
    store = {}
    if STORE.exists():
        store = json.loads(STORE.read_text())
    todo = [i for i in ids if i not in store or store[i].get("err")]
    print(f"total={len(ids)} todo={len(todo)}", flush=True)
    t0 = time.time()

    def work(vid):
        if time.time() - t0 > budget:
            return None
        return vid, fetch(vid)

    with ThreadPoolExecutor(max_workers=3) as ex:
        for i, r in enumerate(ex.map(work, todo)):
            if r:
                store[r[0]] = r[1]
            if i and i % 150 == 0:
                STORE.write_text(json.dumps(store, ensure_ascii=False))
    STORE.write_text(json.dumps(store, ensure_ascii=False))
    bad = sum(1 for v in store.values() if v.get("err"))
    print(f"stored={len(store)} errors={bad} in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
