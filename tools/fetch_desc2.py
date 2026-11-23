#!/usr/bin/env python3
"""Adaptive, rate-limited description fetcher for the 30만+ channel sweep.
- Priority order: venue-review channels first.
- Global pace with cooldown on 429/403.
- Per channel: skip remaining videos when the first N fetched show no place signal.
Writes data/desc_store.json and data/channel_yield.json."""
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STORE = DATA / "desc_store.json"
CV = DATA / "channel_videos.json"
YIELD = DATA / "channel_yield.json"

PRIORITY = [
    "성시경 · 먹을텐데", "풍자 · 또간집", "맛상무", "곽튜브", "재슐랭가이드", "지뉼랭가이드",
    "일상이여행 Everyday travel", "푸디랜드 FoodieLand", "FoodyTrip 푸디트립", "트래블 푸드Travel Food",
    "끼룩푸드 seagull food", "FoodieBoy 푸디보이", "푸드스토리 Food Story", "상해기", "정육왕",
    "하이갱스", "김사원세끼", "맛있겠다 Yummy", "섬마을훈태", "만리 manli", "광마니", "흑백리뷰",
    "jisoujang", "먹갱 [Mukgang]", "맛있겠다", "푸디버디 FOODIE BUDDY", "MAYO FOOD 마요푸드",
    "쿡쿡티비 Cook Cook TV", "스튜디오슬램", "코우지 TV [더 상생]", "이영자 TV", "김숙티비",
    "안녕하세요 최화정이에요", "홍석천이원일", "김나영의 노필터티비", "비밀이야", "더들리",
    "전현무계획 · MBN", "최자로드 · tvN D ENT", "입짧은햇님 · tvN Joy", "SBS STORY · 생활의 달인",
    "ETTV 이티티비", "공부왕찐천재 홍진경", "할명수", "셰프 안성재 Chef Sung Anh", "입질의추천TV jiminTV",
    "큰손 노희영", "운동부 둘이 왔어요", "먹보스 쭈엽이", "떡볶퀸", "야식이", "히밥", "윤호찌",
    "FOODING", "SBS Entertainment", "EBS Documentary", "김종국 GYM JONG KOOK", "침착맨", "공혁준",
    "백종원 · 님아 그 시장을 가오", "쯔양", "쏘영 Ssoyoung", "문복희 Eat with Boki", "야미보이 Yummyboy",
    "햄지", "나름TV (엄마가 된 나름이)", "광마니",
]

SIGNAL = re.compile(
    r"(naver\.me|map\.naver\.com|place\.naver\.com|maps\.app\.goo\.gl|google\.[a-z.]+/maps|"
    r"(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)"
    r"[^\n]{2,40}(?:로|길|동|읍|면)\s?\d*)")

_lock = threading.Lock()
_cooldown = [0.0]
_last = [0.0]
MIN_GAP = 0.45


def load(p, d):
    return json.loads(p.read_text()) if p.exists() else d


def save(obj, p):
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False))
    tmp.replace(p)


def fetch(vid):
    for attempt in range(6):
        with _lock:
            now = time.time()
            if _cooldown[0] > now:
                time.sleep(min(_cooldown[0] - now, 40))
            gap = time.time() - _last[0]
            if gap < MIN_GAP:
                time.sleep(MIN_GAP - gap)
            _last[0] = time.time()
        try:
            d = yt.video(vid)
            return vid, dict(title=d.get("title", ""), channel=d.get("channel", ""),
                             channelId=d.get("channelId", ""), description=d.get("description", ""),
                             date=d.get("date", ""), views=d.get("views", ""))
        except Exception as e:
            code = getattr(e, "code", None)
            if code in (429, 403):
                with _lock:
                    _cooldown[0] = time.time() + 30 + 20 * attempt
                time.sleep(2)
            else:
                time.sleep(2 + attempt)
    return vid, None


def main():
    n_workers = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    budget = float(sys.argv[2]) if len(sys.argv) > 2 else 280.0
    gate = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    cv = load(CV, {})
    store = load(STORE, {})
    y = load(YIELD, {})
    order = []
    seen = set()
    for n in PRIORITY:
        if n in cv and n not in seen:
            order.append(n)
            seen.add(n)
    for n in cv:
        if n not in seen:
            order.append(n)

    queue = []
    for ch in order:
        info = y.setdefault(ch, {"reason": None})
        vids = [v for v in cv[ch]["videos"] if v["videoId"] not in store]
        # count how many of this channel's videos were already inspected
        inspected = [v for v in cv[ch]["videos"] if v["videoId"] in store]
        sig = sum(1 for v in inspected if SIGNAL.search((store.get(v["videoId"]) or {}).get("description") or ""))
        info["inspected"] = len(inspected)
        info["signal"] = sig
        if info.get("reason"):
            continue
        if len(inspected) >= gate and sig == 0:
            info["reason"] = "no-place-signal"
            continue
        for v in vids:
            queue.append((ch, v["videoId"]))

    print(f"queue={len(queue)} have={len(store)} channels={len(cv)}", flush=True)
    t0 = time.time()
    done = [0]
    per_ch = {}

    def work(item):
        ch, vid = item
        if time.time() - t0 > budget:
            return
        r = fetch(vid)
        with _lock:
            if r[1] is None:
                store[r[0]] = {"title": "", "channel": ch, "description": "", "failed": True}
            else:
                store[r[0]] = r[1]
            done[0] += 1
            per_ch[ch] = per_ch.get(ch, 0) + 1
            if done[0] % 100 == 0:
                _save(store, y, per_ch)
                print(f"  {done[0]} in {time.time()-t0:.0f}s", flush=True)

    def _save(store, y, per_ch):
        save(store, STORE)
        save(y, YIELD)

    with ThreadPoolExecutor(max_workers=n_workers) as ex:
        list(ex.map(work, queue))
    save(store, STORE)
    save(y, YIELD)
    print(f"stored={len(store)} fetched={done[0]} in {time.time()-t0:.0f}s", flush=True)
    print("by channel:", json.dumps(per_ch, ensure_ascii=False)[:800], flush=True)


if __name__ == "__main__":
    main()
