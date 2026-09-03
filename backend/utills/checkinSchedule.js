// backend/utills/checkinSchedule.js
// [현장 QR 체크인] 체크인 시간대 — "언제부터 언제까지 QR 을 받을지"
//
// ── 왜 markets 에 시간 컬럼을 넣지 않았나 ──────────────────────────
//   markets 에는 날짜(eventDate_min/max)만 있고 시간이 없습니다. 운영시간은 소개글에
//   자유 텍스트로 씁니다. 거기에 시간 컬럼을 새로 넣으면 마켓 등록·수정 화면과
//   컨트롤러까지 팀 파일을 여러 개 고쳐야 합니다.
//
//   그리고 개념이 다릅니다. 마켓이 10~17시 운영이어도 입장 확인은 9~12시만 받고 싶을 수 있고,
//   7일 마켓이면 토요일만 늦게 시작할 수도 있습니다.
//   체크인 시간은 체크인 쪽에 두는 것이 맞습니다.
//
// ── 7일 마켓을 어떻게 다루나 ──────────────────────────────────────
//   세션은 원래부터 UNIQUE(marketId, eventDate) 라 날짜당 1행입니다.
//   주최자가 "매일 10:00~17:00" 을 한 번 정하면 7행이 한꺼번에 만들어지고,
//   각 날짜가 알아서 자기 시간에 열리고 닫힙니다. 날짜별로 시간을 따로 바꿀 수도 있습니다.
//
// ── 상태는 저장하지 않고 계산합니다 ───────────────────────────────
//   status 컬럼에 'open' 을 박아두고 시간이 되면 누가 바꿔주는 방식은 스케줄러가 필요하고,
//   서버가 꺼져 있던 동안은 상태가 어긋납니다.
//   대신 status 는 주최자의 "의사"만 담고(scheduled / open / closed),
//   실제로 지금 QR 을 받을 수 있는지는 시각과 비교해 매번 계산합니다.
//
//     closed    → 주최자가 직접 닫음. 시간과 무관하게 닫힘 (수동이 최우선)
//     open      → 주최자가 직접 염. 시간과 무관하게 열림 (지각 판매자 받을 때)
//     scheduled → 시간대에 맡김. opensAt - leadMinutes ~ closesAt 사이에만 열림

/** 예약 상태: 시간대에 따라 자동으로 열리고 닫힙니다. */
export const STATUS_SCHEDULED = 'scheduled';
/** 주최자가 직접 연 상태 */
export const STATUS_OPEN = 'open';
/** 주최자가 직접 닫은 상태 */
export const STATUS_CLOSED = 'closed';

/** QR 을 미리 띄우는 기본 시간(분). 줄이 몰리기 전에 판매자가 화면을 준비할 수 있게. */
export const DEFAULT_LEAD_MINUTES = 60;

/** 'HH:MM' 형식 검사 */
export function isValidTime(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());
}

/** 'YYYY-MM-DD' + 'HH:MM' -> 'YYYY-MM-DD HH:MM:00' (DB DATETIME 문자열) */
export function toDateTime(dateStr, timeStr) {
  return `${dateStr} ${timeStr}:00`;
}

/** DB 의 DATETIME(또는 Date 객체)을 ms 로. 값이 없으면 null */
function toMs(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * 지금 이 세션이 실제로 체크인을 받는 상태인지 계산합니다.
 *
 * @param {object} session  market_checkin_sessions 의 한 행
 * @param {number} [now]    현재 시각(ms). 테스트에서 시간을 밀어보기 위해 주입 가능
 * @returns {{
 *   isOpen: boolean,          지금 QR 을 발급/스캔할 수 있는가
 *   phase: string,            'before' | 'open' | 'after' | 'closed' | 'no-window'
 *   opensAt: number|null,     체크인 시작 시각(ms)
 *   qrFrom: number|null,      QR 이 나오기 시작하는 시각(ms) = opensAt - leadMinutes
 *   closesAt: number|null,
 *   reason: string            화면에 그대로 보여줄 안내 문구
 * }}
 */
export function resolveSessionWindow(session, now = Date.now()) {
  if (!session) {
    return { isOpen: false, phase: 'none', opensAt: null, qrFrom: null, closesAt: null,
             reason: '아직 체크인이 준비되지 않았어요.' };
  }

  const opensAt = toMs(session.opensAt);
  const closesAt = toMs(session.closesAt);
  const lead = Number(session.leadMinutes);
  const leadMs = (Number.isFinite(lead) ? lead : DEFAULT_LEAD_MINUTES) * 60 * 1000;
  const qrFrom = opensAt != null ? opensAt - leadMs : null;

  // 1) 주최자가 직접 닫았으면 시간과 무관하게 닫힘.
  //    "그만 받겠다"는 명시적 의사라 시간표보다 우선합니다.
  if (session.status === STATUS_CLOSED) {
    return { isOpen: false, phase: 'closed', opensAt, qrFrom, closesAt,
             reason: '주최자가 체크인을 종료했어요.' };
  }

  // 2) 주최자가 직접 열었으면 시간과 무관하게 열림.
  //    시간이 지났는데 늦게 온 판매자를 받아야 하는 상황이 실제로 생깁니다.
  if (session.status === STATUS_OPEN) {
    return { isOpen: true, phase: 'open', opensAt, qrFrom, closesAt,
             reason: '체크인 진행 중이에요.' };
  }

  // 3) 예약 상태인데 시간이 안 정해져 있으면 열 수 없습니다.
  //    (시간 없이 예약만 걸리는 일은 없어야 하지만, 값이 비어도 서버가 죽지 않게)
  if (opensAt == null || closesAt == null) {
    return { isOpen: false, phase: 'no-window', opensAt, qrFrom, closesAt,
             reason: '체크인 시간이 아직 설정되지 않았어요.' };
  }

  if (now < qrFrom) {
    return { isOpen: false, phase: 'before', opensAt, qrFrom, closesAt,
             reason: `체크인 시작 ${Math.round((qrFrom - now) / 60000)}분 전이에요. 시간이 되면 QR 이 자동으로 나와요.` };
  }
  if (now > closesAt) {
    return { isOpen: false, phase: 'after', opensAt, qrFrom, closesAt,
             reason: '오늘 체크인 시간이 끝났어요.' };
  }
  return { isOpen: true, phase: 'open', opensAt, qrFrom, closesAt,
           reason: '체크인 진행 중이에요.' };
}

/** 개최 시작일~종료일 사이의 모든 날짜를 'YYYY-MM-DD' 배열로 (최대 60일 안전장치) */
export function eachEventDate(minDate, maxDate) {
  const out = [];
  if (!minDate || !maxDate) return out;
  const d = new Date(`${minDate}T00:00:00`);
  const end = new Date(`${maxDate}T00:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) return out;

  let guard = 0;
  while (d <= end && guard++ < 60) {
    const p = (n) => String(n).padStart(2, '0');
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export default {
  STATUS_SCHEDULED, STATUS_OPEN, STATUS_CLOSED, DEFAULT_LEAD_MINUTES,
  isValidTime, toDateTime, resolveSessionWindow, eachEventDate,
};
