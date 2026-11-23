#!/usr/bin/env python3
"""NAVER Place lookups: short-link resolution, place detail (address, category, menu), name search."""
import json
import re
import sys
import time
import urllib.parse
import urllib.request

UA_M = ("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1")


def _get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA_M,
                                              "Referer": "https://map.naver.com/",
                                              "Accept-Language": "ko-KR,ko;q=0.9"})
    return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "ignore")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def resolve_short(url):
    """naver.me/XXXX -> (place_id, kind) or (None, None)."""
    op = urllib.request.build_opener(_NoRedirect)
    try:
        r = op.open(urllib.request.Request(url, headers={"User-Agent": UA_M}), timeout=20)
        loc = r.headers.get("Location")
    except urllib.error.HTTPError as e:
        loc = e.headers.get("Location")
    if not loc:
        return None, None
    m = re.search(r"/(?:entry/)?(place|restaurant|cafe)/(\d+)", loc) or \
        re.search(r"placePath.*?(\d{6,})", loc)
    if m:
        if m.lastindex == 2:
            return m.group(2), m.group(1)
        return m.group(1), "place"
    m = re.search(r"/(\d{6,})", loc)
    return (m.group(1), "place") if m else (None, None)


def _apollo(html):
    i = html.find("__APOLLO_STATE__")
    if i < 0:
        return {}
    j = html[i + len("__APOLLO_STATE__"):]
    j = j.lstrip(" =")
    depth = 0
    end = None
    for k, ch in enumerate(j):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = k + 1
                break
    if not end:
        return {}
    try:
        return json.loads(j[:end])
    except Exception:
        return {}


def place_detail(place_id, kind="restaurant"):
    """Return dict(name, category, roadAddress, address, menus[], lat, lon) or None."""
    for path in ("restaurant", "cafe", "place"):
        try:
            h = _get("https://pcmap.place.naver.com/%s/%s/home" % (path, place_id))
        except Exception:
            continue
        st = _apollo(h)
        base = None
        for k, v in st.items():
            if k.startswith("PlaceDetailBase"):
                base = v
                break
        if not base:
            continue
        menus = []
        for k, v in st.items():
            if k.startswith("PlaceMenuItem") and isinstance(v, dict):
                nm = v.get("name")
                if nm and nm not in menus:
                    menus.append(nm)
        lat = lon = None
        for k, v in st.items():
            if k.startswith("Panorama") and isinstance(v, dict):
                lat, lon = v.get("lat"), v.get("lon")
                break
        return dict(id=place_id, name=base.get("name"), category=base.get("category"),
                    roadAddress=base.get("roadAddress"), address=base.get("address"),
                    menus=menus, lat=lat, lon=lon, path=path)
    return None


def search_place(query, limit=8):
    """Return list of dict(id, name, category, address, roadAddress)."""
    u = "https://pcmap.place.naver.com/place/list?query=" + urllib.parse.quote(query)
    try:
        h = _get(u)
    except Exception:
        return []
    st = _apollo(h)
    out = []
    for k, v in st.items():
        if k.startswith("PlaceListBusinessesItem") and isinstance(v, dict):
            out.append(dict(id=v.get("id"), name=v.get("name"),
                            category=v.get("category"),
                            address=v.get("address"),
                            roadAddress=v.get("roadAddress")))
            if len(out) >= limit:
                break
    return out


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "resolve":
        print(resolve_short(sys.argv[2]))
    elif cmd == "detail":
        print(json.dumps(place_detail(sys.argv[2]), ensure_ascii=False, indent=1))
    elif cmd == "search":
        for r in search_place(" ".join(sys.argv[2:])):
            print(r)
