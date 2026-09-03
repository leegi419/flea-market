// backend/utills/marketCancellation.js
// [마켓 취소 - 신규 파일]
//
// 담는 것: 주최자가 마켓을 취소할 때 "누구에게 얼마를 돌려줘야 하는지" 계산과 실제 환불 실행.
//
// 왜 만들었나
//   기존 취소(dbdeleteController.deleteMarket)는 딱 한 줄이었습니다.
//     UPDATE markets SET isExpired = 2 WHERE marketId = ?
//   그래서 이런 상태가 됐습니다.
//     - 판매자는 통보를 못 받고, 화면에서 마켓만 조용히 사라짐
//     - applications 는 Paid 인 채로 남고, 돈은 주최자 쪽에 그대로
//   기능정의서 확정 정책은 「주최자가 마켓 취소 시 전액 환불 + 주최자 페널티」입니다.
//
// 설계 요점
//   1) 취소 전에 반드시 미리보기를 거칩니다. 돈이 나가는 동작이라 주최자가
//      "얼마가 빠져나가는지" 모른 채 누르면 안 됩니다.
//      화면뿐 아니라 서버에서도 confirmRefund 없이는 거부합니다. (API 직접 호출 차단)
//   2) 환불은 부스 종류(A/B/C)별로 묶어서 보여줍니다. 주최자가 규모를 바로 가늠할 수 있습니다.
//   3) 환불 실패가 나도 마켓 취소는 진행합니다.
//      취소를 막으면 판매자에게 통보조차 못 가고, 주최자는 아무것도 못 하는 상태가 됩니다.
//      실패 건은 목록으로 돌려주고, 기존 건별 환불 API 로 재시도하게 합니다.

// [정리] 환불 1건의 절차(결제사 취소 + payments/applications 갱신)는
//        utills/refundCore.js 한 곳에 있습니다. 건별 환불·일괄 결제취소와 같은 코드를 씁니다.
//        예전에는 여기서 따로 구현해서, RefundRequested 건의 처리가 서로 달랐습니다.


/** 아직 살아 있는(취소 시 처리해야 하는) 신청 상태 */
export const LIVE_STATUSES = ['Pending', 'Approved', 'Paid', 'RefundRequested'];

/** 실제로 돈이 들어와 있어 돌려줘야 하는 결제 상태 */
export const REFUNDABLE_PAYMENT_STATUSES = ['Paid', 'RefundRequested'];

/* ------------------------------------------------------------------ */
/* 스키마 확인                                                          */
/* ------------------------------------------------------------------ */

const MISSING_TTL_MS = 60 * 1000;
const PRESENT_TTL_MS = 10 * 60 * 1000;

let schemaCache = null;
let schemaExpires = 0;

export function resetCancellationCache() {
  schemaCache = null;
  schemaExpires = 0;
}

/**
 * 환불에 필요한 컬럼이 있는지 확인합니다.
 * 팀마다 마이그레이션 시점이 달라, 없는 컬럼을 SELECT 하면 취소 자체가 500 으로 죽습니다.
 */
export async function getCancellationSchema(db) {
  const now = Date.now();
  if (schemaCache && now < schemaExpires) return schemaCache;

  let state = { paymentKey: false, refundAmount: false, refundReason: false, boothType: false };
  try {
    const [payCols] = await db.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'payments'`
    );
    // [대소문자] 정규화하지 않으면 컬럼이 있는데도 환불 기록을 건너뛰게 됩니다.
    const payNames = new Set(payCols.map((r) => String(r.c).toLowerCase()));

    const [appCols] = await db.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'applications'
          AND column_name = 'boothTypeId'`
    );

    // [버그 수정] 예전에는 applications.boothTypeId 컬럼만 보고 부스 종류 기능이 있다고 판단했습니다.
    //   그런데 컬럼은 남아 있는데 market_booth_types 테이블만 없는 상태가 실제로 생깁니다.
    //   (부스 종류 기능을 되돌리면서 테이블은 지우고 컬럼은 남겨둔 경우)
    //   그러면 아래 미리보기 쿼리가 없는 테이블을 JOIN 해서
    //   "Table 'xxx.market_booth_types' doesn't exist" 로 통째로 실패하고,
    //   화면에는 신청자가 있는데도 "신청자가 없어요" 로 잘못 뜹니다.
    //   테이블 존재까지 함께 확인해야 합니다.
    const [typeTable] = await db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'market_booth_types'`
    );

    state = {
      paymentKey: payNames.has('paymentkey'),
      refundAmount: payNames.has('refundamount'),
      refundReason: payNames.has('refundreason'),
      boothType: appCols.length > 0 && Number(typeTable[0].cnt) > 0,
    };
  } catch (error) {
    console.warn('[marketCancellation] 스키마 확인 실패:', error.message);
  }

  schemaCache = state;
  schemaExpires = now + (state.paymentKey ? PRESENT_TTL_MS : MISSING_TTL_MS);
  return schemaCache;
}

/* ------------------------------------------------------------------ */
/* 미리보기                                                            */
/* ------------------------------------------------------------------ */

/**
 * 이 마켓을 취소하면 무슨 일이 벌어지는지 계산합니다. (DB 를 바꾸지 않습니다)
 *
 * @returns {Promise<{
 *   marketId:number, marketTitle:string,
 *   byBoothType: Array<{ boothTypeName:string, paidCount:number, refundTotal:number, unpaidCount:number }>,
 *   refundCount:number, refundTotal:number,
 *   unpaidCount:number, sellerCount:number,
 *   items: Array<object>
 * }>}
 */
export async function buildCancelPreview(db, marketId) {
  const schema = await getCancellationSchema(db);

  // 부스 종류 이름 — 컬럼이 없는 DB 에서는 전부 '기본'으로 묶습니다.
  const typeNameExpr = schema.boothType ? "COALESCE(bt.name, '기본')" : "'기본'";
  const typeJoin = schema.boothType
    ? 'LEFT JOIN market_booth_types bt ON bt.boothTypeId = a.boothTypeId'
    : '';

  const [rows] = await db.query(
    `SELECT a.applicationId, a.sellerId, a.status, a.boothNumber, a.itemName,
            ${typeNameExpr} AS boothTypeName,
            u.nickname AS sellerNickname,
            p.paymentId, p.amount AS paidAmount, p.status AS paymentStatus
       FROM applications a
       ${typeJoin}
       LEFT JOIN users u ON u.userId = a.sellerId
       LEFT JOIN payments p
              ON p.applicationId = a.applicationId
             AND p.status IN (${REFUNDABLE_PAYMENT_STATUSES.map(() => '?').join(', ')})
      WHERE a.marketId = ?
        AND a.status IN (${LIVE_STATUSES.map(() => '?').join(', ')})
      ORDER BY ${schema.boothType ? 'bt.sortOrder, ' : ''}a.applicationId`,
    [...REFUNDABLE_PAYMENT_STATUSES, marketId, ...LIVE_STATUSES]
  );

  const groups = new Map();
  let refundCount = 0;
  let refundTotal = 0;
  let unpaidCount = 0;
  const sellers = new Set();

  for (const r of rows) {
    const key = r.boothTypeName || '기본';
    if (!groups.has(key)) {
      groups.set(key, { boothTypeName: key, paidCount: 0, refundTotal: 0, unpaidCount: 0 });
    }
    const g = groups.get(key);
    sellers.add(Number(r.sellerId));

    if (r.paymentId) {
      const amount = Number(r.paidAmount) || 0;
      g.paidCount += 1;
      g.refundTotal += amount;
      refundCount += 1;
      refundTotal += amount;
    } else {
      g.unpaidCount += 1;
      unpaidCount += 1;
    }
  }

  return {
    marketId: Number(marketId),
    byBoothType: [...groups.values()],
    refundCount,
    refundTotal,
    unpaidCount,
    sellerCount: sellers.size,
    items: rows.map((r) => ({
      applicationId: Number(r.applicationId),
      sellerId: Number(r.sellerId),
      sellerNickname: r.sellerNickname,
      boothNumber: r.boothNumber,
      boothTypeName: r.boothTypeName || '기본',
      status: r.status,
      paidAmount: r.paymentId ? Number(r.paidAmount) || 0 : 0,
      isPaid: !!r.paymentId,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 환불 실행                                                            */
/* ------------------------------------------------------------------ */

// [제거됨] refundAllForMarket
//
//   이 파일에 환불 실행 함수가 있었지만, 팀이 되돌리는 과정에서 이 함수가 의존하던
//   utills/refundCore.js 가 삭제됐습니다. 그 결과 refundOneApplication 과 REFUND_MODE 가
//   **정의되지 않은 채로 남아**, 누군가 이 함수를 부르면 그 자리에서
//   ReferenceError 로 죽는 상태였습니다. 아무도 부르지 않아 드러나지 않았을 뿐입니다.
//
//   환불 실행은 controllers/dbdeleteController.js 의 deleteMarket 안에 있습니다.
//   (paymentService.cancelPayment 를 직접 호출하는 방식)
//   이 파일은 이제 "환불 예상 내역 계산" 만 담당합니다.

/** 미리보기를 사람이 읽는 한 줄로 (알림·로그용) */
export function summarizePreview(preview) {
  if (!preview || preview.sellerCount === 0) return '신청자가 없습니다.';
  const parts = preview.byBoothType.map(
    (g) => `${g.boothTypeName} ${g.paidCount}건 ${g.refundTotal.toLocaleString()}원`
  );
  return `${parts.join(' / ')} — 총 ${preview.refundCount}건 ${preview.refundTotal.toLocaleString()}원`;
}

export default {
  LIVE_STATUSES,
  REFUNDABLE_PAYMENT_STATUSES,
  getCancellationSchema,
  resetCancellationCache,
  buildCancelPreview,
  summarizePreview,
};
