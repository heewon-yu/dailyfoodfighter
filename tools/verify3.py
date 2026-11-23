#!/usr/bin/env python3
"""Verify cand3.json against NAVER Place (link or name+address) -> data/verified3.jsonl."""
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, "/workspace/dailyfoodfighter/tools")
import places  # noqa: E402
import verify_batch as vb  # noqa: E402

DATA = Path("/workspace/dailyfoodfighter/data")
OUT = DATA / "verified3.jsonl"
LOG = DATA / "verify3.log"
MAP = Path("/workspace/dailyfoodfighter/map/index.html")

FS = re.compile(r"(식당|음식점|빙수|한식|분식|국밥|국수|고기|육류|구이|회|횟집|카페|커피|베이커리|빵|제과|치킨|족발|"
                r"보쌈|곱창|막창|닭|피자|버거|중식|일식|양식|해물|해산물|찌개|탕|전골|면|냉면|떡볶이|김밥|"
                r"초밥|스시|돈까스|돈가스|라멘|우동|파스타|정육|주점|호프|술집|포차|와인|디저트|아이스크림|"
                r"샌드위치|토스트|덮밥|뷔페|마라|쌀국수|양꼬치|찜|백반|한정식|감자탕|순대|죽|만두|오리|양고기|"
                r"태국|베트남|인도|멕시코|남미|이자카야|선술집|주막|분식|떡|과자|식품|요리)")
NONFOOD = re.compile(r"(관광|명소|박물관|미술관|숙박|호텔|모텔|펜션|리조트|공원|체험|전시|도서관|휴게소|"
                     r"주차|터미널|서점|병원|약국|은행|편의점|마트|백화점|아울렛|문화|축제|공연|학원|학교|"
                     r"교회|성당|사찰|농원|농장|축산|수산|도매|기업|빌딩|건물|공사|공방|스튜디오|사무|"
                     r"아파트|부동산|주유소|세차|렌터카|여행사|은신처)")


def norm_key(name, prov):
    n = vb.norm(name)
    n = re.sub(r"(본점|지점|직영점|호점)$", "", n)
    return (n, prov)


def load_existing():
    h = MAP.read_text()
    rows = json.loads("[" + re.search(r"const listings = \[(.*?)\n\];", h, re.S).group(1) + "]")
    return rows


def detail_row(pid, c, prov_hint=None, st=None, name=None):
    try:
        det = places.place_detail(pid)
    except Exception:
        return None, "detail-fail"
    if not det or not det.get("roadAddress"):
        return None, "no-road"
    road = vb.norm_prov(det["roadAddress"])
    rprov = vb.prov_of(road)
    if not rprov:
        return None, "no-prov"
    if prov_hint and rprov != prov_hint:
        return None, "prov-mismatch"
    cat = det.get("category") or ""
    if NONFOOD.search(cat) or not FS.search(cat):
        return None, "non-food:" + cat
    nm = vb.name_match(name or "", det["name"])
    if st and vb.norm(st).replace(" ", "") not in vb.norm(road) and nm < 0.9:
        return None, "street-mismatch"
    kind = vb.kind_of(cat, det["name"])
    return dict(store=det["name"].strip(), road=road.strip(), category=cat, kind=kind,
                menu=vb.menu_of(det.get("menus"), kind), region=rprov,
                channel=c["channel"], subs=c.get("subs"), videoId=c["videoId"],
                start=c.get("start"), query=c["name"], pid=pid), None


def verify_one(c):
    name, st, prov = c["name"], c.get("street"), c.get("prov")
    if c.get("link"):
        try:
            pid, _ = places.resolve_short(c["link"])
        except Exception:
            pid = None
        if pid:
            row, why = detail_row(pid, c, prov, None, name)
            if row:
                return row, None
    city = c.get("city") or ""
    queries = []
    if st:
        queries.append(f"{city} {st}".strip() if city else f"{prov} {st}".strip())
    queries.append(f"{city} {name}".strip() if city else f"{prov} {name}".strip())
    pool = {}
    for q in queries:
        try:
            for r in places.search_place(q, limit=8):
                pool.setdefault(r["id"], r)
        except Exception:
            pass
        if len(pool) >= 6:
            break
    if not pool:
        return None, "no-result"

    def score(r):
        s = vb.name_match(name, r.get("name") or "")
        rd = vb.norm_prov(r.get("roadAddress") or "") + " " + vb.norm_prov(r.get("address") or "")
        if st and vb.norm(st).replace(" ", "") in vb.norm(rd):
            s += 1.0
        if prov and prov in rd:
            s += 0.3
        return s

    for r in sorted(pool.values(), key=score, reverse=True)[:2]:
        row, why = detail_row(r["id"], c, prov, st, name)
        if row:
            return row, None
    return None, "no-match"


def main():
    cands = json.loads((DATA / "cand3.json").read_text())
    done = set()
    for p in (DATA / "verified2.jsonl", OUT):
        if p.exists():
            for line in p.read_text().splitlines():
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                done.add((r["query"], r["videoId"]))
                done.add((vb.norm(r["store"]), r["region"]))
    miss = set()
    if LOG.exists():
        for line in LOG.read_text().splitlines():
            if line.startswith("x "):
                parts = line[2:].split("|")
                miss.add((parts[0], parts[1] if len(parts) > 1 else ""))
    ex = load_existing()
    ex_keys = {norm_key(r[0], r[1]) for r in ex}
    ex_names = {(vb.norm(r[0]), r[1]) for r in ex}

    todo = []
    for c in cands:
        if (c["name"], c["videoId"]) in done or (c["name"], c["videoId"]) in miss:
            continue
        if (vb.norm(c["name"]), c.get("prov")) in done:
            continue
        if norm_key(c["name"], c.get("prov")) in ex_keys or (vb.norm(c["name"]), c.get("prov")) in ex_names:
            continue
        todo.append(c)
    print(f"cands={len(cands)} todo={len(todo)}", flush=True)
    budget = float(sys.argv[1]) if len(sys.argv) > 1 else 260
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    t0 = time.time()
    lock = threading.Lock()
    n = [0, 0]

    def work(c):
        if time.time() - t0 > budget:
            return
        row, why = verify_one(c)
        with lock:
            n[0] += 1
            with OUT.open("a") as f, LOG.open("a") as g:
                if row:
                    n[1] += 1
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
                    g.write(f"OK {row['store']}|{row['road']}\n")
                    print(f"OK {row['store']} | {row['road']} | {row['kind']} | {row['channel']}", flush=True)
                else:
                    g.write(f"x {c['name']}|{c['videoId']}|{why}\n")

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(work, todo))
    print(f"processed={n[0]} ok={n[1]} in {time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
