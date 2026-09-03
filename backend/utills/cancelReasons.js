// backend/utills/cancelReasons.js
// [마켓 취소 사유] 자주 쓰는 사유 목록과 검증
//
// 왜 코드와 문구를 나눠 저장하는가
//   코드만 저장하면 나중에 목록 문구를 다듬었을 때 과거 기록의 의미까지 같이 바뀝니다.
//   ("주최자 사정" 을 "주최자 개인 사정" 으로 고치면 3개월 전 취소 건의 표기도 바뀜)
//   문구만 저장하면 "기상 악화로 취소된 마켓이 몇 건인지" 같은 집계를 할 수 없습니다.
//   그래서 코드(집계용)와 그때 보여준 문구(기록용)를 둘 다 남깁니다.
//
// 왜 목록을 서버에 두는가
//   화면에만 두면 API 를 직접 호출해 아무 코드나 넣을 수 있고,
//   화면과 서버의 목록이 갈라지면 저장은 되는데 표시가 안 되는 상태가 됩니다.
//   프론트는 GET /markets/cancel-reasons 로 이 목록을 받아 그립니다.

/** 자주 쓰는 사유. 순서가 화면 표시 순서입니다. */
export const CANCEL_REASONS = [
  { code: 'weather',     label: '기상 악화 (우천·강풍·폭염 등)' },
  { code: 'venue',       label: '장소 사용 불가 (대관 취소·시설 문제)' },
  { code: 'low_signup',  label: '신청 부스 부족으로 행사 진행 어려움' },
  { code: 'host_issue',  label: '주최자 사정으로 진행 불가' },
  { code: 'safety',      label: '안전·방역 등 행정 지침에 따른 취소' },
  { code: 'other',       label: '기타 (직접 입력)' },
];

export const OTHER_CODE = 'other';

/** 기타 사유의 최소/최대 길이. DB 컬럼이 varchar(300) 입니다. */
export const REASON_MIN = 5;
export const REASON_MAX = 300;

const BY_CODE = new Map(CANCEL_REASONS.map((r) => [r.code, r]));

/**
 * 요청으로 들어온 사유를 검증하고, 저장할 형태로 정규화합니다.
 *
 * @param {string} code   목록에서 고른 코드
 * @param {string} detail '기타' 일 때 직접 입력한 문구
 * @returns {{ok:true, code:string, reason:string} | {ok:false, message:string}}
 */
export function normalizeCancelReason(code, detail) {
  const c = String(code || '').trim();
  if (!c) {
    return { ok: false, message: '취소 사유를 선택해 주세요.' };
  }

  const found = BY_CODE.get(c);
  if (!found) {
    return { ok: false, message: '알 수 없는 취소 사유예요. 목록에서 다시 선택해 주세요.' };
  }

  if (c === OTHER_CODE) {
    const text = String(detail || '').trim();
    if (text.length < REASON_MIN) {
      return { ok: false, message: `기타 사유는 ${REASON_MIN}자 이상 적어 주세요. 판매자에게 그대로 전달됩니다.` };
    }
    if (text.length > REASON_MAX) {
      return { ok: false, message: `사유는 ${REASON_MAX}자까지 적을 수 있어요.` };
    }
    return { ok: true, code: c, reason: text };
  }

  // 목록에서 고른 경우, 고를 당시의 문구를 그대로 저장합니다.
  // 나중에 목록 문구가 바뀌어도 과거 기록은 그때 보여준 문구 그대로 남습니다.
  //   덧붙인 설명이 있으면 함께 남깁니다. (선택 사항)
  const extra = String(detail || '').trim();
  const reason = extra ? `${found.label} — ${extra}` : found.label;
  return { ok: true, code: c, reason: reason.slice(0, REASON_MAX) };
}

export default { CANCEL_REASONS, OTHER_CODE, REASON_MIN, REASON_MAX, normalizeCancelReason };
