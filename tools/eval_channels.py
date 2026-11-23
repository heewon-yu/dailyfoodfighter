#!/usr/bin/env python3
"""Stage 2: evaluate candidate channels (subscriber count, food relevance), pick new channels."""
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt
import paced

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "videos.json"
CANDS = DATA / "candidates.json"
CHMAP = DATA / "channel_map.json"
NEW = DATA / "new_channels.json"


def load(p, default):
    return json.loads(p.read_text()) if p.exists() else default


def fetch(vid):
    return paced.video(vid)


def main():
    cands = load(CANDS, {})
    chmap = load(CHMAP, {})
    existing_ids = {v["channelId"] for v in chmap.values()}
    existing_ids.add("UCkW3qWVwgkI7mL0eFPVOlPA")
    videos = load(CACHE, {})
    reps = {cid: c["videos"][0] for cid, c in cands.items() if c["videos"]}
    need = [v for v in reps.values() if not (videos.get(v) or {}).get("channelId")]
    print(f"fetching {len(need)} videos for {len(reps)} candidates")
    for i, v in enumerate(need):
        fetch(v)
        if i % 25 == 0:
            print(f"  {i}/{len(need)}")
    paced.flush_log()
    videos = json.loads(CACHE.read_text())

    newch = {}
    for cid, vid in reps.items():
        d = videos.get(vid) or {}
        subs = d.get("subs")
        name = d.get("channel") or cands[cid]["channel"]
        if not subs or subs < 100000:
            continue
        if cid in existing_ids:
            continue
        newch[cid] = dict(name=name, subs=subs, subsText=d.get("subsText"),
                          handle=d.get("handle"), queries=cands[cid]["queries"],
                          videos=cands[cid]["videos"])
    NEW.write_text(json.dumps(newch, ensure_ascii=False, indent=1))
    print(f"{len(newch)} new channels >=100k")
    for cid, v in sorted(newch.items(), key=lambda x: -x[1]["subs"]):
        print(f"  {v['name']} | {v['subsText']} | {','.join(v['queries'][:3])}")


if __name__ == "__main__":
    main()
