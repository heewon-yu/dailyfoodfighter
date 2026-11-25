#!/usr/bin/env python3
"""Match a post's declared per-100 g values against USDA FDC search results.

Read-only helper for the P1 audit: prints candidate FDC entries whose energy /
protein / fat / potassium are closest to the front-matter nutrition block, so a
human can decide whether an FDC ID can be cited for the article's numbers.
"""
import json, re, sys, urllib.request

API = "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY"
KEYS = ["Energy", "Protein", "Total lipid (fat)", "Potassium, K", "Carbohydrate, by difference",
        "Fiber, total dietary", "Water"]


def front_vals(path):
    raw = open(path, encoding="utf-8").read()
    fm = re.match(r"^---\s*\n(.*?)\n---", raw, re.S).group(1)
    out = {}
    for k in ("calories", "proteinContent", "fatContent", "carbohydrateContent", "fiberContent"):
        m = re.search(k + r':\s*"([\d.]+)', fm)
        out[k] = float(m.group(1)) if m else None
    return out


def search(q, n=12):
    req = urllib.request.Request(API, data=json.dumps({"query": q, "pageSize": n,
        "dataType": ["SR Legacy", "Foundation", "Survey (FNDDS)"]}).encode(),
        headers={"Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(req, timeout=40))
    for f in d.get("foods", []):
        g = {x["nutrientName"]: x.get("value") for x in f.get("foodNutrients", [])}
        yield f["fdcId"], f.get("dataType", "")[:10], f["description"], g


for arg in sys.argv[1:]:
    path, q = arg.split("=", 1)
    v = front_vals(path)
    print(f"\n## {path}  (declared kcal {v['calories']} / P {v['proteinContent']} / F {v['fatContent']})")
    for fid, dt, desc, g in search(q):
        print(f"  {fid:>8} {dt:10} {desc[:62]:62} E={g.get('Energy')} P={g.get('Protein')} F={g.get('Total lipid (fat)')} K={g.get('Potassium, K')} C={g.get('Carbohydrate, by difference')}")
