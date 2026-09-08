// backend/scripts/migrate-add-address-detail.js
// [주소] markets 에 도로명주소·상세주소·우편번호를 따로 저장할 컬럼 추가
//
//   실행:  cd backend && node scripts/migrate-add-address-detail.js
//
// 왜 필요한가
//   지금은 주소가 locationName 한 칸에 "도로명 + 상세" 가 합쳐진 채로만 저장됩니다.
//   그래서 마켓 수정 화면을 열면 상세주소 칸을 채울 방법이 없습니다.
//   (합쳐진 문자열을 도로 나누려 해봤지만, "가가로 15 1000 100 1500" 처럼
//    상세주소가 숫자로 끝나면 어디까지가 도로명인지 알 수 없습니다.
//    잘못 자르면 주소가 망가지므로 추측하지 않고 따로 저장합니다.)
//
//   locationName 은 그대로 둡니다. 목록·검색·기존 화면이 계속 쓰는 값입니다.
//   새 컬럼은 "수정 화면에서 각 칸을 복원하기 위한" 용도입니다.
//
// 안전 규칙: 추가만 합니다. 기존 데이터를 지우거나 바꾸지 않습니다.

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

async function addColumnIfMissing(column, clause) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = ? AND LOWER(table_name) = 'markets' AND LOWER(column_name) = LOWER(?)`,
    [DB_NAME, column]
  );
  if (Number(rows[0].c) > 0) {
    console.log(`  ✔ markets.${column} — 이미 있음 (건너뜀)`);
    return false;
  }
  await conn.query(`ALTER TABLE markets ${clause}`);
  console.log(`  + markets.${column} 추가`);
  return true;
}

try {
  console.log(`▶ 대상 DB: ${DB_NAME}`);

  const added = await addColumnIfMissing('addressBase',
    "ADD COLUMN addressBase varchar(255) DEFAULT NULL COMMENT '우편번호 검색으로 받은 도로명(지번) 주소'");
  await addColumnIfMissing('addressDetail',
    "ADD COLUMN addressDetail varchar(255) DEFAULT NULL COMMENT '주최자가 직접 입력한 상세주소 (동/호수 등)'");
  await addColumnIfMissing('postcode',
    "ADD COLUMN postcode varchar(10) DEFAULT NULL COMMENT '우편번호'");

  if (added) {
    // 기존 마켓은 나눠 담을 근거가 없습니다. 전체를 도로명 자리에 넣고 상세는 비웁니다.
    //   추측해서 자르면 주소가 망가집니다. 주최자가 수정 화면에서 직접 정리하면
    //   그때부터 제대로 나뉘어 저장됩니다.
    const [r] = await conn.query(
      'UPDATE markets SET addressBase = locationName WHERE addressBase IS NULL');
    console.log(`  · 기존 마켓 ${r.affectedRows}건의 주소를 도로명 칸으로 옮김 (상세는 비움)`);
  }

  console.log('✅ 완료 — 서버를 재시작해 주세요.');
} catch (err) {
  console.error('❌ 실패:', err.sqlMessage || err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
