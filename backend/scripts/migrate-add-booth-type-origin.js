// backend/scripts/migrate-add-booth-type-origin.js
// [부스 등급] 등급별 원가(priceOrigin) + 직전가(pricePrev) 컬럼 추가
//
//   실행:  cd backend && node scripts/migrate-add-booth-type-origin.js
//
// 왜 두 개인가
//   마켓 전체 가격은 이미 markets.boothPrice_origin 으로 "최초 등록가" 를 남기고 있습니다.
//   등급별 가격도 같은 것이 필요하고, 여기에 더해 요청하신
//   "마지막 변경된 금액 대비 얼마가 바뀌었는지" 를 보여주려면
//   **직전 가격**도 있어야 합니다.
//     priceOrigin : 처음 등록했을 때의 금액 (한 번 정해지면 안 바뀜)
//     pricePrev   : 바로 이전 금액 (가격을 고칠 때마다 갱신)
//   둘을 다 남기면 "처음 대비" 와 "직전 대비" 를 모두 보여줄 수 있습니다.
//
// 안전 규칙: 추가만 합니다. DROP / DELETE 가 한 줄도 없고, 이미 있으면 건너뜁니다.

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
      WHERE table_schema = ? AND LOWER(table_name) = LOWER(?)`, [DB_NAME, name]);
  return Number(rows[0].c) > 0;
}

async function addColumnIfMissing(table, column, clause) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = ? AND LOWER(table_name) = LOWER(?) AND LOWER(column_name) = LOWER(?)`,
    [DB_NAME, table, column]);
  if (Number(rows[0].c) > 0) { console.log(`  ✔ ${table}.${column} — 이미 있음 (건너뜀)`); return false; }
  await conn.query(`ALTER TABLE \`${table}\` ${clause}`);
  console.log(`  + ${table}.${column} 추가`);
  return true;
}

try {
  console.log(`▶ 대상 DB: ${DB_NAME}`);

  if (!(await tableExists('market_booth_types'))) {
    console.error('❌ market_booth_types 테이블이 없습니다.');
    console.error('   rebuild_flea_market_db.sql 로 DB 를 구성했는지 확인해 주세요.');
    process.exitCode = 1;
  } else {
    const added = await addColumnIfMissing('market_booth_types', 'priceOrigin',
      "ADD COLUMN priceOrigin INT DEFAULT NULL COMMENT '이 등급을 처음 등록했을 때의 금액. 한 번 정해지면 바뀌지 않습니다'");
    await addColumnIfMissing('market_booth_types', 'pricePrev',
      "ADD COLUMN pricePrev INT DEFAULT NULL COMMENT '바로 직전 금액. 가격을 고칠 때마다 갱신됩니다'");

    if (added) {
      // 이미 있던 등급들은 원가 기록이 없습니다. 지금 금액을 원가로 채웁니다.
      //   비워두면 화면이 "변동 없음" 과 "기록 없음" 을 구분하지 못합니다.
      const [r] = await conn.query(
        'UPDATE market_booth_types SET priceOrigin = price WHERE priceOrigin IS NULL');
      console.log(`  · 기존 등급 ${r.affectedRows}건의 원가를 현재 금액으로 채움`);
    }
    console.log('✅ 완료 — 서버를 재시작해 주세요.');
  }
} catch (err) {
  console.error('❌ 실패:', err.sqlMessage || err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
