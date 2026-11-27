/**
 * 힐튼포숙지도 — D1 실시간 요금 조회 API (Cloudflare Pages Function)
 *
 * GET /api/hotel/rates?city=Seoul&checkIn=2026-12-18&checkOut=2026-12-19&adults=2
 * GET /api/hotel/rates?hotelCode=SELCICI&checkIn=...&checkOut=...&adults=2&weekendOnly=1
 *
 * 응답: { ok, ok:true, source:"d1", observedAt, records:[...] }  — 스키마는 schema.sql 참고.
 * D1 바인딩(HOTEL_DB)이 없으면 503 database_unavailable 을 돌려준다.
 * 프론트엔드는 /hotel/assets/hotel-api.js 의 HOTEL_API_CONFIG.mode 를 "live" 로 바꾸면
 * 이 엔드포인트를 사용한다.
 */

const STALE_HOURS = 24;
const KST_OFFSET_MS = 9 * 3600 * 1000;

function json(data, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache }
  });
}

function isoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function validCount(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

/* 체크인이 금·토·일(KST)인지 — 주말숙박권 필터 */
export function isWeekendStay(checkIn) {
  const t = Date.parse(`${checkIn}T00:00:00+09:00`);
  if (!Number.isFinite(t)) return false;
  const day = new Date(t + KST_OFFSET_MS).getUTCDay();
  return day === 5 || day === 6 || day === 0;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const city = url.searchParams.get('city');
  const hotelCode = url.searchParams.get('hotelCode');
  const checkIn = isoDate(url.searchParams.get('checkIn'));
  const checkOut = isoDate(url.searchParams.get('checkOut'));
  const adults = validCount(url.searchParams.get('adults'), 2, 1, 8);
  const rooms = validCount(url.searchParams.get('rooms'), 1, 1, 5);
  const weekendOnly = url.searchParams.get('weekendOnly') === '1';

  if (!checkIn || !checkOut) return json({ ok: false, error: 'invalid_dates' }, 400);
  if (checkOut <= checkIn) return json({ ok: false, error: 'invalid_date_range' }, 400);
  if (!city && !hotelCode) return json({ ok: false, error: 'city_or_hotel_required' }, 400);
  if (weekendOnly && !isWeekendStay(checkIn)) {
    return json({ ok: false, error: 'weekend_only_fri_sat_sun' }, 400);
  }

  const db = env.HOTEL_DB;
  if (!db) return json({ ok: false, error: 'database_unavailable' }, 503);

  const where = ['check_in = ?', 'check_out = ?', 'adults = ?', 'rooms = ?'];
  const args = [checkIn, checkOut, adults, rooms];
  if (hotelCode) {
    where.push('hotel_code = ?');
    args.push(String(hotelCode).toUpperCase());
  }
  if (city) {
    where.push('city = ?');
    args.push(city);
  }

  try {
    const { results } = await db
      .prepare(`SELECT * FROM hotel_rate_observations WHERE ${where.join(' AND ')} ORDER BY points ASC`)
      .bind(...args)
      .all();

    const now = Date.now();
    const records = (results || []).map(row => {
      const observed = Date.parse(row.observed_at);
      const stale = !Number.isFinite(observed) || now - observed > STALE_HOURS * 3600 * 1000;
      const available = row.status === 'AVAILABLE' && !stale;
      return {
        hotelCode: row.hotel_code,
        city: row.city,
        checkIn: row.check_in,
        checkOut: row.check_out,
        adults: row.adults,
        rooms: row.rooms,
        status: available ? 'AVAILABLE' : (row.status === 'SOLD_OUT' ? 'SOLD_OUT' : 'STALE'),
        currency: available ? row.currency : null,
        cash: available ? row.cash : null,
        extra: available ? (row.extra || 0) : null,
        points: available ? row.points : null,
        rewardType: row.reward_type || null,
        roomCode: row.room_code || null,
        taxIncluded: row.tax_included === 1,
        conditionsMatched: row.conditions_matched === 1,
        source: row.source || 'D1',
        observedAt: row.observed_at
      };
    });

    return json({ ok: true, source: 'd1', observedAt: new Date().toISOString(), records }, 200, 'public, max-age=60');
  } catch (err) {
    return json({ ok: false, error: 'query_failed' }, 500);
  }
}

export async function onRequest() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
