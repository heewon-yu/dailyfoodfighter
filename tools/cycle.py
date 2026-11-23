#!/usr/bin/env python3
"""One work cycle: fetch descriptions (bounded), then re-extract & verify candidates."""
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, "/workspace/dailyfoodfighter/tools")
DATA = Path("/workspace/dailyfoodfighter/data")
STORE = DATA / "desc_store.json"
CV = DATA / "channel_videos.json"

fetch_budget = float(sys.argv[1]) if len(sys.argv) > 1 else 140
verify_budget = float(sys.argv[2]) if len(sys.argv) > 2 else 130


def run(budget, script_args):
    t0 = time.time()
    p = subprocess.run([sys.executable] + script_args, capture_output=True, text=True)
    print(p.stdout[-1500:], p.stderr[-500:], flush=True)


if __name__ == "__main__":
    t0 = time.time()
    p = subprocess.run([sys.executable, "tools/fetch_desc3.py", "4", str(fetch_budget), "30"],
                       capture_output=True, text=True, cwd="/workspace/dailyfoodfighter")
    print("FETCH:", p.stdout[-600:], flush=True)
    p = subprocess.run([sys.executable, "tools/extract3.py"], capture_output=True, text=True,
                       cwd="/workspace/dailyfoodfighter")
    print("EXTRACT:", p.stdout[-400:], flush=True)
    left = verify_budget - (time.time() - t0)
    if left > 40:
        p = subprocess.run([sys.executable, "tools/verify3.py", str(int(left - 10)), "6"],
                           capture_output=True, text=True, cwd="/workspace/dailyfoodfighter")
        print("VERIFY:", p.stdout[-500:], flush=True)
