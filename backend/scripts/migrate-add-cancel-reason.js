// backend/scripts/migrate-add-cancel-reason.js
// [마켓 취소 사유] markets 에 사유 컬럼 3개를 추가합니다.
//
//   실행:  cd backend && node scripts/migrate-add-cancel-reason.js
//
// 안전 규칙
//   - 추가만 합니다. DROP / DELETE / TRUNCATE 가 한 줄도 없습니다.
//   - 이미 있으면 건너뜁니다. 몇 번을 다시 실행해도 데이터가 바뀌지 않습니다.
//   - charset 을 명시하지 않으면 한글 COMMENT 가 '?' 로 깨져 저장됩니다.

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

async function addColumnIfMissing(table, column, alterClause) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = ? AND LOWER(table_name) = LOWER(?) AND LOWER(column_name) = LOWER(?)`,
    [DB_NAME, table, column]
  );
  if (Number(rows[0].c) > 0) {
    console.log(`  ✔ ${table}.${column} — 이미 있음 (건너뜀)`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ${alterClause}`);
  console.log(`  + ${table}.${column} 추가`);
}

try {
  console.log(`▶ 대상 DB: ${DB_NAME}`);

  // 사유를 코드와 문구로 나눠 저장합니다.
  //   코드만 두면 나중에 목록 문구를 바꿨을 때 과거 기록의 의미까지 같이 바뀝니다.
  //   문구만 두면 "기상 악화가 몇 건인지" 같은 집계를 할 수 없습니다.
  await addColumnIfMissing('markets', 'cancelReasonCode',
    "ADD COLUMN cancelReasonCode VARCHAR(30) DEFAULT NULL COMMENT '취소 사유 코드 (weather/venue/low_signup/host_issue/safety/other)'");
  await addColumnIfMissing('markets', 'cancelReason',
    "ADD COLUMN cancelReason VARCHAR(300) DEFAULT NULL COMMENT '취소 사유 문구. 목록에서 고른 문구 또는 기타 직접 입력'");
  await addColumnIfMissing('markets', 'cancelledAt',
    "ADD COLUMN cancelledAt DATETIME DEFAULT NULL COMMENT '취소한 시각. 사유와 함께 기록으로 남습니다'");

  console.log('✅ 완료 — 서버를 재시작해 주세요.');
} catch (err) {
  console.error('❌ 실패:', err.sqlMessage || err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
