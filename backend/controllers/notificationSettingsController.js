// backend/controllers/notificationSettingsController.js
// [알림 설정] 조회 / 저장

import pool from '../config/db.js';
import {
  NOTIFICATION_CATEGORIES, LEAD_HOURS_MIN, LEAD_HOURS_MAX, LEAD_HOURS_DEFAULT,
  NOTIFY_HOUR_DEFAULT, getUserNotificationSettings, isLockedCategory, categoriesForRole,
  clampLeadHours, clampNotifyHour,
} from '../utills/notificationSettings.js';
// [지역] 전국 17개 시·도 고정 목록. 마켓이 아직 없는 지역도 고를 수 있어야 합니다.
import { REGIONS, filterValidRegions } from '../utills/regions.js';

const VALID_KEYS = new Set(NOTIFICATION_CATEGORIES.map((c) => c.key));

/**
 * GET /api/notifications/settings?role=host|seller
 *
 * 역할별로 따로 조회합니다. role 을 생략하면 두 역할을 모두 돌려줍니다.
 * (가입 직후 설정 화면이 주최자 → 판매자 순서로 두 번 보여주기 위해)
 */
export async function getNotificationSettings(req, res) {
  const requested = String(req.query.role || '').trim();
  const roles = (requested === 'host' || requested === 'seller') ? [requested] : ['host', 'seller'];

  try {
    const s = await getUserNotificationSettings(pool, req.user.userId);

    const byRole = {};
    for (const role of roles) {
      byRole[role] = categoriesForRole(role).map((c) => ({
        key: c.key,
        label: c.label,
        description: c.description,
        locked: !!c.lockedOn,
        hasLeadHours: !!c.hasLeadHours,
        hasRegions: !!c.hasRegions,
        hasNotifyHour: !!c.hasNotifyHour,
        enabled: c.lockedOn ? true : (s.categories[c.key] === undefined ? true : s.categories[c.key]),
      }));
    }

    // 지역 후보는 고정 목록(전국 17개 시·도)입니다.
    //   예전에는 `SELECT DISTINCT region FROM markets` 로 뽑아서
    //   **이미 마켓이 등록된 지역만** 보였습니다.
    //   "우리 동네에 마켓이 열리면 알려줘" 가 목적인데, 마켓이 없어서
    //   그 동네를 고를 수 없다면 앞뒤가 맞지 않습니다.

    return res.status(200).json({
      success: true,
      data: {
        roles: byRole,
        // 화면이 단일 역할만 요청했으면 바로 쓸 수 있게 평평한 목록도 함께 줍니다.
        categories: roles.length === 1 ? byRole[roles[0]] : null,
        regions: s.regions,
        allRegions: REGIONS,
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
      const lead = key === 'seller_deadline' ? (leadHours ?? LEAD_HOURS_DEFAULT) : LEAD_HOURS_DEFAULT;
      const hour = key === 'seller_attendance' ? (notifyHour ?? NOTIFY_HOUR_DEFAULT) : NOTIFY_HOUR_DEFAULT;
      // 묶음 키에 역할이 들어 있으므로(host_/seller_) 거기서 role 을 꺼냅니다.
      const role = key.startsWith('host_') ? 'host' : 'seller';
      await pool.query(
        `INSERT INTO notification_settings (userId, role, category, enabled, leadHours, notifyHour)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled),
                                 leadHours = VALUES(leadHours),
                                 notifyHour = VALUES(notifyHour)`,
        [userId, role, key, enabled, lead, hour]
      );
    }

    // 토글을 안 건드리고 시간만 바꾼 경우도 반영합니다.
    if (leadHours != null && categories.seller_deadline === undefined) {
      await pool.query(
        `INSERT INTO notification_settings (userId, role, category, enabled, leadHours)
         VALUES (?, 'seller', 'seller_deadline', 1, ?)
         ON DUPLICATE KEY UPDATE leadHours = VALUES(leadHours)`,
        [userId, leadHours]
      );
    }
    if (notifyHour != null && categories.seller_attendance === undefined) {
      await pool.query(
        `INSERT INTO notification_settings (userId, role, category, enabled, notifyHour)
         VALUES (?, 'seller', 'seller_attendance', 1, ?)
         ON DUPLICATE KEY UPDATE notifyHour = VALUES(notifyHour)`,
        [userId, notifyHour]
      );
    }

    // 지역은 "화면에 있는 것이 전부" 이므로 지우고 다시 넣습니다.
    //   행을 하나도 안 넣으면 "모든 지역" 을 뜻합니다.
    if (regions) {
      await pool.query('DELETE FROM notification_regions WHERE userId = ?', [userId]);
      // 목록에 없는 값을 저장하면 markets.region 과 영영 안 맞아
      // "설정은 했는데 알림이 안 온다" 가 됩니다.
      const clean = filterValidRegions(regions);
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
