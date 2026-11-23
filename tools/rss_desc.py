#!/usr/bin/env python3
"""Fill descriptions for each channel's latest videos from the YouTube RSS feed."""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path("/workspace/dailyfoodfighter")
DATA = ROOT / "data"
STORE = DATA / "desc_store.json"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"


def feed(cid):
    u = "https://www.youtube.com/feeds/videos.xml?channel_id=" + cid
    req = urllib.request.Request(u, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")


def parse(x):
    out = []
    for m in re.finditer(r"<entry>(.*?)</entry>", x, re.S):
        e = m.group(1)
        vid = re.search(r"<yt:videoId>([^<]+)</yt:videoId>", e)
        title = re.search(r"<title>(.*?)</title>", e, re.S)
        desc = re.search(r"<media:description>(.*?)</media:description>", e, re.S)
        pub = re.search(r"<published>([^<]+)</published>", e)
        name = re.search(r"<author>\s*<name>([^<]*)</name>", e)
        if not vid:
            continue
        un = lambda s: (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                        .replace("&quot;", '"').replace("&#39;", "'")) if s else ""
        out.append(dict(videoId=vid.group(1), title=un(title.group(1)) if title else "",
                        description=un(desc.group(1)) if desc else "", date=un(pub.group(1)) if pub else "",
                        channel=un(name.group(1)) if name else ""))
    return out


def main():
    targets = json.loads((DATA / "targets67.json").read_text())
    store = json.loads(STORE.read_text()) if STORE.exists() else {}
    added = 0
    for name, t in targets.items():
        cid = t.get("channelId")
        if not cid:
            continue
        try:
            items = parse(feed(cid))
        except Exception as e:
            print("ERR", name, e)
            continue
        for it in items:
            if it["videoId"] in store and (store[it["videoId"]] or {}).get("description"):
                continue
            store[it["videoId"]] = dict(title=it["title"], channel=name, channelId=cid,
                                        description=it["description"], date=it["date"])
            added += 1
        time.sleep(0.2)
    json.dump(store, open(STORE, "w"), ensure_ascii=False)
    print("rss added", added, "total", len(store))


if __name__ == "__main__":
    main()
