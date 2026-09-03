import pool from '../config/db.js';
import { verifyPayment, cancelPayment } from '../services/paymentService.js';
import { calculateRefundRate } from '../utills/refundPolicy.js'
import { createNotification } from '../services/notificationService.js';

// POST /api/payments/confirm
// PortOne 결제 완료 후 호출
export async function confirmPayment(req, res) {
  const { userId } = req.user;
  const { applicationId } = req.body;
  let { paymentId } = req.body;

  // paymentId는 실제 결제(포트원)가 발생하는 유료 부스에서만 필수.
  // 부스료 0원인 경우는 아래에서 boothPrice를 확인한 뒤에 필수 여부를 판단한다.
  if (!applicationId) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'applicationId는 필수입니다.',
    });
  }

  try {
    // 신청 정보 조회
    const [rows] = await pool.query(
      `SELECT a.applicationId, a.sellerId, a.status, a.boothNumber, a.itemName, a.marketId, m.boothPrice, m.hostId, m.title AS marketTitle
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       WHERE a.applicationId = ?`,
      [applicationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        message: '해당 신청을 찾을 수 없습니다.',
      });
    }

    const application = rows[0];

    if (Number(application.sellerId) !== Number(userId)) {
      return res.status(403).json({
        success: false,
        data: null,
        message: '본인의 신청 건만 결제할 수 있습니다.',
      });
    }

    if (application.status !== 'Approved') {
      return res.status(409).json({
        success: false,
        data: null,
        message: '승인된 신청만 결제할 수 있습니다.',
      });
    }

    const boothPrice = Number(application.boothPrice || 0);
    const isFreeBooth = boothPrice === 0;

    if (isFreeBooth) {
      // 부스료 0원: 실제로 결제할 금액이 없으므로 포트원 검증을 건너뛴다.
      // (paymentId도 없을 수 있음 — 프론트에서 포트원 결제창을 아예 띄우지 않음)
      paymentId = paymentId || null;
    } else {
      if (!paymentId) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'paymentId는 필수입니다.',
        });
      }

      // PortOne 결제 검증
      const payment = await verifyPayment(paymentId);

      // 결제 완료 여부 확인
      if (payment.status !== 'PAID') {
        return res.status(400).json({
          success: false,
          data: null,
          message: '결제가 완료되지 않았습니다.',
        });
      }

      // 금액 검증
      if (Number(payment.amount.total) !== boothPrice) {
        return res.status(400).json({
          success: false,
          data: null,
          message: '결제 금액이 일치하지 않습니다.',
        });
      }
    }

    // 중복 결제(등록) 방지
    const [paidRows] = await pool.query(
      `SELECT paymentId
      FROM payments
      WHERE applicationId = ? AND status = 'Paid'`,
      [applicationId]
    );
    if (paidRows.length > 0) {
      return res.status(409).json({
        success: false,
        data: null,
        message: '이미 결제가 완료된 신청입니다.',
      });
    }
    const [result] = await pool.query(
      `INSERT INTO payments (applicationId, amount, status, paymentKey)
   VALUES (?, ?, 'Paid', ?)`,
      [applicationId, application.boothPrice || 0, paymentId] // ← paymentId를 paymentKey 자리에 넣음
    );

    await pool.query(`UPDATE applications SET status = 'Paid' WHERE applicationId = ?`, [applicationId]);

    // 결제 완료 → 결제 기한 제거
    await pool.query(
      'UPDATE applications SET paymentDueAt = NULL WHERE applicationId = ?',
      [applicationId]
    );

    // [추가] 결제 완료 -> 마켓 주최자에게 알림
    await createNotification({
      userId: application.hostId,
      audience: 'host',
      type: 'payment_completed',
      title: '부스 결제 완료',
      message: `"${application.marketTitle}" 마켓 ${application.boothNumber}번 부스(${application.itemName}) 결제가 완료되었습니다. (${boothPrice.toLocaleString()}원)`,
      marketId: application.marketId,
      applicationId: application.applicationId,
    });

    return res.status(201).json({
      success: true,
      data: {
        paymentId: result.insertId,
        applicationId: Number(applicationId),
        amount: boothPrice,
        status: 'Paid',
      },
      message: isFreeBooth ? '무료 부스 등록이 완료되었습니다.' : '결제가 완료되었습니다.',
    });
  } catch (error) {
    console.error('결제 검증 오류:', error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      data: null,
      message: '서버 오류로 결제 처리에 실패했습니다.',
    });
  }
}

export async function refundPayment(req, res) {
  const { userId } = req.user;
  const { applicationId, reason } = req.body;

  if (!applicationId) {
    return res.status(400).json({ success: false, message: 'applicationId는 필수 입니다' })
  }

  try {
    const [rows] = await pool.query(
      /*sql*/
      `SELECT p.paymentId, p.paymentKey, p.status, p.amount, p.refundAmount, m.hostId,
              a.sellerId, a.boothNumber, a.itemName, a.marketId, m.title AS marketTitle
       FROM payments p
       JOIN applications a ON a.applicationId = p.applicationId
       JOIN markets m ON m.marketId = a.marketId
       WHERE p.applicationId = ?`,
      [applicationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "결제 내역을 찾을 수 없습니다" });
    }

    const payment = rows[0];

    if (Number(payment.hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, message: "결제 완료된 건만 환불할 수 있습니다." });
    }

    if (payment.status == 'Paid') {
      const cancelResult = await cancelPayment(
        payment.paymentKey,
        reason || '주최자 요청에 의한 환불'
      )
    }

    if (payment.status == 'RefundRequested') {
      // 📌 미리 계산해둔 refundAmount로 부분 환불 실행
      await cancelPayment(payment.paymentKey, '환불 승인 처리', payment.refundAmount);
    }

    await pool.query(
      /*sql*/ `UPDATE payments SET status = 'Refunded', refundReason = ? WHERE applicationId = ?`,
      [reason, applicationId]);
    await pool.query(
      /*sql*/
      `UPDATE applications 
      SET status = 'Refunded' 
      WHERE applicationId = ?`,
      [applicationId]);

    // [추가] 환불 완료 -> 판매자에게 알림
    const refundedAmount = payment.status === 'RefundRequested' ? payment.refundAmount : payment.amount;
    await createNotification({
      userId: payment.sellerId,
      audience: 'seller',
      type: 'refund_completed',
      title: '환불 완료',
      message: `"${payment.marketTitle}" 마켓 ${payment.boothNumber}번 부스(${payment.itemName}) 환불이 완료되었습니다. (${Number(refundedAmount || 0).toLocaleString()}원)`,
      marketId: payment.marketId,
      applicationId: Number(applicationId),
    });

    return res.status(200).json({
      success: true,
      data: { applicationId, status: 'Refunded' },
      message: '환불이 완료되었습니다.',
    });
  }
  catch (error) {
    console.error('환불 처리 오류:', error.message);
    return res.status(500).json({ success: false, message: error.message || '서버 오류가 발생했습니다.' });
  }
}

export async function requestRefund(req, res) {
  const { userId } = req.user;
  const { applicationId, reason } = req.body;

  try {
    const [rows] = await pool.query(
      /*SQL*/
      `SELECT p.paymentId, p.amount, p.status, a.sellerId, m.eventDate_min,
              m.hostId, m.title AS marketTitle, a.boothNumber, a.itemName, a.marketId
       FROM payments p
       JOIN applications a ON a.applicationId = p.applicationId
       JOIN markets m ON m.marketId = a.marketId
       WHERE p.applicationId = ?`
      , [applicationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '결제 내역을 찾을 수 없습니다.' });
    }

    const payment = rows[0];

    if (Number(payment.sellerId) !== Number(userId)) {
      return res.status(403).json({ success: false, message: '본인의 결제 건만 환불 요청할 수 있습니다.' });
    }

    // 📌 환불 비율 계산
    const refundRate = calculateRefundRate(payment.eventDate_min);
    const refundAmount = Math.floor(payment.amount * refundRate);

    if (refundRate === 0) {
      return res.status(400).json({
        success: false,
        message: '행사가 임박하여 환불이 불가능합니다.',
      });
    }

    // 계산된 금액을 미리 저장해서, 주최자가 승인할 때 그대로 쓰게 함
    await pool.query(
      /*sql*/
      `UPDATE payments SET status = 'RefundRequested', refundReason = ?, refundAmount = ? WHERE applicationId = ?`,
      [reason, refundAmount, applicationId]
    );
    await pool.query(
      `UPDATE applications SET status = 'RefundRequested' WHERE applicationId = ?`,
      [applicationId]
    );

    // [추가] 환불 요청 -> 마켓 주최자에게 알림
    await createNotification({
      userId: payment.hostId,
      audience: 'host',
      type: 'refund_requested',
      title: '환불 요청',
      message: `"${payment.marketTitle}" 마켓 ${payment.boothNumber}번 부스(${payment.itemName})에 환불 요청이 접수되었습니다. (예정 금액: ${refundAmount.toLocaleString()}원)`,
      marketId: payment.marketId,
      applicationId: Number(applicationId),
    });

    return res.status(200).json({
      success: true,
      data: { refundRate: refundRate * 100, refundAmount },
      message: `환불 요청이 접수되었습니다. (환불 예정 금액: ${refundAmount.toLocaleString()}원, 환불율: ${refundRate * 100}%)`,
    });
  } catch (error) {
    console.error('환불 요청 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}
/**
 * GET /api/pay/history?period=this_month|3months|all
 *
 * 주최자에게는 「정산 내역」, 판매자에게는 「결제 내역」 입니다.
 * 같은 API 지만 보는 관점이 반대라 role 로 나눠 응답합니다.
 *
 * ── 정산이라고 부르는 근거 ────────────────────────────────────────
 *   주최자 기준 (원금 - 환불) 이 곧 받을 금액입니다. 계산은 이미 되어 있었고,
 *   화면이 그걸 "결제내역" 이라 부르며 마켓별 합계도 보여주지 않았을 뿐입니다.
 *
 * ── 실제 이체는 없습니다 ──────────────────────────────────────────
 *   결제가 테스트 API 라 주최자 계좌로 돈이 나가지는 않습니다.
 *   여기서 하는 일은 "얼마를 받게 되는가" 를 보여주는 조회까지입니다.
 *
 * ── 정산 확정 시점 ────────────────────────────────────────────────
 *   마켓이 끝나야 금액이 굳습니다. 진행 중인 마켓은 아직 취소·환불이 나올 수 있어
 *   'pending' 으로 따로 보여줍니다. 확정분과 섞으면 숫자가 나중에 바뀝니다.
 */
export async function paymentHistory(req, res) {
  const userId = req.user.userId;
  // 라우트가 POST 라 본문으로도, 쿼리스트링으로도 받을 수 있게 둡니다.
  const period = String(req.query?.period || req.body?.period || 'all');

  // 기간은 "마켓 개최일" 기준입니다. 결제일 기준으로 하면 몇 달 전에 미리 결제한 건이
  // 엉뚱한 달에 잡혀, 주최자가 생각하는 행사 단위와 어긋납니다.
  const PERIODS = {
    this_month: 'AND m.eventDate_max >= DATE_FORMAT(CURDATE(), "%Y-%m-01")',
    '3months': 'AND m.eventDate_max >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)',
    '6months': 'AND m.eventDate_max >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)',
    all: '',
  };
  const periodSql = PERIODS[period] ?? '';

  try {
    const [me] = await pool.query('SELECT userType FROM users WHERE userId = ?', [userId]);
    if (me.length === 0) {
      return res.status(404).json({ success: false, data: [], message: '사용자를 찾을 수 없습니다.' });
    }
    const isHost = Number(me[0].userType) === 1;

    // 주최자는 자기 마켓의 모든 결제, 판매자는 자기가 낸 결제.
    const [rows] = await pool.query(
      `SELECT
         a.applicationId, a.marketId, a.sellerId, a.itemName, a.boothNumber, a.status,
         m.title AS marketTitle,
         m.isExpired,
         DATE_FORMAT(m.eventDate_min, '%Y-%m-%d') AS eventDateMin,
         DATE_FORMAT(m.eventDate_max, '%Y-%m-%d') AS eventDateMax,
         (m.eventDate_max < CURDATE()) AS isFinished,
         u.nickname AS sellerNickname,
         hu.nickname AS hostNickname,
         IFNULL(p.amount, 0) AS amount,
         IFNULL(p.refundAmount, 0) AS refundAmount,
         p.paidAt
       FROM applications a
       INNER JOIN markets m ON a.marketId = m.marketId
       INNER JOIN users u ON a.sellerId = u.userId
       INNER JOIN users hu ON m.hostId = hu.userId
       LEFT JOIN payments p ON a.applicationId = p.applicationId
      WHERE ${isHost ? 'm.hostId = ?' : 'a.sellerId = ?'}
        AND a.status IN ('Paid', 'Refunded', 'RefundRequested')
        ${periodSql}
      ORDER BY m.eventDate_max DESC, a.applicationId ASC`,
      [userId]
    );

    // 마켓별로 묶고 합계를 서버에서 냅니다.
    //   화면마다 따로 더하면 계산이 갈립니다. 정산 금액은 한 곳에서만 계산해야 합니다.
    const groupMap = new Map();
    for (const r of rows) {
      const key = String(r.marketId);
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          marketId: r.marketId,
          marketTitle: r.marketTitle,
          hostNickname: r.hostNickname,
          eventDateMin: r.eventDateMin,
          eventDateMax: r.eventDateMax,
          isFinished: Number(r.isFinished) === 1,
          isCancelled: Number(r.isExpired) === 2,
          items: [],
          boothCount: 0,
          grossAmount: 0,
          refundAmount: 0,
          netAmount: 0,
        });
      }
      const g = groupMap.get(key);
      const amount = Number(r.amount) || 0;
      const refund = Number(r.refundAmount) || 0;
      g.items.push({
        applicationId: r.applicationId,
        sellerId: r.sellerId,
        sellerNickname: r.sellerNickname,
        boothNumber: r.boothNumber,
        itemName: r.itemName,
        status: r.status,
        amount,
        refundAmount: refund,
        netAmount: amount - refund,
        paidAt: r.paidAt,
      });
      g.boothCount += 1;
      g.grossAmount += amount;
      g.refundAmount += refund;
      g.netAmount += amount - refund;
    }

    const groups = [...groupMap.values()].map((g) => ({
      ...g,
      // 마켓이 끝나야 금액이 굳습니다. 취소된 마켓은 전액 환불이라 확정으로 봅니다.
      settlementStatus: g.isCancelled ? 'cancelled' : (g.isFinished ? 'settled' : 'pending'),
    }));

    const sum = (list, key) => list.reduce((acc, g) => acc + g[key], 0);
    const settled = groups.filter((g) => g.settlementStatus === 'settled');
    const pending = groups.filter((g) => g.settlementStatus === 'pending');

    return res.status(200).json({
      success: true,
      data: {
        role: isHost ? 'host' : 'seller',
        period,
        groups,
        summary: {
          marketCount: groups.length,
          boothCount: sum(groups, 'boothCount'),
          grossAmount: sum(groups, 'grossAmount'),
          refundAmount: sum(groups, 'refundAmount'),
          netAmount: sum(groups, 'netAmount'),
          // 확정 = 끝난 마켓, 대기 = 진행 중 (아직 환불이 나올 수 있음)
          settledAmount: sum(settled, 'netAmount'),
          pendingAmount: sum(pending, 'netAmount'),
        },
      },
      // [버그 수정] 내역이 없을 때 500 을 반환하고 있었습니다.
      //   신규 주최자는 화면이 그냥 깨졌습니다. 빈 목록은 오류가 아니라 정상 상태입니다.
      message: groups.length === 0
        ? (isHost ? '아직 정산할 내역이 없어요.' : '아직 결제 내역이 없어요.')
        : '조회 성공',
    });
  } catch (error) {
    console.error('결제/정산 내역 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 내역을 불러오지 못했습니다.' });
  }
}
