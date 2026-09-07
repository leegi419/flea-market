// backend/controllers/notificationController.js
// [추가] 알림(종 버튼) 목록 조회 / 안읽음 개수 / 읽음 처리

import pool from '../config/db.js';
// [알림 히스토리] 종류 필터를 묶음 단위로 받기 위해 알림 묶음 정의를 씁니다.
import { NOTIFICATION_CATEGORIES } from '../utills/notificationSettings.js';

/** 알림 보관 기간(일). 이보다 오래된 것은 스케줄러가 지웁니다. */
export const RETENTION_DAYS = 7;

/**
 * GET /api/notifications
 *   ?limit=&page=&audience=host|seller&category=&unreadOnly=true
 *
 * 종 버튼(최근 몇 건)과 히스토리 화면(페이지 넘기기)이 같은 API 를 씁니다.
 * 파라미터를 안 주면 예전과 똑같이 최근 30건을 돌려주므로 기존 화면은 그대로 동작합니다.
 *
 * ── 역할 필터 ─────────────────────────────────────────────────────
 *   audience 컬럼이 이미 host/seller 로 나뉘어 있어 컬럼 추가 없이 됩니다.
 *   주최자는 두 역할의 알림을 다 받으므로, 화면에서 전환해 따로 볼 수 있어야 합니다.
 *
 * ── 왜 총 개수를 함께 주나 ────────────────────────────────────────
 *   페이지 버튼을 그리려면 전체가 몇 건인지 알아야 합니다.
 *   화면이 따로 세면 필터 조건이 어긋나 마지막 페이지가 비는 일이 생깁니다.
 */
export async function getNotifications(req, res) {
  const { userId } = req.user;
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * limit;

  const audience = req.query.audience === 'host' || req.query.audience === 'seller'
    ? req.query.audience : null;
  const unreadOnly = String(req.query.unreadOnly) === 'true';

  // 종류 필터는 묶음 키로 받습니다. (seller_payment 등)
  //   화면이 알림 타입을 하나하나 알 필요가 없고,
  //   타입이 늘어도 화면을 고치지 않아도 됩니다.
  const category = String(req.query.category || '').trim();
  const categoryDef = category
    ? NOTIFICATION_CATEGORIES.find((c) => c.key === category)
    : null;

  const where = ['userId = ?'];
  const params = [userId];

  if (audience) { where.push('audience = ?'); params.push(audience); }
  if (unreadOnly) where.push('isRead = 0');
  if (categoryDef && categoryDef.types.length > 0) {
    where.push(`type IN (${categoryDef.types.map(() => '?').join(', ')})`);
    params.push(...categoryDef.types);
  }
  const whereSql = where.join(' AND ');

  try {
    const [rows] = await pool.query(
      `SELECT notificationId, audience, type, title, message, marketId, applicationId, isRead, createdAt
       FROM notifications
       WHERE ${whereSql}
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM notifications WHERE ${whereSql}`, params
    );
    const total = Number(countRows[0].total) || 0;

    return res.status(200).json({
      success: true,
      // 예전 화면이 data 를 배열로 쓰고 있어 형태를 바꾸지 않습니다.
      //   페이지 정보는 별도 필드로 얹습니다.
      data: rows,
      page: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: offset + rows.length < total,
      },
      retentionDays: RETENTION_DAYS,
      message: '알림 목록을 조회했습니다.',
    });
  } catch (error) {
    console.error('알림 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 알림을 불러오지 못했습니다.' });
  }
}

/**
 * GET /api/notifications/filters
 * 히스토리 화면이 종류 드롭다운을 그릴 때 씁니다.
 * 목록을 화면에 하드코딩하면 서버와 갈라져, 고를 수는 있는데 결과가 안 나오는 상태가 됩니다.
 */
export async function getNotificationFilters(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      categories: NOTIFICATION_CATEGORIES.map((c) => ({
        key: c.key, label: c.label, role: c.role,
      })),
      retentionDays: RETENTION_DAYS,
    },
    message: '알림 필터 목록이에요.',
  });
}

// GET /api/notifications/unread-count (로그인 필요)
export async function getUnreadCount(req, res) {
  const { userId } = req.user;

  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS unreadCount FROM notifications WHERE userId = ? AND isRead = 0`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: { unreadCount: rows[0].unreadCount },
      message: '안읽은 알림 개수를 조회했습니다.',
    });
  } catch (error) {
    console.error('안읽은 알림 개수 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 조회에 실패했습니다.' });
  }
}

// PATCH /api/notifications/:notificationId/read (로그인 필요, 본인 알림만)
export async function markNotificationRead(req, res) {
  const { userId } = req.user;
  const { notificationId } = req.params;

  try {
    const [rows] = await pool.query(
      'SELECT notificationId, userId FROM notifications WHERE notificationId = ?',
      [notificationId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 알림을 찾을 수 없습니다.' });
    }
    if (Number(rows[0].userId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인의 알림만 처리할 수 있습니다.' });
    }

    await pool.query('UPDATE notifications SET isRead = 1 WHERE notificationId = ?', [notificationId]);

    return res.status(200).json({ success: true, data: { notificationId: Number(notificationId) }, message: '알림을 읽음 처리했습니다.' });
  } catch (error) {
    console.error('알림 읽음 처리 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 처리에 실패했습니다.' });
  }
}

// PATCH /api/notifications/read-all (로그인 필요)
export async function markAllNotificationsRead(req, res) {
  const { userId } = req.user;

  try {
    await pool.query('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0', [userId]);
    return res.status(200).json({ success: true, data: null, message: '모든 알림을 읽음 처리했습니다.' });
  } catch (error) {
    console.error('전체 알림 읽음 처리 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 처리에 실패했습니다.' });
  }
}
