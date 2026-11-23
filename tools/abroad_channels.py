#!/usr/bin/env python3
"""Resolve YouTube channel IDs for abroad-map creator set (channel-filtered search)."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def search_channels(query, limit=8):
    """Innertube search restricted to channels (sp=EgIQAg%3D%3D)."""
    j = yt._post("search", {"context": yt.CTX, "query": query, "params": "EgIQAg%3D%3D"})
    s = json.dumps(j, ensure_ascii=False)
    out = []
    for m in re.finditer(r'"channelRenderer":\s*\{', s):
        start = m.end() - 1
        depth = 0
        i = start
        while i < len(s):
            if s[i] == '{':
                depth += 1
            elif s[i] == '}':
                depth -= 1
                if depth == 0:
                    break
            i += 1
        try:
            r = json.loads(s[start:i + 1])
        except Exception:
            continue
        cid = r.get("channelId")
        if not cid:
            continue
        title = (r.get("title", {}).get("simpleText") or
                 "".join(x.get("text", "") for x in r.get("title", {}).get("runs", [])))
        subs = r.get("videoCountText", {}).get("simpleText", "")
        sc = r.get("subscriberCountText", {}).get("simpleText", "")
        handle = ""
        mh = re.search(r'"canonicalBaseUrl":"/(@[\w.-]+)"', json.dumps(r, ensure_ascii=False))
        if mh:
            handle = mh.group(1)
        out.append(dict(channelId=cid, title=title, subsText=sc or subs, handle=handle))
        if len(out) >= limit:
            break
    return out


def main():
    names = sys.argv[1:]
    for name in names:
        rows = search_channels(name, 5)
        print("##", name)
        for r in rows:
            print("   ", r["channelId"], "|", r["title"], "|", r["subsText"], "|", r["handle"])


if __name__ == "__main__":
    main()
