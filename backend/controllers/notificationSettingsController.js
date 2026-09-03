// backend/controllers/notificationSettingsController.js
// [알림 설정] 조회 / 저장

import pool from '../config/db.js';
import {
  NOTIFICATION_CATEGORIES, LEAD_HOURS_MIN, LEAD_HOURS_MAX, LEAD_HOURS_DEFAULT,
  NOTIFY_HOUR_DEFAULT, getUserNotificationSettings, isLockedCategory,
  clampLeadHours, clampNotifyHour,
} from '../utills/notificationSettings.js';

const VALID_KEYS = new Set(NOTIFICATION_CATEGORIES.map((c) => c.key));

/** GET /api/notifications/settings — 화면이 토글을 그릴 때 씁니다. */
export async function getNotificationSettings(req, res) {
  try {
    const s = await getUserNotificationSettings(pool, req.user.userId);

    // 정의와 현재 값을 함께 내려, 화면이 목록을 하드코딩하지 않게 합니다.
    const categories = NOTIFICATION_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      description: c.description,
      locked: !!c.lockedOn,
      hasLeadHours: !!c.hasLeadHours,
      hasRegions: !!c.hasRegions,
      hasNotifyHour: !!c.hasNotifyHour,
      enabled: c.lockedOn ? true : (s.categories[c.key] === undefined ? true : s.categories[c.key]),
    }));

    // 사용자가 사는 지역을 기본 후보로 함께 줍니다.
    const [regionRows] = await pool.query(
      'SELECT DISTINCT region FROM markets WHERE region IS NOT NULL AND region <> "" ORDER BY region'
    );

    return res.status(200).json({
      success: true,
      data: {
        categories,
        regions: s.regions,
        allRegions: regionRows.map((r) => r.region),
        leadHours: s.leadHours,
        notifyHour: s.notifyHour,
        leadHoursMin: LEAD_HOURS_MIN,
        leadHoursMax: LEAD_HOURS_MAX,
        available: s.available,
      },
      message: '알림 설정을 조회했어요.',
    });
  } catch (error) {
    console.error('[알림설정] 조회 오류:', error.message);
    return res.status(500).json({ success: false, message: '알림 설정을 불러오지 못했어요.' });
  }
}

/**
 * PUT /api/notifications/settings
 *   body: { categories: {key: bool}, regions: string[], leadHours: number }
 *
 * 화면의 상태를 통째로 받아 그대로 맞춥니다.
 * 항목별 API 를 따로 두면 저장 중간에 실패했을 때 화면과 서버가 어긋납니다.
 */
export async function updateNotificationSettings(req, res) {
  const { userId } = req.user;
  const categories = req.body?.categories || {};
  const regions = Array.isArray(req.body?.regions) ? req.body.regions : null;
  const leadHours = req.body?.leadHours == null ? null : clampLeadHours(req.body.leadHours);
  const notifyHour = req.body?.notifyHour == null ? null : clampNotifyHour(req.body.notifyHour);

  try {
    for (const [key, value] of Object.entries(categories)) {
      if (!VALID_KEYS.has(key)) continue;          // 모르는 키는 조용히 무시
      if (isLockedCategory(key)) continue;          // 잠긴 묶음은 끌 수 없습니다

      const enabled = value ? 1 : 0;
      const lead = key === 'deadline' ? (leadHours ?? LEAD_HOURS_DEFAULT) : LEAD_HOURS_DEFAULT;
      const hour = key === 'attendance' ? (notifyHour ?? NOTIFY_HOUR_DEFAULT) : NOTIFY_HOUR_DEFAULT;
      await pool.query(
        `INSERT INTO notification_settings (userId, category, enabled, leadHours, notifyHour)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled),
                                 leadHours = VALUES(leadHours),
                                 notifyHour = VALUES(notifyHour)`,
        [userId, key, enabled, lead, hour]
      );
    }

    // 토글을 안 건드리고 시간만 바꾼 경우도 반영합니다.
    if (leadHours != null && categories.deadline === undefined) {
      await pool.query(
        `INSERT INTO notification_settings (userId, category, enabled, leadHours)
         VALUES (?, 'deadline', 1, ?)
         ON DUPLICATE KEY UPDATE leadHours = VALUES(leadHours)`,
        [userId, leadHours]
      );
    }
    if (notifyHour != null && categories.attendance === undefined) {
      await pool.query(
        `INSERT INTO notification_settings (userId, category, enabled, notifyHour)
         VALUES (?, 'attendance', 1, ?)
         ON DUPLICATE KEY UPDATE notifyHour = VALUES(notifyHour)`,
        [userId, notifyHour]
      );
    }

    // 지역은 "화면에 있는 것이 전부" 이므로 지우고 다시 넣습니다.
    //   행을 하나도 안 넣으면 "모든 지역" 을 뜻합니다.
    if (regions) {
      await pool.query('DELETE FROM notification_regions WHERE userId = ?', [userId]);
      const clean = [...new Set(regions.map((r) => String(r).trim()).filter(Boolean))].slice(0, 30);
      for (const r of clean) {
        await pool.query(
          'INSERT IGNORE INTO notification_regions (userId, region) VALUES (?, ?)', [userId, r]
        );
      }
    }

    const s = await getUserNotificationSettings(pool, userId);
    return res.status(200).json({
      success: true,
      data: { categories: s.categories, regions: s.regions, leadHours: s.leadHours, notifyHour: s.notifyHour },
      message: regions && regions.length === 0
        ? '알림 설정을 저장했어요. 신규 마켓은 모든 지역의 알림을 받아요.'
        : '알림 설정을 저장했어요.',
    });
  } catch (error) {
    console.error('[알림설정] 저장 오류:', error.message);
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        success: false, code: 'SETTINGS_TABLE_MISSING',
        message: '알림 설정 테이블이 없어요. backend 에서 `node scripts/migrate-add-notification-settings.js` 를 실행해 주세요.',
      });
    }
    return res.status(500).json({ success: false, message: '알림 설정을 저장하지 못했어요.' });
  }
}

export default { getNotificationSettings, updateNotificationSettings };
