#!/usr/bin/env python3
"""힐튼포숙지도 — 브랜드 디렉터리 자동 수집기 (파이썬만으로 끝까지).

hilton.com 공개 디렉터리 `/en/locations/{brand}/` 8페이지를 **실제 Chrome**으로 순회하며
카드마다 `포인트 · Standard/Premium 라벨 · Sold Out · 현금가(KRW)`를 읽어
`hotel/scripts/data/observed_sample.json` 규격의 JSON을 만든다. 그 결과를
`build_hotel_data.py` 에 넘기면 `hotel/data/hotels.json` 까지 파이썬만으로 이어진다.

■ 왜 브라우저인가 (Akamai)
  curl·직링크·번들 Chromium·headless 는 hilton.com Akamai 가 403(Reference No.)으로 막는다.
  통과하는 것은 **Akamai 센서 쿠키·JS 챌린지를 통과한 실제 Chrome 세션**뿐이고,
  `/book/` 직행도 "예약 흐름을 시작한 적 없는 손님"으로 403 이다.
  그래서 이 스크립트는 (1) 실제 Chrome + headed, (2) `/en/locations/`(robots 허용 경로)만,
  (3) 페이지당 1회 로드 · 2~3초 간격, (4) 403/429/캡차 감지 시 **즉시 중단** 만 한다.

■ 날짜별(3개월) 수집은 하지 않는다 — 2026-11-27 실측
  - `/en/locations/{brand}/?arrivalDate=…&departureDate=…` 는 **날짜를 무시한다**(카드가 계속 '향후 30일 최저',
    각주도 "*Prices are based on current availability over the next 30 days" 그대로).
  - 디렉터리의 날짜 선택은 목적지 입력이 필수이고, Update 를 누르면 `/en/search/{brand}/?query=…&arrivalDate=…` 로
    넘어간다. 이 경로는 robots.txt `User-agent: *` 아래 **`/search/` Disallow**(`/book/`·`/find-hotels/`와 같은 등급)다.
  - 따라서 12월·1월·2월 값은 수집하지 않고, 앱이 카드별 '공식 날짜 조회'(예약 화면)·'같은 도시 날짜 목록'
    링크로 사용자가 직접 확인하게 둔다. `--checkin/--checkout` 은 이 이유로 **의도적으로 미지원**이다(지정 시 안내 후 종료).

■ 실행 (권장: 사람이 한 번 열어 둔 Chrome 에 붙는다)

    # 0) 실제 Chrome 을 CDP 로 띄운다 (macOS)
    open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.hilton-chrome"

    # 1) 오프라인 자기검증(브라우저·네트워크 불필요)
    python3 hotel/scripts/collect_locations.py --self-test

    # 2) 수집 — 8페이지 · KRW · Use Points 토글
    python3 hotel/scripts/collect_locations.py --attach http://127.0.0.1:9222 \
        --out hotel/scripts/data/observed_locations.json \
        --merge-existing hotel/scripts/data/observed_sample.json

    # 3) 앱 데이터 빌드 (파이썬만)
    python3 hotel/scripts/build_hotel_data.py --observed hotel/scripts/data/observed_locations.json

  `--launch` 를 주면 스크립트가 직접 실제 Chrome(channel="chrome", headed)을 띄운다.
  첫 실행에서 쿠키 배너가 있으면 자동으로 `Reject All Cookies → Confirm My Choices` 를 누른다.

■ 중단 규칙 (여기서 멈추는 것이 맞다)
  - 문서 응답 401/403/429, `Something went wrong`·`Reference No.`·`Access Denied`·캡차 문구
  - 카드가 0장인 페이지(구조 변경·차단). 받은 페이지까지의 결과만 저장하고 exit 3.
  - 한 브랜드의 페이지 수가 설정(max-pages)을 넘으면 그 브랜드만 중단.

■ 출력
  { meta:{collectedAt, method, pages:[…], currency, warnings:[…]}, records:[{name,brand,points,
    rewardType,cashAmount,cashCurrency,cashBasis,observedAt,observedAtLabel}], raw:{brand:[[card,…]]} }
  rewardType: STANDARD | PREMIUM | SOLD_OUT | NO_POINTS
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
HERE = Path(__file__).resolve().parent
DATA = HERE / "data"

# 디렉터리 8페이지 = Waldorf 3 + Conrad 3 + LXR 2 (2026-11-27 실측)
BRANDS = {
    "waldorf-astoria": {"brand": "wa", "pages": 3},
    "conrad-hotels": {"brand": "co", "pages": 3},
    "lxr-hotels": {"brand": "lx", "pages": 2},
}
BASE = "https://www.hilton.com/en/locations"
CARD_SEL = 'li[data-testid^="hotel-card-"]'
CASH_MODE_WAIT_MS = 20000   # Use Points 해제 후 현금 표기로 바뀌기를 기다리는 최대 시간

HALT_TEXT = (
    "Something went wrong",
    "Reference No.",
    "Access Denied",
    "Pardon Our Interruption",
    "Verify you are human",
    "captcha",
)
CURRENCY_BASIS = "디렉터리 최저 현금가(향후 30일, Honors 할인 등 최저 요금 · KRW 표시로 판독)"

# 2026-11-28 오염(#28) 재발 방지 — 현금가는 '통화 표기'가 있는 값만 인정한다.
# Use Points 를 끈 직후 React 가 아직 포인트 카드를 그려 두면 숫자만 남는데,
# 그 숫자를 현금가로 읽으면 cashAmount == points(=1.0원/P) 가 된다.
CURRENCY_MARKER = re.compile(
    r"(\u20a9|US\$|\$|\u20ac|\u00a3|\u00a5|\u0e3f|\u20ba|\u20b9|\bKRW\b|\bUSD\b|\bEUR\b|\bJPY\b|"
    r"\bGBP\b|\bTHB\b|\bCNY\b|\bHKD\b|\bSGD\b|\bAUD\b|\bAED\b|\bQAR\b)", re.I)
POINTS_LINE = re.compile(r"^Points\s*/\s*night$", re.I)
FROM_LINE = re.compile(r"^From\*?$", re.I)


def has_currency_marker(text: str | None) -> bool:
    return bool(text and CURRENCY_MARKER.search(text))


def cash_from_card_text(text: str | None, currency_label: str | None = None) -> str | None:
    """카드 텍스트에서 **현금가로 확신할 수 있는** 표기 1건만 고른다. 아니면 None.

    - 카드에 `Points/night` 가 남아 있으면 그 카드는 포인트 모드다 → 현금가 없음(오염 방지 핵심).
    - `From*` 다음 줄이 `Points/night` 로 이어지면 그 숫자는 포인트다 → 건너뛴다.
    - 통화 표기(₩·$·€·¥·KRW …)가 없는 숫자는 화면 통화 안내(currency_label)가 확인된 경우에만 인정한다.
    """
    lines = [ln.strip() for ln in (text or "").split("\n") if ln.strip()]
    if any(POINTS_LINE.match(ln) for ln in lines):
        return None
    candidates: list[str] = []
    for i, ln in enumerate(lines):
        if not FROM_LINE.match(ln):
            continue
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        after = lines[i + 2] if i + 2 < len(lines) else None
        if nxt and not (after and POINTS_LINE.match(after)):
            candidates.append(nxt)
    candidates += [ln for ln in lines if has_currency_marker(ln) and to_int(ln) is not None]
    for cand in candidates:
        if to_int(cand) is None:
            continue
        if has_currency_marker(cand) or currency_label:
            return cand
    return None


def find_cash_point_collisions(records, tol: int = 10) -> list[tuple[str, int, int]]:
    """현금가가 포인트와 같아진 레코드(오염) 목록. 하나라도 있으면 스냅숏을 배포하면 안 된다."""
    hits: list[tuple[str, int, int]] = []
    for r in records or []:
        points, cash = r.get("points"), r.get("cashAmount")
        try:
            if points and cash and abs(int(cash) - int(points)) < tol:
                hits.append((str(r.get("code") or r.get("name") or "?"), int(points), int(cash)))
        except (TypeError, ValueError):
            continue
    return hits

# 카드 안에서 한 번에 뽑는 원자료. 해석은 파이썬(parse_card)이 한다 — 오프라인 테스트가 가능하도록.
READ_JS = """
(sel) => {
  const cards = [...document.querySelectorAll(sel)].map((li) => {
    const a = li.querySelector('a[href*="/en/hotels/"]');
    return {
      testid: li.getAttribute('data-testid') || '',
      href: a ? a.getAttribute('href') : null,
      text: li.innerText || '',
    };
  });
  const body = document.body ? document.body.innerText : '';
  const m = body.match(/Prices include all taxes and fees in ([^.\\n]+)\\./);
  return { cards, currencyLabel: m ? m[1].trim() : null, bodySample: body.slice(0, 4000) };
}
"""

CASH_MODE_JS = """
(sel) => {
  const cards = [...document.querySelectorAll(sel)];
  if (!cards.length) return false;
  return cards.every((li) => {
    const t = li.innerText || '';
    if (/Points\\s*\\/\\s*night/i.test(t)) return false;
    return /[\u20a9$\u20ac\u00a3\u00a5\u0e3f\u20ba\u20b9]/.test(t) || /Sold Out|Coming Soon/i.test(t);
  });
}
"""

CHECKBOX_JS = """
() => [...document.querySelectorAll('input[type="checkbox"]')].map((i) => ({
  id: i.id || '', name: i.name || '', checked: !!i.checked,
  label: ((i.closest('label') || {}).innerText || '').trim()
}))
"""

CURRENCY_JS = """
() => {
  const out = { selects: [], buttons: [] };
  document.querySelectorAll('select').forEach((s) => {
    out.selects.push([...s.options].map((o) => ({ value: o.value, label: o.textContent.trim() })));
  });
  document.querySelectorAll('button, [role="button"]').forEach((b) => {
    const t = (b.innerText || b.getAttribute('aria-label') || '').trim();
    if (/currency/i.test(t)) out.buttons.push(t);
  });
  return out;
}
"""


class Halt(Exception):
    """차단·구조 변경 — 더 진행하지 않고 지금까지 것을 저장한다."""

    def __init__(self, kind: str, detail: str = ""):
        super().__init__(f"{kind}: {detail}")
        self.kind = kind
        self.detail = detail


# ─── 파싱 (순수 함수 · --self-test 로 검증) ─────────────────────────────────
def to_int(text: str | None):
    if not text:
        return None
    digits = re.sub(r"[^\d]", "", str(text))
    return int(digits) if digits else None


def currency_of(text: str | None, label: str | None):
    """금액 표기 → 통화 코드.

    금액에 붙은 통화 기호·코드가 가장 확실한 증거이므로 그것을 먼저 믿고,
    숫자만 남은 경우에만 화면의 'Prices include … in Korean Won' 문구로 판단한다.
    """
    if text:
        t = text.strip()
        if t.startswith("₩") or t.upper().startswith("KRW"):
            return "KRW"
        for sym, code in (("US$", "USD"), ("CN¥", "CNY"), ("HK$", "HKD"), ("S$", "SGD"),
                          ("A$", "AUD"), ("JP¥", "JPY"), ("$", "USD"), ("¥", "JPY"), ("€", "EUR"),
                          ("£", "GBP"), ("฿", "THB"), ("₺", "TRY"), ("₹", "INR"),
                          ("AED", "AED"), ("QAR", "QAR")):
            if t.startswith(sym) or (len(sym) >= 3 and sym in t.upper()[:5]):
                return code
    if label and "korean won" in label.lower():
        return "KRW"
    return None


def parse_card(card: dict, brand: str, currency_label: str | None) -> dict:
    """카드 1장(원자료) → 관측 레코드 후보.

    규칙(가이드 3절 함정):
      - 포인트 모드: 'Points/night' 바로 앞 줄이 포인트.
      - 라벨은 'Standard Room Reward' / 'Premium Room Rewards' 텍스트만 인정.
      - 포인트가 없는데 금액이 남아 있으면 '포인트 없음(현금만)', 'Sold Out' 이면 재고 없음.
      - 코드는 `data-testid="hotel-card-XXXXXXX"` 에서 (슬러그가 바뀌어도 안정적).
    """
    text = card.get("text") or ""
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    code = (card.get("testid") or "").replace("hotel-card-", "").strip().upper() or None
    href = card.get("href") or ""
    slug = re.sub(r"^https?://[^/]+", "", href) if href else None

    # 카드 상단에 사진 캐러셀 카운터('1 / 12')가 먼저 오는 경우가 있다 — 호텔명이 아니다.
    name_lines = [ln for ln in lines if not re.match(r"^\d+\s*/\s*\d+$", ln)] or lines
    lines = name_lines
    name = lines[0] if lines else None
    if name and re.match(r"^(Sold Out|Coming Soon|Featured|New)$", name, re.I) and len(lines) > 1:
        name = lines[1]

    p_idx = next((i for i, ln in enumerate(lines) if re.match(r"^Points/night$", ln, re.I)), None)
    points = to_int(lines[p_idx - 1]) if p_idx not in (None, 0) else None

    reward = next((ln for ln in lines if re.match(r"^(Standard Room Reward|Premium Room Rewards)$", ln, re.I)), None)
    sold_out = any(re.match(r"^Sold Out$", ln, re.I) for ln in lines)

    # 현금가: 현금 모드에서 확인된 값(cashHint) 우선, 없으면 카드 자체 텍스트에서 엄격 판독.
    # 카드에 Points/night 가 남아 있으면 현금가 없음 — 포인트 숫자를 현금가로 쓰지 않는다.
    cash_text = card.get("cashHint") or cash_from_card_text(text, currency_label)

    if points is not None:
        reward_type = "STANDARD" if reward and reward.lower().startswith("standard") else (
            "PREMIUM" if reward and reward.lower().startswith("premium") else None)
        if reward_type is None:
            # 포인트는 있는데 라벨이 없으면 등급 판정 불가 → 저장하지 않는다(추정 금지)
            return {"code": code, "name": name, "brand": brand, "slug": slug,
                    "points": points, "rewardType": None, "skipReason": "LABEL_MISSING"}
    else:
        reward_type = "SOLD_OUT" if sold_out else ("NO_POINTS" if cash_text else "UNKNOWN")

    return {
        "code": code,
        "name": name,
        "brand": brand,
        "slug": slug,
        "points": points,
        "rewardType": reward_type,
        "cashAmount": to_int(cash_text) if cash_text else None,
        "cashCurrency": currency_of(cash_text, currency_label) if cash_text else None,
        "cashText": cash_text,
    }


def to_record(row: dict, observed_at: str, label: str) -> dict | None:
    if not row.get("name") or not row.get("code"):
        return None
    if row.get("rewardType") not in {"STANDARD", "PREMIUM", "SOLD_OUT", "NO_POINTS"}:
        return None
    rec = {
        "name": row["name"],
        "brand": row["brand"],
        "code": row["code"],
        "points": row.get("points"),
        "rewardType": row["rewardType"],
        "observedAt": observed_at,
        "observedAtLabel": label,
    }
    if row.get("cashAmount") is not None:
        rec["cashAmount"] = row["cashAmount"]
        rec["cashCurrency"] = row.get("cashCurrency") or "KRW"
        rec["cashBasis"] = CURRENCY_BASIS
    return rec


# ─── 브라우저 조작 ─────────────────────────────────────────────────────────
def now_kst():
    t = datetime.now(KST).replace(microsecond=0)
    return t.isoformat(), t.strftime("%Y-%m-%d %H:%M KST")


def check_halt(page, status: int | None, where: str):
    if status in (401, 403, 429):
        raise Halt("HTTP_%d" % status, where)
    sample = page.evaluate("() => (document.body && document.body.innerText || '').slice(0, 4000)")
    for token in HALT_TEXT:
        if token.lower() in sample.lower():
            raise Halt("BLOCKED_PAGE", f"{where} · '{token}'")


def accept_cookies(page, log):
    for label in ("Reject All Cookies", "Accept All Cookies"):
        try:
            btn = page.get_by_role("button", name=re.compile(label, re.I)).first
            if btn.is_visible(timeout=1500):
                btn.click(timeout=3000)
                page.wait_for_timeout(400)
                for confirm in ("Confirm My Choices", "Save Settings", "Confirm"):
                    try:
                        c = page.get_by_role("button", name=re.compile(confirm, re.I)).first
                        if c.is_visible(timeout=1000):
                            c.click(timeout=2500)
                            break
                    except Exception:
                        continue
                log.append(f"cookie: {label}")
                return True
        except Exception:
            continue
    return False


def set_currency_krw(page, log) -> bool:
    """Select currency → KRW. 실패해도 수집은 계속(현금 통화는 화면 표기에서 판별)."""
    # 현재 Locations는 명시적인 native select를 제공한다. DOM 탐색보다 이 경로를
    # 먼저 써야 React 재렌더링 중 다른 select(Sort by)를 잘못 잡지 않는다.
    try:
        currency = page.locator("#selectCurrencyConverter")
        if currency.count():
            currency.select_option(value="KRW", timeout=5000)
            page.wait_for_timeout(1800)
            log.append("currency: select KRW - South Korean Won")
            return True
    except Exception:
        pass

    try:
        info = page.evaluate(CURRENCY_JS)
    except Exception:
        info = {"selects": [], "buttons": []}

    for options in info.get("selects") or []:
        for opt in options:
            if re.search(r"\bKRW\b|South Korean Won", opt.get("label", ""), re.I):
                try:
                    page.locator("#selectCurrencyConverter").select_option(value=opt.get("value") or "KRW")
                    page.wait_for_timeout(1500)
                    log.append(f"currency: select {opt['label']}")
                    return True
                except Exception:
                    pass

    for label in info.get("buttons") or ["Select currency"]:
        try:
            btn = page.get_by_role("button", name=re.compile(re.escape(label), re.I)).first
            if not btn.is_visible(timeout=2000):
                continue
            btn.click(timeout=3000)
            page.wait_for_timeout(500)
            search = page.locator('input[type="search"], input[placeholder*="urrenc" i]').first
            try:
                if search.is_visible(timeout=1200):
                    search.fill("KRW")
                    page.wait_for_timeout(400)
            except Exception:
                pass
            opt = page.get_by_text(re.compile(r"KRW\s*[-–]\s*South Korean Won|South Korean Won", re.I)).first
            opt.click(timeout=4000)
            page.wait_for_timeout(1500)
            log.append("currency: KRW 선택")
            return True
        except Exception:
            continue
    log.append("currency: KRW 선택 실패 — 화면 통화 표기 그대로 판독")
    return False


def toggle_use_points(page, log) -> bool:
    try:
        boxes = page.evaluate(CHECKBOX_JS)
    except Exception:
        boxes = []
    target = next((b for b in boxes if "point" in (b.get("label") or "").lower()), None)
    if target and target.get("checked"):
        log.append("usePoints: 이미 켜져 있음")
        return True
    if target:
        try:
            sel = f'#{target["id"]}' if target.get("id") else f'input[name="{target["name"]}"]'
            page.check(sel, timeout=3000)
            page.wait_for_timeout(1800)
            log.append("usePoints: 체크")
            return True
        except Exception:
            pass
    try:
        page.get_by_text(re.compile(r"^Use Points$", re.I)).first.click(timeout=4000)
        page.wait_for_timeout(1800)
        log.append("usePoints: 라벨 클릭")
        return True
    except Exception:
        log.append("usePoints: 켜지 못함 — 포인트 판독 불가")
        return False


def points_box_checked(page) -> bool | None:
    """Use Points 체크박스가 켜져 있는지. 판독 불가면 None."""
    try:
        boxes = page.evaluate(CHECKBOX_JS)
    except Exception:
        return None
    return any("point" in (b.get("label") or "").lower() and b.get("checked") for b in boxes)


def uncheck_use_points(page, log) -> bool:
    """Use Points 를 끄고 **실제로 꺼졌는지 확인**한다. 확인되지 않으면 False."""
    for _ in range(2):
        checked = points_box_checked(page)
        if checked is None:
            log.append("usePoints: 체크박스 판독 실패")
            return False
        if not checked:
            return True
        try:
            boxes = page.evaluate(CHECKBOX_JS)
            target = next((b for b in boxes if "point" in (b.get("label") or "").lower() and b.get("checked")), None)
            sel = f'#{target["id"]}' if target and target.get("id") else (
                f'input[name="{target["name"]}"]' if target and target.get("name") else None)
            if sel is None:
                raise RuntimeError("selector 없음")
            page.uncheck(sel, timeout=3000)
            page.wait_for_timeout(1500)
            log.append("usePoints: 현금 모드로 해제")
        except Exception:
            try:
                page.get_by_text(re.compile(r"^Use Points$", re.I)).first.click(timeout=3000)
                page.wait_for_timeout(1500)
                log.append("usePoints: 라벨 클릭으로 해제")
            except Exception:
                log.append("usePoints: 해제 실패")
                return False
    return points_box_checked(page) is False


def wait_for_cash_cards(page, log, timeout: int | None = None) -> bool:
    """Use Points 해제 후 카드가 실제로 **현금 표기**로 다시 그려질 때까지 기다린다.

    모든 카드에서 `Points/night` 가 사라지고 통화 표기(또는 Sold Out)가 보여야 True.
    False 면 그 페이지의 금액은 현금가로 쓰지 않는다(포인트 숫자를 현금가로 오독 방지).
    """
    try:
        page.wait_for_function(CASH_MODE_JS, arg=CARD_SEL,
                               timeout=CASH_MODE_WAIT_MS if timeout is None else timeout)
        return True
    except Exception:
        return False


def read_page(page):
    data = page.evaluate(READ_JS, CARD_SEL)
    return data.get("cards") or [], data.get("currencyLabel")


def wait_for_real_cards(page, timeout=30000):
    """React 로딩용 hotel-card-skeleton이 실제 호텔 카드로 바뀔 때까지 대기."""
    page.wait_for_function(
        "sel => { const cards = [...document.querySelectorAll(sel)]; "
        "return cards.length > 0 && cards.every((el) => "
        "!((el.getAttribute('data-testid') || '').includes('skeleton'))); }",
        arg=CARD_SEL, timeout=timeout,
    )


def next_page(page) -> bool:
    """페이지네이션 '다음' 클릭 후 첫 호텔 카드가 바뀌었는지 확인."""
    try:
        before = page.locator(CARD_SEL).first.get_attribute("data-testid")
    except Exception:
        before = None

    def click_and_verify(el) -> bool:
        try:
            if not el.is_visible(timeout=1500) or not el.is_enabled():
                return False
            label = (el.inner_text(timeout=1000) or "").strip()
            print(json.dumps({"event": "pagination_click", "label": label, "before": before}, ensure_ascii=False), flush=True)
            el.click(timeout=4000)
        except Exception:
            return False
        if not before:
            page.wait_for_timeout(2500)
            return True
        # SPA 교체와 실제 URL 이동을 모두 처리한다. navigation 도중 JS context가
        # 사라질 수 있으므로 wait_for_function 대신 새 locator를 반복 확인한다.
        for _ in range(30):
            try:
                page.wait_for_timeout(500)
                current = page.locator(CARD_SEL).first.get_attribute("data-testid", timeout=1000)
                if current and current != before:
                    print(json.dumps({"event": "pagination_changed", "before": before, "after": current}, ensure_ascii=False), flush=True)
                    return True
            except Exception:
                continue
        print(json.dumps({"event": "pagination_unchanged", "before": before}, ensure_ascii=False), flush=True)
        return False

    candidates = (
        'a[rel="next"]',
        'button[aria-label^="Next Page" i]',
        'a[aria-label^="Next Page" i]',
    )
    # 현재 Hilton은 목록 하단을 여러 번 렌더링한 뒤 페이지 버튼을 붙이는 경우가 있다.
    for attempt in range(1, 7):
        try:
            page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(1500)
        except Exception:
            pass
        for sel in candidates:
            if click_and_verify(page.locator(sel).first):
                return True
        for role, pattern in (("button", r"^Next Page\b"), ("link", r"^Next(?:\s+Page)?$")):
            name_re = re.compile(pattern, re.I)
            el = page.get_by_role(role, name=name_re).first
            try:
                count = page.get_by_role(role, name=name_re).count()
            except Exception:
                count = 0
            print(json.dumps({"event": "pagination_probe", "attempt": attempt, "role": role, "count": count}, ensure_ascii=False), flush=True)
            if click_and_verify(el):
                return True
    return False


def collect_brand(page, brand_dir: str, cfg: dict, max_pages: int, sleep_s: float, log, pages_out):
    brand = cfg["brand"]
    rows = []
    page_limit = min(max_pages, cfg["pages"])
    print(json.dumps({"event": "brand_start", "brand": brand_dir}, ensure_ascii=False), flush=True)
    for page_no in range(1, page_limit + 1):
        url = f"{BASE}/{brand_dir}/" if page_no == 1 else None
        if url:
            resp = page.goto(url, wait_until="domcontentloaded", timeout=60000)
            check_halt(page, resp.status if resp else None, f"{brand_dir} p{page_no}")
            accept_cookies(page, log)
            page.wait_for_timeout(int(sleep_s * 1000))

        try:
            page.wait_for_selector(CARD_SEL, timeout=30000)
            wait_for_real_cards(page)
        except Exception:
            raise Halt("PAGE_EMPTY", f"{brand_dir} p{page_no} 카드 0장")

        # 페이지 이동 시 Hilton이 통화를 호텔 기본값으로 되돌릴 수 있어 매 페이지 재설정한다.
        set_currency_krw(page, log)
        wait_for_real_cards(page)

        # 1) 현금 모드 판독(Use Points 꺼짐) — 해제 확인 + 실제 현금 표기로 재렌더 확인 후에만 읽는다.
        cash_mode = uncheck_use_points(page, log) and wait_for_cash_cards(page, log)
        if cash_mode:
            wait_for_real_cards(page)
            cash_cards, currency_label = read_page(page)
        else:
            cash_cards, currency_label = [], None
            log.append(f"cashMode: {brand_dir} p{page_no} 현금 표기 확인 실패 — 현금가 판독하지 않음")

        # 2) 포인트 모드 판독(Use Points 켬) — 같은 페이지에서 토글 2회, 재로드 없음
        if toggle_use_points(page, log):
            wait_for_real_cards(page)
            point_cards, currency_label2 = read_page(page)
            currency_label = currency_label2 or currency_label
        else:
            point_cards = cash_cards

        cash_by_code = {c["testid"]: c for c in cash_cards}
        merged = []
        for card in point_cards:
            cash = cash_by_code.get(card["testid"])
            # 현금 모드에서 확인된 카드에서만 현금가 후보를 떼어 온다(포인트 카드 숫자 재사용 금지).
            hint = cash_from_card_text(cash.get("text") or "", currency_label) if (cash and cash_mode) else None
            merged.append({**card, "cashHint": hint})

        parsed = [parse_card(c, brand, currency_label) for c in merged]
        kept = [p for p in parsed if p.get("rewardType")]
        rows.extend(kept)
        pages_out.append({
            "brand": brand, "page": page_no, "cards": len(point_cards),
            "kept": len(kept), "currency": currency_label, "cashMode": cash_mode,
        })
        log.append(f"{brand_dir} p{page_no}: 카드 {len(point_cards)} · 저장 {len(kept)} · cashMode={cash_mode}")
        print(json.dumps({
            "event": "page_complete", "brand": brand_dir, "page": page_no,
            "expectedPages": cfg["pages"], "cards": len(point_cards), "kept": len(kept),
            "totalKept": len(rows), "currency": currency_label, "cashMode": cash_mode,
        }, ensure_ascii=False), flush=True)

        if page_no >= page_limit:
            break
        print(json.dumps({"event": "next_page", "brand": brand_dir, "from": page_no}, ensure_ascii=False), flush=True)
        if not next_page(page):
            print(json.dumps({"event": "next_page_missing", "brand": brand_dir, "from": page_no}, ensure_ascii=False), flush=True)
            break
    print(json.dumps({"event": "brand_complete", "brand": brand_dir, "pages": len([p for p in pages_out if p["brand"] == brand]), "kept": len(rows)}, ensure_ascii=False), flush=True)
    return rows


def run_collect(args) -> int:
    from playwright.sync_api import sync_playwright  # 실행 시점에만 필요

    log, pages_out = [], []
    observed_at, label = now_kst()
    rows: list[dict] = []

    with sync_playwright() as p:
        if args.attach:
            browser = p.chromium.connect_over_cdp(args.attach)
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            page = context.new_page()
        else:
            context = p.chromium.launch_persistent_context(
                args.user_data_dir, channel=args.channel, headless=False,
                viewport={"width": 1440, "height": 900},
            )
            page = context.pages[0] if context.pages else context.new_page()

        halted = None
        try:
            for brand_dir, cfg in BRANDS.items():
                if args.brands and brand_dir not in args.brands:
                    continue
                try:
                    rows.extend(collect_brand(page, brand_dir, cfg, args.max_pages, args.sleep, log, pages_out))
                except Halt as exc:
                    halted = exc
                    log.append(f"HALT {exc.kind} — {exc.detail}")
                    break
                except Exception as exc:  # 브랜드 하나 실패로 전체를 잃지 않는다
                    log.append(f"ERROR {brand_dir}: {type(exc).__name__}: {exc}")
                    continue
                finally:
                    page.wait_for_timeout(int(args.sleep * 1000))
        finally:
            try:
                page.close()
            except Exception:
                pass
            try:
                context.close()
            except Exception:
                pass

    records: list[dict] = []
    seen = set()
    for row in rows:
        rec = to_record(row, observed_at, label)
        if rec and rec["code"] not in seen:
            records.append(rec)
            seen.add(rec["code"])

    collisions = find_cash_point_collisions(records)
    if collisions:
        detail = ", ".join(f"{code}:points={p},cash={v}" for code, p, v in collisions[:8])
        log.append(f"ERROR CASH_POINTS_COLLISION — 현금가=포인트 {len(collisions)}건 ({detail})")
        if halted is None:
            halted = Halt("CASH_POINTS_COLLISION", f"{len(collisions)}건 현금가가 포인트와 같음")
        print(json.dumps({"event": "cash_points_collision", "count": len(collisions),
                          "sample": collisions[:8]}, ensure_ascii=False), flush=True)

    if args.merge_existing and Path(args.merge_existing).exists():
        old = json.loads(Path(args.merge_existing).read_text(encoding="utf-8"))
        for rec in old.get("records", []):
            code = (rec.get("code") or "").upper()
            if code and code in seen:
                continue
            if not code:
                records.append(rec)   # 코드가 없던 기존 레코드는 이름으로 남긴다
            else:
                records.append(rec)
        log.append(f"merge: 기존 {len(old.get('records', []))}건 중 새 관측에 없는 레코드 유지")

    out = {
        "meta": {
            "collectedAt": observed_at,
            "collectedAtLabel": label,
            "method": "실제 Chrome(CDP/headed) · /en/locations/ 브랜드 디렉터리 · Select currency=KRW · Use Points 토글 판독",
            "currency": "KRW",
            "targetCount": sum(cfg["pages"] for cfg in BRANDS.values()),
            "observedAt": observed_at,
            "observedAtLabel": label,
            "observedScope": f"브랜드 디렉터리 8페이지 자동 순회로 영업 중 {len(records)}곳 관측(collect_locations.py)",
            "sources": [f"{BASE}/{b}/ (1~{cfg['pages']}페이지)" for b, cfg in BRANDS.items()],
            "pages": pages_out,
            "warnings": log,
            "halted": None if not halted else {"kind": halted.kind, "detail": halted.detail},
            "pageNote": "표시 값은 힐튼 디렉터리 기준 '향후 30일 현재 재고 최저 포인트'이며 특정 날짜 값이 아니다.",
        },
        "records": records,
        "raw": rows,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    counts = {}
    for rec in records:
        counts[rec.get("rewardType")] = counts.get(rec.get("rewardType"), 0) + 1
    print(json.dumps({"out": str(out_path), "records": len(records), "counts": counts,
                      "pages": len(pages_out), "halted": bool(halted), "warnings": log[-4:]},
                     ensure_ascii=False))
    if halted:
        print(f"STOPPED — {halted.kind} ({halted.detail}). 받은 페이지까지 저장했다. 45~60분 뒤 새 세션으로 재개.", file=sys.stderr)
        return 3
    return 0


# ─── 오프라인 자기검증 ─────────────────────────────────────────────────────
FIXTURes = [
    # 포인트 모드 · Standard
    {"testid": "hotel-card-SELCICI", "href": "/en/hotels/conrad-seoul/",
     "text": "Conrad Seoul\nSeoul, South Korea\nFrom*\n140,000\nPoints/night\nStandard Room Reward"},
    # 포인트 모드 · Premium만
    {"testid": "hotel-card-TYOCICI", "href": "/en/hotels/conrad-tokyo/",
     "text": "Conrad Tokyo\nTokyo, Japan\nFrom*\n293,000\nPoints/night\nPremium Room Rewards"},
    # Sold Out
    {"testid": "hotel-card-BODWAWA", "href": "/en/hotels/waldorf-astoria-bodrum/",
     "text": "Susona Bodrum, LXR Hotels & Resorts\nBodrum, Türkiye\nSold Out"},
    # 포인트 없음(현금만)
    {"testid": "hotel-card-TYOGAJA", "href": "/en/hotels/gajoen-tokyo/",
     "text": "Hotel Gajoen Tokyo\nTokyo, Japan\nFrom*\n₩96,991\nHonors Discount Advance Purchase"},
    # 2026-11-28 실측: 카드 innerText 가 사진 캐러셀 카운터('1 / 12')로 시작한다 — 호텔명이 아니다
    {"testid": "hotel-card-BERWAWA", "href": "/en/hotels/waldorf-astoria-berlin/",
     "text": "1 / 12\nWaldorf Astoria Berlin\nBerlin, Germany\nFrom*\n€285\nStandard Room Reward"},
    # 2026-11-28 오염 재현 — Use Points 해제 직후 아직 포인트 카드가 남은 상태에서
    # 현금 모드 판독값을 그대로 붙여 둔 경우(현금가 = 포인트 숫자). 현금가로 읽으면 안 된다.
    {"testid": "hotel-card-JRSWAWA", "href": "/en/hotels/waldorf-astoria-jerusalem/",
     "text": "1 / 12\nWaldorf Astoria Jerusalem\nJerusalem, Israel\nFrom*\n312,000\nPoints/night\nStandard Room Reward\nFrom*\n312,000"},
]


def self_test() -> int:
    fails = []
    ran = []

    def check(name, got, want):
        ran.append(name)
        if got != want:
            fails.append((name, got, want))
            print(f"  FAIL {name}: got={got!r} want={want!r}")
        else:
            print(f"  ok   {name}")

    rows = [parse_card(c, "co" if "CICI" in c["testid"] else "wa", "South Korean Won") for c in FIXTURes]
    check("코드 추출", [r["code"] for r in rows], ["SELCICI", "TYOCICI", "BODWAWA", "TYOGAJA", "BERWAWA", "JRSWAWA"])
    check("Standard 판정", rows[0]["rewardType"], "STANDARD")
    check("Standard 포인트", rows[0]["points"], 140000)
    check("Premium만 판정", rows[1]["rewardType"], "PREMIUM")
    check("Premium 포인트", rows[1]["points"], 293000)
    check("Sold Out 판정", rows[2]["rewardType"], "SOLD_OUT")
    check("현금만 판정", rows[3]["rewardType"], "NO_POINTS")
    check("현금 금액(₩)", rows[3]["cashAmount"], 96991)
    check("현금 통화", rows[3]["cashCurrency"], "KRW")
    check("캐러셀 카운터는 호텔명이 아니다", rows[4]["name"], "Waldorf Astoria Berlin")
    check("카운터 카드 현금가", rows[4]["cashAmount"], 285)
    check("카운터 카드 통화", rows[4]["cashCurrency"], "EUR")

    # 회귀(2026-11-28 #28): 포인트 카드가 남은 상태의 숫자를 현금가로 읽지 않는다
    check("오염 재현 카드: 현금가 없음", rows[5]["cashAmount"], None)
    check("오염 재현 카드: 포인트 유지", (rows[5]["points"], rows[5]["rewardType"]), (312000, "STANDARD"))
    check("오염 재현 카드: 이름", rows[5]["name"], "Waldorf Astoria Jerusalem")
    check("포인트 카드 텍스트 직접 판독", cash_from_card_text(FIXTURes[5]["text"], "South Korean Won"), None)
    check("통화 표기 없는 숫자는 현금가 아님", cash_from_card_text("From*\n312,000", None), None)
    check("통화 표기 숫자는 현금가", cash_from_card_text("From*\n₩312,000", None), "₩312,000")
    check("현금 모드 From* 판독", cash_from_card_text(FIXTURes[3]["text"], None), "₩96,991")
    check("현금가=포인트 충돌 감지",
          find_cash_point_collisions([{"code": "JRSWAWA", "points": 312000, "cashAmount": 312000},
                                      {"code": "OK1", "points": 80000, "cashAmount": 638000}]),
          [("JRSWAWA", 312000, 312000)])
    check("정상 레코드 충돌 없음",
          find_cash_point_collisions([{"code": "OK1", "points": 80000, "cashAmount": 638000}]), [])

    # collect_brand 병합 경로 — 현금 모드에서 확인한 값을 cashHint 로 넘긴 경우만 현금가로 인정
    merged = {"testid": "hotel-card-SELCICI", "href": "/en/hotels/conrad-seoul/",
              "text": "Conrad Seoul\nSeoul, South Korea\nFrom*\n140,000\nPoints/night\nStandard Room Reward",
              "cashHint": "₩638,000"}
    m = parse_card(merged, "co", "South Korean Won")
    check("포인트+현금 병합", (m["points"], m["rewardType"]), (140000, "STANDARD"))
    check("cashHint 는 현금가로 인정", m["cashAmount"], 638000)

    # 2026-11-28 이전 방식(포인트 카드 텍스트에 'From*\n<숫자>'를 덧붙이던 경로) — 이제 현금가 아님
    legacy = {"testid": "hotel-card-SELCICI", "href": "/en/hotels/conrad-seoul/",
              "text": "Conrad Seoul\nSeoul, South Korea\nFrom*\n140,000\nPoints/night\nStandard Room Reward\nFrom*\n140,000"}
    lm = parse_card(legacy, "co", "South Korean Won")
    check("옛 병합 경로는 현금가 없음", lm["cashAmount"], None)
    check("현금가 없는 포인트 카드", rows[0]["cashAmount"], None)

    rec = to_record(rows[0], "2026-11-27T16:00:00+09:00", "2026-11-27 16:00 KST")
    check("레코드 스키마", (rec["rewardType"], rec["code"], rec["brand"]), ("STANDARD", "SELCICI", "co"))

    if fails:
        print(f"SELFTEST FAILED — {len(fails)}건")
        return 1
    print(f"SELFTEST PASSED (카드 판독 {len(ran)}항목 · 오프라인)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="힐튼 브랜드 디렉터리 자동 수집(실제 Chrome, 파이썬만)")
    ap.add_argument("--attach", default=None, help="실행 중인 Chrome CDP 주소(예: http://127.0.0.1:9222)")
    ap.add_argument("--launch", action="store_true", help="--attach 대신 실제 Chrome을 직접 띄운다")
    ap.add_argument("--channel", default="chrome", help="launch 시 Chrome 채널(기본 chrome)")
    ap.add_argument("--user-data-dir", default=str(Path.home() / ".hilton-chrome"))
    ap.add_argument("--brands", nargs="*", default=None, help="일부 브랜드만(waldorf-astoria conrad-hotels lxr-hotels)")
    ap.add_argument("--max-pages", type=int, default=3, help="브랜드당 최대 페이지(기본 3 · 8페이지=3+3+2)")
    ap.add_argument("--sleep", type=float, default=3.0, help="페이지·조작 사이 간격(초, 기본 3)")
    ap.add_argument("--out", default=str(DATA / "observed_locations.json"))
    ap.add_argument("--merge-existing", default=None, help="기존 observed_sample.json — 새 관측에 없는 레코드 유지")
    ap.add_argument("--self-test", action="store_true", help="브라우저·네트워크 없이 카드 판독 규칙 검증")
    ap.add_argument("--checkin", default=None, help="[미지원] 디렉터리는 날짜를 받지 않는다 — 지정하면 안내 후 종료")
    ap.add_argument("--checkout", default=None, help="[미지원] 위와 같음")
    args = ap.parse_args()

    if args.checkin or args.checkout:
        print(
            "--checkin/--checkout 은 지원하지 않는다. 2026-11-27 실측:\n"
            "  · /en/locations/{brand}/ 는 arrivalDate·departureDate 쿼리를 무시하고 항상 '향후 30일 최저'를 준다.\n"
            "  · 날짜를 고르면 목적지 입력 후 /en/search/{brand}/?query=…&arrivalDate=… 로 이동하며,\n"
            "    /search/ 는 hilton.com robots.txt 에서 User-agent: * Disallow (/book/·/find-hotels/ 와 동급)다.\n"
            "  → 12월·1월·2월 값은 수집하지 않는다. 앱의 '공식 날짜 조회'·'같은 도시 날짜 목록' 링크로 사람이 확인한다.",
            file=sys.stderr,
        )
        return 2

    if args.self_test:
        return self_test()
    if not args.attach and not args.launch:
        ap.error("--attach http://127.0.0.1:9222 또는 --launch 중 하나가 필요하다(Akamai 때문에 실제 Chrome 필수)")
    return run_collect(args)


if __name__ == "__main__":
    sys.exit(main())
