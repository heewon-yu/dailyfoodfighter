#!/usr/bin/env python3
"""Map existing map/index.html channels to YouTube channel IDs (one video each, cached)."""
import json
import sys
import time
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt
import map_data

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "videos.json"
CACHE.parent.mkdir(exist_ok=True)


def load_cache():
    return json.loads(CACHE.read_text()) if CACHE.exists() else {}


def save_cache(c):
    CACHE.write_text(json.dumps(c, ensure_ascii=False, indent=0))


def get_video(vid, cache):
    if vid in cache and cache[vid].get("description") is not None:
        return cache[vid]
    for attempt in range(3):
        try:
            d = yt.video(vid)
            cache[vid] = d
            return d
        except Exception as e:
            time.sleep(1.5 * (attempt + 1))
    return None


def main():
    subs, listings = map_data.load()
    # one representative video per channel
    rep = {}
    for r in listings:
        rep.setdefault(r[6], r[5])
    cache = load_cache()
    need = [v for v in set(rep.values()) if v not in cache]
    print(f"{len(rep)} channels, {len(need)} videos to fetch")
    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(lambda v: get_video(v, cache), need))
    save_cache(cache)
    chmap = {}
    for ch, vid in rep.items():
        d = cache.get(vid)
        if d and d.get("channelId"):
            chmap[ch] = dict(channelId=d["channelId"], ytName=d.get("channel"),
                             subs=d.get("subs"), subsText=d.get("subsText"),
                             sampleVideo=vid)
        else:
            print("MISSING", ch, vid)
    (ROOT / "data" / "channel_map.json").write_text(json.dumps(chmap, ensure_ascii=False, indent=0))
    print(f"mapped {len(chmap)}/{len(rep)}")
    for ch, v in chmap.items():
        print(f"  {ch} -> {v['ytName']} {v['subsText']} {v['channelId']}")


if __name__ == "__main__":
    main()
