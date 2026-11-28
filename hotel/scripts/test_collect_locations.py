#!/usr/bin/env python3
"""collect_locations.py 동작 검증 — ① 브라우저 없이 판독/가드 로직 ② 로컬 가짜 디렉터리로 실제 실행.

hilton.com 에 붙지 않는다(Akamai·차단 위험 없음). 대신 실제 Chromium(headless)에
우리와 같은 DOM(카드 `li[data-testid]`, `Use Points` 체크박스, `Select currency` 네이티브 select,
`rel=next` 페이지네이션)을 서빙하고, `collect_brand()` 를 그대로 돌려
현금 모드 판독 → Use Points 토글 → 포인트 판독 → 다음 페이지 → 병합 → 파싱 이 전부 이어지는지 본다.

    python3 hotel/scripts/test_collect_locations.py

브라우저 시나리오는 Chromium 실행이 불가능한 환경(시스템 라이브러리 없음)에서는 SKIP 으로 표시하고
오프라인 로직 검사만 수행한다. 기대: TEST PASSED.

2026-11-28 #28 회귀: `Use Points` 를 끈 직후 카드가 아직 포인트 표기인데 그 숫자를 현금가로 읽어
58곳이 cashAmount == points(=1.0원/P) 로 오염됐다. 이 테스트는 세 가지를 지킨다.
  · delayed — 현금 표기가 늦게 그려지면 기다렸다가 올바른 현금가를 읽는다.
  · stuck   — 포인트 표기가 그대로면 현금가를 비워 둔다(포인트 숫자를 현금가로 쓰지 않는다).
  · instant — 정상 페이지에서도 현금가가 포인트와 같아지지 않는다.
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
  <select id="selectCurrencyConverter">
    <option value="USD">USD - US Dollar</option>
    <option value="KRW">KRW - South Korean Won</option>
  </select>
</label>
<p id="taxNotice">Prices include all taxes and fees in US Dollar.</p>
<ul>{cards}</ul>
{next}
<script>
  var MODE = '{mode}';
  var box = document.getElementById('usePoints');
  function paint() {
    document.querySelectorAll('.pts').forEach(function (el) { el.hidden = !box.checked; });
    document.querySelectorAll('.cash').forEach(function (el) { el.hidden = box.checked; });
  }
  // delayed·stuck 은 'Use Points 가 켜진 상태'로 시작한다(수집기가 끄는 순간을 재현).
  if (MODE !== 'instant') { box.checked = true; paint(); }
  box.addEventListener('change', function () {
    if (MODE === 'stuck') return;              // 카드가 포인트 표기에서 바뀌지 않는다
    if (MODE === 'delayed') { setTimeout(paint, 400); return; }   // React 재렌더처럼 늦게 바뀐다
    paint();
  });
  var cur = document.getElementById('selectCurrencyConverter');
  cur.addEventListener('change', function () {
    // 실제 사이트처럼 통화 변경 시 금액 다시 그리기(KRW면 ₩ 표기)
    document.querySelectorAll('.cash').forEach(function (el) {
      if (cur.value === 'KRW') el.innerHTML = 'From*<br>₩638,000';
    });
    document.getElementById('taxNotice').textContent =
      'Prices include all taxes and fees in ' + (cur.value === 'KRW' ? 'South Korean Won.' : 'US Dollar.');
  });
</script>
</body></html>"""

MODE = "instant"   # instant | delayed | stuck


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
    nxt = '<button type="button" onclick="location.href=\'?page=2\'">Next Page, 2 of 2</button>' if n == 1 else ""
    return PAGE.replace("{cards}", cards).replace("{next}", nxt).replace("{mode}", MODE)


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


class FakePage:
    """브라우저 없이 체크박스 상태/현금 표기 대기를 검사하기 위한 최소 대역."""

    def __init__(self, checked: bool, cash_ready: bool = True, eval_error: bool = False):
        self.checked = checked
        self.cash_ready = cash_ready
        self.eval_error = eval_error
        self.waits = 0

    def evaluate(self, js, arg=None):
        if self.eval_error:
            raise RuntimeError("evaluate 실패")
        return [{"id": "usePoints", "name": "usePoints", "checked": self.checked, "label": "Use Points"}]

    def wait_for_function(self, js, arg=None, timeout=None):
        self.waits += 1
        if not self.cash_ready:
            raise RuntimeError("timeout")
        return True


def offline_checks() -> None:
    """브라우저 없이 '포인트 숫자를 현금가로 쓰지 않는다' 규칙을 확인한다."""
    print("  -- 오프라인 로직")
    check("포인트 카드에서 현금가 안 뽑음",
          cl.cash_from_card_text("Conrad Seoul\nFrom*\n80,000\nPoints/night\nStandard Room Reward"), None)
    check("오염 카드(현금 From* 덧붙임)에서 현금가 안 뽑음",
          cl.cash_from_card_text("Conrad Seoul\nFrom*\n80,000\nPoints/night\nStandard Room Reward\nFrom*\n80,000"), None)
    check("현금 모드 카드에서 현금가", cl.cash_from_card_text("Conrad Seoul\nFrom*\n₩638,000"), "₩638,000")
    check("통화 표기 없는 숫자는 현금가 아님", cl.cash_from_card_text("Conrad Seoul\nFrom*\n638,000"), None)
    check("충돌 감지", cl.find_cash_point_collisions(
        [{"code": "BERWAWA", "points": 80000, "cashAmount": 80000},
         {"code": "SELCICI", "points": 80000, "cashAmount": 485925}]),
        [("BERWAWA", 80000, 80000)])

    check("체크박스 켜짐 감지", cl.points_box_checked(FakePage(checked=True)), True)
    check("체크박스 꺼짐 감지", cl.points_box_checked(FakePage(checked=False)), False)
    check("체크박스 판독 불가는 None", cl.points_box_checked(FakePage(checked=True, eval_error=True)), None)
    check("현금 표기 대기 성공", cl.wait_for_cash_cards(FakePage(checked=False, cash_ready=True), []), True)
    check("현금 표기 대기 실패", cl.wait_for_cash_cards(FakePage(checked=False, cash_ready=False), [], timeout=50), False)


def browser_checks() -> bool:
    """가짜 디렉터리로 collect_brand 를 그대로 돌린다. Chromium 실행 불가면 False."""
    from playwright.sync_api import sync_playwright

    try:
        probe = sync_playwright().start()
        browser = probe.chromium.launch(headless=True)
        browser.close()
        probe.stop()
    except Exception as exc:  # 시스템 라이브러리 부족 등
        print(f"  SKIP 브라우저 시나리오 — Chromium 실행 불가: {type(exc).__name__}")
        return False

    global MODE
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"

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
    check("현금 모드 판정(정상 페이지)", all(p.get("cashMode") for p in pages_out), True)

    recs = [cl.to_record(r, "2026-11-27T17:00:00+09:00", "2026-11-27 17:00 KST") for r in rows]
    recs = [r for r in recs if r]
    check("레코드 4건", len(recs), 4)
    check("레코드에 관측시각", all(r.get("observedAt") for r in recs), True)
    check("현금가=포인트 충돌 없음", cl.find_cash_point_collisions(recs), [])
    print("  log:", " | ".join(log[-6:]))

    # ── 회귀(2026-11-28 #28) ──
    for mode, want_cash, want_cash_mode in (("delayed", 638000, True), ("stuck", None, False)):
        MODE = mode
        srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        rows2, pages2, log2 = [], [], []
        old_wait = cl.CASH_MODE_WAIT_MS
        cl.CASH_MODE_WAIT_MS = 1500
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page(viewport={"width": 1440, "height": 900})
                old_base = cl.BASE
                cl.BASE = f"http://127.0.0.1:{srv.server_port}"
                try:
                    rows2 = cl.collect_brand(page, "conrad-hotels", {"brand": "co", "pages": 1},
                                             max_pages=1, sleep_s=0.2, log=log2, pages_out=pages2)
                finally:
                    cl.BASE = old_base
                    browser.close()
        finally:
            cl.CASH_MODE_WAIT_MS = old_wait
            srv.shutdown()
        sel = {r["code"]: r for r in rows2}.get("SELCICI") or {}
        check(f"[{mode}] 현금 모드 판정", pages2[0].get("cashMode") if pages2 else None, want_cash_mode)
        check(f"[{mode}] 현금가", sel.get("cashAmount"), want_cash)
        check(f"[{mode}] 포인트는 유지", (sel.get("points"), sel.get("rewardType")), (80000, "STANDARD"))
        check(f"[{mode}] 현금가→포인트 오염 없음",
              cl.find_cash_point_collisions([cl.to_record(r, "2026-11-27T17:00:00+09:00", "2026-11-27 17:00 KST")
                                             for r in rows2 if r]), [])
    MODE = "instant"
    return True


def main() -> int:
    offline_checks()
    ran_browser = browser_checks()

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
    print(f"TEST PASSED (오프라인 로직 + {'가짜 디렉터리 2페이지 · 실제 Chromium' if ran_browser else '브라우저 시나리오 SKIP'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
