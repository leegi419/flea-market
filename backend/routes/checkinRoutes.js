// backend/routes/checkinRoutes.js
// [현장 QR 체크인] /api/checkin/*
//
// 라우트를 marketRoutes.js 에 끼워 넣지 않고 파일을 새로 만든 이유
//   marketRoutes.js 는 여러 명이 동시에 건드리는 파일이라 병합 충돌이 잦습니다.
//   체크인은 테이블도 분리돼 있으니 파일 단위로 떼어 두면
//   server.js 에 2줄만 추가하고 나머지는 이 파일 안에서 끝납니다.
//
// 권한 요약
//   주최자 전용 : sessions(시작/현황/종료), scan, manual, records 삭제
//   판매자      : pass(입장 QR 발급), my(내 출석 이력), stats/me
//   공개        : stats/:userId (프로필의 노쇼 표기)

import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireHostAccount } from '../middleware/roleGuard.js';
import {
  openCheckinSession,
  scheduleCheckin,
  closeCheckinSession,
  getCheckinSession,
  getSellerPass,
  scanCheckin,
  manualCheckin,
  cancelCheckin,
  getMyAttendanceStats,
  getUserAttendanceStats,
  getMyCheckins,
} from '../controllers/checkinController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Checkin
 *   description: 현장 QR 체크인 (판매자가 QR 을 띄우고 주최자가 스캔)
 */

/**
 * @swagger
 * /checkin/sessions:
 *   post:
 *     summary: 체크인 시작 (주최자)
 *     description: |
 *       개최 기간 안의 날짜에 대해 체크인을 엽니다. 주최자가 열어야 판매자 화면에 QR 이 나옵니다.
 *       같은 날짜를 다시 열면 세션은 재사용하되 서명 키가 교체되어, 그전에 캡처된 판매자 QR 은 모두 무효가 됩니다.
 *       지난 날짜(어제 이전)는 이미 노쇼가 확정된 날이라 열 수 없습니다.
 *     tags: [Checkin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marketId, eventDate]
 *             properties:
 *               marketId:  { type: integer, example: 12 }
 *               eventDate: { type: string, format: date, example: '2026-09-05' }
 *     responses:
 *       200: { description: 시작됨 }
 *       400: { description: DATE_OUT_OF_RANGE / DATE_ALREADY_PASSED }
 *       403: { description: NOT_MARKET_OWNER }
 *       409: { description: MARKET_CANCELLED }
 */
router.post('/sessions', authenticateToken, requireHostAccount, openCheckinSession);

/**
 * @swagger
 * /checkin/schedule:
 *   post:
 *     summary: 체크인 시간대 일괄 예약 (주최자)
 *     description: |
 *       개최 기간 전체에 대해 "매일 몇 시부터 몇 시까지" 를 한 번에 잡습니다.
 *       7일 마켓이면 세션 7행이 만들어지고, 각 날짜가 자기 시간에 자동으로 열리고 닫힙니다.
 *       QR 은 시작 시각의 leadMinutes(기본 60분) 전부터 판매자 화면에 나옵니다.
 *       이미 지난 날짜와, 주최자가 직접 열거나 닫은 날짜는 건드리지 않습니다.
 *     tags: [Checkin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marketId, startTime, endTime]
 *             properties:
 *               marketId:    { type: integer, example: 12 }
 *               startTime:   { type: string, example: '10:00' }
 *               endTime:     { type: string, example: '17:00' }
 *               leadMinutes: { type: integer, example: 60, description: 'QR 을 몇 분 전부터 띄울지 (0~720)' }
 *               dates:
 *                 type: array
 *                 items: { type: string, format: date }
 *                 description: '생략하면 개최 기간 전체. 특정 날짜만 다른 시간으로 잡을 때 사용'
 *     responses:
 *       200: { description: 예약됨 (applied / skipped 목록 포함) }
 *       400: { description: TIME_INVALID / TIME_RANGE_INVALID / LEAD_INVALID }
 *       403: { description: NOT_MARKET_OWNER }
 */
router.post('/schedule', authenticateToken, requireHostAccount, scheduleCheckin);

/**
 * @swagger
 * /checkin/sessions:
 *   get:
 *     summary: 체크인 현황 (주최자)
 *     description: |
 *       세션 상태, 출석 명단(승인·결제 완료 신청), 요약 수치, 날짜별 탭 정보를 돌려줍니다.
 *       주최자 스캐너 화면이 몇 초 간격으로 폴링합니다. eventDate 생략 시 오늘.
 *       isPast=true 면 그날 미출석은 이미 노쇼로 확정된 상태입니다.
 *     tags: [Checkin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: marketId, required: true, schema: { type: integer } }
 *       - { in: query, name: eventDate, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: 조회 성공 }
 *       403: { description: NOT_MARKET_OWNER }
 */
router.get('/sessions', authenticateToken, requireHostAccount, getCheckinSession);

/**
 * @swagger
 * /checkin/sessions/{sessionId}/close:
 *   patch:
 *     summary: 체크인 종료 (주최자)
 *     description: 응답의 absentees 에 아직 안 온 판매자 목록이 담깁니다. 날짜가 지나면 노쇼로 확정됩니다.
 *     tags: [Checkin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: sessionId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: 종료됨 }
 */
router.patch('/sessions/:sessionId/close', authenticateToken, requireHostAccount, closeCheckinSession);

/**
 * @swagger
 * /checkin/pass:
 *   get:
 *     summary: 입장 QR 발급 (판매자)
 *     description: |
 *       판매자 폰의 「입장 QR」 화면이 45초마다 호출합니다.
 *       QR 토큰(90초 만료)과 6자리 숫자 코드(주최자 카메라를 못 쓸 때의 대체 수단)를 함께 돌려줍니다.
 *       주최자가 아직 체크인을 시작하지 않았으면 sessionOpen=false, token=null 로 응답합니다.
 *     tags: [Checkin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: marketId, required: true, schema: { type: integer } }
 *       - { in: query, name: eventDate, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: 발급됨 또는 아직 대기 }
 *       403: { description: NOT_APPROVED / NOT_ELIGIBLE }
 *       404: { description: NO_APPLICATION }
 */
router.get('/pass', authenticateToken, getSellerPass);

/**
 * @swagger
 * /checkin/scan:
 *   post:
 *     summary: QR 스캔 / 코드 입력 처리 (주최자)
 *     description: |
 *       카메라로 찍었으면 token 을, 6자리 코드를 받아 적었으면 sessionId + code 를 보냅니다.
 *       어느 쪽이든 그 판매자가 이 마켓에 잡아둔 승인·결제 부스가 전부 함께 출석 처리됩니다.
 *     tags: [Checkin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:     { type: string, example: '12.7.1788000000.9f2a1c4b7d5e6a8b' }
 *               sessionId: { type: integer, example: 12 }
 *               code:      { type: string, example: '482913' }
 *     responses:
 *       200: { description: 체크인 완료 또는 이미 체크인됨 }
 *       400: { description: PASS_MALFORMED / PASS_INVALID / CODE_MALFORMED }
 *       403: { description: NOT_MARKET_OWNER }
 *       404: { description: CODE_NOT_MATCHED / NO_APPLICATION }
 *       409: { description: SESSION_CLOSED / CODE_AMBIGUOUS / MARKET_CANCELLED }
 *       410: { description: PASS_EXPIRED (판매자 화면의 새 QR 을 다시 촬영) }
 */
router.post('/scan', authenticateToken, requireHostAccount, scanCheckin);

/**
 * @swagger
 * /checkin/manual:
 *   post:
 *     summary: 명단에서 직접 출석 처리 (주최자)
 *     description: QR 도 코드도 못 쓰는 상황용. 기록은 method=manual 로 남습니다.
 *     tags: [Checkin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, applicationId]
 *             properties:
 *               sessionId:     { type: integer }
 *               applicationId: { type: integer }
 *     responses:
 *       200: { description: 처리됨 }
 *       409: { description: SESSION_CLOSED / NOT_ELIGIBLE }
 */
router.post('/manual', authenticateToken, requireHostAccount, manualCheckin);

/**
 * @swagger
 * /checkin/records/{checkinId}:
 *   delete:
 *     summary: 출석 취소 (주최자)
 *     description: 잘못 처리한 출석을 되돌립니다. 지난 날짜는 노쇼가 소급 변경되므로 취소할 수 없습니다.
 *     tags: [Checkin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: checkinId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: 취소됨 }
 *       409: { description: DATE_ALREADY_PASSED }
 */
router.delete('/records/:checkinId', authenticateToken, requireHostAccount, cancelCheckin);

/**
 * @swagger
 * /checkin/stats/me:
 *   get:
 *     summary: 내 출석·노쇼 현황 (판매자)
 *     description: |
 *       지나간 체크인 날짜만 셉니다. 노쇼 = 그날 체크인을 받지 못한 날의 수(사람 기준, 부스 수 아님).
 *       체크인 세션이 열리지 않은 날은 세지 않습니다.
 *     tags: [Checkin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 조회 성공 (byMarket 에 마켓별 내역 포함) }
 */
router.get('/stats/me', authenticateToken, getMyAttendanceStats);

/**
 * @swagger
 * /checkin/my:
 *   get:
 *     summary: 내 출석 이력 (판매자)
 *     tags: [Checkin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: marketId, schema: { type: integer } }
 *     responses:
 *       200: { description: 조회 성공 }
 */
router.get('/my', authenticateToken, getMyCheckins);

/**
 * @swagger
 * /checkin/stats/{userId}:
 *   get:
 *     summary: 특정 판매자의 출석·노쇼 현황 (공개)
 *     description: 프로필 화면에서 노쇼 횟수를 표시하는 데 씁니다. 마켓별 상세는 빼고 합계만 내려갑니다.
 *     tags: [Checkin]
 *     parameters:
 *       - { in: path, name: userId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: 조회 성공 }
 */
router.get('/stats/:userId', getUserAttendanceStats);

export default router;
