#!/usr/bin/env python3
"""YouTube research helpers (no API key): search, channel-scoped search, video details."""
import json
import re
import sys
import urllib.request

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0.0.0 Safari/537.36")
CTX = {"client": {"clientName": "WEB", "clientVersion": "2.20240101.00.00",
                  "hl": "ko", "gl": "KR"}}


def _post(path, body):
    req = urllib.request.Request(
        "https://www.youtube.com/youtubei/v1/" + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "X-Youtube-Client-Name": "1",
                 "X-Youtube-Client-Version": "2.20240101.00.00",
                 "Accept-Language": "ko-KR,ko;q=0.9"})
    return json.load(urllib.request.urlopen(req, timeout=40))


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                              "Accept-Language": "ko-KR,ko;q=0.9"})
    return urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "ignore")


def _vid_dicts(s, limit=40):
    out = []
    for m in re.finditer(r'"videoRenderer":\s*\{', s):
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
        vid = r.get("videoId")
        if not vid:
            continue
        title = ("".join(x.get("text", "") for x in r.get("title", {}).get("runs", []))
                 or r.get("title", {}).get("simpleText", ""))
        ch = r.get("ownerText", {}).get("runs", [{}])
        channel = ch[0].get("text", "") if ch else ""
        chid = (ch[0].get("navigationEndpoint", {}).get("browseEndpoint", {}).get("browseId", "")
                if ch else "")
        out.append(dict(videoId=vid, title=title, channel=channel, channelId=chid,
                        views=r.get("viewCountText", {}).get("simpleText", ""),
                        published=r.get("publishedTimeText", {}).get("simpleText", ""),
                        length=r.get("lengthText", {}).get("simpleText", "")))
        if len(out) >= limit:
            break
    return out


def search(query, limit=30):
    j = _post("search", {"context": CTX, "query": query})
    return _vid_dicts(json.dumps(j, ensure_ascii=False), limit)


def channel_search(channel_id, query, limit=30):
    """Videos of one channel matching a query (channel's own search tab, HTML page)."""
    import urllib.parse
    url = ("https://www.youtube.com/channel/%s/search?query=%s&hl=ko"
           % (channel_id, urllib.parse.quote(query)))
    h = _get(url)
    return _vid_dicts(h, limit)


def _search_params(query):
    # browse params for channel search: base64 protobuf of query
    import base64
    q = query.encode()
    inner = b"\x0a" + bytes([len(q)]) + q
    body = b"\x12" + bytes([len(inner)]) + inner
    return base64.b64encode(body).decode()


def _desc_from_next(s):
    i = s.find('expandableVideoDescriptionBodyRenderer": {')
    if i < 0:
        i = s.find("expandableVideoDescriptionBodyRenderer")
    if i < 0:
        return ""
    seg = s[i:i + 300000]
    m = re.search(r'"attributedDescriptionBodyText":\s*\{"content":\s*"((?:[^"\\]|\\.)*)"', seg)
    if not m:
        return ""
    try:
        return json.loads('"' + m.group(1) + '"')
    except Exception:
        return m.group(1)


def _video_from_html(video_id, h):
    out = {"videoId": video_id}
    m = re.search(r'<meta name="title" content="((?:[^"\\]|\\.)*)"', h)
    try:
        out["title"] = json.loads('"' + m.group(1) + '"') if m else ""
    except Exception:
        out["title"] = m.group(1) if m else ""
    if not out["title"]:
        m = re.search(r'"videoPrimaryInfoRenderer":\{"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"', h)
        if m:
            try:
                out["title"] = json.loads('"' + m.group(1) + '"')
            except Exception:
                out["title"] = m.group(1)
    i = h.find('"attributedDescription"')
    desc = ""
    if i >= 0:
        m = re.match(r'"attributedDescription":\{"content":"((?:[^"\\]|\\.)*)"', h[i:i + 40000])
        if m:
            try:
                desc = json.loads('"' + m.group(1) + '"')
            except Exception:
                desc = m.group(1)
    out["description"] = desc
    own = ""
    m = re.search(r'"videoOwnerRenderer":(.{0,8000})', h, re.S)
    if m:
        own = m.group(1)
    m = re.search(r'"simpleText":"구독자 ([\d.,]+[만천억]?)명"', own)
    out["subsText"] = ("구독자 " + m.group(1) + "명") if m else ""
    out["subs"] = parse_kr(m.group(1)) if m else None
    m = re.search(r'"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"', own)
    try:
        out["channel"] = json.loads('"' + m.group(1) + '"') if m else ""
    except Exception:
        out["channel"] = m.group(1) if m else ""
    m = re.search(r'"canonicalBaseUrl":"/(@[\w.-]+)"', own)
    out["handle"] = m.group(1) if m else ""
    m = re.search(r'"browseId":"(UC[\w-]{22})"', own)
    out["channelId"] = m.group(1) if m else ""
    m = re.search(r'"viewCount":"(\d+)"', h)
    out["views"] = m.group(1) if m else ""
    m = re.search(r'"uploadDate":"(.*?)"', h)
    out["date"] = m.group(1) if m else ""
    return out


def video(video_id):
    """Video details: innertube 'next' endpoint, watch-page HTML fallback."""
    try:
        j = _post("next", {"context": CTX, "videoId": video_id})
        s = json.dumps(j, ensure_ascii=False)
        out = _next_to_video(video_id, s)
        if out.get("channelId"):
            return out
    except Exception:
        pass
    return _video_from_html(video_id, _get("https://www.youtube.com/watch?v=" + video_id + "&hl=ko"))


def _next_to_video(video_id, s):
    out = {"videoId": video_id}
    out = {"videoId": video_id}
    out["description"] = _desc_from_next(s)
    m = re.search(r'"videoPrimaryInfoRenderer":\s*\{"title":\s*\{"runs":\s*\[\{"text":\s*"((?:[^"\\]|\\.)*)"', s)
    out["title"] = json.loads('"' + m.group(1) + '"') if m else ""
    own = ""
    m = re.search(r'"videoOwnerRenderer":(.{0,8000})', s, re.S)
    if m:
        own = m.group(1)
    m = re.search(r'"simpleText":\s*"구독자 ([\d.,]+[만천억]?)명"', own)
    out["subsText"] = ("구독자 " + m.group(1) + "명") if m else ""
    out["subs"] = parse_kr(m.group(1)) if m else None
    m = re.search(r'"title":\s*\{"runs":\s*\[\{"text":\s*"((?:[^"\\]|\\.)*)"', own)
    out["channel"] = json.loads('"' + m.group(1) + '"') if m else ""
    m = re.search(r'"canonicalBaseUrl":\s*"/(@[\w.-]+)"', own)
    out["handle"] = m.group(1) if m else ""
    m = re.search(r'"browseId":\s*"(UC[\w-]{22})"', own)
    out["channelId"] = m.group(1) if m else ""
    m = re.search(r'"viewCount":\s*\{"simpleText":\s*"([^"]+)"', s)
    out["views"] = m.group(1) if m else ""
    m = re.search(r'"dateText":\s*\{"simpleText":\s*"([^"]+)"', s)
    out["date"] = m.group(1) if m else ""
    return out


def parse_kr(t):
    t = t.replace(",", "").strip()
    for unit, mult in (("억", 100000000), ("만", 10000), ("천", 1000)):
        m = re.search(r"([\d.]+)\s*" + unit, t)
        if m:
            return int(float(m.group(1)) * mult)
    m = re.search(r"(\d+)", t)
    return int(m.group(1)) if m else None


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "search":
        for r in search(" ".join(sys.argv[2:]), limit=25):
            print(f"{r['videoId']} | {r['channel']} | {r['views']} | {r['published']} | {r['title'][:80]}")
    elif cmd == "video":
        d = video(sys.argv[2])
        print(f"{d['channel']} | {d['subsText']} | {d['date']} | {d['title'][:70]}")
        print(d["description"][:2500])
    elif cmd == "cs":
        for r in channel_search(sys.argv[2], " ".join(sys.argv[3:])):
            print(f"{r['videoId']} | {r['views']} | {r['title'][:80]}")
