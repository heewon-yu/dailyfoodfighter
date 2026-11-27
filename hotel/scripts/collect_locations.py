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

HALT_TEXT = (
    "Something went wrong",
    "Reference No.",
    "Access Denied",
    "Pardon Our Interruption",
    "Verify you are human",
    "captcha",
)
CURRENCY_BASIS = "디렉터리 최저 현금가(향후 30일, Honors 할인 등 최저 요금 · KRW 표시로 판독)"

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
    """금액 표기 → 통화 코드. 화면의 'Prices include … in Korean Won' 문구를 우선한다."""
    if label and "korean won" in label.lower():
        return "KRW"
    if not text:
        return None
    t = text.strip()
    if t.startswith("₩") or t.upper().startswith("KRW"):
        return "KRW"
    for sym, code in (("US$", "USD"), ("$", "USD"), ("¥", "JPY"), ("JP¥", "JPY"), ("€", "EUR"),
                      ("CN¥", "CNY"), ("HK$", "HKD"), ("S$", "SGD"), ("A$", "AUD"),
                      ("£", "GBP"), ("฿", "THB"), ("₺", "TRY"), ("AED", "AED"), ("QAR", "QAR")):
        if t.startswith(sym) or sym in t.upper()[:4]:
            return code
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

    name = lines[0] if lines else None
    if name and re.match(r"^(Sold Out|Coming Soon|Featured|New)$", name, re.I) and len(lines) > 1:
        name = lines[1]

    p_idx = next((i for i, ln in enumerate(lines) if re.match(r"^Points/night$", ln, re.I)), None)
    points = to_int(lines[p_idx - 1]) if p_idx not in (None, 0) else None

    reward = next((ln for ln in lines if re.match(r"^(Standard Room Reward|Premium Room Rewards)$", ln, re.I)), None)
    sold_out = any(re.match(r"^Sold Out$", ln, re.I) for ln in lines)

    # 현금가: 현금 모드의 "From*" 다음 줄. 없으면 카드에 남은 금액 표기(포인트 재고 없는 호텔).
    cash_text = None
    for i, ln in enumerate(lines):
        if not re.match(r"^From\*$", ln, re.I):
            continue
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        after = lines[i + 2] if i + 2 < len(lines) else None
        # 포인트 모드의 "From* / 140,000 / Points/night" 는 현금가가 아니다 — 건너뛴다.
        if after and re.match(r"^Points/night$", after, re.I):
            continue
        if to_int(nxt) is not None:
            cash_text = nxt
            break
    if cash_text is None:
        cash_text = next((ln for ln in lines if re.match(r"^([₩$€¥£฿]|US\$|KRW|KR\s?W)", ln)), None)

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
    try:
        info = page.evaluate(CURRENCY_JS)
    except Exception:
        info = {"selects": [], "buttons": []}

    for options in info.get("selects") or []:
        for opt in options:
            if re.search(r"\bKRW\b|South Korean Won", opt.get("label", ""), re.I):
                try:
                    page.select_option("select", label=opt["label"])
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


def uncheck_use_points(page, log):
    try:
        boxes = page.evaluate(CHECKBOX_JS)
        target = next((b for b in boxes if "point" in (b.get("label") or "").lower() and b.get("checked")), None)
        if target:
            sel = f'#{target["id"]}' if target.get("id") else f'input[name="{target["name"]}"]'
            page.uncheck(sel, timeout=3000)
            page.wait_for_timeout(1500)
            log.append("usePoints: 현금 모드로 해제")
    except Exception:
        pass


def read_page(page):
    data = page.evaluate(READ_JS, CARD_SEL)
    return data.get("cards") or [], data.get("currencyLabel")


def next_page(page) -> bool:
    """페이지네이션 '다음' 클릭. 같은 내용이면 False."""
    candidates = (
        'a[rel="next"]',
        'button[aria-label*="Next" i]',
        'a[aria-label*="Next" i]',
    )
    for sel in candidates:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=1200) and el.is_enabled():
                el.click(timeout=3000)
                page.wait_for_timeout(2500)
                return True
        except Exception:
            continue
    try:
        el = page.get_by_role("link", name=re.compile(r"^Next\b", re.I)).first
        if el.is_visible(timeout=1200):
            el.click(timeout=3000)
            page.wait_for_timeout(2500)
            return True
    except Exception:
        pass
    return False


def collect_brand(page, brand_dir: str, cfg: dict, max_pages: int, sleep_s: float, log, pages_out):
    brand = cfg["brand"]
    rows = []
    for page_no in range(1, max_pages + 1):
        url = f"{BASE}/{brand_dir}/" if page_no == 1 else None
        if url:
            resp = page.goto(url, wait_until="domcontentloaded", timeout=60000)
            check_halt(page, resp.status if resp else None, f"{brand_dir} p{page_no}")
            accept_cookies(page, log)
            set_currency_krw(page, log)
            page.wait_for_timeout(int(sleep_s * 1000))

        try:
            page.wait_for_selector(CARD_SEL, timeout=30000)
        except Exception:
            raise Halt("PAGE_EMPTY", f"{brand_dir} p{page_no} 카드 0장")

        # 1) 현금 모드 판독(Use Points 꺼짐)
        uncheck_use_points(page, log)
        cash_cards, currency_label = read_page(page)

        # 2) 포인트 모드 판독(Use Points 켬) — 같은 페이지에서 토글 2회, 재로드 없음
        if toggle_use_points(page, log):
            page.wait_for_timeout(1200)
            point_cards, currency_label2 = read_page(page)
            currency_label = currency_label2 or currency_label
        else:
            point_cards = cash_cards

        cash_by_code = {c["testid"]: c for c in cash_cards}
        merged = []
        for card in point_cards:
            cash = cash_by_code.get(card["testid"])
            text = card.get("text") or ""
            if cash:
                # 포인트 모드에서 사라진 현금가를 현금 모드 판독값으로 채운다
                cash_lines = [ln.strip() for ln in (cash.get("text") or "").split("\n") if ln.strip()]
                f_idx = next((i for i, ln in enumerate(cash_lines) if re.match(r"^From\*$", ln, re.I)), None)
                cash_text = cash_lines[f_idx + 1] if f_idx is not None and f_idx + 1 < len(cash_lines) else None
                if cash_text and not re.search(r"^Points/night$", cash_text, re.I):
                    text = text + "\nFrom*\n" + cash_text
            merged.append({**card, "text": text})

        parsed = [parse_card(c, brand, currency_label) for c in merged]
        kept = [p for p in parsed if p.get("rewardType")]
        rows.extend(kept)
        pages_out.append({
            "brand": brand, "page": page_no, "cards": len(point_cards),
            "kept": len(kept), "currency": currency_label,
        })
        log.append(f"{brand_dir} p{page_no}: 카드 {len(point_cards)} · 저장 {len(kept)}")

        if page_no >= cfg["pages"] and max_pages == cfg["pages"]:
            break
        if not next_page(page):
            break
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
                args=["--disable-blink-features=AutomationControlled"],
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
    check("코드 추출", [r["code"] for r in rows], ["SELCICI", "TYOCICI", "BODWAWA", "TYOGAJA"])
    check("Standard 판정", rows[0]["rewardType"], "STANDARD")
    check("Standard 포인트", rows[0]["points"], 140000)
    check("Premium만 판정", rows[1]["rewardType"], "PREMIUM")
    check("Premium 포인트", rows[1]["points"], 293000)
    check("Sold Out 판정", rows[2]["rewardType"], "SOLD_OUT")
    check("현금만 판정", rows[3]["rewardType"], "NO_POINTS")
    check("현금 금액(₩)", rows[3]["cashAmount"], 96991)
    check("현금 통화", rows[3]["cashCurrency"], "KRW")

    # 현금 모드에서 온 From* 줄을 포인트 카드에 덧붙였을 때 (collect_brand 병합 경로)
    merged = {"testid": "hotel-card-SELCICI", "href": "/en/hotels/conrad-seoul/",
              "text": "Conrad Seoul\nSeoul, South Korea\nFrom*\n140,000\nPoints/night\nStandard Room Reward\nFrom*\n638,000"}
    m = parse_card(merged, "co", "South Korean Won")
    check("포인트+현금 병합", (m["points"], m["rewardType"]), (140000, "STANDARD"))
    check("포인트 카드의 From*은 현금가가 아니다", m["cashAmount"], 638000)
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
