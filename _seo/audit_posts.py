#!/usr/bin/env python3
"""Read-only, repeatable SEO triage of all Markdown posts; findings are not clinical verification."""
import argparse, csv, json, re
from pathlib import Path
from collections import Counter
P = argparse.ArgumentParser()
P.add_argument("--root", default=".")
P.add_argument("--output", default="/tmp/dff-post-audit.csv")
a=P.parse_args()
root=Path(a.root)
rows=[]
ref_re=re.compile(r'https?://(?:doi\.org|pubmed\.ncbi\.nlm\.nih\.gov|pmc\.ncbi\.nlm\.nih\.gov|fdc\.nal\.usda\.gov)/[^\s)"<]+')
risk_re=re.compile(r'치료한다|완치|안전합니다|하루 [\d~–]+g|해독|10배|근본적으로|cures |guaranteed|safe for|daily is safe|detox|100% bioavailability',re.I)
link_re=re.compile(r'/(?:en/)?posts/[a-z0-9-]+/')
for file in sorted((root/"_posts").glob("*.md")):
    raw=file.read_text(encoding="utf-8")
    fm=re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$',raw,re.S)
    if not fm:
        rows.append(dict(file=file.name,flags="invalid_frontmatter"));continue
    front,body=fm.groups()
    def field(k):
        m=re.search(r'^'+re.escape(k)+r':\s*(.*?)\s*$',front,re.M)
        return m.group(1).strip('"\'') if m else ""
    flags=[]
    title,description,lang,url=(field(x) for x in ("title","description","lang","permalink"))
    for k,v in (("title",title),("description",description),("lang",lang),("permalink",url)):
        if not v:flags.append("missing_"+k)
    refs=ref_re.findall(body)
    if not refs:flags.append("direct_reference_link_review")
    risks=risk_re.findall(body)
    if risks:flags.append("medical_claim_review")
    json_errors=0
    for block in re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>\s*(.*?)\s*</script>',body,re.S):
        try:json.loads(block)
        except ValueError:json_errors+=1
    if json_errors:flags.append("invalid_jsonld")
    links=sorted(set(link_re.findall(body)))
    if not links:flags.append("missing_internal_links")
    rows.append(dict(file=file.name,title=title,description=description,lang=lang,url=url,category=field("category"),references=len(refs),risk_hits=len(risks),faq="FAQPage" in body,nutrition="servingSize:" in front,links="|".join(links),flags=";".join(flags)))
urls=Counter(r.get("url","") for r in rows if r.get("url"))
titles=Counter(r.get("title","") for r in rows if r.get("title"))
for r in rows:
    url=r.get("url",""); flags=r.get("flags","").split(";") if r.get("flags") else []
    if url and urls[url]>1:flags.append("duplicate_url")
    if r.get("title") and titles[r["title"]]>1:flags.append("duplicate_title")
    if url.startswith(("/posts/","/en/posts/")):
        pair=url[3:] if url.startswith("/en/") else "/en"+url
        if pair not in urls:flags.append("missing_pair")
    missing=[v for v in r.get("links","").split("|") if v and v not in urls]
    if missing:flags.append("unresolved_internal_link")
    r["unresolved_links"]="|".join(missing)
    r["flags"]=";".join(flags)
keys=["file","url","lang","category","title","description","nutrition","faq","references","risk_hits","links","unresolved_links","flags"]
with open(a.output,"w",encoding="utf-8-sig",newline="") as f:
    w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows(rows)
print(json.dumps({"posts":len(rows),"flags":dict(Counter(flag for r in rows for flag in r.get("flags","").split(";") if flag)),"output":a.output},ensure_ascii=False,indent=2))
