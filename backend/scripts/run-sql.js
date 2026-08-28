// backend/scripts/run-sql.js
// 사용법: node scripts/run-sql.js scripts/rebuild_flea_market_db.sql
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const target = process.argv[2];
if (!target) {
  console.error('실행할 .sql 파일 경로를 인자로 넘겨주세요.');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(target), 'utf8');

// database 를 지정하지 않습니다. 스크립트 안에 CREATE DATABASE / USE 가 들어 있습니다.
const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: Number(process.env.DB_PORT) || 3306,
  multipleStatements: true,   // 덤프처럼 여러 문장을 한 번에 실행하려면 필수
});

try {
  console.log(`▶ 실행: ${target}`);
  const results = await conn.query(sql);
  const last = Array.isArray(results[0]) ? results[0][results[0].length - 1] : null;
  if (Array.isArray(last)) {
    console.log('📊 생성된 테이블:');
    last.forEach((r) => console.log('  -', Object.values(r)[0]));
  }
  console.log('✅ 완료');
} catch (err) {
  console.error('❌ 실패:', err.sqlMessage || err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}