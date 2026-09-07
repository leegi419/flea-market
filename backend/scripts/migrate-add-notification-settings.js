// backend/scripts/migrate-add-notification-settings.js
// [알림 설정] 사용자별 알림 on/off · 지역 · 사전 알림 시간 + 중복 발송 방지 기록
//
//   실행:  cd backend && node scripts/migrate-add-notification-settings.js
//
// 안전 규칙: 추가만 합니다. DROP / DELETE / TRUNCATE 가 한 줄도 없습니다.
//            이미 있으면 건너뛰므로 몇 번을 실행해도 안전합니다.

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const DB_NAME = process.env.DB_NAME || 'flea_market_db';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  charset: 'utf8mb4',   // 없으면 한글 COMMENT 가 '?' 로 깨집니다
});

async function tableExists(name) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
      WHERE table_schema = ? AND LOWER(table_name) = LOWER(?)`,
    [DB_NAME, name]
  );
  return Number(rows[0].c) > 0;
}

async function userIdType() {
  const [rows] = await conn.query(
    `SELECT COLUMN_TYPE AS t FROM information_schema.columns
      WHERE table_schema = ? AND LOWER(table_name) = 'users' AND LOWER(column_name) = 'userid'`,
    [DB_NAME]
  );
  return rows[0]?.t || 'bigint unsigned';
}

try {
  console.log(`▶ 대상 DB: ${DB_NAME}`);
  const uid = await userIdType();

  // ── 1) 알림 종류별 on/off + 사전 알림 시간 ────────────────────
  //   users 에 컬럼을 붙이지 않은 이유: 알림 종류가 늘 때마다 users 가 부풀고,
  //   나중에 종류를 없앨 때 컬럼을 지워야 해서 위험합니다.
  //   한 행 = 한 사용자의 한 설정. 없으면 기본값(켜짐)으로 봅니다.
  if (await tableExists('notification_settings')) {
    console.log('  ✔ notification_settings — 이미 있음 (건너뜀)');
  } else {
    await conn.query(`
      CREATE TABLE notification_settings (
        settingId INT NOT NULL AUTO_INCREMENT,
        userId ${uid} NOT NULL,
        category VARCHAR(40) NOT NULL COMMENT '알림 묶음 (application/payment/comment/market_change/new_market/deadline)',
        enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0이면 이 묶음의 알림을 받지 않음',
        PRIMARY KEY (settingId),
        UNIQUE KEY uk_user_category (userId, category),
        CONSTRAINT fk_notif_setting_user
          FOREIGN KEY (userId) REFERENCES users (userId) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('  + notification_settings 생성');
  }

  // ── 2) 신규 마켓 알림을 받을 지역 ─────────────────────────────
  //   여러 지역을 고를 수 있어야 하므로 한 컬럼에 담지 않고 행으로 나눕니다.
  //   행이 하나도 없으면 "모든 지역" 으로 봅니다.
  if (await tableExists('notification_regions')) {
    console.log('  ✔ notification_regions — 이미 있음 (건너뜀)');
  } else {
    await conn.query(`
      CREATE TABLE notification_regions (
        regionId INT NOT NULL AUTO_INCREMENT,
        userId ${uid} NOT NULL,
        region VARCHAR(50) NOT NULL COMMENT '알림 받을 지역명. 행이 없으면 모든 지역',
        PRIMARY KEY (regionId),
        UNIQUE KEY uk_user_region (userId, region),
        CONSTRAINT fk_notif_region_user
          FOREIGN KEY (userId) REFERENCES users (userId) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('  + notification_regions 생성');
  }

  // ── 3) 예약 알림 중복 발송 방지 ───────────────────────────────
  //   스케줄러가 5분마다 도는데, 보낸 기록이 없으면 같은 알림을 계속 보냅니다.
  //   "무엇에 대해 어떤 알림을 보냈는가" 를 남겨 두 번 가지 않게 합니다.
  //   시각이 아니라 이 기록으로 판정하므로, 서버가 꺼져 있던 동안 놓친 건도
  //   다음 검사에서 한 번은 나갑니다.
  if (await tableExists('notification_sent_log')) {
    console.log('  ✔ notification_sent_log — 이미 있음 (건너뜀)');
  } else {
    await conn.query(`
      CREATE TABLE notification_sent_log (
        logId INT NOT NULL AUTO_INCREMENT,
        userId ${uid} NOT NULL,
        kind VARCHAR(40) NOT NULL COMMENT '예약 알림 종류 (recruit_closing / payment_due)',
        targetType VARCHAR(20) NOT NULL COMMENT 'market | application',
        targetId INT NOT NULL,
        sentAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (logId),
        UNIQUE KEY uk_sent_once (userId, kind, targetType, targetId)
          COMMENT '같은 대상에 같은 알림은 한 번만',
        KEY idx_sent_at (sentAt)
      ) ENGINE=InnoDB
    `);
    console.log('  + notification_sent_log 생성');
  }

  // ── 4) 결제 마감 사전 알림 시간 (1~24시간) ────────────────────
  const [col] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = ? AND LOWER(table_name) = 'notification_settings'
        AND LOWER(column_name) = 'leadhours'`,
    [DB_NAME]
  );
  if (Number(col[0].c) > 0) {
    console.log('  ✔ notification_settings.leadHours — 이미 있음 (건너뜀)');
  } else {
    await conn.query(
      `ALTER TABLE notification_settings
         ADD COLUMN leadHours INT NOT NULL DEFAULT 1
         COMMENT '마감 몇 시간 전에 알릴지 (1~24). deadline 묶음에서만 사용'`
    );
    console.log('  + notification_settings.leadHours 추가');
  }

  // ── 5) 미참여 통지를 받을 시각 (0~23시) ──────────────────────
  //   기분 좋은 알림이 아니라 한밤중에 받으면 더 나쁩니다.
  //   판정은 자정에 끝나지만 통지는 사용자가 정한 시각에 나갑니다.
  const [col2] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = ? AND LOWER(table_name) = 'notification_settings'
        AND LOWER(column_name) = 'notifyhour'`,
    [DB_NAME]
  );
  if (Number(col2[0].c) > 0) {
    console.log('  ✔ notification_settings.notifyHour — 이미 있음 (건너뜀)');
  } else {
    await conn.query(
      `ALTER TABLE notification_settings
         ADD COLUMN notifyHour INT NOT NULL DEFAULT 10
         COMMENT '이 시각(0~23)에 통지. attendance 묶음에서만 사용'`
    );
    console.log('  + notification_settings.notifyHour 추가');
  }

  console.log('✅ 완료 — 서버를 재시작해 주세요.');
} catch (err) {
  console.error('❌ 실패:', err.sqlMessage || err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
