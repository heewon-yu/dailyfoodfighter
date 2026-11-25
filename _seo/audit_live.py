#!/usr/bin/env python3
"""Read-only production SEO smoke test. Standard library only; no credentials."""
import sys, time, urllib.request, urllib.error, urllib.parse, xml.etree.ElementTree as ET
from html.parser import HTMLParser
from collections import Counter
ORIGIN = "https://dailyfoodfighter.com"
class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canon = []
        self.alt = {}
        self.robots = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "link" and a.get("rel") == "canonical": self.canon.append(a.get("href"))
        if tag == "link" and a.get("rel") == "alternate" and a.get("hreflang"): self.alt[a["hreflang"]] = a.get("href")
        if tag == "meta" and a.get("name") == "robots": self.robots.append(a.get("content",""))
def get(url):
    req=urllib.request.Request(url, headers={"User-Agent":"DailyFoodFighter-SEO-Audit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status,r.geturl(),r.read(),r.headers
    except urllib.error.HTTPError as r: return r.code,r.geturl(),r.read(),r.headers
def norm(u):
    return urllib.parse.unquote(u or "")
def main():
    errors=[]
    def check(ok,msg):
        if not ok: errors.append(msg); print("FAIL",msg)
    for path in ("/__dff_missing_seo_check_20261125__", "/en/__dff_missing_seo_check_20261125__"):
        code,_,_,_=get(ORIGIN+path);check(code==404,f"{path}: expected 404, got {code}")
    code,_,body,_=get(ORIGIN+"/robots.txt")
    check(code==200 and b"Sitemap:" in body and b"{{" not in body,"robots.txt response")
    code,_,body,_=get(ORIGIN+"/sitemap.xml")
    check(code==200,"sitemap HTTP status")
    root=ET.fromstring(body)
    urls=[n.text.strip() for n in root.findall("./{*}url/{*}loc") if n.text]
    check(len(urls)==len(set(map(norm,urls))),"duplicate sitemap URL")
    posts=[u for u in urls if urllib.parse.urlsplit(u).path.startswith(("/posts/","/en/posts/"))]
    print("Sitemap:",len(urls),"posts:",len(posts))
    targets=urls if "--all" in sys.argv else [ORIGIN+"/",ORIGIN+"/en/"]+posts[:4]
    for u in targets:
        check(u.startswith(ORIGIN+"/"),"noncanonical host "+u)
        if not u.startswith(ORIGIN+"/"): continue
        code,final,body,headers=get(u)
        check(code==200 and norm(final)==norm(u),f"{u}: {code} {final}")
        if code!=200: continue
        h=Head();h.feed(body.decode("utf-8",errors="replace"))
        check(list(map(norm,h.canon))==[norm(u)],f"{u}: canonical {h.canon}")
        check(not any("noindex" in x.lower() for x in h.robots) and "noindex" not in headers.get("X-Robots-Tag","").lower(),f"{u}: noindex")
        if u in posts:
            path=urllib.parse.urlsplit(u).path
            ko=ORIGIN+(path[3:] if path.startswith("/en/") else path)
            en=ORIGIN+"/en"+urllib.parse.urlsplit(ko).path
            check({k:norm(v) for k,v in h.alt.items()}=={"ko":norm(ko),"en":norm(en),"x-default":norm(en)},f"{u}: hreflang {h.alt}")
        time.sleep(0.25)
    print("PASS" if not errors else f"{len(errors)} failures")
    return int(bool(errors))
if __name__=="__main__": sys.exit(main())
