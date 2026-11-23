#!/usr/bin/env python3
"""Refetch videos missing titles (chunked, resumable)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, "/workspace/dailyfoodfighter/tools")
import paced

V = Path("/workspace/dailyfoodfighter/data/videos.json")
videos = json.loads(V.read_text())
need = [vid for vid, vd in videos.items() if not vd.get("title")]
chunk = need[:30]
print("todo", len(need), "chunk", len(chunk), flush=True)
for vid in chunk:
    paced.video(vid, force=True)
paced.flush_log()
print("chunk done", flush=True)
