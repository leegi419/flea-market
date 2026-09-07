// backend/controllers/marketController.js
// 마켓(공고) 관련 로직 - 조회는 담당 C, 등록/신청목록은 담당 D, 좌표 저장은 담당 E

import pool from '../config/db.js';
// [중복 부스 신청 안내] 신청자 목록에 "이 판매자가 이 마켓에 몇 칸"을 붙입니다.
import { attachDuplicateToMarketApplications, summarizeDuplicates } from '../utills/duplicateApplication.js';
import { createNotification, createNotifications } from '../services/notificationService.js';
// [신규 마켓 알림] 관심 지역을 등록한 판매자를 골라냅니다.
import { findNewMarketRecipients } from '../utills/notificationSettings.js';
// [부스 등급] 등급 목록·신청 수·가격 이력을 마켓 응답에 붙입니다.
//   테이블만 있고 아무도 쓰지 않아 화면에 전혀 나오지 않던 것을 배선합니다.
import { attachBoothTypes, saveBoothTypes, normalizeBoothTypes, totalCapacityOf } from '../utills/boothTypes.js';
// [환불 예상] 주최자도 결제취소 전에 얼마가 나가는지 알아야 합니다.
import { buildRefundPreview } from '../utills/refundPolicy.js';

// GET /api/markets?region=&sort=latest|eventDate|priceLow&includeExpired=
export async function getMarketList(req, res) {
  const { region, sort } = req.query;
  const includeExpired = req.query.includeExpired === 'true';

  try {
    let sql = `
      SELECT m.*,
        u.nickname AS hostNickname,
        (SELECT COUNT(*) FROM applications a
          WHERE a.marketId = m.marketId
            AND a.status IN ('Pending', 'Approved', 'Paid')
        ) AS appliedBooths
      FROM markets m
      JOIN users u ON u.userId = m.hostId
    `;
    // isExpired=2(주최자가 삭제함)인 마켓은 includeExpired 여부와 상관없이 항상 목록에서 제외합니다.
    const conditions = ['m.isExpired <> 2'];
    const values = [];

    if (!includeExpired) {
      conditions.push('m.isExpired = 0');
      conditions.push('m.eventDate_max >= CURDATE()'); // D-0(오늘)까지는 보이고, 다음 날부터 자동 제외
    }
    if (region) { conditions.push('m.region = ?'); values.push(region); }
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;

    if (sort === 'eventDate') {
      sql += ' ORDER BY m.eventDate_min ASC';
    } else if (sort === 'priceLow') {
      sql += ' ORDER BY m.boothPrice ASC';
    } else {
      sql += ' ORDER BY m.marketId DESC';
    }

    const [rows] = await pool.query(sql, values);
    // 메인 카드가 등급별 게이지와 대표 가격을 그리려면 등급 정보가 필요합니다.
    await attachBoothTypes(pool, rows);

    return res.status(200).json({ success: true, data: rows, message: '마켓 목록을 조회했습니다.' });
  } catch (error) {
    console.error('마켓 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 목록 조회에 실패했습니다.' });
  }
}

// GET /api/markets/:marketId
export async function getMarketDetail(req, res) {
  const { marketId } = req.params;

  try {
    // isExpired=2(주최자가 삭제함)인 마켓은 삭제된 것처럼 조회되지 않도록 제외합니다.
    // [수정] 상세 화면에 주최자 닉네임을 노출하기 위해 users 를 조인합니다.
    const [rows] = await pool.query(
      `SELECT m.*, u.nickname AS hostNickname
       FROM markets m
       JOIN users u ON u.userId = m.hostId
       WHERE m.marketId = ?`,
      [marketId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }

    // [수정] 취소된 마켓(isExpired=2)은 판매자·방문자에게 계속 감추되,
    //   **주최자 본인에게는 보여줍니다.**
    //   예전에는 본인에게도 404 라서, 「내 마켓 관리 → 보러가기」로 들어가도
    //   "마켓 정보를 불러오지 못했어요" 만 뜨고 환불이 어떻게 됐는지 확인할 수 없었습니다.
    //   라우트에 optionalAuth 가 걸려 있어 비로그인 조회는 그대로 동작합니다.
    const market = rows[0];
    const isOwner = req.user?.userId !== undefined
      && Number(market.hostId) === Number(req.user.userId);

    if (Number(market.isExpired) === 2 && !isOwner) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }

    // 화면이 "취소된 마켓을 주최자 자격으로 보고 있다"를 알 수 있게 표시를 얹어 보냅니다.
    market.isOwner = isOwner;
    market.isCancelled = Number(market.isExpired) === 2;

    // 주최자 본인은 「신규 신청 중단」한 등급도 봐야 수정할 수 있습니다.
    const detailRows = [market];
    await attachBoothTypes(pool, detailRows, { includeInactive: !!market.isOwner });

    return res.status(200).json({ success: true, data: market, message: '마켓 상세 정보를 조회했습니다.' });
  } catch (error) {
    console.error('마켓 상세 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 상세 조회에 실패했습니다.' });
  }
}

// POST /api/markets (로그인 필요, 주최자)
export async function createMarket(req, res) {
  const { userId } = req.user;
  let { title, description, marketImage, locationName, region, latitude, longitude, eventDate_min, eventDate_max, boothPrice, isExpired, maxparticipants, recruitmentDate_min, recruitmentDate_max, allowDuplicateApplication, allowOvercapacity, boothPrice_origin, boothTypes } = req.body;
  //console.log(req.body);

  if (!title || !eventDate_min || !eventDate_max || !locationName) {
    return res.status(400).json({ success: false, data: null, message: '마켓 이름, 개최 일자, 장소는 필수입니다.' });
  }
  if (new Date(eventDate_max) < new Date(eventDate_min)) {
    return res.status(400).json({ success: false, data: null, message: '종료일은 시작일보다 빠를 수 없습니다.' });
  }
  if (new Date(eventDate_max) < new Date(recruitmentDate_min)) {
    return res.status(400).json({ success: false, data: null, message: '모집일은 개최일보다 빠를 수 없습니다.' });
  }
  if (boothPrice !== undefined && (Number.isNaN(Number(boothPrice)) || Number(boothPrice) < 0)) {
    return res.status(400).json({ success: false, data: null, message: '부스료는 0 이상의 숫자여야 합니다.' });
  }

  try {
    // [추가] 판매자 중복 신청 허용 여부. 값이 안 오면 기존 동작과 동일하게 허용(1)합니다.
    const allowDuplicateApplicationVal = allowDuplicateApplication === undefined ? 1 : (allowDuplicateApplication ? 1 : 0);
    // [초과 신청 허용] 수정 화면에는 있는데 등록 화면에만 빠져 있었습니다.
    //   그래서 마켓을 만들 때는 항상 0(불가)으로 생성되고,
    //   주최자가 켜려면 만든 뒤 수정 화면에 다시 들어가야 했습니다.
    //   기본값은 0(초과 불가) — 기존 동작과 같습니다.
    const allowOvercapacityVal = allowOvercapacity === undefined ? 0 : (allowOvercapacity ? 1 : 0);
    boothPrice_origin = boothPrice;
    const [result] = await pool.query(
      `INSERT INTO markets (hostId, title, description, marketImage, locationName, region, latitude, longitude, eventDate_min, eventDate_max, boothPrice, isExpired, maxparticipants,recruitmentDate_min,recruitmentDate_max,allowDuplicateApplication ,allowOvercapacity, boothPrice_origin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?,?, ?)`,
      [userId, title, description || '', marketImage || null, locationName, region || null, latitude || 0, longitude || 0, eventDate_min, eventDate_max, boothPrice || 0, isExpired || 0, maxparticipants || 9999, recruitmentDate_min, recruitmentDate_max, allowDuplicateApplicationVal, allowOvercapacityVal, boothPrice_origin]
    );

    //console.log('req.body 전체:', req.body);

    // [부스 등급] 주최자가 등급을 넣었으면 함께 저장합니다.
    //   첫 번째 등급(프리미엄)의 금액을 markets.boothPrice 에도 반영합니다.
    //   대표 가격이 두 곳에서 갈리면, 등급을 모르는 화면이 엉뚱한 금액을 보여줍니다.
    let boothTypeResult = null;
    if (Array.isArray(boothTypes) && boothTypes.length > 0) {
      try {
        const normalized = normalizeBoothTypes(boothTypes);
        if (normalized.ok) {
          boothTypeResult = await saveBoothTypes(pool, result.insertId, normalized.list);
          const primary = normalized.list[0];
          if (primary) {
            // [총 부스 수] 등급을 쓰면 합계가 곧 총 정원입니다.
            //   따로 받으면 크면 무의미하고 작으면 등급 칸을 막아버립니다.
            //   0 이면 제한 없음 — 스키마 기본값(9999)과 맞춰 저장합니다.
            const totalCap = totalCapacityOf(normalized.list);
            await pool.query(
              `UPDATE markets
                  SET boothPrice = ?, boothPrice_origin = COALESCE(boothPrice_origin, ?),
                      maxParticipants = ?
                WHERE marketId = ?`,
              [primary.price, primary.price, totalCap > 0 ? totalCap : 9999, result.insertId]
            );
          }
        } else {
          boothTypeResult = { ok: false, message: normalized.message };
        }
      } catch (btError) {
        // 등급 저장이 실패해도 마켓 등록 자체는 살립니다.
        console.error('부스 등급 저장 실패(마켓은 등록됨):', btError.message);
        boothTypeResult = { ok: false, message: '부스 등급을 저장하지 못했어요. 마켓 수정에서 다시 시도해 주세요.' };
      }
    }

    // [신규 마켓 알림] 관심 지역이 맞는 판매자에게 알립니다.
    //   지역을 등록하지 않은 사람은 "모든 지역" 으로 보고 전부 받습니다.
    //   발송량이 커질 수 있어 세 가지를 지켰습니다:
    //     - 모집 중인 마켓만 (isExpired=0). 지난 마켓을 옮겨 담는 경우 알리지 않습니다.
    //     - 주최자 본인은 제외
    //     - 실패해도 등록 응답을 막지 않음 (알림 때문에 마켓 등록이 실패하면 안 됩니다)
    if (!Number(isExpired)) {
      try {
        const targets = await findNewMarketRecipients(pool, region || '', userId);
        if (targets.length > 0) {
          const when = eventDate_min === eventDate_max
            ? eventDate_min
            : `${eventDate_min} ~ ${eventDate_max}`;
          await createNotifications(targets.map((uid) => ({
            userId: uid,
            audience: 'seller',
            type: 'new_market',
            title: '관심 지역에 새 마켓이 열렸어요',
            message: `「${title}」 · ${when} · ${locationName || region || ''}`,
            marketId: result.insertId,
          })));
        }
      } catch (notifyError) {
        console.error('신규 마켓 알림 실패(등록은 완료됨):', notifyError.message);
      }
    }

    return res.status(201).json({
      success: true,
      data: { marketId: result.insertId, boothTypes: boothTypeResult },
      message: boothTypeResult && boothTypeResult.ok === false
        ? `마켓은 등록됐지만 부스 등급 저장에 문제가 있어요: ${boothTypeResult.message}`
        : '마켓이 등록되었습니다.',
    });
  } catch (error) {
    console.error('마켓 등록 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 등록에 실패했습니다.' });
  }
}

// PATCH /api/markets/:marketId (로그인 필요, 마켓 주최자 본인만) - 마감 처리 등 상태 변경
export async function updateMarketStatus(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;
  const {
    isExpired, title, description,
    eventDate_min, eventDate_max,
    recruitmentDate_min, recruitmentDate_max,
    boothPrice, locationName, region,
    latitude, longitude, maxParticipants,
    marketImage, allowOvercapacity, allowDuplicateApplication
  } = req.body;

  try {
    // [변경 알림] 무엇이 바뀌었는지 알려면 바꾸기 전 값이 필요합니다.
    //   hostId 만 읽던 것을 필요한 필드까지 함께 읽도록 넓혔습니다.
    const [rows] = await pool.query(
      `SELECT hostId, title,
              DATE_FORMAT(eventDate_min, '%Y-%m-%d') AS eventDate_min,
              DATE_FORMAT(eventDate_max, '%Y-%m-%d') AS eventDate_max,
              locationName, isExpired
         FROM markets WHERE marketId = ?`,
      [marketId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(rows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓만 수정할 수 있습니다.' });
    }

    const fields = [];
    const values = [];

    if (isExpired !== undefined) { fields.push('isExpired = ?'); values.push(isExpired ? 1 : 0); }
    if (title) { fields.push('title = ?'); values.push(title); }
    if (description) { fields.push('description = ?'); values.push(description); }
    if (eventDate_min) { fields.push('eventDate_min = ?'); values.push(eventDate_min); }
    if (eventDate_max) { fields.push('eventDate_max = ?'); values.push(eventDate_max); }
    if (recruitmentDate_min) { fields.push('recruitmentDate_min = ?'); values.push(recruitmentDate_min); }
    if (recruitmentDate_max) { fields.push('recruitmentDate_max = ?'); values.push(recruitmentDate_max); }
    if (boothPrice !== undefined) { fields.push('boothPrice = ?'); values.push(boothPrice); }
    if (locationName) { fields.push('locationName = ?'); values.push(locationName); }
    if (region) { fields.push('region = ?'); values.push(region); }
    if (latitude !== undefined) { fields.push('latitude = ?'); values.push(latitude); }
    if (longitude !== undefined) { fields.push('longitude = ?'); values.push(longitude); }
    if (maxParticipants !== undefined) {
      const maxParticipantsVal = Number(maxParticipants) === 0 ? 9999 : maxParticipants;
      fields.push('maxParticipants = ?');
      values.push(maxParticipantsVal);
    }
    if (allowOvercapacity !== undefined) { fields.push('allowOvercapacity = ?'); values.push(allowOvercapacity ? 1 : 0); }
    // [추가] 같은 판매자가 이 마켓에 부스를 중복(같은 상품이든 다른 상품이든) 신청하는 것을 허용할지 여부
    if (allowDuplicateApplication !== undefined) { fields.push('allowDuplicateApplication = ?'); values.push(allowDuplicateApplication ? 1 : 0); }
    // [수정] 예전에는 `if (marketImage)` 라서 null/'' 이 무시됐고, 이미지 삭제가 불가능했습니다.
    if (marketImage !== undefined) { fields.push('marketImage = ?'); values.push(marketImage || null); }

    // [부스 등급] 등급만 바꾸는 것도 엄연한 수정입니다.
    //   여기서 걸러버리면 등급 저장 코드까지 가지 못해, 주최자가 가격을 고쳐도
    //   "수정할 내용이 없습니다" 만 뜨고 아무 일도 일어나지 않습니다.
    const hasBoothTypeChange = Array.isArray(req.body?.boothTypes);

    if (fields.length === 0 && !hasBoothTypeChange) {
      return res.status(400).json({ success: false, data: null, message: '수정할 내용이 없습니다.' });
    }

    // 바꿀 컬럼이 없으면 UPDATE 를 건너뜁니다. (등급만 수정하는 경우)
    if (fields.length > 0) {
      values.push(marketId);
      await pool.query(`UPDATE markets SET ${fields.join(', ')} WHERE marketId = ?`, values);
    }

    // [부스 등급] 수정 화면에서 등급을 보냈으면 저장합니다.
    //   가격이 바뀌면 boothTypes.js 가 직전가(pricePrev)를 자동으로 남깁니다.
    let boothTypeResult = null;
    if (Array.isArray(req.body?.boothTypes)) {
      const normalized = normalizeBoothTypes(req.body.boothTypes);
      if (!normalized.ok) {
        return res.status(400).json({ success: false, data: null, message: normalized.message });
      }
      boothTypeResult = await saveBoothTypes(pool, marketId, normalized.list);
      if (boothTypeResult.ok === false) {
        // 신청자가 있는 등급을 지우려 한 경우 등 — 이유를 그대로 전달합니다.
        return res.status(409).json({ success: false, data: null, message: boothTypeResult.message });
      }
      const primary = normalized.list[0];
      if (primary) {
        // 등급을 고치면 총 부스 수도 함께 맞춥니다.
        //   예전에 총 8 / 등급 6 으로 등록된 마켓도 다음 수정 때 6 으로 정리됩니다.
        const totalCap = totalCapacityOf(normalized.list);
        await pool.query(
          'UPDATE markets SET boothPrice = ?, maxParticipants = ? WHERE marketId = ?',
          [primary.price, totalCap > 0 ? totalCap : 9999, marketId]
        );
      }
    }

    // [변경 알림] 날짜와 장소만 알립니다.
    //   설명이나 이미지가 바뀔 때마다 알리면 알림이 의미를 잃습니다.
    //   날짜가 바뀌면 못 오게 되는 사람이 생기고, 장소가 바뀌면 엉뚱한 곳으로 갑니다.
    //   이 알림은 market_change 묶음이라 설정에서 끌 수 없습니다.
    try {
      const before = rows[0];
      const changes = [];
      if (eventDate_min && eventDate_min !== before.eventDate_min) {
        changes.push(`행사 시작일 ${before.eventDate_min} → ${eventDate_min}`);
      }
      if (eventDate_max && eventDate_max !== before.eventDate_max) {
        changes.push(`행사 종료일 ${before.eventDate_max} → ${eventDate_max}`);
      }
      if (locationName && locationName !== before.locationName) {
        changes.push(`장소 ${before.locationName} → ${locationName}`);
      }

      if (changes.length > 0) {
        // 자리를 확보한 사람에게만 알립니다. 반려·취소된 사람에게는 의미가 없습니다.
        const [sellers] = await pool.query(
          `SELECT DISTINCT sellerId FROM applications
            WHERE marketId = ? AND status IN ('Pending', 'Approved', 'Paid')`,
          [marketId]
        );
        if (sellers.length > 0) {
          await createNotifications(sellers.map((s) => ({
            userId: s.sellerId,
            audience: 'seller',
            type: 'market_changed',
            title: '참가 예정 마켓 정보가 바뀌었어요',
            message: `「${title || before.title}」 ${changes.join(' · ')}`,
            marketId: Number(marketId),
          })));
        }
      }
    } catch (notifyError) {
      console.error('마켓 변경 알림 실패(수정은 완료됨):', notifyError.message);
    }

    return res.status(200).json({ success: true, data: { boothTypes: boothTypeResult }, message: '마켓 정보가 수정되었습니다.' });
  } catch (error) {
    console.error('마켓 상태 수정 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 수정에 실패했습니다.' });
  }
}

// GET /api/markets/:marketId/applications (로그인 필요, 담당 D - 마켓 주최자용 신청 목록)
export async function getApplicationsByMarket(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;

  try {
    const [myData] = await pool.query('SELECT userType FROM users WHERE userId = ?', [userId]);
    const [marketRows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (myData.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 유저 정보를 찾을 수 없습니다.' });
    }
    if (myData[0]?.userType === 1) {
      if (marketRows.length === 0) {
        return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
      }
      if (Number(marketRows[0].hostId) !== Number(userId)) {
        return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓의 신청 목록만 조회할 수 있습니다.' });
      }

      // 수정 — 평가하기 버튼 표시에 필요한 정보(행사 시작 여부/결제여부/이미 평가했는지) 같이 내려줌
      const [rows] = await pool.query(
        // [닉네임] 신청자 목록에 sellerId(숫자)만 내려가서 화면에 "신청자: 12"처럼 보였습니다.
        //          users 를 조인해 sellerNickname 을 같이 내려줍니다.
        `SELECT a.*,
          su.nickname AS sellerNickname,
          (m.eventDate_min <= CURDATE()) AS eventStarted,
          EXISTS(
            SELECT 1 FROM payments p WHERE p.applicationId = a.applicationId AND p.status = 'Paid'
          ) AS isPaid,
          sr.rating AS mySellerRating,
          pay.refundReason AS refundReason,
          pay.amount AS paidAmount,
          -- [환불 예상] 개최일을 알아야 환불 비율을 계산할 수 있습니다.
          DATE_FORMAT(m.eventDate_min, '%Y-%m-%d') AS eventDateMin
        FROM applications a
        JOIN markets m ON m.marketId = a.marketId
        LEFT JOIN users su ON su.userId = a.sellerId
        LEFT JOIN seller_reviews sr ON sr.applicationId = a.applicationId
        LEFT JOIN payments pay ON pay.applicationId = a.applicationId
        WHERE a.marketId = ?
        ORDER BY a.applicationId DESC`,
        [marketId]
      );

      // [중복 부스 신청 안내] 한 판매자가 이 마켓에서 부스를 몇 칸 잡고 있는지 각 행에 붙입니다.
      //   목록 전체를 이미 들고 있으므로 추가 쿼리 없이 배열 안에서 셉니다.
      //   화면(market.js)은 sellerDuplicateCount 로 "중복 N" 배지를 그립니다.
      const withDuplicate = attachDuplicateToMarketApplications(rows);
      const duplicateSummary = summarizeDuplicates(withDuplicate);

      // [환불 예상] 결제된 신청에 "지금 취소하면 얼마" 를 붙입니다.
      //   주최자가 결제취소를 누르기 전에 판매자에게 얼마가 돌아가는지 알아야
      //   "얼마 나가는지 모르고 눌렀다" 가 생기지 않습니다.
      for (const row of withDuplicate) {
        if (!row.isPaid) continue;
        row.refundPreview = buildRefundPreview(
          row.eventDateMin,
          row.paidAmount != null ? row.paidAmount : row.boothPrice
        );
      }

      return res.status(200).json({
        success: true,
        data: withDuplicate,
        duplicateSummary,
        message: '신청 목록을 조회했습니다.',
      });
    }

    // [단방향 전환 규칙 검증 - 버그 수정]
    //   판매자(userType 0)일 때 아무 응답도 만들지 않고 함수가 끝나서,
    //   요청이 응답을 못 받고 브라우저에서 계속 매달려 있었습니다. (타임아웃까지 대기)
    //   이 API 는 주최자 전용이므로 명시적으로 403 을 돌려줍니다.
    //   (app.use(hostAreaGuard) 에서도 막히지만, 컨트롤러 단독 호출 시를 대비한 이중 방어입니다.)
    return res.status(403).json({
      success: false,
      data: null,
      message: '판매자 계정은 주최자 기능을 이용할 수 없습니다.',
    });
  } catch (error) {
    console.error('신청 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 신청 목록 조회에 실패했습니다.' });
  }
}

// [추가 07-28] H-02 주최자 마켓 목록 정렬 필터
// 메인 목록(getMarketList) / 검색(searchController) 과 동일하게
// 고정된 SQL 조각만 매핑에서 골라 쓰므로 sort 값이 그대로 쿼리에 들어가지 않음 (인젝션 안전).
//   - recruitEnd : 모집마감순  (모집 마감일이 가까운 순, 마감일 없는 마켓은 뒤로)
//   - region     : 지역순      (같은 지역 안에서는 개최일이 빠른 순)
//   - eventDate  : 개최순      (개최일이 가까운 순, 개최일 없는 마켓은 뒤로)
//   - latest     : 기본값      (기존 동작 = 진행중 우선 + 최근 수정순)
const MY_MARKET_SORT_CLAUSES = {
  recruitEnd: 'm.recruitmentDate_max IS NULL ASC, m.recruitmentDate_max ASC, m.marketId DESC',
  region: 'm.region ASC, m.eventDate_min ASC, m.marketId DESC',
  eventDate: 'm.eventDate_min IS NULL ASC, m.eventDate_min ASC, m.marketId DESC',
  latest: 'm.isExpired ASC, m.updated_at DESC',
};

// GET /api/markets/mine?includeExpired=&sort=recruitEnd|region|eventDate|latest
// [통합] 기존 /api/my-markets (myMarketController.getMyMarkets) 와 기능이 중복되어
//        이 함수 하나로 합쳤습니다. includeExpired 옵션은 구 my-markets 스펙에서 흡수.
//        - 기본값: 모집중/마감/취소 전부 반환 (프론트 상태 필터가 클라이언트에서 동작)
//        - includeExpired=false: 모집중(isExpired=0)만 반환
export async function getMyMarket(req, res) {
  const { userId } = req.user;
  const includeExpired = req.query.includeExpired !== 'false';

  // 정렬 옵션이 없거나 정의되지 않은 값이면 기존 기본 정렬(latest)을 사용
  const { sort } = req.query;
  const sortClause = MY_MARKET_SORT_CLAUSES[sort] || MY_MARKET_SORT_CLAUSES.latest;
  // 취소된 마켓(isExpired=2)은 어떤 정렬을 골라도 항상 목록 맨 아래로 내림
  const orderClause = sort && sort !== 'latest'
    ? `(m.isExpired = 2) ASC, ${sortClause}`
    : sortClause;

  try {
    const [rows] = await pool.query(
      `SELECT m.*,
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId
              AND a.status IN ('Pending', 'Approved', 'Paid')
         ) AS appliedBooths,
         -- [추가] 결제 현황 게이지용: 판매자별 결제 진행 상태 집계
         --   결제완료 = 'Paid', 결제대기 = 'Approved'(승인은 됐지만 아직 결제 전),
         --   환불완료 = 'Refunded' + 'RefundRequested'(환불 승인 완료 및 환불 진행중 건 포함)
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId AND a.status = 'Paid'
         ) AS paidBooths,
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId AND a.status = 'Approved'
         ) AS pendingPaymentBooths,
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId AND a.status IN ('Refunded', 'RefundRequested')
         ) AS refundedBooths,
         -- [추가] 승인 현황 게이지용: 판매자 신청건의 승인 진행 상태 집계
         --   승인대기 = 'Pending', 반려 = 'Rejected',
         --   승인됨 = 승인을 한 번이라도 통과한 건 전체
         --           ('Approved'/'Paid'/'Refunded'/'RefundRequested'/'Expired')
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId AND a.status = 'Pending'
         ) AS pendingApprovalBooths,
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId
              AND a.status IN ('Approved', 'Paid', 'Refunded', 'RefundRequested', 'Expired')
         ) AS approvedBooths,
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId AND a.status = 'Rejected'
         ) AS rejectedBooths
       FROM markets m
       WHERE m.hostId = ?
         ${includeExpired ? '' : 'AND m.isExpired = 0'}
       ORDER BY ${orderClause}`,
      [userId]
    );
    // 밑에 코드는 참여자 수 까지 가져오는 코드지만 아직 applications db가 완성 되지 않아 보류
    // const [rows] = await pool.query(
    //   `select 
    //     m.*,
    //   (select count(*) from applications a where a.marketId = m.marketId) as applicantCount
    //   from markets  m
    //   where m.hostId= ?
    //   order by marketId desc`, [userId]
    // );
    return res.status(200).json({
      success: true,
      data: rows,
      message: '내 마켓 목록 조회'
    });
  }
  catch (error) {
    console.error('조회 실패');
    return res.status(500).json({ success: false, data: null, message: '서버 오류' })
  }
}
