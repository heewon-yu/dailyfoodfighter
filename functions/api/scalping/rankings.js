// Cloudflare Pages Function: /api/scalping/rankings
// 5분 단타왕 (Scalping King) 일일 랭킹 API

function getKstDay() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...CORS_HEADERS,
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

// GET: 당일 TOP5 랭킹 조회
export async function onRequestGet({ env }) {
  const kstDay = getKstDay();
  const db = env.DB || env.SCALPING_DB;

  if (!db) {
    // D1 바인딩 전 기본 응답
    return json({
      day: kstDay,
      rates: [],
      profits: [],
      notice: 'D1 database binding ready',
    });
  }

  try {
    // 수익률 TOP 5 (닉네임당 당일 최고 기록 1건)
    const ratesQuery = await db.prepare(
      `SELECT nickname, MAX(rate) as value 
       FROM daily_rankings 
       WHERE kst_day = ? 
       GROUP BY nickname 
       ORDER BY value DESC 
       LIMIT 5`
    ).bind(kstDay).all();

    // 수익금 TOP 5 (닉네임당 당일 최고 기록 1건)
    const profitsQuery = await db.prepare(
      `SELECT nickname, MAX(profit) as value 
       FROM daily_rankings 
       WHERE kst_day = ? 
       GROUP BY nickname 
       ORDER BY value DESC 
       LIMIT 5`
    ).bind(kstDay).all();

    const rates = (ratesQuery.results || []).map((row, idx) => ({
      nickname: row.nickname,
      rank: idx + 1,
      value: row.value,
    }));

    const profits = (profitsQuery.results || []).map((row, idx) => ({
      nickname: row.nickname,
      rank: idx + 1,
      value: row.profit !== undefined ? row.profit : row.value,
    }));

    return json({ day: kstDay, rates, profits });
  } catch (error) {
    return json({ day: kstDay, rates: [], profits: [], error: error.message }, 500);
  }
}

// POST: 게임 종료 시 성적 등록
export async function onRequestPost({ request, env }) {
  const kstDay = getKstDay();
  const db = env.DB || env.SCALPING_DB;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { nickname, rate, profit } = body || {};

  // 닉네임 유효성 검증 (2~12자 한글/영문/숫자/밑줄)
  if (!nickname || typeof nickname !== 'string') {
    return json({ error: 'invalid_nickname' }, 400);
  }
  const cleanNick = nickname.trim().normalize('NFKC');
  if (!/^[가-힣A-Za-z0-9_]{2,12}$/.test(cleanNick) || /관리자|운영자|admin|moderator|fuck|shit/i.test(cleanNick)) {
    return json({ error: 'invalid_nickname' }, 400);
  }

  if (typeof rate !== 'number' || isNaN(rate) || typeof profit !== 'number' || isNaN(profit)) {
    return json({ error: 'invalid_score' }, 400);
  }

  if (!db) {
    return json({ ok: true, notice: 'D1 database binding ready' });
  }

  try {
    // 성적 기록 삽입
    await db.prepare(
      `INSERT INTO daily_rankings (kst_day, nickname, rate, profit) VALUES (?, ?, ?, ?)`
    ).bind(kstDay, cleanNick, Number(rate.toFixed(2)), Math.round(profit)).run();

    // 2일 이상 지난 만료 데이터 백그라운드 자동 정리
    await db.prepare(
      `DELETE FROM daily_rankings WHERE kst_day < date('now', '-2 days')`
    ).run().catch(() => {});

    return json({ ok: true, day: kstDay });
  } catch (error) {
    return json({ error: 'database_error', details: error.message }, 500);
  }
}
