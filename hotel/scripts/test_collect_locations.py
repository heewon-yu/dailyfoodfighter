#!/usr/bin/env python3
"""collect_locations.py 동작 검증 — 로컬 가짜 디렉터리 페이지로 브라우저까지 실제 실행.

hilton.com 에 붙지 않는다(Akamai·차단 위험 없음). 대신 실제 Chromium(headless)에
우리와 같은 DOM(카드 `li[data-testid]`, `Use Points` 체크박스, `Select currency` 네이티브 select,
`rel=next` 페이지네이션)을 서빙하고, `collect_brand()` 를 그대로 돌려
현금 모드 판독 → Use Points 토글 → 포인트 판독 → 다음 페이지 → 병합 → 파싱 이 전부 이어지는지 본다.

    python3 hotel/scripts/test_collect_locations.py

기대: TEST PASSED. 실패하면 수집기가 hilton.com 에서도 같은 지점에서 틀린다.
"""
from __future__ import annotations

import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import collect_locations as cl  # noqa: E402

FAILS = []


def check(name, got, want):
    if got != want:
        FAILS.append((name, got, want))
        print(f"  FAIL {name}: got={got!r} want={want!r}")
    else:
        print(f"  ok   {name}")


CARD = """
<li data-testid="hotel-card-{code}">
  <a href="/en/hotels/{slug}/">{name}</a>
  <p>{city}</p>
  <div class="price">
    <span class="cash">From*<br>{cash}</span>
    <span class="pts" hidden>From*<br>{points}<br>Points/night<br>{label}</span>
    <span class="soldout" hidden>Sold Out</span>
  </div>
</li>
"""

PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><title>fake directory</title></head><body>
<h1>Hotels</h1>
<label><input type="checkbox" id="usePoints"> Use Points</label>
<label>Select currency
  <select id="currency">
    <option value="USD">USD - US Dollar</option>
    <option value="KRW">KRW - South Korean Won</option>
  </select>
</label>
<p id="taxNotice">Prices include all taxes and fees in US Dollar.</p>
<ul>{cards}</ul>
{next}
<script>
  var box = document.getElementById('usePoints');
  box.addEventListener('change', function () {
    document.querySelectorAll('.pts').forEach(function (el) { el.hidden = !box.checked; });
    document.querySelectorAll('.cash').forEach(function (el) { el.hidden = box.checked; });
  });
  var cur = document.getElementById('currency');
  cur.addEventListener('change', function () {
    // 실제 사이트처럼 통화 변경 시 금액 다시 그리기(KRW면 ₩ 표기)
    document.querySelectorAll('.cash').forEach(function (el) {
      if (cur.value === 'KRW') el.innerHTML = 'From*<br>₩638,000';
    });
    // body.innerHTML 전체 교체는 Use Points 이벤트 리스너까지 제거한다.
    // 실제 사이트처럼 통화 안내 문구만 갱신한다.
    document.getElementById('taxNotice').textContent =
      'Prices include all taxes and fees in ' + (cur.value === 'KRW' ? 'South Korean Won.' : 'US Dollar.');
  });
</script>
</body></html>"""


def page_html(n: int) -> str:
    cards = "".join([
        CARD.format(code="SELCICI", slug="conrad-seoul", name="Conrad Seoul", city="Seoul, South Korea",
                    cash="₩638,000", points="80,000", label="Standard Room Reward"),
        CARD.format(code="TYOCICI", slug="conrad-tokyo", name="Conrad Tokyo", city="Tokyo, Japan",
                    cash="¥153,465", points="293,000", label="Premium Room Rewards"),
        CARD.format(code="BODWAWA", slug="susona-bodrum", name="Susona Bodrum", city="Bodrum, Türkiye",
                    cash="", points="", label="").replace(
            '<span class="soldout" hidden>Sold Out</span>', '<span class="soldout">Sold Out</span>'),
    ]) if n == 1 else "".join([
        CARD.format(code="BKKWAWA", slug="waldorf-astoria-bangkok", name="Waldorf Astoria Bangkok",
                    city="Bangkok, Thailand", cash="฿9,900", points="85,000", label="Standard Room Reward"),
    ])
    nxt = '<a rel="next" href="?page=2">Next</a>' if n == 1 else ""
    # PAGE 안의 JavaScript 중괄호는 str.format 자리표시자가 아니다.
    return PAGE.replace("{cards}", cards).replace("{next}", nxt)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        n = 2 if "page=2" in self.path else 1
        body = page_html(n).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"

    from playwright.sync_api import sync_playwright

    log, pages_out, rows = [], [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            old_base = cl.BASE
            cl.BASE = base
            try:
                rows = cl.collect_brand(page, "conrad-hotels", {"brand": "co", "pages": 2},
                                        max_pages=2, sleep_s=0.2, log=log, pages_out=pages_out)
            finally:
                cl.BASE = old_base
                browser.close()
    finally:
        server.shutdown()

    by_code = {r["code"]: r for r in rows}
    check("페이지 2장 순회", len(pages_out), 2)
    check("1페이지 저장 3곳", pages_out[0]["kept"] if pages_out else None, 3)
    check("2페이지 저장 1곳", pages_out[1]["kept"] if len(pages_out) > 1 else None, 1)
    check("코드 수집", sorted(by_code), ["BKKWAWA", "BODWAWA", "SELCICI", "TYOCICI"])
    check("Standard 라벨", by_code["SELCICI"]["rewardType"], "STANDARD")
    check("Standard 포인트", by_code["SELCICI"]["points"], 80000)
    check("현금모드 KRW 병합", by_code["SELCICI"]["cashAmount"], 638000)
    check("현금 통화", by_code["SELCICI"]["cashCurrency"], "KRW")
    check("Premium만", by_code["TYOCICI"]["rewardType"], "PREMIUM")
    check("Sold Out", by_code["BODWAWA"]["rewardType"], "SOLD_OUT")
    check("2페이지 Standard", by_code["BKKWAWA"]["rewardType"], "STANDARD")

    recs = [cl.to_record(r, "2026-11-27T17:00:00+09:00", "2026-11-27 17:00 KST") for r in rows]
    recs = [r for r in recs if r]
    check("레코드 4건", len(recs), 4)
    check("레코드에 관측시각", all(r.get("observedAt") for r in recs), True)
    print("  log:", " | ".join(log[-6:]))

    # 차단 감지 — 403 문서에서 즉시 Halt
    try:
        cl.check_halt(type("P", (), {"evaluate": lambda self, js: "Something went wrong\nReference No. 27.abcd"})(), 200, "test")
        check("차단 문구 감지", False, True)
    except cl.Halt as exc:
        check("차단 문구 감지", exc.kind, "BLOCKED_PAGE")
    try:
        cl.check_halt(type("P", (), {"evaluate": lambda self, js: ""})(), 403, "test")
        check("403 감지", False, True)
    except cl.Halt as exc:
        check("403 감지", exc.kind, "HTTP_403")

    if FAILS:
        print(f"TEST FAILED — {len(FAILS)}건")
        return 1
    print("TEST PASSED (가짜 디렉터리 2페이지 · 실제 Chromium)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
