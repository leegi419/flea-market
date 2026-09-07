// backend/utills/refundPolicy.js
// [환불 정책] 개최일까지 남은 날짜에 따라 환불 비율이 달라집니다.
//
// ── 왜 여기 한 곳에서만 정의하나 ──────────────────────────────────
//   예전에는 화면(mybooth.js)이 규정표를 직접 그리면서 비율을 하드코딩했습니다.
//   그 결과 **서버와 화면이 어긋나 있었습니다.**
//     화면: 100% / 50% / 0%   (3일 전은 환불 불가라고 안내)
//     서버: 100% / 50% / 30% / 0%   (3~4일 전이면 30% 환불)
//   판매자는 "환불 불가" 라고 보고 포기했는데 실제로는 30% 를 받을 수 있었습니다.
//
//   이제 규정표도 이 파일에서 만들어 내려줍니다. 정책을 바꿀 때 한 곳만 고치면 됩니다.

/** 환불 구간. 위에서부터 검사하며, 먼저 맞는 구간이 적용됩니다. */
export const REFUND_TIERS = [
  { minDays: 7, rate: 1.0, label: '개최 7일 이상 전' },
  { minDays: 5, rate: 0.5, label: '개최 5~6일 전' },
  { minDays: 3, rate: 0.3, label: '개최 3~4일 전' },
  { minDays: -Infinity, rate: 0, label: '개최 3일 미만 전' },
];

/** 개최일까지 남은 날짜 (음수면 이미 지남) */
export function daysUntilEvent(eventDateMin, requestDate = new Date()) {
  const eventDate = new Date(eventDateMin);
  // 시:분까지 섞이면 같은 날인데 하루 차이로 계산되는 일이 생깁니다. 날짜만 봅니다.
  eventDate.setHours(0, 0, 0, 0);
  const base = new Date(requestDate);
  base.setHours(0, 0, 0, 0);
  return Math.floor((eventDate - base) / (1000 * 60 * 60 * 24));
}

/** 지금 신청하면 적용될 환불 비율 (0 ~ 1) */
export function calculateRefundRate(eventDateMin, requestDate = new Date()) {
  const diffDays = daysUntilEvent(eventDateMin, requestDate);
  const tier = REFUND_TIERS.find((t) => diffDays >= t.minDays);
  return tier ? tier.rate : 0;
}

/**
 * 화면에 보여줄 환불 안내를 통째로 만들어 줍니다.
 *
 *   화면이 직접 계산하면 정책이 바뀔 때 양쪽을 고쳐야 하고,
 *   한쪽만 고치면 "안내와 실제 환불액이 다른" 상태가 됩니다.
 *
 * @returns {{ daysLeft, rate, percent, amount, label, tiers, refundable, notice }}
 */
export function buildRefundPreview(eventDateMin, paidAmount, requestDate = new Date()) {
  const amountPaid = Number(paidAmount) || 0;
  const daysLeft = daysUntilEvent(eventDateMin, requestDate);
  const rate = calculateRefundRate(eventDateMin, requestDate);
  const current = REFUND_TIERS.find((t) => daysLeft >= t.minDays) || REFUND_TIERS[REFUND_TIERS.length - 1];

  return {
    daysLeft,
    rate,
    percent: Math.round(rate * 100),
    // 원 단위 절사. 서버가 실제로 환불할 때와 같은 계산이어야
    // "안내는 500원인데 480원 들어왔다" 가 생기지 않습니다.
    amount: Math.floor(amountPaid * rate),
    paidAmount: amountPaid,
    label: current.label,
    refundable: rate > 0,
    // 규정표 전체. 지금 적용되는 줄에 current 표시가 붙습니다.
    tiers: REFUND_TIERS.map((t) => ({
      label: t.label,
      percent: Math.round(t.rate * 100),
      amount: Math.floor(amountPaid * t.rate),
      current: t === current,
    })),
    notice: rate > 0
      ? `지금 취소하면 ${Math.floor(amountPaid * rate).toLocaleString()}원이 환불돼요. (${Math.round(rate * 100)}%)`
      : '개최일이 가까워 환불이 불가능해요. 취소는 가능하지만 결제 금액은 돌려받을 수 없어요.',
  };
}

export default { REFUND_TIERS, daysUntilEvent, calculateRefundRate, buildRefundPreview };
