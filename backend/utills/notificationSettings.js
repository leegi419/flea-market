// backend/utills/notificationSettings.js
// [알림 설정] 알림 묶음 정의 · 사용자 설정 조회 · 발송 대상 필터
//
// ── 왜 "묶음"으로 나누는가 ────────────────────────────────────────
//   알림 타입은 10종이 넘고 앞으로 더 늘어납니다. 그걸 하나하나 토글로 만들면
//   설정 화면이 길어져 아무도 안 봅니다. 사용자가 실제로 구분하고 싶은 단위로 묶습니다.
//
// ── 왜 끌 수 없는 묶음이 있는가 ───────────────────────────────────
//   마켓 취소·변경은 돈과 직결됩니다. 결제한 판매자가 이 알림을 꺼두면
//   마켓이 취소되고 환불된 것을 모른 채 당일 현장에 갈 수 있습니다.
//   설정 화면에 잠금 표시로 보여주되 끄지는 못하게 합니다.
//
// ── 설정이 없으면 켜짐 ────────────────────────────────────────────
//   기존 사용자에게 행을 미리 만들어 넣지 않습니다. (수천 행을 미리 채울 이유가 없음)
//   행이 없으면 기본값으로 봅니다. 사용자가 토글을 건드린 것만 저장됩니다.

/**
 * 알림 묶음 정의.
 *
 * ── 왜 역할로 나누는가 ────────────────────────────────────────────
 *   이 사이트는 주최자도 판매자로 전환해 부스를 신청할 수 있습니다.
 *   그래서 한 사람이 두 역할의 알림을 함께 받습니다.
 *
 *   예전에는 「부스 신청」 묶음 하나에 주최자용(신청 들어옴)과
 *   판매자용(승인·반려)이 같이 들어 있어서, 하나를 끄면 **양쪽이 같이 꺼졌습니다.**
 *   "내가 주최한 마켓 알림만 끄고 싶다" 를 할 수 없었습니다.
 *
 *   이제 role 로 나눠 각각 따로 켜고 끕니다.
 *     host   = 내가 주최한 마켓에서 오는 알림
 *     seller = 내가 참가하는 마켓에서 오는 알림
 *
 * ── 한 타입이 양쪽에 있을 수 있나 ─────────────────────────────────
 *   없습니다. 알림 타입마다 audience(host/seller)가 하나로 정해져 있어,
 *   타입 하나는 반드시 한쪽 역할에만 속합니다.
 */
export const NOTIFICATION_CATEGORIES = [
  /* ── 주최자 알림 ── */
  {
    key: 'host_application',
    role: 'host',
    label: '부스 신청 접수',
    description: '내 마켓에 부스 신청이 들어오거나 판매자가 신청을 취소했을 때',
    types: ['application_received', 'application_cancelled', 'application_duplicate'],
    lockedOn: false,
  },
  {
    key: 'host_payment',
    role: 'host',
    label: '결제 · 환불 요청',
    description: '판매자가 결제를 마쳤거나 환불을 요청했을 때',
    // refund_processed 는 주최자 전용입니다.
    //   판매자에게 가는 refund_completed 와 타입을 나눠야
    //   역할별 설정이 서로를 건드리지 않습니다.
    //   (한 타입을 양쪽이 나눠 쓰면 어느 묶음에 넣어도 한쪽이 틀립니다)
    types: ['payment_completed', 'refund_requested', 'refund_processed'],
    lockedOn: false,
  },
  {
    key: 'host_comment',
    role: 'host',
    label: '내 마켓 댓글',
    description: '내가 주최한 마켓에 댓글이 달렸을 때',
    types: ['market_comment_received'],
    lockedOn: false,
  },

  /* ── 판매자 알림 ── */
  {
    key: 'seller_application',
    role: 'seller',
    label: '승인 · 반려',
    description: '신청한 부스가 승인되거나 반려됐을 때',
    types: ['application_approved', 'application_rejected'],
    lockedOn: false,
  },
  {
    key: 'seller_payment',
    role: 'seller',
    label: '환불 완료',
    description: '환불이 처리됐을 때',
    types: ['refund_completed'],
    lockedOn: false,
  },
  {
    key: 'seller_comment',
    role: 'seller',
    label: '내 댓글 답글',
    description: '내가 쓴 댓글에 답글이 달렸을 때',
    types: ['comment_reply_received'],
    lockedOn: false,
  },
  {
    key: 'seller_market_change',
    role: 'seller',
    label: '마켓 취소 · 변경',
    description: '참가 중인 마켓이 취소되거나 일정이 바뀌었을 때',
    types: ['market_cancelled', 'market_changed'],
    // 돈이 걸린 알림이라 끌 수 없습니다.
    //   결제한 판매자가 이걸 꺼두면 마켓이 취소되고 환불된 것을 모른 채
    //   당일 현장에 갈 수 있습니다.
    lockedOn: true,
  },
  {
    key: 'seller_deadline',
    role: 'seller',
    label: '마감 임박 알림',
    description: '모집 종료 1일 전, 결제 마감 전에 미리 알려드려요',
    types: ['recruit_closing', 'payment_due'],
    lockedOn: false,
    hasLeadHours: true,
  },
  {
    key: 'seller_attendance',
    role: 'seller',
    label: '현장 참여 기록',
    description: '마켓이 끝난 뒤 체크인 기록이 없을 때 알려드려요',
    types: ['absence_recorded'],
    lockedOn: false,
    hasNotifyHour: true,
  },
  {
    key: 'seller_new_market',
    role: 'seller',
    label: '신규 마켓 등록',
    description: '관심 지역에 새 마켓이 열렸을 때',
    types: ['new_market'],
    lockedOn: false,
    hasRegions: true,
  },
];

/** 역할별로 묶음을 골라냅니다. */
export function categoriesForRole(role) {
  return NOTIFICATION_CATEGORIES.filter((c) => c.role === role);
}

/** 알림 타입이 속한 역할 */
export function roleOfType(type) {
  const c = NOTIFICATION_CATEGORIES.find((x) => x.types.includes(String(type)));
  return c ? c.role : null;
}

/** 결제 마감 사전 알림 시간의 허용 범위 (결제 기한이 24시간이라 그 이상은 의미 없음) */
export const LEAD_HOURS_MIN = 1;
export const LEAD_HOURS_MAX = 24;
export const LEAD_HOURS_DEFAULT = 1;

/** 미참여 통지를 받을 시각. 판정은 자정에 끝나지만 통지는 이 시각에 나갑니다. */
export const NOTIFY_HOUR_DEFAULT = 10;

/** 알림 타입 -> 묶음 키 */
const TYPE_TO_CATEGORY = new Map();
for (const c of NOTIFICATION_CATEGORIES) {
  for (const t of c.types) TYPE_TO_CATEGORY.set(t, c.key);
}

const CATEGORY_BY_KEY = new Map(NOTIFICATION_CATEGORIES.map((c) => [c.key, c]));

export function categoryOfType(type) {
  return TYPE_TO_CATEGORY.get(String(type)) || null;
}

export function isLockedCategory(key) {
  return CATEGORY_BY_KEY.get(key)?.lockedOn === true;
}

/** 0~23 시로 맞춥니다. */
export function clampNotifyHour(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NOTIFY_HOUR_DEFAULT;
  return Math.min(23, Math.max(0, Math.round(n)));
}

export function clampLeadHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return LEAD_HOURS_DEFAULT;
  return Math.min(LEAD_HOURS_MAX, Math.max(LEAD_HOURS_MIN, Math.round(n)));
}

/** 테이블이 아직 없는 DB(마이그레이션 전)에서도 알림이 멈추지 않게 합니다. */
function isMissingTable(error) {
  return error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146);
}

/**
 * 사용자 한 명의 알림 설정을 읽습니다.
 * @returns {{categories:Object, regions:string[], leadHours:number, available:boolean}}
 *   available=false 면 설정 테이블이 없다는 뜻입니다. 이때는 전부 켜진 것으로 봅니다.
 */
export async function getUserNotificationSettings(db, userId) {
  const fallback = { categories: {}, regions: [], leadHours: LEAD_HOURS_DEFAULT, notifyHour: NOTIFY_HOUR_DEFAULT, available: false };
  if (!userId) return fallback;

  try {
    const [rows] = await db.query(
      'SELECT role, category, enabled, leadHours, notifyHour FROM notification_settings WHERE userId = ?', [userId]
    );
    const [regionRows] = await db.query(
      'SELECT region FROM notification_regions WHERE userId = ?', [userId]
    );

    const categories = {};
    let leadHours = LEAD_HOURS_DEFAULT;
    let notifyHour = NOTIFY_HOUR_DEFAULT;
    for (const r of rows) {
      categories[r.category] = Number(r.enabled) === 1;
      if (r.category === 'seller_deadline') leadHours = clampLeadHours(r.leadHours);
      if (r.category === 'seller_attendance') notifyHour = clampNotifyHour(r.notifyHour);
    }

    return {
      categories,
      regions: regionRows.map((r) => r.region),
      leadHours,
      notifyHour,
      available: true,
    };
  } catch (error) {
    if (isMissingTable(error)) return fallback;
    console.error('[알림설정] 조회 실패:', error.message);
    return fallback;
  }
}

/**
 * 이 사용자가 이 타입의 알림을 받을지 판정합니다.
 * 설정 행이 없으면 켜짐. 잠긴 묶음은 설정과 무관하게 항상 켜짐.
 */
export function shouldReceive(settings, type) {
  const key = categoryOfType(type);
  if (!key) return true;                    // 묶음에 없는 타입은 그대로 보냅니다
  if (isLockedCategory(key)) return true;   // 끌 수 없는 묶음
  // 묶음 키에 역할이 들어 있어(host_/seller_) 키 하나로 구분됩니다.
  const v = settings?.categories?.[key];
  return v === undefined ? true : v;        // 설정한 적 없으면 켜짐
}

/**
 * 여러 명에게 보낼 때, 설정을 한 번에 읽어 받을 사람만 골라냅니다.
 * 사람마다 따로 조회하면 100명에게 보낼 때 쿼리가 200번 나갑니다.
 *
 * @returns {Promise<Set<number>>} 이 타입을 받을 userId 집합
 */
export async function filterRecipients(db, userIds, type) {
  const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
  const key = categoryOfType(type);
  if (ids.length === 0 || !key || isLockedCategory(key)) return new Set(ids);

  try {
    const [rows] = await db.query(
      `SELECT userId, enabled FROM notification_settings
        WHERE category = ? AND userId IN (${ids.map(() => '?').join(', ')})`,
      [key, ...ids]
    );
    const off = new Set(rows.filter((r) => Number(r.enabled) === 0).map((r) => Number(r.userId)));
    return new Set(ids.filter((id) => !off.has(id)));
  } catch (error) {
    if (isMissingTable(error)) return new Set(ids);
    console.error('[알림설정] 대상 필터 실패:', error.message);
    return new Set(ids);   // 설정을 못 읽으면 보내는 쪽이 안전합니다
  }
}

/**
 * 신규 마켓 알림을 받을 사용자를 찾습니다.
 * 지역 행이 하나도 없으면 "모든 지역" 으로 봅니다.
 */
export async function findNewMarketRecipients(db, region, excludeUserId) {
  try {
    const [rows] = await db.query(
      `SELECT u.userId
         FROM users u
         LEFT JOIN notification_settings s ON s.userId = u.userId AND s.category = 'seller_new_market'
        WHERE u.userId <> ?
          AND (s.enabled IS NULL OR s.enabled = 1)
          AND (
                NOT EXISTS (SELECT 1 FROM notification_regions r WHERE r.userId = u.userId)
                OR EXISTS (SELECT 1 FROM notification_regions r WHERE r.userId = u.userId AND r.region = ?)
              )`,
      [excludeUserId || 0, region || '']
    );
    return rows.map((r) => Number(r.userId));
  } catch (error) {
    if (isMissingTable(error)) return [];
    console.error('[알림설정] 신규 마켓 대상 조회 실패:', error.message);
    return [];
  }
}

export default {
  NOTIFICATION_CATEGORIES, LEAD_HOURS_MIN, LEAD_HOURS_MAX, LEAD_HOURS_DEFAULT, NOTIFY_HOUR_DEFAULT,
  categoryOfType, isLockedCategory, clampLeadHours, clampNotifyHour,
  getUserNotificationSettings, shouldReceive, filterRecipients, findNewMarketRecipients,
};
