// backend/scripts/migrate-add-notification-role.js
// [알림 설정] 역할별 분리 — notification_settings 에 role 컬럼 추가
//
//   실행:  cd backend && node scripts/migrate-add-notification-role.js
//
// 왜 필요한가
//   지금은 (userId, category) 하나로 관리해서, 「부스 신청」 묶음을 끄면
//   주최자용(신청 들어옴)과 판매자용(승인·반려)이 **같이 꺼집니다.**
//   이 사이트는 주최자도 판매자로 전환해 부스를 신청할 수 있어서,
//   같은 사람이 두 역할의 알림을 따로 조절할 수 있어야 합니다.
//
//   그래서 키를 (userId, role, category) 로 바꿉니다.
//
// 기존 설정은 어떻게 되나
//   지우지 않고 **양쪽 역할로 복사**합니다.
//   지금까지 "댓글 알림 끔" 으로 두었던 사람이 갑자기 알림을 받기 시작하면
//   설정을 무시당한 것으로 느낍니다.
//
// 안전 규칙: 기존 행을 지우지 않습니다. 재실행해도 안전합니다.

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
  charset: 'utf8mb4',
});

async function hasColumn(table, column) {
  const [r] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = ? AND LOWER(table_name) = LOWER(?) AND LOWER(column_name) = LOWER(?)`,
    [DB_NAME, table, column]);
  return Number(r[0].c) > 0;
}

async function hasIndex(table, index) {
  const [r] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.statistics
      WHERE table_schema = ? AND LOWER(table_name) = LOWER(?) AND LOWER(index_name) = LOWER(?)`,
    [DB_NAME, table, index]);
  return Number(r[0].c) > 0;
}

try {
  console.log(`▶ 대상 DB: ${DB_NAME}`);

  if (await hasColumn('notification_settings', 'role')) {
    console.log('  ✔ notification_settings.role — 이미 있음 (건너뜀)');
  } else {
    // 1) 컬럼 추가. 기존 행은 일단 'seller' 로 둡니다.
    await conn.query(
      `ALTER TABLE notification_settings
         ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'seller'
         COMMENT '이 설정이 적용되는 역할 (host = 주최자 알림, seller = 판매자 알림)'`);
    console.log('  + notification_settings.role 추가');

    // 2) 기존 UNIQUE(userId, category) 를 (userId, role, category) 로 교체.
    //    먼저 새 키를 만들고 옛 키를 지웁니다. 순서를 바꾸면 중복 행이 잠깐 허용됩니다.
    if (!(await hasIndex('notification_settings', 'uk_user_role_category'))) {
      await conn.query(
        'ALTER TABLE notification_settings ADD UNIQUE KEY uk_user_role_category (userId, role, category)');
      console.log('  + UNIQUE (userId, role, category) 추가');
    }
    if (await hasIndex('notification_settings', 'uk_user_category')) {
      await conn.query('ALTER TABLE notification_settings DROP INDEX uk_user_category');
      console.log('  - 옛 UNIQUE (userId, category) 제거');
    }

    // 3) 기존 설정을 host 쪽으로도 복사합니다.
    //    지금까지의 선택을 양쪽 역할에 그대로 이어받게 합니다.
    const [copied] = await conn.query(
      `INSERT IGNORE INTO notification_settings (userId, role, category, enabled, leadHours, notifyHour)
       SELECT userId, 'host', category, enabled, leadHours, notifyHour
         FROM notification_settings WHERE role = 'seller'`);
    console.log(`  · 기존 설정 ${copied.affectedRows}건을 주최자 쪽으로 복사`);
  }

  console.log('✅ 완료 — 서버를 재시작해 주세요.');
} catch (err) {
  console.error('❌ 실패:', err.sqlMessage || err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
