#!/usr/bin/env python3
"""Description fetcher using watch-page HTML GET (innertube POST is rate-limited).
Adaptive per channel gate, writes desc_store.json."""
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402
from fetch_desc2 import PRIORITY, SIGNAL, load, save  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STORE = DATA / "desc_store.json"
CV = DATA / "channel_videos.json"
YIELD = DATA / "channel_yield.json"

_lock = threading.Lock()
_last = [0.0]
_cooldown = [0.0]
MIN_GAP = 0.4


def fetch(vid):
    for attempt in range(4):
        with _lock:
            now = time.time()
            if _cooldown[0] > now:
                time.sleep(min(_cooldown[0] - now, 45))
            gap = time.time() - _last[0]
            if gap < MIN_GAP:
                time.sleep(MIN_GAP - gap)
            _last[0] = time.time()
        try:
            h = yt._get("https://www.youtube.com/watch?v=" + vid + "&hl=ko")
            d = yt._video_from_html(vid, h)
            d["channel2"] = ""
            return vid, dict(title=d.get("title", ""), channel=d.get("channel", ""),
                             channelId=d.get("channelId", ""), description=d.get("description", ""),
                             date=d.get("date", ""))
        except Exception as e:
            if getattr(e, "code", None) in (429, 403):
                with _lock:
                    _cooldown[0] = time.time() + 45 + 30 * attempt
            time.sleep(2 + 2 * attempt)
    return vid, None


def main():
    n_workers = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    budget = float(sys.argv[2]) if len(sys.argv) > 2 else 280.0
    gate = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    cv = load(CV, {})
    store = load(STORE, {})
    y = load(YIELD, {})
    order, seen = [], set()
    for n in PRIORITY:
        if n in cv and n not in seen:
            order.append(n)
            seen.add(n)
    for n in cv:
        if n not in seen:
            order.append(n)

    queue = []
    for ch in order:
        info = y.setdefault(ch, {})
        if info.get("reason"):
            continue
        inspected = [v for v in cv[ch]["videos"] if (store.get(v["videoId"]) or {}).get("description") is not None
                     and v["videoId"] in store]
        sig = sum(1 for v in inspected if SIGNAL.search((store.get(v["videoId"]) or {}).get("description") or ""))
        info["inspected"], info["signal"] = len(inspected), sig
        if len(inspected) >= gate and sig == 0:
            info["reason"] = "no-place-signal"
            continue
        for v in cv[ch]["videos"]:
            if v["videoId"] not in store or (store[v["videoId"]] or {}).get("failed"):
                queue.append((ch, v["videoId"]))
    print(f"queue={len(queue)} have={len(store)}", flush=True)
    t0 = time.time()
    done = [0]
    per_ch = {}

    def work(item):
        ch, vid = item
        if time.time() - t0 > budget:
            return
        r = fetch(vid)
        with _lock:
            if r[1] is None:
                store[vid] = {"title": "", "channel": ch, "description": "", "failed": True}
            else:
                store[vid] = r[1]
            done[0] += 1
            per_ch[ch] = per_ch.get(ch, 0) + 1
            if done[0] % 200 == 0:
                save(store, STORE)
                print(f"  {done[0]} in {time.time()-t0:.0f}s", flush=True)

    with ThreadPoolExecutor(max_workers=n_workers) as ex:
        list(ex.map(work, queue))
    save(store, STORE)
    save(y, YIELD)
    print(f"stored={len(store)} fetched={done[0]} in {time.time()-t0:.0f}s", flush=True)
    print("by channel:", json.dumps(per_ch, ensure_ascii=False)[:600], flush=True)


if __name__ == "__main__":
    main()
