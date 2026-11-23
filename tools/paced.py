#!/usr/bin/env python3
"""Paced YouTube fetching: shared rate limit, 429 backoff, persistent cache."""
import json
import sys
import threading
import time
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "videos.json"
_lock = threading.Lock()
_last = [0.0]
MIN_GAP = 1.6
_log = []


def _cache_load():
    return json.loads(CACHE.read_text()) if CACHE.exists() else {}


def _cache_save(c):
    CACHE.write_text(json.dumps(c, ensure_ascii=False))


def video(vid, force=False):
    c = _cache_load()
    if not force and vid in c and c[vid].get("channelId"):
        return c[vid]
    for attempt in range(5):
        with _lock:
            gap = time.time() - _last[0]
            if gap < MIN_GAP:
                time.sleep(MIN_GAP - gap)
            _last[0] = time.time()
        try:
            d = yt.video(vid)
            if not d.get("channelId"):
                d["channelId"] = "UNAVAILABLE"
            with _lock:
                c = _cache_load()
                c[vid] = d
                _cache_save(c)
            return d
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503):
                wait = 40 * (attempt + 1)
                _log.append(f"{vid}: {e.code} backoff {wait}s")
                time.sleep(wait)
            else:
                _log.append(f"{vid}: HTTP {e.code}")
                time.sleep(3)
        except Exception as e:
            _log.append(f"{vid}: {type(e).__name__} {e}")
            time.sleep(3)
    return None


def many(vids, workers=2):
    """Fetch sequentially-ish with small worker pool (rate limited globally)."""
    from concurrent.futures import ThreadPoolExecutor
    out = {}
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(video, v): v for v in vids}
        for f, v in futs.items():
            out[v] = f.result()
    return out


def flush_log():
    if _log:
        p = ROOT / "data" / "fetch.log"
        with p.open("a") as fh:
            fh.write("\n".join(_log) + "\n")
        _log.clear()


if __name__ == "__main__":
    vid = sys.argv[1]
    d = video(vid)
    print(json.dumps(d, ensure_ascii=False)[:800])
    flush_log()
