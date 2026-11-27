/* ==========================================================================
   힐튼포숙지도 — 예약 화면 2단계(Select a Rate) 판독 스니펫 (읽기 전용)
   --------------------------------------------------------------------------
   대상: 객실 목록에서 한 객실의 "More Rates" 를 누르면 열리는
         /en/book/reservation/rates/?...  (Step 2 of 3 Select a Rate)
   목적: 주말숙박권(Free Night Reward) 사용 가능 여부의 유일한 정답인
         "Standard Room Reward" / "Premium Room Rewards" 라벨과 그 포인트,
         그리고 그 객실의 세금 포함 현금가 목록을 뽑는다.

   판정
     standardAvailable = rewards 에 Standard Room Reward 가 있음 → 숙박권 사용 가능
     premiumOnly       = Premium Room Rewards 만 있음            → 숙박권 사용 불가
     noPoints          = rewards 가 비어 있음                    → 이 날짜 포인트 재고 없음

   실행 전 사람이 직접: 쿠키 배너, "Use Points & Money" 체크, (선택) 통화 KRW
   검증: 2026-11-27 15:3x KST, 콘래드 서울 1 King Bed Deluxe(2026-12-15~16)
         → { Standard Room Reward, 80,000 } / 현금 최저 ₩827,200 /
           "Prices include all taxes and fees in South Korean Won." 확인.
         비로그인 상태에서는 "Sign in to pay with Points" 안내가 함께 뜬다(예약은 로그인 필요).
   ========================================================================== */
(() => {
  'use strict';

  const toInt = (s) => {
    const digits = String(s).replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
  };

  const body = document.body.innerText;
  const lines = body.split('\n').map((s) => s.trim()).filter(Boolean);
  const q = new URL(location.href).searchParams;

  // "Standard Room Reward" 다음 1~3줄 안에 "80,000 Points per night" 가 온다.
  const rewards = [];
  lines.forEach((line, i) => {
    if (/^(Standard Room Reward|Premium Room Rewards)$/.test(line)) {
      const ptsLine = lines.slice(i, i + 4).find((x) => /^[\d,]+ Points per night$/.test(x));
      rewards.push({
        label: line,
        points: ptsLine ? toInt(ptsLine) : null
      });
    }
  });

  // 세금 포함 현금가 목록(요금제 순서대로): 금액만 모으고 최저가를 따로 표시한다.
  const moneyLine = /((?:US\$|[₩$€¥₹])\s?[\d,]{3,}|[\d,]{4,}\s?(?:KRW|JPY|USD|THB|CNY|HKD|SGD|AED|EUR))/;
  const cashRates = lines
    .filter((l) => moneyLine.test(l) && /^[\s\S]{0,24}$/.test(l))
    .map((l) => ({ text: l, amount: toInt((l.match(moneyLine) || [])[0]) }))
    .filter((r) => r.amount && r.amount > 1000);

  const cashMin = cashRates.length ? Math.min(...cashRates.map((r) => r.amount)) : null;
  const standard = rewards.find((r) => r.label === 'Standard Room Reward') || null;
  const premium = rewards.find((r) => r.label === 'Premium Room Rewards') || null;

  // /rates/ URL 은 쿼리를 잃는 경우가 있어, 없으면 화면의 "Your stay" 문구에서 읽는다.
  // 화면 예:  "Conrad Seoul" … "Fri, Nov 27 – Sat, Nov 28, 2026"
  const stayMatch = body.match(/([A-Z][a-z]{2}, [A-Z][a-z]+ \d{1,2}) – ([A-Z][a-z]{2}, [A-Z][a-z]+ \d{1,2}, \d{4})/);

  const result = {
    url: location.href,
    // /rates/ 화면은 쿼리(ctyhocn)를 잃는 경우가 있다. 없으면 호텔 코드는 마스터 목록에서 직접 붙인다.
    hotelCode: (q.get('ctyhocn') || '').toUpperCase() || null,
    hotelName: (document.querySelector('[data-testid="hotelName"]')?.innerText || '').trim() || null,
    checkIn: q.get('arrivalDate') || (stayMatch ? stayMatch[1] : null),
    checkOut: q.get('departureDate') || (stayMatch ? stayMatch[2] : null),
    currencyLabel: (body.match(/Prices include all taxes and fees in ([^.\n]+)\./) || [])[1] || null,
    taxIncluded: /Prices include all taxes and fees/i.test(body),
    rewards,
    standardAvailable: !!standard,
    premiumOnly: !standard && !!premium,
    noPoints: rewards.length === 0,
    points: standard ? standard.points : (premium ? premium.points : null),
    cashRates,
    cashMin,
    valuePerPoint: standard && standard.points && cashMin ? Math.round((cashMin / standard.points) * 100) / 100 : null,
    signInRequired: /Sign in to pay with Points/i.test(body),
    capturedAt: new Date().toISOString()
  };

  window.HILTON_RATE_DETAIL = result;
  console.log(`[hilton] ${result.hotelCode || '?'} ${result.checkIn} → ${result.standardAvailable ? 'STANDARD' : result.premiumOnly ? 'PREMIUM' : 'NONE'} ${result.points || ''} pts · cashMin ${result.cashMin || ''}`);
  return result;
})();
