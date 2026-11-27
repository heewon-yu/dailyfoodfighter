/* ==========================================================================
   힐튼포숙지도 — 브랜드 디렉터리 판독 스니펫 (읽기 전용)
   --------------------------------------------------------------------------
   대상: https://www.hilton.com/en/locations/{brand}/
         brand = waldorf-astoria | conrad-hotels | lxr-hotels | (그 밖의 브랜드)
   목적: 한 페이지(20곳)의 호텔 코드 · 이름 · 최저 포인트 · Standard/Premium 라벨
         · Sold Out 여부(포인트 모드) / From* 최저 현금가(현금 모드)를 뽑는다.

   실행 전 사람이 직접 하는 두 가지 (스크립트는 클릭하지 않는다)
     1) 쿠키 배너: "Reject All Cookies" → "Confirm My Choices" (최초 1회)
     2) 모드 전환
        · 포인트 판독: 상단 "Use Points" 체크박스 체크
        · 현금 판독:  "Use Points" 체크 해제 (기본 상태)
        · 통화를 원화로:  "Select currency" 에서 KRW - South Korean Won 선택

   실행: 페이지가 완전히 그려진 뒤(카드 20장) DevTools 콘솔에 이 파일을 붙여넣고
         copy(JSON.stringify(window.HILTON_LOCATION_ROWS, null, 1)) 로 복사한다.

   검증: 2026-11-27 15:2x KST, LXR 디렉터리 1페이지에서 20곳 전부 코드와 함께 판독됨.
         카드 컨테이너는 <li data-testid="hotel-card-ITMOLOL"> 처럼 코드가 data-testid 에
         들어 있어, 이름·슬러그가 바뀌어도 코드가 안정적으로 잡힌다.
   ========================================================================== */
(() => {
  'use strict';

  const CARD = 'li[data-testid^="hotel-card-"]';

  // "1,234" / "₩827,200" / "US$120" → 1234 / 827200 / 120
  const toInt = (s) => {
    const digits = String(s).replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
  };

  const rows = [...document.querySelectorAll(CARD)].map((li) => {
    const testid = li.getAttribute('data-testid') || '';
    const code = testid.replace('hotel-card-', '').trim().toUpperCase() || null;

    const link = li.querySelector('a[href*="/en/hotels/"]');
    const name = link ? (link.innerText || '').split('\n')[0].trim() : null;
    const slug = link ? (link.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '') : null;

    const lines = (li.innerText || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    // 포인트 모드:  "From*" / "140,000" / "Points/night" / "Standard Room Reward"
    const pIdx = lines.findIndex((l) => /^Points\/night$/i.test(l));
    const points = pIdx > 0 ? toInt(lines[pIdx - 1]) : null;

    // 라벨은 More Rates 안에서만 정확히 갈린다(디렉터리 카드도 라벨을 함께 노출한다).
    const reward = lines.find((l) => /^(Standard Room Reward|Premium Room Rewards)$/i.test(l)) || null;

    // 현금 모드:  "From*" / "₩96,991" / "Honors Discount Advance Purchase"
    const fIdx = lines.findIndex((l) => /^From\*$/i.test(l));
    const cashRaw = fIdx >= 0 && fIdx + 1 < lines.length ? lines[fIdx + 1] : null;

    // 포인트 모드에서도 포인트 재고가 없는 호텔은 현금가가 그대로 남는다(예: Gajoen Tokyo).
    const soldOut = lines.includes('Sold Out');

    return {
      code,
      name,
      slug,
      points,
      reward,                                   // "Standard Room Reward" | "Premium Room Rewards" | null
      standard: reward === 'Standard Room Reward',
      premiumOnly: reward === 'Premium Room Rewards',
      cashText: points === null ? cashRaw : null, // 포인트가 없을 때만 의미 있는 현금 표기
      cashAmount: points === null ? toInt(cashRaw) : null,
      soldOut,
      stream: points !== null ? 'points' : (cashRaw ? 'cash' : (soldOut ? 'sold_out' : 'none'))
    };
  });

  const page = {
    url: location.href,
    brand: (location.pathname.match(/\/locations\/([^/]+)\//) || [])[1] || null,
    currencyLabel: (document.body.innerText.match(/Prices include all taxes and fees in ([^.\n]+)\./) || [])[1] || null,
    capturedAt: new Date().toISOString(),
    rows
  };

  window.HILTON_LOCATION_ROWS = page;
  console.log(`[hilton] ${rows.length} cards · ${rows.filter((r) => r.points !== null).length} points · ${rows.filter((r) => r.cashAmount !== null).length} cash`);
  return page;
})();
