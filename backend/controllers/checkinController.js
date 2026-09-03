// backend/controllers/checkinController.js
// [현장 QR 체크인] 판매자가 폰에 QR 을 띄우고, 주최자가 그것을 찍어 출석을 확인합니다.
//
// 흐름
//   1) 주최자: 개최일 당일이 되면 「체크인 시작」        POST   /api/checkin/sessions
//   2) 판매자: 「입장 QR」 화면에 QR + 6자리 코드 표시   GET    /api/checkin/pass?marketId=
//   3) 주최자: 줄 선 판매자의 QR 을 카메라로 찍음        POST   /api/checkin/scan
//      (카메라를 못 쓰면 판매자가 부르는 6자리 코드 입력 — 같은 API)
//   4) 주최자: 실시간 현황 확인                          GET    /api/checkin/sessions?marketId=&eventDate=
//   5) 주최자: 「체크인 종료」                            PATCH  /api/checkin/sessions/:id/close
//   6) 다음 날: 그날 체크인 못 받은 판매자는 노쇼 1회로 확정 (utills/checkinStats.js)
//
// 설계 메모
//   - 하루 = 세션 1개 (UNIQUE(marketId, eventDate)). 여러 날 열리는 마켓은 날짜별로 따로 집계됩니다.
//   - 한 번 찍으면 그 판매자가 이 마켓에 잡아둔 승인·결제 부스가 전부 함께 출석 처리됩니다.
//     (1인 다부스 허용 정책 — 부스마다 찍게 하면 현장에서 줄이 늘어집니다)
//   - 출석 대상은 status 가 Approved / Paid 인 신청뿐입니다.
//   - 알림(종 버튼)은 일부러 만들지 않았습니다. 50명이 체크인하면 알림이 50개 쌓입니다.
//     주최자는 체크인 화면의 실시간 현황으로 보는 편이 낫습니다.

import pool from '../config/db.js';
import {
  createSessionSecret,
  issueSellerPass,
  parseSellerPass,
  verifySellerPass,
  deriveSellerCode,
  codeSecondsLeft,
  matchSellerCode,
  PASS_TTL_SEC,
  PASS_REFRESH_SEC,
  CODE_WINDOW_SEC,
} from '../utills/checkinToken.js';
import { getSellerAttendance, getSessionAbsentees } from '../utills/checkinStats.js';
import {
  resolveSessionWindow,
  eachEventDate,
  isValidTime,
  toDateTime,
  STATUS_SCHEDULED,
  STATUS_OPEN,
  STATUS_CLOSED,
  DEFAULT_LEAD_MINUTES,
} from '../utills/checkinSchedule.js';

/** 출석 처리 대상이 되는 신청 상태 */
const ELIGIBLE_STATUSES = ['Approved', 'Paid'];
const STATUS_PLACEHOLDERS = ELIGIBLE_STATUSES.map(() => '?').join(', ');

/** markets.isExpired */
const MARKET_CANCELLED = 2;

function fail(res, status, code, message) {
  return res.status(status).json({ success: false, data: null, code, message });
}

function ok(res, data, message) {
  return res.status(200).json({ success: true, data, message });
}

function missingTable(error) {
  return error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146);
}

const MIGRATION_HINT =
  '체크인 테이블이 아직 없어요. backend 폴더에서 `node scripts/migrate-add-checkin.js` 를 실행한 뒤 서버를 재시작해 주세요.';

/** 'YYYY-MM-DD' 형식이면 그대로, 아니면 null */
function normalizeDateParam(value) {
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** 서버 로컬 기준 오늘 (DB 의 CURDATE() 와 맞추기 위해 UTC 변환을 쓰지 않습니다) */
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 마켓을 조회하면서 요청자가 주최자 본인인지 확인합니다.
 * 날짜는 DATE_FORMAT 으로 문자열화해서 가져옵니다.
 *   -> mysql2 는 DATE 컬럼을 서버 로컬 자정의 Date 객체로 주는데,
 *      그대로 JSON 으로 내보내면 UTC 로 바뀌며 KST 기준 하루가 밀립니다.
 */
async function loadOwnedMarket(marketId, userId) {
  const [rows] = await pool.query(
    `SELECT marketId, hostId, title, isExpired,
            DATE_FORMAT(eventDate_min, '%Y-%m-%d') AS eventDateMin,
            DATE_FORMAT(eventDate_max, '%Y-%m-%d') AS eventDateMax
       FROM markets WHERE marketId = ?`,
    [marketId]
  );
  if (rows.length === 0) {
    return { error: { status: 404, code: 'MARKET_NOT_FOUND', message: '해당 마켓을 찾을 수 없어요.' } };
  }
  const market = rows[0];
  if (Number(market.hostId) !== Number(userId)) {
    return { error: { status: 403, code: 'NOT_MARKET_OWNER', message: '본인이 주최한 마켓만 관리할 수 있어요.' } };
  }
  return { market };
}

/** 세션 1건 + 마켓 정보 */
async function loadSessionById(sessionId) {
  const [rows] = await pool.query(
    `SELECT s.sessionId, s.marketId, s.status, s.secret, s.openedBy,
            DATE_FORMAT(s.eventDate, '%Y-%m-%d') AS eventDate,
            s.openedAt, s.closedAt, s.opensAt, s.closesAt, s.leadMinutes,
            m.hostId, m.title AS marketTitle, m.isExpired
       FROM market_checkin_sessions s
       JOIN markets m ON m.marketId = s.marketId
      WHERE s.sessionId = ?`,
    [sessionId]
  );
  return rows[0] || null;
}

/** secret 은 절대 응답에 담지 않습니다. */
function toPublicSession(row) {
  if (!row) return null;
  const win = resolveSessionWindow(row);
  return {
    sessionId: row.sessionId,
    marketId: row.marketId,
    eventDate: row.eventDate,
    status: row.status,          // 주최자의 의사 (scheduled / open / closed)
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    // 아래는 "지금 실제로 받는 중인가" — 시각과 비교해 계산한 값입니다.
    isOpen: win.isOpen,
    phase: win.phase,
    reason: win.reason,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
    leadMinutes: row.leadMinutes == null ? DEFAULT_LEAD_MINUTES : row.leadMinutes,
    qrFrom: win.qrFrom,
  };
}

/* ================================================================== */
/* 주최자 — 세션 시작 / 종료 / 현황                                    */
/* ================================================================== */

/**
 * POST /api/checkin/sessions   body: { marketId, eventDate }
 *
 * 같은 날짜 세션이 이미 있으면 새로 만들지 않고 다시 엽니다.
 * 이때 서명 키를 교체하므로, 종료 전에 캡처돼 돌아다니던 판매자 QR 은 전부 무효가 됩니다.
 * 이미 기록된 출석은 같은 sessionId 를 쓰기 때문에 그대로 남습니다.
 */
export async function openCheckinSession(req, res) {
  const { userId } = req.user;
  const marketId = Number(req.body?.marketId);
  const eventDate = normalizeDateParam(req.body?.eventDate);

  if (!Number.isInteger(marketId) || marketId <= 0) {
    return fail(res, 400, 'MARKET_ID_REQUIRED', '마켓을 선택해 주세요.');
  }
  if (!eventDate) {
    return fail(res, 400, 'EVENT_DATE_REQUIRED', '날짜를 YYYY-MM-DD 형식으로 보내 주세요.');
  }

  try {
    const { market, error } = await loadOwnedMarket(marketId, userId);
    if (error) return fail(res, error.status, error.code, error.message);

    if (Number(market.isExpired) === MARKET_CANCELLED) {
      return fail(res, 409, 'MARKET_CANCELLED', '취소된 마켓은 체크인을 열 수 없어요.');
    }
    if (eventDate < market.eventDateMin || eventDate > market.eventDateMax) {
      return fail(res, 400, 'DATE_OUT_OF_RANGE',
        `개최 기간(${market.eventDateMin} ~ ${market.eventDateMax}) 안의 날짜만 열 수 있어요.`);
    }
    // 지난 날짜는 이미 노쇼가 확정된 날이라, 뒤늦게 열어 기록을 바꾸지 못하게 막습니다.
    if (eventDate < today()) {
      return fail(res, 400, 'DATE_ALREADY_PASSED',
        '이미 지난 날짜예요. 그날의 출석은 확정되어 더 이상 변경할 수 없어요.');
    }

    await pool.query(
      `INSERT INTO market_checkin_sessions (marketId, eventDate, status, secret, openedBy)
       VALUES (?, ?, 'open', ?, ?)
       ON DUPLICATE KEY UPDATE
         status = 'open', secret = VALUES(secret), openedBy = VALUES(openedBy),
         openedAt = CURRENT_TIMESTAMP, closedAt = NULL`,
      [marketId, eventDate, createSessionSecret(), userId]
    );

    const session = await findSessionByDay(marketId, eventDate);
    return ok(res, { session: toPublicSession(session), isToday: eventDate === today() }, '체크인을 시작했어요.');
  } catch (error) {
    console.error('[checkin] 세션 시작 오류:', error.message);
    if (missingTable(error)) return fail(res, 500, 'CHECKIN_TABLE_MISSING', MIGRATION_HINT);
    return fail(res, 500, 'SERVER_ERROR', '서버 오류로 체크인을 시작하지 못했어요.');
  }
}

async function findSessionByDay(marketId, eventDate) {
  const [rows] = await pool.query(
    `SELECT sessionId, marketId, status, secret, openedAt, closedAt,
            opensAt, closesAt, leadMinutes,
            DATE_FORMAT(eventDate, '%Y-%m-%d') AS eventDate
       FROM market_checkin_sessions
      WHERE marketId = ? AND eventDate = ?`,
    [marketId, eventDate]
  );
  return rows[0] || null;
}

/** PATCH /api/checkin/sessions/:sessionId/close */
export async function closeCheckinSession(req, res) {
  const { userId } = req.user;
  const sessionId = Number(req.params.sessionId);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return fail(res, 400, 'SESSION_ID_REQUIRED', '체크인 세션을 찾을 수 없어요.');
  }

  try {
    const session = await loadSessionById(sessionId);
    if (!session) return fail(res, 404, 'SESSION_NOT_FOUND', '체크인 세션을 찾을 수 없어요.');
    if (Number(session.hostId) !== Number(userId)) {
      return fail(res, 403, 'NOT_MARKET_OWNER', '본인이 주최한 마켓만 종료할 수 있어요.');
    }

    await pool.query(
      `UPDATE market_checkin_sessions SET status = 'closed', closedAt = CURRENT_TIMESTAMP
        WHERE sessionId = ? AND status = 'open'`,
      [sessionId]
    );

    const updated = await loadSessionById(sessionId);
    const absentees = await getSessionAbsentees(sessionId);

    // 종료했다고 노쇼가 바로 확정되는 게 아니라는 점을 응답에서 분명히 합니다.
    // 오늘 날짜면 자정을 넘겨야 확정이고, 그전까지는 다시 열어 처리할 수 있습니다.
    return ok(res, {
      session: toPublicSession(updated),
      absentees,
      noShowFinalizesOn: session.eventDate === today() ? '내일' : '이미 확정됨',
    }, absentees.length > 0
      ? `체크인을 종료했어요. 미도착 ${absentees.length}명은 날짜가 지나면 노쇼로 기록돼요.`
      : '체크인을 종료했어요. 미도착 인원은 없어요.');
  } catch (error) {
    console.error('[checkin] 세션 종료 오류:', error.message);
    if (missingTable(error)) return fail(res, 500, 'CHECKIN_TABLE_MISSING', MIGRATION_HINT);
    return fail(res, 500, 'SERVER_ERROR', '서버 오류로 체크인을 종료하지 못했어요.');
  }
}

/**
 * GET /api/checkin/sessions?marketId=&eventDate=
 * 주최자 화면이 처음 뜰 때 + 몇 초마다 폴링할 때 부릅니다.
 */
export async function getCheckinSession(req, res) {
  const { userId } = req.user;
  const marketId = Number(req.query.marketId);
  const eventDate = normalizeDateParam(req.query.eventDate) || today();

  if (!Number.isInteger(marketId) || marketId <= 0) {
    return fail(res, 400, 'MARKET_ID_REQUIRED', '마켓을 선택해 주세요.');
  }

  try {
    const { market, error } = await loadOwnedMarket(marketId, userId);
    if (error) return fail(res, error.status, error.code, error.message);

    const session = await findSessionByDay(marketId, eventDate);
    const roster = await loadRoster(marketId, session ? session.sessionId : null);

    const [dayRows] = await pool.query(
      `SELECT DATE_FORMAT(s.eventDate, '%Y-%m-%d') AS eventDate, s.status,
              DATE_FORMAT(s.opensAt, '%H:%i') AS startTime,
              DATE_FORMAT(s.closesAt, '%H:%i') AS endTime,
              s.opensAt, s.closesAt, s.leadMinutes,
              COUNT(c.checkinId) AS checkedIn
         FROM market_checkin_sessions s
         LEFT JOIN market_checkins c ON c.sessionId = s.sessionId
        WHERE s.marketId = ?
        GROUP BY s.sessionId, s.eventDate, s.status, s.opensAt, s.closesAt, s.leadMinutes`,
      [marketId]
    );

    return ok(res, {
      market: {
        marketId: market.marketId,
        title: market.title,
        eventDateMin: market.eventDateMin,
        eventDateMax: market.eventDateMax,
        isCancelled: Number(market.isExpired) === MARKET_CANCELLED,
      },
      eventDate,
      today: today(),
      isToday: eventDate === today(),
      isPast: eventDate < today(),   // 지난 날짜 = 미출석이 이미 노쇼로 확정된 날
      session: toPublicSession(session),
      roster,
      summary: summarizeRoster(roster),
      days: dayRows.map((d) => ({
        eventDate: d.eventDate,
        status: d.status,
        checkedIn: Number(d.checkedIn) || 0,
        startTime: d.startTime,
        endTime: d.endTime,
        leadMinutes: d.leadMinutes == null ? DEFAULT_LEAD_MINUTES : d.leadMinutes,
        // 지금 실제로 받는 중인지 (시각과 비교해 계산)
        isOpen: resolveSessionWindow(d).isOpen,
      })),
      // 개최 기간의 모든 날짜. 아직 예약 안 된 날도 화면에 줄로 나와야 합니다.
      eventDates: eachEventDate(market.eventDateMin, market.eventDateMax),
      codeWindowSec: CODE_WINDOW_SEC,
    }, '체크인 현황을 조회했어요.');
  } catch (error) {
    console.error('[checkin] 현황 조회 오류:', error.message);
    if (missingTable(error)) return fail(res, 500, 'CHECKIN_TABLE_MISSING', MIGRATION_HINT);
    return fail(res, 500, 'SERVER_ERROR', '서버 오류로 체크인 현황을 불러오지 못했어요.');
  }
}

/** 출석 대상 명단 + 각자의 출석 여부 (미출석이 위로 오도록 정렬) */
async function loadRoster(marketId, sessionId) {
  const [rows] = await pool.query(
    `SELECT a.applicationId, a.sellerId, a.boothNumber, a.itemName, a.status,
            u.nickname AS sellerNickname,
            c.checkinId, c.checkedInAt, c.method
       FROM applications a
       LEFT JOIN users u ON u.userId = a.sellerId
       LEFT JOIN market_checkins c
              ON c.applicationId = a.applicationId AND c.sessionId = ?
      WHERE a.marketId = ? AND a.status IN (${STATUS_PLACEHOLDERS})
      ORDER BY (c.checkinId IS NOT NULL) ASC, a.boothNumber ASC, a.applicationId ASC`,
    [sessionId, marketId, ...ELIGIBLE_STATUSES]
  );

  return rows.map((r) => ({
    applicationId: r.applicationId,
    sellerId: r.sellerId,
    sellerNickname: r.sellerNickname,
    boothNumber: r.boothNumber,
    itemName: r.itemName,
    status: r.status,
    checkedIn: r.checkinId != null,
    checkinId: r.checkinId,
    checkedInAt: r.checkedInAt,
    method: r.method,
  }));
}

function summarizeRoster(roster) {
  const sellers = new Set(roster.map((r) => String(r.sellerId)));
  const checkedInSellers = new Set(roster.filter((r) => r.checkedIn).map((r) => String(r.sellerId)));
  const checkedIn = roster.filter((r) => r.checkedIn).length;
  return {
    totalBooths: roster.length,
    checkedInBooths: checkedIn,
    absentBooths: roster.length - checkedIn,
    totalSellers: sellers.size,
    checkedInSellers: checkedInSellers.size,
    absentSellers: sellers.size - checkedInSellers.size,
  };
}

/**
 * POST /api/checkin/schedule
 *   body: { marketId, startTime:'10:00', endTime:'17:00', leadMinutes?:60, dates?:['YYYY-MM-DD'] }
 *
 * 개최 기간 전체(또는 지정한 날짜들)에 대해 체크인 시간대를 한 번에 잡아 둡니다.
 * 7일 마켓이면 세션 7행이 만들어지고, 각 날짜가 자기 시간에 알아서 열리고 닫힙니다.
 *
 * 주최자가 매일 아침 「시작」을 누르러 들어오지 않아도 되게 하는 것이 목적입니다.
 * (누르고 싶으면 여전히 누를 수 있고, 그때는 시간표를 무시하고 열립니다)
 *
 * 이미 지난 날짜는 건드리지 않습니다 — 그날 출석은 이미 확정됐기 때문입니다.
 * 주최자가 이미 손으로 열거나 닫은 날짜도 덮어쓰지 않습니다.
 */
export async function scheduleCheckin(req, res) {
  const { userId } = req.user;
  const marketId = Number(req.body?.marketId);
  const startTime = String(req.body?.startTime || '').trim();
  const endTime = String(req.body?.endTime || '').trim();
  const leadRaw = req.body?.leadMinutes;
  const leadMinutes = leadRaw == null ? DEFAULT_LEAD_MINUTES : Number(leadRaw);

  if (!Number.isInteger(marketId) || marketId <= 0) {
    return fail(res, 400, 'MARKET_ID_REQUIRED', '마켓을 선택해 주세요.');
  }
  // 두 가지 형태를 모두 받습니다.
  //   ① 일괄  : { startTime, endTime, leadMinutes }        → 개최 기간 전체에 같은 시간
  //   ② 개별  : { days: [{ eventDate, startTime, endTime, leadMinutes }, ...] }
  //              → 날짜마다 다른 시간 (토요일만 늦게 시작하는 경우 등)
  //   화면에서는 "모든 날짜에 적용" 으로 칸을 채운 뒤 한 번에 저장하므로,
  //   실제로는 대부분 ②로 들어옵니다. ①은 API 를 직접 쓸 때를 위해 남겨 둡니다.
  const perDay = Array.isArray(req.body?.days) ? req.body.days : null;

  if (perDay) {
    if (perDay.length === 0) {
      return fail(res, 400, 'NO_DAYS', '저장할 날짜가 없어요.');
    }
    for (const d of perDay) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d?.eventDate || ''))) {
        return fail(res, 400, 'DATE_INVALID', '날짜 형식이 올바르지 않아요.');
      }
      if (!isValidTime(d?.startTime) || !isValidTime(d?.endTime)) {
        return fail(res, 400, 'TIME_INVALID', `${d.eventDate}: 시간을 HH:MM 형식으로 입력해 주세요.`);
      }
      if (String(d.startTime) >= String(d.endTime)) {
        return fail(res, 400, 'TIME_RANGE_INVALID', `${d.eventDate}: 종료 시간이 시작 시간보다 늦어야 해요.`);
      }
      const lead = d.leadMinutes == null ? DEFAULT_LEAD_MINUTES : Number(d.leadMinutes);
      if (!Number.isFinite(lead) || lead < 0 || lead > 720) {
        return fail(res, 400, 'LEAD_INVALID', `${d.eventDate}: QR 사전 노출은 0~720분 사이로 정해 주세요.`);
      }
    }
  } else {
    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      return fail(res, 400, 'TIME_INVALID', '시간을 HH:MM 형식으로 입력해 주세요. (예: 10:00)');
    }
    if (startTime >= endTime) {
      return fail(res, 400, 'TIME_RANGE_INVALID', '종료 시간이 시작 시간보다 늦어야 해요.');
    }
    if (!Number.isFinite(leadMinutes) || leadMinutes < 0 || leadMinutes > 720) {
      return fail(res, 400, 'LEAD_INVALID', 'QR 사전 노출은 0~720분 사이로 정해 주세요.');
    }
  }

  try {
    const { market, error } = await loadOwnedMarket(marketId, userId);
    if (error) return fail(res, error.status, error.code, error.message);
    if (Number(market.isExpired) === MARKET_CANCELLED) {
      return fail(res, 409, 'MARKET_CANCELLED', '취소된 마켓은 체크인을 예약할 수 없어요.');
    }

    const allDates = eachEventDate(market.eventDateMin, market.eventDateMax);
    if (allDates.length === 0) {
      return fail(res, 400, 'NO_EVENT_DATE', '개최 날짜를 확인할 수 없어요.');
    }

    // 처리할 목록을 "날짜 + 그 날의 시간" 형태로 통일합니다.
    // 일괄이든 개별이든 아래 루프는 같은 코드를 씁니다.
    let plan;
    if (perDay) {
      plan = perDay
        .filter((d) => allDates.includes(String(d.eventDate)))
        .map((d) => ({
          eventDate: String(d.eventDate),
          startTime: String(d.startTime),
          endTime: String(d.endTime),
          leadMinutes: d.leadMinutes == null ? DEFAULT_LEAD_MINUTES : Number(d.leadMinutes),
        }));
    } else {
      const targets = Array.isArray(req.body?.dates) && req.body.dates.length > 0
        ? req.body.dates.map((d) => String(d).trim()).filter((d) => allDates.includes(d))
        : allDates;
      plan = targets.map((date) => ({ eventDate: date, startTime, endTime, leadMinutes }));
    }

    const todayStr = today();
    const applied = [];
    const skipped = [];

    for (const item of plan) {
      const date = item.eventDate;
      if (date < todayStr) {
        skipped.push({ eventDate: date, reason: '이미 지난 날짜 (출석 확정됨)' });
        continue;
      }

      const existing = await findSessionByDay(marketId, date);

      // 주최자가 이미 손으로 열거나 닫은 날은 그 의사를 존중합니다.
      // 시간표가 사람의 결정을 덮어쓰면 현장에서 혼란이 생깁니다.
      if (existing && existing.status !== STATUS_SCHEDULED) {
        skipped.push({ eventDate: date, reason: `주최자가 직접 ${existing.status === STATUS_OPEN ? '연' : '닫은'} 날짜` });
        continue;
      }

      const opensAt = toDateTime(date, item.startTime);
      const closesAt = toDateTime(date, item.endTime);

      await pool.query(
        `INSERT INTO market_checkin_sessions
           (marketId, eventDate, status, secret, openedBy, opensAt, closesAt, leadMinutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           status = VALUES(status),
           opensAt = VALUES(opensAt),
           closesAt = VALUES(closesAt),
           leadMinutes = VALUES(leadMinutes),
           closedAt = NULL`,
        [marketId, date, STATUS_SCHEDULED, createSessionSecret(), userId, opensAt, closesAt, item.leadMinutes]
      );

      applied.push({
        eventDate: date, opensAt, closesAt,
        startTime: item.startTime, endTime: item.endTime, leadMinutes: item.leadMinutes,
      });
    }

    // 전부 같은 시간인지 확인해서 안내 문구를 다르게 냅니다.
    const uniform = applied.length > 0
      && applied.every((a) => a.startTime === applied[0].startTime && a.endTime === applied[0].endTime);

    return ok(res, {
      marketId,
      totalEventDays: allDates.length,
      applied,
      skipped,
    }, applied.length === 0
      ? '적용할 날짜가 없었어요.'
      : uniform
        ? `${applied.length}일치 저장했어요. 매일 ${applied[0].startTime}~${applied[0].endTime}, QR 은 ${applied[0].leadMinutes}분 전부터 나와요.`
        : `${applied.length}일치 저장했어요. 날짜마다 시간이 달라요.`);
  } catch (error) {
    console.error('[checkin] 시간대 예약 오류:', error.message);
    if (missingTable(error)) return fail(res, 500, 'CHECKIN_TABLE_MISSING', MIGRATION_HINT);
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return fail(res, 500, 'CHECKIN_SCHEDULE_COLUMNS_MISSING',
        '체크인 시간대 컬럼이 없어요. backend 폴더에서 `node scripts/migrate-add-checkin.js` 를 다시 실행한 뒤 서버를 재시작해 주세요.');
    }
    return fail(res, 500, 'SERVER_ERROR', '서버 오류로 체크인 시간을 예약하지 못했어요.');
  }
}

/* ================================================================== */
/* 판매자 — 입장 QR 발급                                               */
/* ================================================================== */

/**
 * GET /api/checkin/pass?marketId=&eventDate=
 * 판매자 폰의 「입장 QR」 화면이 45초마다 부릅니다.
 * QR 토큰과 6자리 코드를 함께 돌려줍니다. (코드는 주최자 카메라가 안 될 때의 대체 수단)
 */
export async function getSellerPass(req, res) {
  const { userId } = req.user;
  const marketId = Number(req.query.marketId);
  const eventDate = normalizeDateParam(req.query.eventDate) || today();

  if (!Number.isInteger(marketId) || marketId <= 0) {
    return fail(res, 400, 'MARKET_ID_REQUIRED', '마켓을 선택해 주세요.');
  }

  try {
    const [marketRows] = await pool.query(
      `SELECT marketId, title, isExpired, locationName,
              DATE_FORMAT(eventDate_min, '%Y-%m-%d') AS eventDateMin,
              DATE_FORMAT(eventDate_max, '%Y-%m-%d') AS eventDateMax
         FROM markets WHERE marketId = ?`,
      [marketId]
    );
    if (marketRows.length === 0) return fail(res, 404, 'MARKET_NOT_FOUND', '해당 마켓을 찾을 수 없어요.');
    const market = marketRows[0];

    // 내가 이 마켓에 가진 부스
    const [apps] = await pool.query(
      `SELECT applicationId, boothNumber, itemName, status
         FROM applications
        WHERE marketId = ? AND sellerId = ?
        ORDER BY boothNumber ASC, applicationId ASC`,
      [marketId, userId]
    );
    if (apps.length === 0) {
      return fail(res, 404, 'NO_APPLICATION', '이 마켓에 신청한 부스가 없어요.');
    }
    const eligible = apps.filter((a) => ELIGIBLE_STATUSES.includes(a.status));
    if (eligible.length === 0) {
      return apps.some((a) => a.status === 'Pending')
        ? fail(res, 403, 'NOT_APPROVED', '아직 주최자 승인 대기 중이에요. 승인 후에 입장 QR 이 나와요.')
        : fail(res, 403, 'NOT_ELIGIBLE', '입장할 수 있는 부스가 없어요. (반려·취소·환불된 신청)');
    }

    const session = await findSessionByDay(marketId, eventDate);
    const base = {
      market: {
        marketId: market.marketId,
        title: market.title,
        locationName: market.locationName,
        eventDateMin: market.eventDateMin,
        eventDateMax: market.eventDateMax,
      },
      eventDate,
      isToday: eventDate === today(),
      booths: eligible.map((a) => ({
        applicationId: a.applicationId, boothNumber: a.boothNumber, itemName: a.itemName, status: a.status,
      })),
    };

    // QR 은 "지금 체크인을 받는 시간인가"로 판정합니다.
    //   - 예약된 시간대면 시작 1시간 전(leadMinutes)부터 자동으로 나옵니다.
    //   - 주최자가 직접 열었으면 시간과 무관하게 나옵니다.
    //   - 세션 자체가 없으면 서명할 키가 없으므로 만들 수 없습니다.
    const win = resolveSessionWindow(session);
    if (!session || !win.isOpen) {
      return ok(res, {
        ...base,
        sessionOpen: false,
        token: null,
        code: null,
        phase: session ? win.phase : 'none',
        opensAt: session ? session.opensAt : null,
        closesAt: session ? session.closesAt : null,
        qrFrom: win.qrFrom,
        message: session ? win.reason : '아직 주최자가 체크인을 준비하지 않았어요.',
      }, '아직 입장 QR 을 발급할 수 없어요.');
    }

    // 이미 체크인했는지
    const [done] = await pool.query(
      `SELECT COUNT(*) AS c, MIN(checkedInAt) AS firstAt
         FROM market_checkins WHERE sessionId = ? AND sellerId = ?`,
      [session.sessionId, userId]
    );
    const checkedInCount = Number(done[0]?.c) || 0;

    const pass = issueSellerPass(session, userId);
    return ok(res, {
      ...base,
      sessionOpen: true,
      sessionId: session.sessionId,
      opensAt: session.opensAt,
      closesAt: session.closesAt,
      token: pass.token,
      expiresAt: pass.expiresAt,
      ttlSec: pass.ttlSec,
      refreshSec: PASS_REFRESH_SEC,
      code: deriveSellerCode(session, userId),
      codeSecondsLeft: codeSecondsLeft(),
      alreadyCheckedIn: checkedInCount > 0,
      checkedInBooths: checkedInCount,
      checkedInAt: done[0]?.firstAt || null,
    }, checkedInCount > 0 ? '이미 체크인된 상태예요.' : '입장 QR 을 발급했어요.');
  } catch (error) {
    console.error('[checkin] 입장 QR 발급 오류:', error.message);
    if (missingTable(error)) return fail(res, 500, 'CHECKIN_TABLE_MISSING', '체크인 기능이 아직 준비되지 않았어요. 주최자에게 문의해 주세요.');
    return fail(res, 500, 'SERVER_ERROR', '서버 오류로 입장 QR 을 만들지 못했어요.');
  }
}

/* ================================================================== */
/* 주최자 — 스캔 처리                                                  */
/* ================================================================== */

/**
 * POST /api/checkin/scan
 *   body: { token }                      QR 을 찍은 경우
 *   body: { sessionId, code, sellerId? } 6자리 코드를 입력한 경우
 *
 * 두 경우 모두 같은 결과(그 판매자의 승인·결제 부스 전부 출석)를 냅니다.
 */
export async function scanCheckin(req, res) {
  const { userId } = req.user;
  const token = String(req.body?.token || '').trim();
  const code = String(req.body?.code || '').trim();
  const bodySessionId = Number(req.body?.sessionId);

  try {
    let session = null;
    let sellerId = null;
    let method = 'qr';

    if (token) {
      const parsed = parseSellerPass(token);
      if (!parsed) return fail(res, 400, 'PASS_MALFORMED', '이 서비스의 입장 QR 이 아니에요.');

      session = await loadSessionById(parsed.sessionId);
      if (!session) return fail(res, 404, 'SESSION_NOT_FOUND', '체크인 정보를 찾을 수 없어요.');

      const verified = verifySellerPass(token, session.secret);
      if (!verified.ok) {
        return fail(res, verified.code === 'PASS_EXPIRED' ? 410 : 400, verified.code, verified.message);
      }
      sellerId = verified.sellerId;
    } else if (code) {
      if (!Number.isInteger(bodySessionId) || bodySessionId <= 0) {
        return fail(res, 400, 'SESSION_ID_REQUIRED', '체크인 세션 정보가 없어요. 화면을 새로고침해 주세요.');
      }
      if (!/^\d{6}$/.test(code)) {
        return fail(res, 400, 'CODE_MALFORMED', '6자리 숫자를 입력해 주세요.');
      }
      session = await loadSessionById(bodySessionId);
      if (!session) return fail(res, 404, 'SESSION_NOT_FOUND', '체크인 세션을 찾을 수 없어요.');
      method = 'code';
      // sellerId 는 아래에서 후보를 훑어 찾습니다.
    } else {
      return fail(res, 400, 'INPUT_REQUIRED', 'QR 을 찍거나 6자리 코드를 입력해 주세요.');
    }

    // 스캔은 주최자 본인만
    if (Number(session.hostId) !== Number(userId)) {
      return fail(res, 403, 'NOT_MARKET_OWNER', '본인이 주최한 마켓만 체크인할 수 있어요.');
    }
    const scanWin = resolveSessionWindow(session);
    if (!scanWin.isOpen) {
      // 시간이 지나 자동으로 닫힌 경우도 여기서 걸립니다.
      // 늦게 온 판매자를 받아야 하면 주최자가 「체크인 시작」을 눌러 수동으로 열면 됩니다.
      return fail(res, 409, 'SESSION_CLOSED', scanWin.reason + ' 늦게 온 분을 받으시려면 「체크인 시작」을 눌러 주세요.');
    }
    if (Number(session.isExpired) === MARKET_CANCELLED) {
      return fail(res, 409, 'MARKET_CANCELLED', '취소된 마켓이에요.');
    }

    // 이 마켓의 출석 대상 신청 전부
    const [rows] = await pool.query(
      `SELECT a.applicationId, a.sellerId, a.boothNumber, a.itemName, u.nickname AS sellerNickname
         FROM applications a
         LEFT JOIN users u ON u.userId = a.sellerId
        WHERE a.marketId = ? AND a.status IN (${STATUS_PLACEHOLDERS})`,
      [session.marketId, ...ELIGIBLE_STATUSES]
    );

    if (method === 'code') {
      // 후보(이 마켓의 출석 대상 판매자)를 훑어 코드가 맞는 사람을 찾습니다.
      // 코드를 DB 에 저장하지 않으므로 이 방식이 필요하고, 인원이 수십 명 수준이라 비용도 미미합니다.
      const candidates = [...new Set(rows.map((r) => Number(r.sellerId)))];
      const matched = candidates.filter((id) => matchSellerCode(session, id, code));
      if (matched.length === 0) {
        return fail(res, 404, 'CODE_NOT_MATCHED', '맞는 코드가 없어요. 판매자 화면의 최신 6자리를 다시 확인해 주세요.');
      }
      if (matched.length > 1) {
        // 6자리라 이론상 충돌이 가능합니다. 잘못된 사람을 출석 처리하느니 다시 받는 편이 낫습니다.
        return fail(res, 409, 'CODE_AMBIGUOUS', '코드가 겹쳤어요. 잠시 뒤 새 코드로 다시 시도해 주세요.');
      }
      sellerId = matched[0];
    }

    const mine = rows.filter((r) => Number(r.sellerId) === Number(sellerId));
    if (mine.length === 0) {
      return fail(res, 404, 'NO_APPLICATION', '이 마켓에 출석 처리할 부스가 없는 판매자예요.');
    }

    const ids = mine.map((a) => a.applicationId);
    const idPlaceholders = ids.map(() => '?').join(', ');

    // "이미 찍혀 있던 것"은 넣기 **전에** 확인합니다.
    //   처음에는 checkedInAt 이 몇 초 전인지로 판단했는데, 주최자가 같은 사람을 연달아 두 번
    //   찍으면 두 번째도 "방금 찍힘"으로 잡혀 「체크인 완료」가 또 떴습니다.
    //   기록은 UNIQUE 로 하나만 남으니 데이터는 멀쩡했지만, 화면이 거짓말을 하고 있었습니다.
    //   존재 여부를 먼저 읽으면 시간 계산이 필요 없어 정확합니다.
    const [before] = await pool.query(
      `SELECT applicationId FROM market_checkins
        WHERE sessionId = ? AND applicationId IN (${idPlaceholders})`,
      [session.sessionId, ...ids]
    );
    const alreadySet = new Set(before.map((r) => Number(r.applicationId)));

    // 남은 건만 넣습니다. (동시에 두 기기로 찍어도 UNIQUE(sessionId, applicationId) 가 최종 방어)
    const values = mine
      .filter((a) => !alreadySet.has(Number(a.applicationId)))
      .map((a) => [session.sessionId, session.marketId, a.applicationId, sellerId, method, userId]);
    if (values.length > 0) {
      await pool.query(
        `INSERT IGNORE INTO market_checkins
           (sessionId, marketId, applicationId, sellerId, method, checkedBy)
         VALUES ?`,
        [values]
      );
    }

    const [saved] = await pool.query(
      `SELECT applicationId, checkedInAt FROM market_checkins
        WHERE sessionId = ? AND applicationId IN (${idPlaceholders})`,
      [session.sessionId, ...ids]
    );
    const savedMap = new Map(saved.map((s) => [Number(s.applicationId), s]));

    const booths = mine.map((a) => {
      const row = savedMap.get(Number(a.applicationId));
      return {
        applicationId: a.applicationId,
        boothNumber: a.boothNumber,
        itemName: a.itemName,
        checkedInAt: row ? row.checkedInAt : null,
        alreadyCheckedIn: alreadySet.has(Number(a.applicationId)),
      };
    });
    const newlyChecked = booths.filter((b) => !b.alreadyCheckedIn).length;

    return ok(res, {
      sessionId: session.sessionId,
      marketId: session.marketId,
      eventDate: session.eventDate,
      sellerId,
      sellerNickname: mine[0].sellerNickname,
      method,
      booths,
      newlyChecked,
      alreadyChecked: booths.length - newlyChecked,
    }, newlyChecked > 0
      ? `${mine[0].sellerNickname || '판매자'} 님 체크인 완료 (부스 ${newlyChecked}칸)`
      : `${mine[0].sellerNickname || '판매자'} 님은 이미 체크인된 상태예요.`);
  } catch (error) {
    console.error('[checkin] 스캔 처리 오류:', error.message);
    if (missingTable(error)) return fail(res, 500, 'CHECKIN_TABLE_MISSING', MIGRATION_HINT);
    return fail(res, 500, 'SERVER_ERROR', '서버 오류로 체크인하지 못했어요.');
  }
}

/**
 * POST /api/checkin/manual   body: { sessionId, applicationId }
 * QR 도 코드도 못 쓰는 상황에서 주최자가 명단에서 직접 눌러 처리합니다.
 * 기록은 method='manual' 로 남아 나중에 구분할 수 있습니다.
 */
export async function manualCheckin(req, res) {
  const { userId } = req.user;
  const sessionId = Number(req.body?.sessionId);
  const applicationId = Number(req.body?.applicationId);

  if (!Number.isInteger(sessionId) || sessionId <= 0 || !Number.isInteger(applicationId) || applicationId <= 0) {
    return fail(res, 400, 'INVALID_PARAM', '세션과 신청 정보를 확인해 주세요.');
  }

  try {
    const session = await loadSessionById(sessionId);
    if (!session) return fail(res, 404, 'SESSION_NOT_FOUND', '체크인 세션을 찾을 수 없어요.');
    if (Number(session.hostId) !== Number(userId)) {
      return fail(res, 403, 'NOT_MARKET_OWNER', '본인이 주최한 마켓만 출석 처리할 수 있어요.');
    }
    if (!resolveSessionWindow(session).isOpen) {
      return fail(res, 409, 'SESSION_CLOSED', '지금은 체크인을 받는 시간이 아니에요. 「체크인 시작」을 눌러 주세요.');
    }

    const [apps] = await pool.query(
      `SELECT applicationId, sellerId, boothNumber, status
         FROM applications WHERE applicationId = ? AND marketId = ?`,
      [applicationId, session.marketId]
    );
    if (apps.length === 0) return fail(res, 404, 'APPLICATION_NOT_FOUND', '이 마켓의 신청이 아니에요.');

    const app = apps[0];
    if (!ELIGIBLE_STATUSES.includes(app.status)) {
      return fail(res, 409, 'NOT_ELIGIBLE', '승인된 신청만 출석 처리할 수 있어요.');
    }

    await pool.query(
      `INSERT IGNORE INTO market_checkins
         (sessionId, marketId, applicationId, sellerId, method, checkedBy)
       VALUES (?, ?, ?, ?, 'manual', ?)`,
      [sessionId, session.marketId, applicationId, app.sellerId, userId]
    );

    return ok(res, { applicationId, boothNumber: app.boothNumber }, '출석 처리했어요.');
  } catch (error) {
    console.error('[checkin] 수동 출석 오류:', error.message);
    if (missingTable(error)) return fail(res, 500, 'CHECKIN_TABLE_MISSING', MIGRATION_HINT);
    return fail(res, 500, 'SERVER_ERROR', '서버 오류로 출석 처리하지 못했어요.');
  }
}

/** DELETE /api/checkin/records/:checkinId — 잘못 처리한 출석 되돌리기 */
export async function cancelCheckin(req, res) {
  const { userId } = req.user;
  const checkinId = Number(req.params.checkinId);
  if (!Number.isInteger(checkinId) || checkinId <= 0) {
    return fail(res, 400, 'INVALID_PARAM', '출석 기록을 찾을 수 없어요.');
  }

  try {
    const [rows] = await pool.query(
      `SELECT c.checkinId, m.hostId, DATE_FORMAT(s.eventDate, '%Y-%m-%d') AS eventDate
         FROM market_checkins c
         JOIN market_checkin_sessions s ON s.sessionId = c.sessionId
         JOIN markets m ON m.marketId = c.marketId
        WHERE c.checkinId = ?`,
      [checkinId]
    );
    if (rows.length === 0) return fail(res, 404, 'CHECKIN_NOT_FOUND', '출석 기록을 찾을 수 없어요.');
    if (Number(rows[0].hostId) !== Number(userId)) {
      return fail(res, 403, 'NOT_MARKET_OWNER', '본인이 주최한 마켓만 수정할 수 있어요.');
    }
    // 지난 날짜의 출석을 지우면 그 판매자의 노쇼가 소급해서 늘어납니다. 그래서 당일까지만 허용합니다.
    if (rows[0].eventDate < today()) {
      return fail(res, 409, 'DATE_ALREADY_PASSED', '지난 날짜의 출석은 취소할 수 없어요. 이미 기록이 확정됐어요.');
    }

    await pool.query('DELETE FROM market_checkins WHERE checkinId = ?', [checkinId]);
    return ok(res, { checkinId }, '출석을 취소했어요.');
  } catch (error) {
    console.error('[checkin] 출석 취소 오류:', error.message);
    return fail(res, 500, 'SERVER_ERROR', '서버 오류로 출석을 취소하지 못했어요.');
  }
}

/* ================================================================== */
/* 출석 / 노쇼 통계                                                    */
/* ================================================================== */

/** GET /api/checkin/stats/me — 마이페이지(판매자 모드)용 */
export async function getMyAttendanceStats(req, res) {
  try {
    const stats = await getSellerAttendance(req.user.userId);
    return ok(res, stats, '출석 현황을 조회했어요.');
  } catch (error) {
    console.error('[checkin] 내 출석 통계 오류:', error.message);
    return fail(res, 500, 'SERVER_ERROR', '서버 오류로 출석 현황을 불러오지 못했어요.');
  }
}

/** GET /api/checkin/stats/:userId — 남의 프로필에서 노쇼 횟수를 보는 용도(공개) */
export async function getUserAttendanceStats(req, res) {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return fail(res, 400, 'INVALID_PARAM', '사용자를 찾을 수 없어요.');
  }
  try {
    const stats = await getSellerAttendance(userId);
    // 공개 프로필이므로 마켓별 상세는 빼고 합계만 내보냅니다.
    const { byMarket, ...summary } = stats;
    return ok(res, summary, '출석 현황을 조회했어요.');
  } catch (error) {
    console.error('[checkin] 출석 통계 오류:', error.message);
    return fail(res, 500, 'SERVER_ERROR', '서버 오류로 출석 현황을 불러오지 못했어요.');
  }
}

/** GET /api/checkin/my?marketId= — 판매자의 출석 이력 */
export async function getMyCheckins(req, res) {
  const { userId } = req.user;
  const marketId = Number(req.query.marketId);

  try {
    const params = [userId];
    let where = 'c.sellerId = ?';
    if (Number.isInteger(marketId) && marketId > 0) {
      where += ' AND c.marketId = ?';
      params.push(marketId);
    }

    const [rows] = await pool.query(
      `SELECT c.checkinId, c.marketId, c.applicationId, c.method, c.checkedInAt,
              DATE_FORMAT(s.eventDate, '%Y-%m-%d') AS eventDate,
              m.title AS marketTitle, a.boothNumber
         FROM market_checkins c
         JOIN market_checkin_sessions s ON s.sessionId = c.sessionId
         JOIN markets m ON m.marketId = c.marketId
         LEFT JOIN applications a ON a.applicationId = c.applicationId
        WHERE ${where}
        ORDER BY c.checkedInAt DESC
        LIMIT 100`,
      params
    );
    return ok(res, rows, '내 출석 내역을 조회했어요.');
  } catch (error) {
    if (missingTable(error)) return ok(res, [], '아직 출석 내역이 없어요.');
    console.error('[checkin] 내 출석 조회 오류:', error.message);
    return fail(res, 500, 'SERVER_ERROR', '서버 오류로 출석 내역을 불러오지 못했어요.');
  }
}

export default {
  openCheckinSession,
  scheduleCheckin,
  closeCheckinSession,
  getCheckinSession,
  getSellerPass,
  scanCheckin,
  manualCheckin,
  cancelCheckin,
  getMyAttendanceStats,
  getUserAttendanceStats,
  getMyCheckins,
};
