import { dbdelete } from '../utills/DBdelete.js';
import pool from '../config/db.js';
import { cancelPayment } from '../services/paymentService.js';
// [마켓 취소 환불] 예상 내역 계산은 utills/marketCancellation.js 한 곳에서 합니다.
//   상세페이지와 내 마켓 관리가 같은 계산을 쓰게 하려는 것입니다.
import { buildCancelPreview, summarizePreview } from '../utills/marketCancellation.js';
// [취소 사유] 목록과 검증은 utills/cancelReasons.js 한 곳에서 합니다.
import { CANCEL_REASONS, normalizeCancelReason } from '../utills/cancelReasons.js';
// [마켓 취소 알림] 신청자에게 사유와 환불 여부를 알립니다.
//   이 알림은 알림 설정에서 끌 수 없습니다(market_change 묶음이 잠김) —
//   결제한 판매자가 꺼두면 환불된 것을 모른 채 당일 현장에 갈 수 있습니다.
import { createNotifications } from '../services/notificationService.js';

//마켓
// [변경] 실제로 행을 DELETE 하지 않고 isExpired 을 2(삭제됨)로 바꾸는 소프트 삭제 방식으로 변경했습니다.
// isExpired: 0 = 모집중, 1 = 마감, 2 = 주최자가 삭제함
// 이렇게 하면 이 마켓에 신청했던 판매자들의 신청 내역(applications)이나 마이페이지 "행사 현황" 집계가
// 마켓이 통째로 사라져서 깨지는 일 없이, "삭제된 마켓"이라는 상태로 계속 남아있을 수 있습니다.

// 마켓 취소 — 미리보기 + 확인 후 전액 환불
//
// ── 왜 확인 단계를 두는가 ─────────────────────────────────────────
//   전에는 window.confirm 한 줄로 바로 취소됐습니다. 주최자는 몇 명이 얼마를
//   돌려받는지 모르는 채 눌렀고, 누른 뒤에야 결제가 줄줄이 취소됐습니다.
//   되돌릴 수 없는 작업이므로 금액을 먼저 보여주고 동의를 받습니다.
//
//   확인 절차를 화면에만 두면 API 를 직접 호출해 건너뛸 수 있으므로,
//   서버도 confirmRefund 없이는 409 로 거부합니다.
//
// ── 환불 비율 ─────────────────────────────────────────────────────
//   마켓 취소는 주최자 사정이라 판매자에게 책임이 없습니다. 항상 100% 전액입니다.
//   refundPolicy.js 의 기간별 정책(3일 미만 0% 등)은 판매자가 스스로 취소할 때만 씁니다.

/**
 * GET /api/markets/cancel-reasons
 * 화면이 사유 드롭다운을 그릴 때 씁니다.
 * 목록을 화면에 하드코딩하면 서버 검증 목록과 갈라져,
 * 저장은 되는데 표시가 안 되는 상태가 생깁니다.
 */
export async function getCancelReasons(req, res) {
  return res.status(200).json({ success: true, data: CANCEL_REASONS, message: '취소 사유 목록이에요.' });
}

/**
 * GET /api/markets/:marketId/cancel-preview
 * DB 를 전혀 바꾸지 않고, 취소하면 얼마가 환불되는지만 계산해서 돌려줍니다.
 */
export async function getCancelPreview(req, res) {
  const { marketId } = req.params;
  const { userId } = req.user;

  try {
    const [marketRows] = await pool.query(
      'SELECT marketId, hostId, title, isExpired FROM markets WHERE marketId = ?', [marketId]
    );
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 마켓입니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, message: '본인이 등록한 마켓만 조회할 수 있습니다.' });
    }
    if (Number(marketRows[0].isExpired) === 2) {
      return res.status(409).json({ success: false, code: 'ALREADY_CANCELLED', message: '이미 취소된 마켓이에요.' });
    }

    const preview = await buildCancelPreview(pool, marketId);
    return res.status(200).json({
      success: true,
      data: { ...preview, marketTitle: marketRows[0].title, summary: summarizePreview(preview) },
      message: '환불 예상 내역을 조회했어요.',
    });
  } catch (error) {
    console.error('마켓 취소 미리보기 오류:', error.message);
    return res.status(500).json({ success: false, message: '환불 예상 내역을 불러오지 못했습니다.' });
  }
}

/**
 * PATCH /api/markets/closed/:marketId   body: { confirmRefund?: true }
 *
 * 실제로 행을 지우지 않고 isExpired 를 2(취소됨)로 바꾸는 소프트 삭제입니다.
 * 이렇게 해야 신청 내역과 마이페이지 집계가 마켓이 사라져서 깨지지 않습니다.
 */
export async function deleteMarket(req, res) {
  const { marketId } = req.params;
  const { userId } = req.user;
  const confirmRefund = req.body?.confirmRefund === true;

  // [취소 사유] 판매자에게 그대로 전달되고 마켓에 계속 표기되므로 필수입니다.
  //   사유 없이 취소되면 판매자는 왜 취소됐는지 알 방법이 없습니다.
  const reason = normalizeCancelReason(req.body?.cancelReasonCode, req.body?.cancelReasonDetail);
  if (!reason.ok) {
    return res.status(400).json({ success: false, code: 'CANCEL_REASON_REQUIRED', message: reason.message });
  }

  try {
    const [marketRows] = await pool.query(
      'SELECT hostId, title, isExpired FROM markets WHERE marketId = ?', [marketId]
    );
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 마켓입니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, message: '본인이 등록한 마켓만 취소할 수 있습니다.' });
    }
    if (Number(marketRows[0].isExpired) === 2) {
      return res.status(409).json({ success: false, code: 'ALREADY_CANCELLED', message: '이미 취소된 마켓이에요.' });
    }

    const preview = await buildCancelPreview(pool, marketId);

    // 돌려줄 돈이 있는데 확인을 안 받았으면 여기서 멈춥니다.
    // 응답에 예상 내역을 함께 실어, 화면이 다시 조회하지 않고 바로 모달을 띄울 수 있게 합니다.
    if (preview.refundCount > 0 && !confirmRefund) {
      return res.status(409).json({
        success: false,
        code: 'CANCEL_CONFIRM_REQUIRED',
        data: { ...preview, marketTitle: marketRows[0].title, summary: summarizePreview(preview) },
        message: `결제된 부스 ${preview.refundCount}건(${preview.refundTotal.toLocaleString()}원)을 환불해야 합니다. 진행하시겠습니까?`,
      });
    }

    // 사유와 시각을 취소 상태와 같은 UPDATE 로 남깁니다.
    // 따로 쓰면 중간에 실패했을 때 사유 없는 취소 마켓이 생깁니다.
    await pool.query(
      `UPDATE markets
          SET isExpired = 2, cancelReasonCode = ?, cancelReason = ?, cancelledAt = NOW()
        WHERE marketId = ?`,
      [reason.code, reason.reason, marketId]
    );

    const refunded = [];
    const failed = [];

    for (const item of preview.items.filter((i) => i.isPaid)) {
      try {
        const [payRows] = await pool.query(
          `SELECT paymentId, paymentKey, amount FROM payments
            WHERE applicationId = ? AND status IN ('Paid', 'RefundRequested')
            ORDER BY paymentId DESC LIMIT 1`,
          [item.applicationId]
        );
        if (payRows.length === 0) continue;

        const pay = payRows[0];
        // paymentKey 가 없으면 결제사에 보낼 식별자가 없습니다.
        // 그냥 넘어가면 장부상으로만 환불되고 실제 돈은 안 빠져나가므로 실패로 기록합니다.
        if (!pay.paymentKey) {
          failed.push({ ...item, error: '결제 식별자(paymentKey)가 없어 환불할 수 없습니다.' });
          continue;
        }

        await cancelPayment(pay.paymentKey, `마켓 취소: ${reason.reason}`);
        await pool.query(
          `UPDATE payments SET status = 'Canceled',
                  refundReason = ?,
                  refundAmount = ?
            WHERE paymentId = ?`,
          [`마켓 취소: ${reason.reason}`.slice(0, 255), pay.amount, pay.paymentId]
        );
        await pool.query(
          `UPDATE applications SET status = 'Refunded' WHERE applicationId = ?`,
          [item.applicationId]
        );
        refunded.push({ ...item, refundedAmount: Number(pay.amount) || 0 });
      } catch (error) {
        // 한 건이 실패해도 나머지는 계속 처리합니다.
        // 마켓은 이미 취소 상태이므로 여기서 멈추면 일부만 환불된 채 방치됩니다.
        console.error(`환불 실패 (applicationId=${item.applicationId}):`, error.message);
        failed.push({ ...item, error: error.message });
      }
    }

    // [버그 수정] 예전에는 결제 행이 없으면 `continue` 로 빠져나가는 바람에
    //   결제 전(Pending/Approved) 신청의 상태 갱신까지 통째로 건너뛰었습니다.
    //   그래서 마켓이 취소됐는데 판매자 화면에는 계속 「대기중」으로 보였습니다.
    //   결제 여부와 무관하게 한 번에 정리합니다.
    const [unpaidResult] = await pool.query(
      `UPDATE applications SET status = 'Canceled'
        WHERE marketId = ? AND status IN ('Pending', 'Approved')`,
      [marketId]
    );

    // 신청자 전원에게 알립니다. 결제한 사람에게는 환불 금액까지 함께.
    //   알림이 실패해도 취소·환불은 이미 끝났으므로 흐름을 막지 않습니다.
    try {
      // 한 판매자가 부스를 여러 칸 잡았으면 환불액을 **합산**합니다.
      //   Map 에 그대로 넣으면 마지막 한 칸 금액만 남아,
      //   4만원을 낸 사람에게 "2만원 환불" 이라고 알리게 됩니다.
      const refundedBySeller = new Map();
      for (const r of refunded) {
        const sid = Number(r.sellerId);
        refundedBySeller.set(sid, (refundedBySeller.get(sid) || 0) + (Number(r.refundedAmount) || 0));
      }
      const notified = new Map();

      for (const item of preview.items) {
        const sellerId = Number(item.sellerId);
        if (!sellerId || notified.has(sellerId)) continue;   // 한 사람이 여러 부스면 한 번만
        const amount = refundedBySeller.get(sellerId);
        notified.set(sellerId, {
          userId: sellerId,
          audience: 'seller',
          type: 'market_cancelled',
          title: '참가 예정 마켓이 취소됐어요',
          message: amount
            ? `「${marketRows[0].title}」이(가) 취소됐어요. 사유: ${reason.reason} · 결제하신 ${amount.toLocaleString()}원은 전액 환불됩니다.`
            : `「${marketRows[0].title}」이(가) 취소됐어요. 사유: ${reason.reason}`,
          marketId: Number(marketId),
          applicationId: item.applicationId,
        });
      }

      if (notified.size > 0) await createNotifications([...notified.values()]);
    } catch (notifyError) {
      console.error('마켓 취소 알림 발송 실패(취소는 이미 완료됨):', notifyError.message);
    }

    return res.status(200).json({
      success: true,
      data: {
        refundedCount: refunded.length,
        refundedTotal: refunded.reduce((sum, r) => sum + (r.refundedAmount || 0), 0),
        cancelledUnpaid: unpaidResult.affectedRows || 0,
        cancelReasonCode: reason.code,
        cancelReason: reason.reason,
        failed,
      },
      message: failed.length > 0
        ? `마켓을 취소했어요. ${refunded.length}건 환불 완료, ${failed.length}건은 실패해 확인이 필요해요.`
        : `마켓을 취소하고 ${refunded.length}건을 환불했어요.`,
    });
  } catch (error) {
    console.error('마켓 취소 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}

//신청취소
export async function cancelApplication(req, res) {
  const { applicationId } = req.params;

  try {
    const result = await dbdelete('applications', applicationId);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 신청입니다.' });
    }

    return res.status(200).json({ success: true, message: '신청이 취소되었습니다.' });
  } catch (error) {
    console.error('신청 취소 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}

//댓글삭제 (본인 댓글만) - 삭제 자체는 dbdelete()를 그대로 쓰고, 그 앞에 작성자 인증만 추가
export async function deleteComment(req, res) {
  const { commentId } = req.params;
  const { userId } = req.user; // authenticateToken 미들웨어가 넣어줌

  try {
    const [rows] = await pool.query('SELECT userId FROM comments WHERE commentId = ?', [commentId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 댓글입니다.' });
    }
    if (rows[0].userId !== userId) {
      return res.status(403).json({ success: false, message: '본인이 작성한 댓글만 삭제할 수 있습니다.' });
    }

    // parentId FK가 ON DELETE CASCADE라 이 댓글에 달린 대댓글도 함께 삭제됩니다.
    const result = await dbdelete('comments', commentId);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 댓글입니다.' });
    }

    return res.status(200).json({ success: true, message: '댓글이 삭제되었습니다.' });
  } catch (error) {
    console.error('댓글 삭제 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}