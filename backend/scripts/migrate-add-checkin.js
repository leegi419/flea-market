// backend/scripts/migrate-add-checkin.js
// [현장 QR 체크인] 테이블 2개를 만듭니다.
//
//   실행:  cd backend && node scripts/migrate-add-checkin.js
//
// 안전 규칙
//   - 이 스크립트는 "만들기"만 합니다. DROP / DELETE / TRUNCATE 는 한 줄도 없습니다.
//   - 이미 있으면 건너뜁니다. 몇 번을 다시 실행해도 데이터가 바뀌지 않습니다.
//   - CHARSET / COLLATE 를 지정하지 않고 DB 기본값을 따릅니다.
//     (예전에 utf8mb4_0900_ai_ci 를 못 박아 두는 바람에 MySQL 8 이 아닌 환경에서
//      "Unknown collation" 으로 마이그레이션이 통째로 실패한 적이 있습니다)

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
  // charset 을 지정하지 않으면 접속 기본 문자셋으로 SQL 이 전송되어
  // CREATE TABLE 안의 한글 COMMENT 가 전부 '?' 로 깨져 저장됩니다.
  // 테이블 구조는 멀쩡해 보여서 눈치채기 어렵고, DESC 로 봐야 드러납니다.
  charset: 'utf8mb4',
});

async function tableExists(name) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
      WHERE table_schema = ? AND LOWER(table_name) = LOWER(?)`,
    [DB_NAME, name]
  );
  return Number(rows[0].c) > 0;
}

/** users.userId 의 실제 타입을 그대로 따라갑니다. (FK 는 타입이 다르면 붙지 않습니다) */
async function userIdType() {
  const [rows] = await conn.query(
    `SELECT COLUMN_TYPE AS t FROM information_schema.columns
      WHERE table_schema = ? AND LOWER(table_name) = 'users' AND LOWER(column_name) = 'userid'`,
    [DB_NAME]
  );
  return rows[0]?.t || 'bigint unsigned';
}

/** 컬럼이 없을 때만 추가합니다. (있으면 건너뛰므로 몇 번을 실행해도 안전) */
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

  const uid = await userIdType();
  console.log(`  users.userId 타입: ${uid}`);

  // ── 1) 체크인 세션 (마켓 × 날짜 하나당 1행) ────────────────────────
  if (await tableExists('market_checkin_sessions')) {
    console.log('  ✔ market_checkin_sessions — 이미 있음 (건너뜀)');
  } else {
    await conn.query(`
      CREATE TABLE market_checkin_sessions (
        sessionId INT NOT NULL AUTO_INCREMENT,
        marketId  INT NOT NULL,
        eventDate DATE NOT NULL COMMENT '이 세션이 담당하는 개최일 하루',
        status    VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT 'scheduled(시간대에 맡김) | open(주최자가 직접 염) | closed(직접 닫음)',
        secret    CHAR(64) NOT NULL COMMENT 'QR 서명 키. 다시 열 때마다 교체되어 캡처된 옛 QR 을 무효화. 외부 노출 금지',
        openedBy  ${uid} NOT NULL COMMENT '체크인을 시작한 주최자 userId',
        openedAt  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closedAt  DATETIME DEFAULT NULL,
        PRIMARY KEY (sessionId),
        UNIQUE KEY uk_checkin_session_day (marketId, eventDate),
        CONSTRAINT fk_checkin_session_market
          FOREIGN KEY (marketId) REFERENCES markets (marketId) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('  + market_checkin_sessions 생성');
  }

  // ── 2) 출석 기록 (세션 × 신청 하나당 1행) ──────────────────────────
  if (await tableExists('market_checkins')) {
    console.log('  ✔ market_checkins — 이미 있음 (건너뜀)');
  } else {
    await conn.query(`
      CREATE TABLE market_checkins (
        checkinId     INT NOT NULL AUTO_INCREMENT,
        sessionId     INT NOT NULL,
        marketId      INT NOT NULL,
        applicationId INT NOT NULL,
        sellerId      ${uid} NOT NULL,
        method        VARCHAR(10) NOT NULL DEFAULT 'qr' COMMENT 'qr(스캔) | code(6자리 숫자) | manual(명단에서 직접)',
        checkedBy     ${uid} DEFAULT NULL COMMENT '처리한 주최자 userId',
        checkedInAt   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (checkinId),
        UNIQUE KEY uk_checkin_once (sessionId, applicationId)
          COMMENT '같은 날 같은 부스를 두 번 찍어도 1건만 남습니다',
        KEY idx_checkin_market_seller (marketId, sellerId),
        CONSTRAINT fk_checkin_session
          FOREIGN KEY (sessionId) REFERENCES market_checkin_sessions (sessionId) ON DELETE CASCADE,
        CONSTRAINT fk_checkin_application
          FOREIGN KEY (applicationId) REFERENCES applications (applicationId) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('  + market_checkins 생성');
  }

  // ── 3) 체크인 시간대 (개최일마다 "언제부터 언제까지 QR 을 받을지") ──
  //   나중에 추가한 컬럼이라, 이미 테이블이 있는 DB 에서도 따로 붙여 줍니다.
  await addColumnIfMissing('market_checkin_sessions', 'opensAt',
    "ADD COLUMN opensAt DATETIME NULL COMMENT '이 날 체크인 시작 시각. QR 은 이보다 leadMinutes 만큼 먼저 나옵니다'");
  await addColumnIfMissing('market_checkin_sessions', 'closesAt',
    "ADD COLUMN closesAt DATETIME NULL COMMENT '이 날 체크인 종료 시각. 지나면 QR 이 자동으로 멈춥니다'");
  await addColumnIfMissing('market_checkin_sessions', 'leadMinutes',
    "ADD COLUMN leadMinutes INT NOT NULL DEFAULT 60 COMMENT 'opensAt 기준 몇 분 전부터 QR 을 띄울지 (기본 60분)'");

  console.log('✅ 완료 — 서버를 재시작해 주세요.');
} catch (err) {
  console.error('❌ 실패:', err.sqlMessage || err.message);
  console.error('   markets / applications / users 테이블이 먼저 있어야 합니다.');
  process.exitCode = 1;
} finally {
  await conn.end();
}
