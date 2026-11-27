/* ==========================================================================
   힐튼포숙지도 — 예약 화면 1단계(객실 목록) 판독 스니펫 (읽기 전용)
   --------------------------------------------------------------------------
   대상: https://www.hilton.com/en/book/reservation/rooms/?ctyhocn={코드}&
         arrivalDate=YYYY-MM-DD&departureDate=YYYY-MM-DD&redeemPts=true&room1NumAdults=2
   목적: 객실별 "Pay with Points: N per night" 과 현금가(Quick Book / More Rates From)를 뽑는다.
   주의: 이 화면의 포인트 숫자에는 Standard/Premium 라벨이 없다. 라벨 판정은
         More Rates → 2단계(Select a Rate) 화면에서 해야 한다(→ rates_page.js).

   실행 전 사람이 직접:
     · 쿠키 배너 처리
     · "Use Points & Money" 체크
     · (선택) "Select currency" 에서 KRW 선택 → 현금가가 원화로 표시된다
   실행: 화면이 다 그려진 뒤 DevTools 콘솔에 붙여넣기.
   검증: 2026-11-27 15:3x KST, 콘래드 서울 2026-12-15~16·성인2 화면에서 14개 객실 판독.
         (1 King Bed Deluxe 80,000 / Premium 174,000~188,000, 현금 Flexible ₩638,000 등)
   ========================================================================== */
(() => {
  'use strict';

  const toInt = (s) => {
    const digits = String(s).replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
  };

  const url = new URL(location.href);
  const q = url.searchParams;

  const lines = document.body.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
  const currencyLabel = (document.body.innerText.match(/Prices include all taxes and fees in ([^.\n]+)\./) || [])[1] || null;

  // 객실 카드는 <li> 안에 heading(객실명) + "Pay with Points: N per night" +
  //   Quick Book(기준가) / More Rates From(최저가) 버튼이 함께 들어 있다.
  //   Quick Book 버튼은 aria-label 이 아니라 자식 텍스트로 이름이 붙으므로 innerText 로 찾는다.
  const hotels = [...document.querySelectorAll('li')]
    .map((li) => {
      const heading = li.querySelector('h2, h3');
      if (!heading) return null;
      const text = li.innerText || '';
      if (!/Pay with Points:|Quick Book|More Rates/i.test(text)) return null;

      const pts = text.match(/Pay with Points:\s*([\d,]+)\s*per night/i);
      const buttons = [...li.querySelectorAll('button')];
      const nameOf = (b) => `${b.getAttribute('aria-label') || ''} ${b.innerText || ''}`;
      const quick = buttons.find((b) => /^\s*Quick Book/i.test((b.innerText || '').trim()));
      const more = buttons.find((b) => /More Rates/i.test(nameOf(b)));
      const quickText = quick ? quick.innerText.trim() : '';
      const moreText = more ? nameOf(more).trim() : '';
      const quickAmount = (quickText.match(/([₩$€¥₹]|US\$|THB|JPY|CNY|HKD|SGD|AED)\s?([\d,]+)/) || [])[2];
      const moreAmount = (moreText.match(/([₩$€¥₹]|US\$|THB|JPY|CNY|HKD|SGD|AED)\s?([\d,]+)/) || [])[2];

      return {
        room: heading.innerText.split('\n')[0].trim(),
        points: pts ? toInt(pts[1]) : null,       // 라벨 없음 — Standard/Premium 구분 불가
        quickBookText: quickText || null,
        quickBookCash: quickAmount ? toInt(quickAmount) : null,
        moreRatesText: moreText || null,
        moreRatesCash: moreAmount ? toInt(moreAmount) : null,
        soldOut: /^Sold out$/im.test(text)
      };
    })
    .filter(Boolean);

  const page = {
    url: location.href,
    hotelCode: (q.get('ctyhocn') || '').toUpperCase() || null,
    checkIn: q.get('arrivalDate'),
    checkOut: q.get('departureDate'),
    adults: q.get('room1NumAdults'),
    currencyLabel,
    roomsFoundNote: (document.body.innerText.match(/([\d]+)\s+rooms found\./) || [])[1] || null,
    rooms: hotels
  };

  window.HILTON_ROOMS = page;
  console.log(`[hilton] ${hotels.length} rooms · points ${hotels.filter((r) => r.points).length} · soldOut ${hotels.filter((r) => r.soldOut).length}`);
  return page;
})();
