#!/usr/bin/env python3
"""Verify candidate restaurants against NAVER Place; append rows to data/verified2.jsonl."""
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import places  # noqa: E402
import verify_batch as vb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "verified2.jsonl"
LOG = DATA / "verify2.log"

FS = re.compile(r"(식당|음식점|빙수|한식|분식|국밥|국수|고기|구이|회|횟집|카페|커피|베이커리|빵|제과|치킨|족발|보쌈|"
                r"곱창|막창|닭|피자|버거|중식|일식|양식|해물|해산물|찌개|탕|전골|면|냉면|떡볶이|김밥|"
                r"초밥|스시|돈까스|라멘|우동|파스타|고깃집|정육|식품|주점|호프|술집|포차|와인|바|디저트|"
                r"아이스크림|빙수|샌드위치|토스트|덮밥|뷔페|마라|쌀국수|양꼬치|찜|백반|한정식|뼈|감자탕|순대)")
NONFOOD = re.compile(r"(관광|명소|박물관|미술관|숙박|호텔|모텔|펜션|리조트|공원|마을|체험|전시|도서관|"
                     r"시장$|휴게소|주차|역$|터미널|서점|병원|약국|은행|편의점|마트|백화점|아울렛|"
                     r"문화|축제|공연|학원|학교|교회|성당|절$|사찰|명가$|농원|농장|축산|수산|도매)")


def load_rows():
    rows = []
    if OUT.exists():
        for line in OUT.read_text().splitlines():
            try:
                rows.append(json.loads(line))
            except Exception:
                pass
    return rows


def load_existing():
    h = (ROOT / "map" / "index.html").read_text()
    m = re.search(r"const listings = \[(.*?)\n\];", h, re.S)
    rows = json.loads("[" + m.group(1) + "]")
    return rows


def norm_key(name, prov):
    n = vb.norm(name)
    n = re.sub(r"(본점|지점|직영점|1호점|2호점)$", "", n)
    return (n, prov)


def verify_one(c):
    st = c.get("street")
    city = c.get("city") or ""
    prov = c.get("prov") or ""
    name = c["name"]
    queries = []
    if st:
        queries.append(f"{city} {st}".strip() if city else f"{prov} {st}".strip())
        queries.append(f"{city} {name}".strip() if city else f"{prov} {name}".strip())
    else:
        queries.append(f"{city} {name}".strip() if city else name)
    pool = {}
    for q in queries[:2]:
        try:
            for r in places.search_place(q, limit=8):
                pool.setdefault(r["id"], r)
        except Exception:
            pass
        if len(pool) >= 8:
            break
    if not pool:
        return None, "no-result"

    def score(r):
        s = 0.0
        rd = vb.norm_prov(r.get("roadAddress") or "") + " " + vb.norm_prov(r.get("address") or "")
        if vb.prov_of(rd):
            s += 0.3 if vb.prov_of(rd) == prov else -0.5
        if st and vb.norm(st).replace(" ", "") in vb.norm(rd):
            s += 1.0
        s += vb.name_match(name, r.get("name") or "")
        if NONFOOD.search(r.get("category") or ""):
            s -= 0.6
        return s

    ranked = sorted(pool.values(), key=score, reverse=True)[:3]
    for r in ranked:
        try:
            det = places.place_detail(r["id"])
        except Exception:
            det = None
        if not det or not det.get("roadAddress"):
            continue
        road = vb.norm_prov(det["roadAddress"])
        rprov = vb.prov_of(road)
        nm = vb.name_match(name, det["name"])
        cat = det.get("category") or ""
        if rprov != prov:
            continue
        if nm < 0.75:
            continue
        if st and vb.norm(st).replace(" ", "") not in vb.norm(road) and nm < 0.95:
            continue
        if not FS.search(cat) or NONFOOD.search(cat):
            return None, "non-food:" + cat
        kind = vb.kind_of(cat, det["name"])
        return dict(store=det["name"].strip(), road=road.strip(), category=cat, kind=kind,
                    menu=vb.menu_of(det.get("menus"), kind), region=rprov,
                    channel=c["channel"], subs=c.get("subs"), videoId=c["videoId"],
                    start=c.get("start"), query=name, pid=r["id"]), None
    return None, "no-match"


def main():
    cands = json.loads((DATA / "cand2.json").read_text())
    # channel name remap by channelId
    targets = json.loads((DATA / "targets67.json").read_text())
    by_cid = {v["channelId"]: k for k, v in targets.items() if v.get("channelId")}

    rows = load_rows()
    done = {(r["query"], r["videoId"]) for r in rows}
    miss = set()
    if LOG.exists():
        for line in LOG.read_text().splitlines()[-4000:]:
            if line.startswith("x "):
                miss.add(tuple(line[2:].split("|")[:2]))

    ex = load_existing()
    ex_keys = {norm_key(r[0], r[1]) for r in ex}
    ex_names = {(vb.norm(r[0]), r[1]) for r in ex}

    todo = []
    for c in cands:
        c2 = dict(c)
        t = targets.get(c["channel"])
        if not t:
            # map via channelId stored in desc_store
            pass
        k = (c["name"], c["videoId"])
        if k in done or k in miss:
            continue
        if norm_key(c["name"], c["prov"]) in ex_keys:
            continue
        todo.append(c2)
    print(f"cands={len(cands)} done={len(rows)} todo={len(todo)}", flush=True)

    t0 = time.time()
    budget = float(sys.argv[1]) if len(sys.argv) > 1 else 260.0
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    lock = threading.Lock()
    n = [0]

    def work(c):
        if time.time() - t0 > budget:
            return
        row, why = verify_one(c)
        with lock:
            n[0] += 1
            with OUT.open("a") as f, LOG.open("a") as g:
                if row:
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
                    g.write(f"OK {row['store']}|{row['road']}|{row['kind']}|{row['channel']}\n")
                    print(f"OK   {row['store']} | {row['road']} | {row['kind']} | {row['channel']}", flush=True)
                else:
                    g.write(f"x {c['name']}|{c['videoId']}|{why}\n")

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(work, todo))
    print(f"processed={n[0]} rows={len(load_rows())} in {time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
