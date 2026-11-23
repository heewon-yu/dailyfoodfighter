#!/usr/bin/env python3
"""Abroad-map YouTube helpers: channel listing + subscriber header via innertube browse (POST)."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

HDR = {"context": yt.CTX}
VIDEOS_TAB = "EgZ2aWRlb3PyBgQKAjoA"


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
    s = json.dumps(j, ensure_ascii=False)
    tok = None
    m = re.search(r'"continuationCommand":\s*\{"token":\s*"((?:[^"\\\\]|\\\\.)*)"', s)
    if m:
        tok = json.loads('"' + m.group(1) + '"')
    return items, tok


def header_info(j):
    s = json.dumps(j, ensure_ascii=False)
    name = ""
    m = re.search(r'"channelMetadataRenderer":\{"title":"((?:[^"\\]|\\.)*)"', s)
    if m:
        name = json.loads('"' + m.group(1) + '"')
    subs = None
    stext = ""
    m = re.search(r'"content":"구독자 ([\d.,]+[만천억]?)명"', s)
    if m:
        stext = "구독자 " + m.group(1) + "명"
        subs = yt.parse_kr(m.group(1))
    else:
        m = re.search(r'구독자 ([\d.,]+[만천억]?)명', s)
        if m:
            stext = "구독자 " + m.group(1) + "명"
            subs = yt.parse_kr(m.group(1))
    return name, subs, stext


def channel(cid, pages=6, query=None):
    """Return header info + videos (optionally channel-search filtered by query)."""
    if query:
        body = {"context": yt.CTX, "browseId": cid, "params": yt._search_params(query)}
    else:
        body = {"context": yt.CTX, "browseId": cid, "params": VIDEOS_TAB}
    j = yt._post("browse", body)
    name, subs, stext = header_info(j)
    out, tok = parse_page(j)
    for _ in range(pages - 1):
        if not tok:
            break
        time.sleep(0.4)
        try:
            j = yt._post("browse", {"context": yt.CTX, "continuation": tok})
        except Exception:
            break
        it, tok = parse_page(j)
        out.extend(it)
        if not it:
            break
    seen, uniq = set(), []
    for v in out:
        if v["videoId"] in seen:
            continue
        seen.add(v["videoId"])
        uniq.append(v)
    return dict(channelId=cid, name=name, subs=subs, subsText=stext, videos=uniq)


def desc(vid):
    """Title/description via innertube next (retries on failure)."""
    for attempt in range(3):
        try:
            j = yt._post("next", {"context": yt.CTX, "videoId": vid})
            s = json.dumps(j, ensure_ascii=False)
            out = yt._next_to_video(vid, s)
            if out.get("title"):
                return out
        except Exception as e:
            time.sleep(2 + 2 * attempt)
    return {}


if __name__ == "__main__":
    for cid in sys.argv[1:]:
        d = channel(cid, pages=1)
        print(f"{cid} | {d['name']} | {d['subsText']} | {d['subs']} | videos={len(d['videos'])}")
        for v in d["videos"][:3]:
            print("   ", v["videoId"], v["title"][:70])
