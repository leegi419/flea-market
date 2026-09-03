// backend/services/notificationScheduler.js
// [예약 알림] 모집 종료 1일 전 · 결제 마감 N시간 전
//
// ── 스케줄러란 ────────────────────────────────────────────────────
//   지금 서버는 "누가 요청을 보낼 때만" 움직입니다. 아무도 접속하지 않으면
//   아무 일도 일어나지 않으므로, "오후 4시에 알림 보내기" 같은 건 불가능합니다.
//   이 파일이 서버 안에서 일정 주기로 스스로 검사를 돌려 그 문제를 메웁니다.
//
//   패키지(node-cron 등)를 쓰지 않고 setInterval 로 만든 이유:
//     팀 서버가 한 대뿐이라 중복 실행 걱정이 없고, 의존성 없이 이 파일 하나로 끝납니다.
//
// ── 서버가 꺼져 있던 동안은 어떻게 되나 ───────────────────────────
//   "지금이 정확히 마감 1시간 전인가" 로 판단하면, 그 순간 서버가 꺼져 있었을 때
//   알림이 영원히 안 나갑니다. 그래서 시각이 아니라 **상태**로 판단합니다.
//     - 조건: 마감이 아직 지나지 않았고, 남은 시간이 설정한 시간 이하
//     - 그리고 notification_sent_log 에 보낸 기록이 없을 것
//   이렇게 하면 서버를 껐다 켜도 다음 검사에서 한 번은 나가고, 두 번은 안 나갑니다.
//
// ── 왜 사람마다 다른 시간을 처리할 수 있나 ────────────────────────
//   결제 마감 알림은 사용자가 1~24시간 중에 고릅니다.
//   그래서 "마감 1시간 전인 신청" 을 찾는 게 아니라,
//   "각자 설정한 시간 안에 들어온 신청" 을 찾습니다. (아래 쿼리의 leadHours 비교)

import pool from '../config/db.js';
import { createNotification } from './notificationService.js';
import { LEAD_HOURS_DEFAULT, NOTIFY_HOUR_DEFAULT } from '../utills/notificationSettings.js';
import { findUnnotifiedAbsences } from '../utills/checkinStats.js';

/** 검사 주기(분). 짧을수록 정확하지만 DB 를 자주 두드립니다. */
const INTERVAL_MINUTES = 5;

/** 너무 오래된 건은 지금 보내봐야 의미가 없습니다. (서버가 며칠 꺼져 있던 경우) */
const STALE_HOURS = 48;

/** 서버가 며칠 꺼져 있었어도 이 기간 안의 건은 챙깁니다. */
const ABSENCE_LOOKBACK_DAYS = 7;

let timer = null;

function isMissingTable(error) {
  return error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146);
}

/** 이미 보냈는지 확인하고, 안 보냈으면 기록을 남깁니다. (남기기 성공 = 이번에 보낼 차례) */
async function claim(userId, kind, targetType, targetId) {
  try {
    const [r] = await pool.query(
      `INSERT IGNORE INTO notification_sent_log (userId, kind, targetType, targetId)
       VALUES (?, ?, ?, ?)`,
      [userId, kind, targetType, targetId]
    );
    // UNIQUE 제약 덕분에, 이미 있으면 affectedRows 가 0 입니다.
    // 이 방식이면 "확인 후 저장" 사이에 끼어드는 중복도 막힙니다.
    return r.affectedRows > 0;
  } catch (error) {
    if (isMissingTable(error)) return false;
    console.error('[예약알림] 발송 기록 실패:', error.message);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 1) 모집 종료 1일 전 — 아직 신청하지 않은 판매자에게                 */
/* ------------------------------------------------------------------ */

async function notifyRecruitClosing() {
  // 모집 마감일이 "내일" 인 마켓.
  //   recruitmentDate_max 는 DATE 라 시각이 없습니다. 날짜 차이로 판단합니다.
  const [markets] = await pool.query(
    `SELECT m.marketId, m.title, m.region,
            DATE_FORMAT(m.recruitmentDate_max, '%Y-%m-%d') AS closeDate
       FROM markets m
      WHERE m.isExpired = 0
        AND m.recruitmentDate_max IS NOT NULL
        AND DATEDIFF(m.recruitmentDate_max, CURDATE()) = 1`
  );
  if (markets.length === 0) return 0;

  let sent = 0;
  for (const m of markets) {
    // 이미 이 마켓에 신청한 사람에게는 보내지 않습니다. 재촉이 되니까요.
    // 신규 마켓 알림 지역 설정을 그대로 재사용합니다 — 관심 지역이 곧 대상입니다.
    const [users] = await pool.query(
      `SELECT u.userId
         FROM users u
         LEFT JOIN notification_settings s ON s.userId = u.userId AND s.category = 'deadline'
        WHERE (s.enabled IS NULL OR s.enabled = 1)
          AND NOT EXISTS (
                SELECT 1 FROM applications a
                 WHERE a.marketId = ? AND a.sellerId = u.userId
                   AND a.status IN ('Pending','Approved','Paid'))
          AND (
                NOT EXISTS (SELECT 1 FROM notification_regions r WHERE r.userId = u.userId)
                OR EXISTS (SELECT 1 FROM notification_regions r WHERE r.userId = u.userId AND r.region = ?)
              )`,
      [m.marketId, m.region || '']
    );

    for (const u of users) {
      if (!(await claim(u.userId, 'recruit_closing', 'market', m.marketId))) continue;
      await createNotification({
        userId: u.userId,
        audience: 'seller',
        type: 'recruit_closing',
        title: '모집 마감 하루 전이에요',
        message: `「${m.title}」 부스 모집이 ${m.closeDate}에 마감돼요. 신청하시려면 서둘러 주세요.`,
        marketId: m.marketId,
      });
      sent += 1;
    }
  }
  return sent;
}

/* ------------------------------------------------------------------ */
/* 2) 결제 마감 N시간 전 — 승인받고 아직 결제 안 한 판매자에게         */
/* ------------------------------------------------------------------ */

async function notifyPaymentDue() {
  // 사람마다 설정한 시간(leadHours)이 다르므로, 그 값을 조건에 직접 씁니다.
  //   설정이 없으면 기본 1시간.
  //   "남은 시간 <= 설정 시간" 이라 서버가 잠깐 꺼져 있어도 다음 검사에서 잡힙니다.
  const [rows] = await pool.query(
    `SELECT a.applicationId, a.sellerId, a.paymentDueAt, m.marketId, m.title,
            COALESCE(s.leadHours, ?) AS leadHours
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       LEFT JOIN notification_settings s ON s.userId = a.sellerId AND s.category = 'deadline'
      WHERE a.status = 'Approved'
        AND a.paymentDueAt IS NOT NULL
        AND a.paymentDueAt > NOW()
        AND m.isExpired <> 2
        AND (s.enabled IS NULL OR s.enabled = 1)
        AND TIMESTAMPDIFF(MINUTE, NOW(), a.paymentDueAt) <= COALESCE(s.leadHours, ?) * 60
        AND TIMESTAMPDIFF(HOUR, NOW(), a.paymentDueAt) < ?`,
    [LEAD_HOURS_DEFAULT, LEAD_HOURS_DEFAULT, STALE_HOURS]
  );

  let sent = 0;
  for (const r of rows) {
    if (!(await claim(r.sellerId, 'payment_due', 'application', r.applicationId))) continue;

    const leftMin = Math.max(1, Math.round((new Date(r.paymentDueAt) - Date.now()) / 60000));
    const left = leftMin >= 60 ? `${Math.floor(leftMin / 60)}시간 ${leftMin % 60}분` : `${leftMin}분`;

    await createNotification({
      userId: r.sellerId,
      audience: 'seller',
      type: 'payment_due',
      title: '결제 마감이 다가와요',
      message: `「${r.title}」 부스료 결제가 ${left} 뒤에 마감돼요. 기한이 지나면 자리가 취소될 수 있어요.`,
      marketId: r.marketId,
      applicationId: r.applicationId,
    });
    sent += 1;
  }
  return sent;
}

/* ------------------------------------------------------------------ */
/* 3) 미참여 확정 통지 — 마켓이 끝난 뒤, 오전에 한 번                  */
/* ------------------------------------------------------------------ */

/**
 * 통지 시각은 사용자가 정합니다 (기본 오전 10시).
 *   판정 자체는 자정에 끝나지만, 그때 바로 보내면 새벽에 알림이 울립니다.
 *
 * 왜 마켓 단위인가
 *   7일 마켓에서 하루 빠진 것과 아예 안 나온 것은 다릅니다.
 *   전자는 「중도 이탈」, 후자는 「노쇼」 로 나눠 문구도 다르게 씁니다.
 */
async function notifyAbsences() {
  const rows = await findUnnotifiedAbsences(ABSENCE_LOOKBACK_DAYS);
  if (rows.length === 0) return 0;

  // 받을 시각은 사람마다 다릅니다. 대상자들의 설정을 한 번에 읽습니다.
  const sellerIds = [...new Set(rows.map((r) => r.sellerId))];
  const hourBySeller = new Map();
  try {
    const [prefs] = await pool.query(
      `SELECT userId, notifyHour FROM notification_settings
        WHERE category = 'attendance' AND userId IN (${sellerIds.map(() => '?').join(', ')})`,
      sellerIds
    );
    for (const p of prefs) hourBySeller.set(Number(p.userId), Number(p.notifyHour));
  } catch (error) {
    if (!isMissingTable(error)) console.error('[예약알림] 통지 시각 조회 실패:', error.message);
  }

  const nowHour = new Date().getHours();

  let sent = 0;
  for (const r of rows) {
    // 설정한 시각이 되기 전에는 보내지 않습니다.
    //   판정은 자정에 끝나지만, 그때 보내면 새벽에 "미참여로 기록됐어요" 가 울립니다.
    //   기분 좋은 알림이 아닌데 한밤중에 받으면 더 나쁩니다.
    // 그 시각을 놓쳐도 발송 기록이 없으므로 다음 날 같은 시각에 나갑니다.
    const wanted = hourBySeller.has(r.sellerId)
      ? hourBySeller.get(r.sellerId)
      : NOTIFY_HOUR_DEFAULT;
    if (nowHour !== wanted) continue;
    // 마켓 하나당 한 번만. 같은 마켓에 부스가 여러 칸이어도 알림은 1건입니다.
    if (!(await claim(r.sellerId, 'absence_recorded', 'market', r.marketId))) continue;

    const isNoShow = r.outcome === 'no_show';

    // "노쇼" 라는 말을 본문에 직접 쓰지 않습니다.
    //   프로필 지표로는 그 단어가 맞지만, 통지문에서는 사실만 적고
    //   이의 제기 경로를 함께 주는 편이 낫습니다.
    //   주최자가 체크인을 깜빡해 미참여로 잡히는 경우가 실제로 생기기 때문입니다.
    const detail = isNoShow
      ? `${r.openDays}일 모두 체크인 기록이 없어 미참여로 기록됐어요.`
      : `${r.openDays}일 중 ${r.missedDays}일 체크인 기록이 없어 중도 이탈로 기록됐어요.`;

    await createNotification({
      userId: r.sellerId,
      audience: 'seller',
      type: 'absence_recorded',
      title: isNoShow ? '현장 체크인 기록이 없어요' : '일부 날짜에 체크인 기록이 없어요',
      message: `「${r.marketTitle}」 ${detail} 실제로 참여하셨다면 주최자에게 문의해 주세요.`,
      marketId: r.marketId,
    });
    sent += 1;
  }
  return sent;
}

/* ------------------------------------------------------------------ */

/** 한 번 검사합니다. 스케줄러 없이 수동으로 부를 수도 있습니다. */
export async function runNotificationChecks() {
  try {
    const recruit = await notifyRecruitClosing();
    const payment = await notifyPaymentDue();
    const absence = await notifyAbsences();
    if (recruit + payment + absence > 0) {
      console.log(`🔔 예약 알림 발송: 모집마감 ${recruit}건 / 결제마감 ${payment}건 / 미참여 ${absence}건`);
    }
    return { recruit, payment, absence };
  } catch (error) {
    if (isMissingTable(error)) {
      console.warn('⚠️ 알림 설정 테이블이 없어요. `node scripts/migrate-add-notification-settings.js` 를 실행해 주세요.');
      return { recruit: 0, payment: 0, absence: 0 };
    }
    // 스케줄러가 죽으면 이후 알림이 통째로 멈추므로, 오류를 삼키고 다음 주기를 기다립니다.
    console.error('[예약알림] 검사 중 오류(다음 주기에 재시도):', error.message);
    return { recruit: 0, payment: 0 };
  }
}

/** 서버 시작 시 한 번 호출합니다. */
export function startNotificationScheduler() {
  if (timer) return;

  // 서버를 켠 직후에도 한 번 검사합니다.
  // 꺼져 있던 동안 마감이 임박한 건을 바로 잡기 위해서입니다.
  runNotificationChecks();

  timer = setInterval(runNotificationChecks, INTERVAL_MINUTES * 60 * 1000);
  // 이 타이머 때문에 프로세스가 종료되지 않는 일이 없도록 참조를 풉니다.
  if (typeof timer.unref === 'function') timer.unref();

  console.log(`🔔 예약 알림 스케줄러 시작 (${INTERVAL_MINUTES}분마다 검사)`);
}

export function stopNotificationScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

export default { runNotificationChecks, startNotificationScheduler, stopNotificationScheduler };
