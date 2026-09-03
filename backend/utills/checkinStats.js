// backend/utills/checkinStats.js
// [현장 QR 체크인] 출석 / 노쇼 집계
//
// ── 노쇼 규칙 (확정) ──────────────────────────────────────────────
//   집계 단위는 "날짜" 가 아니라 **마켓** 입니다.
//
//   왜 날짜 단위를 버렸나
//     처음에는 체크인이 열린 날마다 미참여를 세었는데, 두 가지가 어긋났습니다.
//       - 7일 마켓에서 하루 빠진 사람과, 하루짜리 마켓에 아예 안 온 사람이 똑같이 1회
//       - 7일 마켓에 한 번도 안 나오면 노쇼 7회 — 약속 하나를 어긴 건데 7배 불이익
//     그래서 마켓 하나를 단위로 보고, 참여 정도에 따라 나눕니다.
//
//   마켓 하나에 대한 판정 (그 마켓에서 체크인이 열렸던 날들 기준)
//     전부 참여   → 정상
//     일부만 참여 → 「중도 이탈」 1회
//     전혀 미참여 → 「노쇼」 1회
//
//   판정 시점: 마켓 전체가 끝난 다음 날부터 (eventDate_max < 오늘)
//     날짜마다 판정하면 7일 마켓 3일차에 이미 노쇼가 찍힙니다. 아직 행사 중인데요.
//     마켓이 끝난 뒤 한 번만 판정합니다.
//
//   체크인 세션이 열리지 않은 날은 세지 않습니다.
//     주최자가 QR 체크인을 운영하지 않은 날까지 판매자 책임으로 돌리면 안 됩니다.
//     7일 중 3일만 운영했다면 그 3일 기준으로 판정합니다.
//     한 날도 열리지 않은 마켓은 아예 집계 대상이 아닙니다.
//
// ── 왜 users 컬럼에 쌓지 않나 ─────────────────────────────────────
//   숫자를 저장하면 "언제 올릴지" 를 정해야 하고, 주최자가 출석을 잘못 눌러
//   취소하면 되돌리는 코드가 또 필요합니다. 한 번 어긋나면 추적할 방법이 없습니다.
//   출석 기록만 정확하면 나머지는 늘 계산으로 나옵니다. 배치도 스케줄러도 필요 없습니다.

import pool from '../config/db.js';

const ELIGIBLE_STATUSES = ['Approved', 'Paid'];

/** 체크인 테이블이 아직 없는 DB(마이그레이션 전)에서도 화면이 깨지지 않게 합니다. */
function isMissingTable(error) {
  return error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146);
}

/**
 * 판매자 1명의 출석/노쇼 집계. (지난 날짜만 = 확정된 것만)
 * @returns {Promise<{attendedDays:number, noShowDays:number, totalDays:number,
 *                    attendanceRate:number|null, byMarket:Array, available:boolean}>}
 *   available=false 면 체크인 테이블이 없다는 뜻입니다. 화면에서 지표를 숨기세요.
 */
/**
 * 판매자 1명의 참여 이력. **마켓 단위**로 집계합니다.
 * @returns {Promise<{completed:number, partial:number, noShow:number, totalMarkets:number,
 *                    attendanceRate:number|null, byMarket:Array, available:boolean}>}
 *   completed = 전부 참여, partial = 중도 이탈, noShow = 전혀 미참여
 */
export async function getSellerAttendance(sellerId) {
  const empty = {
    completed: 0, partial: 0, noShow: 0, totalMarkets: 0,
    attendanceRate: null, paidMarkets: 0, byMarket: [], available: false,
  };
  if (!sellerId) return empty;

  const ph = ELIGIBLE_STATUSES.map(() => '?').join(', ');

  try {
    // 마켓별로 "체크인이 열렸던 날 수" 와 "그 중 실제 참여한 날 수" 를 뽑습니다.
    // 끝난 마켓만 봅니다 — 진행 중인 마켓을 미리 노쇼로 세면 안 됩니다.
    const [rows] = await pool.query(
      `SELECT t.marketId, t.marketTitle, t.eventDateMax,
              COUNT(*) AS openDays,
              SUM(CASE WHEN t.checkedIn > 0 THEN 1 ELSE 0 END) AS attendedDays
         FROM (
           SELECT s.sessionId, s.marketId, m.title AS marketTitle,
                  DATE_FORMAT(m.eventDate_max, '%Y-%m-%d') AS eventDateMax,
                  COUNT(c.checkinId) AS checkedIn
             FROM market_checkin_sessions s
             JOIN markets m ON m.marketId = s.marketId
             JOIN applications a
               ON a.marketId = s.marketId
              AND a.sellerId = ?
              AND a.status IN (${ph})
             LEFT JOIN market_checkins c
               ON c.sessionId = s.sessionId
              AND c.sellerId = a.sellerId
            WHERE m.eventDate_max < CURDATE()
            GROUP BY s.sessionId, s.marketId, m.title, m.eventDate_max
         ) AS t
        GROUP BY t.marketId, t.marketTitle, t.eventDateMax
        ORDER BY t.eventDateMax DESC`,
      [sellerId, ...ELIGIBLE_STATUSES]
    );

    const byMarket = rows.map((r) => {
      const openDays = Number(r.openDays) || 0;
      const attendedDays = Number(r.attendedDays) || 0;
      // 전부 참여 / 일부만 / 전혀 — 세 갈래로 나눕니다.
      const outcome = attendedDays === 0 ? 'no_show'
                    : attendedDays >= openDays ? 'completed'
                    : 'partial';
      return {
        marketId: r.marketId,
        marketTitle: r.marketTitle,
        eventDateMax: r.eventDateMax,
        openDays,
        attendedDays,
        missedDays: openDays - attendedDays,
        outcome,
      };
    });

    const completed = byMarket.filter((m) => m.outcome === 'completed').length;
    const partial = byMarket.filter((m) => m.outcome === 'partial').length;
    const noShow = byMarket.filter((m) => m.outcome === 'no_show').length;
    const totalMarkets = byMarket.length;

    // 「마켓 참여」 = 결제까지 마친 마켓 수. 위 지표와 단위가 달라 따로 보여줍니다.
    const [paid] = await pool.query(
      `SELECT COUNT(DISTINCT marketId) AS c FROM applications WHERE sellerId = ? AND status = 'Paid'`,
      [sellerId]
    );

    return {
      completed,
      partial,
      noShow,
      totalMarkets,
      // 참여율은 "끝까지 참여한 마켓 / 전체" 입니다. 중도 이탈은 분자에 넣지 않습니다.
      attendanceRate: totalMarkets > 0 ? Math.round((completed / totalMarkets) * 100) : null,
      paidMarkets: Number(paid[0]?.c) || 0,
      byMarket,
      available: true,
    };
  } catch (error) {
    if (isMissingTable(error)) return empty;
    console.error('[checkinStats] 참여 이력 집계 실패:', error.message);
    return empty;
  }
}

/**
 * 아직 통지하지 않은, 마켓이 끝난 뒤 확정된 미참여 건을 찾습니다.
 * 스케줄러가 오전에 한 번 훑어 판매자에게 알립니다.
 *
 * @param {number} lookbackDays 며칠 전까지 거슬러 볼지 (서버가 며칠 꺼져 있던 경우 대비)
 */
export async function findUnnotifiedAbsences(lookbackDays = 7) {
  const ph = ELIGIBLE_STATUSES.map(() => '?').join(', ');
  try {
    const [rows] = await pool.query(
      `SELECT t.sellerId, t.marketId, t.marketTitle, t.eventDateMax,
              COUNT(*) AS openDays,
              SUM(CASE WHEN t.checkedIn > 0 THEN 1 ELSE 0 END) AS attendedDays
         FROM (
           SELECT s.sessionId, s.marketId, a.sellerId, m.title AS marketTitle,
                  DATE_FORMAT(m.eventDate_max, '%Y-%m-%d') AS eventDateMax,
                  COUNT(c.checkinId) AS checkedIn
             FROM market_checkin_sessions s
             JOIN markets m ON m.marketId = s.marketId
             JOIN applications a
               ON a.marketId = s.marketId
              AND a.status IN (${ph})
             LEFT JOIN market_checkins c
               ON c.sessionId = s.sessionId
              AND c.sellerId = a.sellerId
            WHERE m.eventDate_max < CURDATE()
              AND m.eventDate_max >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND m.isExpired <> 2
            GROUP BY s.sessionId, s.marketId, a.sellerId, m.title, m.eventDate_max
         ) AS t
        GROUP BY t.sellerId, t.marketId, t.marketTitle, t.eventDateMax
       HAVING attendedDays < openDays`,
      [...ELIGIBLE_STATUSES, lookbackDays]
    );

    return rows.map((r) => {
      const openDays = Number(r.openDays) || 0;
      const attendedDays = Number(r.attendedDays) || 0;
      return {
        sellerId: Number(r.sellerId),
        marketId: Number(r.marketId),
        marketTitle: r.marketTitle,
        eventDateMax: r.eventDateMax,
        openDays,
        attendedDays,
        missedDays: openDays - attendedDays,
        outcome: attendedDays === 0 ? 'no_show' : 'partial',
      };
    });
  } catch (error) {
    if (isMissingTable(error)) return [];
    console.error('[checkinStats] 미참여 조회 실패:', error.message);
    return [];
  }
}

/**
 * 한 세션에서 아직 체크인하지 않은 판매자 목록.
 * 주최자 화면에서 오늘은 「아직 미도착」, 지난 날짜는 「노쇼」로 표시하는 데 씁니다.
 * (같은 데이터를 날짜에 따라 다르게 부르는 것뿐입니다)
 */
export async function getSessionAbsentees(sessionId) {
  const ph = ELIGIBLE_STATUSES.map(() => '?').join(', ');
  try {
    const [rows] = await pool.query(
      `SELECT a.sellerId,
              u.nickname AS sellerNickname,
              COUNT(*) AS boothCount,
              (s.eventDate < CURDATE()) AS isFinalized
         FROM market_checkin_sessions s
         JOIN applications a
           ON a.marketId = s.marketId
          AND a.status IN (${ph})
         LEFT JOIN users u ON u.userId = a.sellerId
        WHERE s.sessionId = ?
          AND NOT EXISTS (
                SELECT 1 FROM market_checkins c
                 WHERE c.sessionId = s.sessionId AND c.sellerId = a.sellerId
              )
        GROUP BY a.sellerId, u.nickname, s.eventDate
        ORDER BY u.nickname ASC`,
      [...ELIGIBLE_STATUSES, sessionId]
    );
    return rows.map((r) => ({
      sellerId: r.sellerId,
      sellerNickname: r.sellerNickname,
      boothCount: Number(r.boothCount) || 0,
      isNoShow: Number(r.isFinalized) === 1, // 지난 날짜면 이미 노쇼로 확정된 상태
    }));
  } catch (error) {
    if (isMissingTable(error)) return [];
    console.error('[checkinStats] 미도착 조회 실패:', error.message);
    return [];
  }
}

export default { getSellerAttendance, getSessionAbsentees, findUnnotifiedAbsences };
