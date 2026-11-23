#!/usr/bin/env python3
"""abroads.js의 모든 영상 ID를 oEmbed로 실사한다 (공개 여부·제목·채널명 대조)."""
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "map" / "abroads.js"
RESULT = ROOT / "data" / "ab2_verify.json"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def norm(s):
    return re.sub(r"[^0-9a-z가-힣]", "", s.lower())


def main():
    s = OUT.read_text()
    pat = re.compile(r'      name:"((?:[^"\\]|\\.)*)", region:"[^"]*", area:"[^"]*", kind:"[^"]*",\n'
                     r'      review:"[^"]*", channel:"((?:[^"\\]|\\.)*)", id:"([^"]*)", start:null,\n'
                     r'      official:"[^"]*",\n(.*?)\n    \},', re.S)
    todo = []
    for m in pat.finditer(s):
        name, channel, vid, body = m.groups()
        todo.append((name, channel, vid, "대표"))
        for rm in re.finditer(r'\{review:"[^"]*", channel:"((?:[^"\\]|\\.)*)", id:"([^"]*)", start:null\}', body):
            todo.append((name, rm.group(1), rm.group(2), "리뷰"))
    print("ids", len(todo))
    results = json.loads(RESULT.read_text()) if RESULT.exists() else {}
    for i, (name, channel, vid, kind) in enumerate(todo):
        if results.get(vid, {}).get("status") in ("ok", "dead"):
            continue
        url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(
            "https://www.youtube.com/watch?v=" + vid, safe="")
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=20)
            d = json.load(r)
            ok = norm(d.get("author_name", ""))[:10] == norm(channel)[:10] or norm(channel)[:10] in norm(d.get("author_name", ""))
            results[vid] = {"status": "ok" if ok else "author_mismatch", "title": d.get("title", ""),
                            "author": d.get("author_name", ""), "place": name, "channel": channel}
        except Exception as e:
            results[vid] = {"status": "dead", "error": str(e), "place": name, "channel": channel, "title": ""}
        if i % 50 == 0:
            print(i, len(results), flush=True)
    RESULT.write_text(json.dumps(results, ensure_ascii=False, indent=0))
    from collections import Counter
    print(Counter(v["status"] for v in results.values()))
    for vid, v in results.items():
        if v["status"] != "ok":
            print(v["status"], vid, v["place"], "|", v["channel"], "|", v.get("author", ""), "|", v.get("title", "")[:50])


if __name__ == "__main__":
    main()
