// backend/routes/notificationRoutes.js
// [추가] 알림(종 버튼) 라우트
import express from 'express';
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/notificationController.js';
import { getNotificationSettings, updateNotificationSettings } from '../controllers/notificationSettingsController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: 알림(종 버튼)
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: 내 알림 목록 조회 (최신순, 최대 50건)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 */
router.get('/', authenticateToken, getNotifications);

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: 안읽은 알림 개수 조회
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 */
router.get('/unread-count', authenticateToken, getUnreadCount);

/**
 * @swagger
 * /notifications/settings:
 *   get:
 *     summary: 내 알림 설정 조회
 *     description: 묶음별 on/off, 관심 지역, 마감 사전 알림 시간(1~24)을 함께 돌려줍니다.
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 조회 성공 }
 *   put:
 *     summary: 내 알림 설정 저장
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               categories: { type: object, example: { comment: false, new_market: true } }
 *               regions: { type: array, items: { type: string }, example: ['경기','서울'] }
 *               leadHours: { type: integer, minimum: 1, maximum: 24, example: 3 }
 *     responses:
 *       200: { description: 저장됨 }
 */
// 주의: '/:notificationId/read' 보다 먼저 등록해야 settings 가 id 로 해석되지 않습니다.
router.get('/settings', authenticateToken, getNotificationSettings);
router.put('/settings', authenticateToken, updateNotificationSettings);

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     summary: 모든 알림 읽음 처리
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 처리 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 */
router.patch('/read-all', authenticateToken, markAllNotificationsRead);

/**
 * @swagger
 * /notifications/{notificationId}/read:
 *   patch:
 *     summary: 알림 1건 읽음 처리 (본인 알림만)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 처리 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 *       403:
 *         description: 본인의 알림이 아님
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 존재하지 않는 알림
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/:notificationId/read', authenticateToken, markNotificationRead);

export default router;
