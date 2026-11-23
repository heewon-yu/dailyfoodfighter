#!/usr/bin/env python3
"""Fetch video descriptions (and channel/title/date) for collected channel videos.
Parallel, foreground, writes data/desc_store.json incrementally."""
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STORE = DATA / "desc_store.json"
CV = DATA / "channel_videos.json"

_lock = threading.Lock()


def load():
    return json.loads(STORE.read_text()) if STORE.exists() else {}


def save(obj):
    tmp = STORE.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False))
    tmp.replace(STORE)


def fetch(vid):
    for attempt in range(3):
        try:
            d = yt.video(vid)
            if d.get("description") or d.get("title"):
                return vid, dict(title=d.get("title", ""), channel=d.get("channel", ""),
                                 channelId=d.get("channelId", ""), description=d.get("description", ""),
                                 date=d.get("date", ""), views=d.get("views", ""))
            return vid, dict(title=d.get("title", ""), channel=d.get("channel", ""),
                             channelId=d.get("channelId", ""), description="",
                             date=d.get("date", ""), views=d.get("views", ""), empty=True)
        except Exception as e:
            time.sleep(1.5 * (attempt + 1))
    return vid, None


def main():
    n_workers = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    budget = float(sys.argv[2]) if len(sys.argv) > 2 else 270.0
    cv = json.loads(CV.read_text())
    store = load()
    todo = []
    for ch, d in cv.items():
        for v in d["videos"]:
            if v["videoId"] not in store:
                todo.append(v["videoId"])
    print(f"need={len(todo)} have={len(store)}", flush=True)
    t0 = time.time()
    done = [0]

    def work(vid):
        if time.time() - t0 > budget:
            return
        r = fetch(vid)
        with _lock:
            store[r[0]] = r[1]
            done[0] += 1
            if done[0] % 40 == 0:
                save(store)
                print(f"  {done[0]} fetched ({time.time()-t0:.0f}s)", flush=True)

    with ThreadPoolExecutor(max_workers=n_workers) as ex:
        list(ex.map(work, todo))
    save(store)
    print(f"stored total={len(store)} fetched this run={done[0]} in {time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
