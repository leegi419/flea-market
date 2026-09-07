// backend/scripts/verify-checkin.js
// [현장 QR 체크인] 실제 서버 + 실제 DB 로 전 구간을 두드려 보는 통합 점검.
//
//   실행:  cd backend
//          node server.js                      (다른 터미널에서 먼저 띄워 두세요)
//          node scripts/verify-checkin.js
//
// 왜 "가짜 DB 스텁" 방식이 아닌가
//   이 프로젝트에서 함수만 스텁으로 갈아끼운 검증 스크립트를 여러 개 만들었는데,
//   실제 SQL 이 한 번도 실행되지 않아 컬럼 대소문자 같은 진짜 버그를 전부 놓쳤습니다.
//   그래서 이 스크립트는 진짜 HTTP + 진짜 DB 로만 돕니다.
//
// 만든 데이터는 끝에서 전부 지웁니다.
// (출력을 head 로 자르면 SIGPIPE 로 정리가 안 될 수 있으니 그대로 보세요)

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const BASE = process.env.VERIFY_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}/api`;
const STAMP = String(Date.now()).slice(-7);
const PASSWORD = 'Checkin@2345';

let pass = 0;
let fail = 0;

function check(label, cond, detail) {
  if (cond) { pass += 1; console.log(`  ✅ ${label}`); }
  else { fail += 1; console.log(`  ❌ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* 본문 없음 */ }
  return { status: res.status, json: json || {} };
}

let nickSeq = 0;
async function register(userType, tag) {
  const email = `chk${tag}${STAMP}@test.local`;
  // 닉네임 규칙: 한글/영문/숫자 2~12자 (특수문자 불가)
  const nickname = `chk${tag}${STAMP}${nickSeq++}`.slice(0, 12);
  const r = await api('/auth/register', {
    method: 'POST',
    body: {
      userType, email, password: PASSWORD, nickname,
      phone: `010-${STAMP.slice(0, 4)}-${String(1000 + nickSeq)}`,
      region: '경기',
    },
  });
  if (r.status !== 200 && r.status !== 201) throw new Error(`회원가입 실패(${tag}): ${JSON.stringify(r.json)}`);

  const login = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  const token = login.json?.data?.token;
  if (!token) throw new Error(`로그인 실패(${tag}): ${JSON.stringify(login.json)}`);
  return { email, token, userId: login.json.data.user?.userId };
}

function dateStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'flea_market_db',
  port: Number(process.env.DB_PORT) || 3306,
});

const created = { marketIds: [], userIds: [] };

try {
  try { await fetch(`${BASE}/markets`); }
  catch {
    console.error(`❌ 서버에 연결할 수 없습니다: ${BASE}`);
    console.error('   먼저 다른 터미널에서 `node server.js` 로 백엔드를 띄워 주세요.');
    process.exit(1);
  }

  console.log('\n── 준비 ─────────────────────────────────────────────────');
  const host = await register(1, 'h');
  const seller = await register(0, 's');
  const other = await register(0, 'o');
  created.userIds.push(host.userId, seller.userId, other.userId);

  const today = dateStr(0);
  const tomorrow = dateStr(1);
  const yesterday = dateStr(-1);

  const [mi] = await conn.query(
    `INSERT INTO markets (hostId, title, description, locationName, region, boothPrice,
                          latitude, longitude, isExpired, maxParticipants,
                          eventDate_min, eventDate_max, recruitmentDate_min, recruitmentDate_max)
     VALUES (?, ?, '검증용', '부천시청 광장', '경기', 10000, 37.5, 127.0, 0, 20, ?, ?, ?, ?)`,
    [host.userId, `[체크인검증]${STAMP}`, yesterday, tomorrow, dateStr(-9), yesterday]
  );
  const marketId = mi.insertId;
  created.marketIds.push(marketId);

  const [a1] = await conn.query(
    `INSERT INTO applications (marketId, sellerId, boothNumber, itemName, status) VALUES (?,?,'A-1','수제 비누','Approved')`,
    [marketId, seller.userId]);
  const [a2] = await conn.query(
    `INSERT INTO applications (marketId, sellerId, boothNumber, itemName, status) VALUES (?,?,'A-2','핸드크림','Paid')`,
    [marketId, seller.userId]);
  await conn.query(
    `INSERT INTO applications (marketId, sellerId, boothNumber, itemName, status) VALUES (?,?,'B-9','대기중','Pending')`,
    [marketId, other.userId]);
  console.log(`  마켓 ${marketId} (개최 ${yesterday}~${tomorrow}) / 판매자 승인 부스 ${a1.insertId}, ${a2.insertId}`);

  /* ───────────────────────────────────────────── */
  console.log('\n── 1. 권한 ──────────────────────────────────────────────');
  let r = await api('/checkin/sessions', { method: 'POST', body: { marketId, eventDate: today }, token: seller.token });
  check('판매자는 체크인을 시작할 수 없다 (403)', r.status === 403, r.json);

  r = await api('/checkin/sessions', { method: 'POST', body: { marketId, eventDate: today } });
  check('비로그인은 401', r.status === 401, r.json);

  /* ───────────────────────────────────────────── */
  console.log('\n── 2. 날짜 검증 ─────────────────────────────────────────');
  r = await api('/checkin/sessions', { method: 'POST', body: { marketId, eventDate: dateStr(30) }, token: host.token });
  check('개최 기간 밖 날짜 거부 (DATE_OUT_OF_RANGE)', r.status === 400 && r.json.code === 'DATE_OUT_OF_RANGE', r.json);

  r = await api('/checkin/sessions', { method: 'POST', body: { marketId, eventDate: yesterday }, token: host.token });
  check('지난 날짜는 열 수 없다 (DATE_ALREADY_PASSED)', r.status === 400 && r.json.code === 'DATE_ALREADY_PASSED', r.json);

  r = await api('/checkin/sessions', { method: 'POST', body: { marketId, eventDate: '2026/09/05' }, token: host.token });
  check('날짜 형식이 틀리면 거부', r.status === 400, r.json);

  /* ───────────────────────────────────────────── */
  console.log('\n── 3. 시작 전에는 판매자 QR 이 안 나온다 ────────────────');
  r = await api(`/checkin/pass?marketId=${marketId}`, { token: seller.token });
  check('주최자가 열기 전에는 sessionOpen=false', r.status === 200 && r.json.data?.sessionOpen === false, r.json.data);
  check('토큰도 코드도 내려가지 않는다', !r.json.data?.token && !r.json.data?.code, r.json.data);
  check('내 부스 목록은 보여준다 (승인 2칸)', r.json.data?.booths?.length === 2, r.json.data?.booths);

  /* ───────────────────────────────────────────── */
  console.log('\n── 4. 체크인 시작 ───────────────────────────────────────');
  r = await api('/checkin/sessions', { method: 'POST', body: { marketId, eventDate: today }, token: host.token });
  check('주최자가 오늘 세션을 연다', r.status === 200 && r.json.data?.session?.status === 'open', r.json);
  check('날짜가 하루 밀리지 않는다 (타임존)', r.json.data?.session?.eventDate === today, r.json.data?.session);
  check('secret 은 응답에 없다', !JSON.stringify(r.json).includes('secret'), Object.keys(r.json.data?.session || {}));
  const sessionId = r.json.data.session.sessionId;

  /* ───────────────────────────────────────────── */
  console.log('\n── 5. 판매자 입장 QR 발급 ───────────────────────────────');
  r = await api(`/checkin/pass?marketId=${marketId}`, { token: seller.token });
  check('판매자에게 QR 토큰이 발급된다', r.status === 200 && typeof r.json.data?.token === 'string', r.json.data?.token);
  check('토큰 형식은 4토막', String(r.json.data?.token || '').split('.').length === 4, r.json.data?.token);
  check('QR 이 짧다 (스캔 잘 되게 60자 미만)', String(r.json.data?.token || '').length < 60, r.json.data?.token?.length);
  check('6자리 숫자 코드가 함께 온다', /^\d{6}$/.test(String(r.json.data?.code)), r.json.data?.code);
  check('아직 체크인 전', r.json.data?.alreadyCheckedIn === false, r.json.data?.alreadyCheckedIn);
  const sellerToken = r.json.data.token;
  const sellerCode = r.json.data.code;

  r = await api(`/checkin/pass?marketId=${marketId}`, { token: other.token });
  check('승인 대기(Pending) 판매자는 QR 을 못 받는다', r.status === 403 && r.json.code === 'NOT_APPROVED', r.json);

  r = await api(`/checkin/pass?marketId=${marketId}`, { token: host.token });
  check('신청이 없는 사람은 QR 을 못 받는다', r.status === 404 && r.json.code === 'NO_APPLICATION', r.json);

  /* ───────────────────────────────────────────── */
  console.log('\n── 6. 판매자는 혼자 출석할 수 없다 (핵심) ───────────────');
  r = await api('/checkin/scan', { method: 'POST', body: { token: sellerToken }, token: seller.token });
  check('판매자가 자기 QR 을 직접 제출해도 403', r.status === 403, r.json);

  r = await api('/checkin/scan', { method: 'POST', body: { token: sellerToken }, token: other.token });
  check('다른 판매자가 대신 제출해도 403', r.status === 403, r.json);

  const [zero] = await conn.query('SELECT COUNT(*) c FROM market_checkins WHERE sessionId = ?', [sessionId]);
  check('출석 기록이 하나도 생기지 않았다', Number(zero[0].c) === 0, zero[0]);

  /* ───────────────────────────────────────────── */
  console.log('\n── 7. 주최자 스캔 ───────────────────────────────────────');
  r = await api('/checkin/scan', { method: 'POST', body: { token: sellerToken }, token: host.token });
  check('주최자가 찍으면 부스 2칸이 한 번에 출석', r.status === 200 && r.json.data?.newlyChecked === 2, r.json);
  check('응답에 판매자 닉네임이 담긴다', !!r.json.data?.sellerNickname, r.json.data?.sellerNickname);

  r = await api('/checkin/scan', { method: 'POST', body: { token: sellerToken }, token: host.token });
  check('같은 사람을 두 번 찍어도 중복 기록 안 됨', r.status === 200 && r.json.data?.newlyChecked === 0 && r.json.data?.alreadyChecked === 2, r.json.data);

  const [dup] = await conn.query('SELECT COUNT(*) c FROM market_checkins WHERE sessionId = ?', [sessionId]);
  check('DB 에도 2행만 남는다', Number(dup[0].c) === 2, dup[0]);

  r = await api(`/checkin/pass?marketId=${marketId}`, { token: seller.token });
  check('판매자 화면이 「이미 체크인됨」을 안다', r.json.data?.alreadyCheckedIn === true, r.json.data);

  /* ───────────────────────────────────────────── */
  console.log('\n── 8. 위조 / 만료 QR ────────────────────────────────────');
  const [sid, sellerIdPart, exp, sig] = sellerToken.split('.');
  r = await api('/checkin/scan', { method: 'POST', body: { token: `${sid}.${sellerIdPart}.${exp}.ffffffffffffffff` }, token: host.token });
  check('서명을 바꾼 QR 거부 (PASS_INVALID)', r.status === 400 && r.json.code === 'PASS_INVALID', r.json);

  r = await api('/checkin/scan', { method: 'POST', body: { token: `${sid}.${Number(other.userId)}.${exp}.${sig}` }, token: host.token });
  check('sellerId 만 바꿔치기한 QR 거부', r.status === 400 && r.json.code === 'PASS_INVALID', r.json);

  r = await api('/checkin/scan', { method: 'POST', body: { token: 'https://example.com/hello' }, token: host.token });
  check('엉뚱한 QR 거부 (PASS_MALFORMED)', r.status === 400 && r.json.code === 'PASS_MALFORMED', r.json);

  const { issueSellerPass } = await import('../utills/checkinToken.js');
  const [secretRow] = await conn.query('SELECT secret FROM market_checkin_sessions WHERE sessionId = ?', [sessionId]);
  const expired = issueSellerPass({ sessionId, secret: secretRow[0].secret }, seller.userId, -10).token;
  r = await api('/checkin/scan', { method: 'POST', body: { token: expired }, token: host.token });
  check('만료된 QR 은 410 PASS_EXPIRED', r.status === 410 && r.json.code === 'PASS_EXPIRED', r.json);

  /* ───────────────────────────────────────────── */
  console.log('\n── 9. 숫자 코드 (카메라 대체) ───────────────────────────');
  await conn.query('DELETE FROM market_checkins WHERE sessionId = ?', [sessionId]); // 코드 경로만 따로 확인

  r = await api('/checkin/scan', { method: 'POST', body: { sessionId, code: sellerCode }, token: host.token });
  check('6자리 코드로도 출석 처리된다', r.status === 200 && r.json.data?.newlyChecked === 2, r.json);
  check("기록에 method='code' 로 남는다", r.json.data?.method === 'code', r.json.data?.method);

  r = await api('/checkin/scan', { method: 'POST', body: { sessionId, code: '000001' }, token: host.token });
  check('없는 코드는 거부 (CODE_NOT_MATCHED)', r.status === 404 && r.json.code === 'CODE_NOT_MATCHED', r.json);

  r = await api('/checkin/scan', { method: 'POST', body: { sessionId, code: '12' }, token: host.token });
  check('6자리가 아니면 거부', r.status === 400, r.json);

  /* ───────────────────────────────────────────── */
  console.log('\n── 10. 현황 / 명단 ──────────────────────────────────────');
  r = await api(`/checkin/sessions?marketId=${marketId}&eventDate=${today}`, { token: host.token });
  check('현황 조회 성공', r.status === 200, r.json);
  check('명단은 승인·결제 2칸만 (Pending 제외)', r.json.data?.roster?.length === 2, r.json.data?.roster?.map((x) => x.boothNumber));
  check('요약: 판매자 1명 중 1명 출석', r.json.data?.summary?.checkedInSellers === 1 && r.json.data?.summary?.absentSellers === 0, r.json.data?.summary);
  check('isToday=true, isPast=false', r.json.data?.isToday === true && r.json.data?.isPast === false, r.json.data);

  r = await api(`/checkin/sessions?marketId=${marketId}&eventDate=${today}`, { token: other.token });
  check('남의 마켓 현황은 403', r.status === 403, r.json);

  /* ───────────────────────────────────────────── */
  console.log('\n── 11. 수동 출석 / 출석 취소 ────────────────────────────');
  await conn.query('DELETE FROM market_checkins WHERE sessionId = ?', [sessionId]);

  r = await api('/checkin/manual', { method: 'POST', body: { sessionId, applicationId: a1.insertId }, token: host.token });
  check('명단에서 직접 출석 처리', r.status === 200, r.json);

  const [mRow] = await conn.query('SELECT method, checkedBy FROM market_checkins WHERE sessionId=? AND applicationId=?', [sessionId, a1.insertId]);
  check("method='manual' 로 남는다", mRow[0]?.method === 'manual', mRow[0]);
  check('처리한 주최자가 기록된다', Number(mRow[0]?.checkedBy) === Number(host.userId), mRow[0]);

  r = await api('/checkin/manual', { method: 'POST', body: { sessionId, applicationId: a1.insertId }, token: other.token });
  check('남이 수동 처리하면 403', r.status === 403, r.json);

  r = await api(`/checkin/sessions?marketId=${marketId}&eventDate=${today}`, { token: host.token });
  const entry = r.json.data.roster.find((x) => x.applicationId === a1.insertId);
  check('명단에 출석으로 반영', entry?.checkedIn === true, entry);

  r = await api(`/checkin/records/${entry.checkinId}`, { method: 'DELETE', token: host.token });
  check('출석 취소 성공', r.status === 200, r.json);

  /* ───────────────────────────────────────────── */
  console.log('\n── 12. 종료 / 재시작 ────────────────────────────────────');
  r = await api('/checkin/scan', { method: 'POST', body: { sessionId, code: sellerCode }, token: host.token });
  check('다시 출석시켜 둔다', r.status === 200, r.json.message);

  r = await api(`/checkin/sessions/${sessionId}/close`, { method: 'PATCH', token: host.token });
  check('세션 종료', r.status === 200 && r.json.data?.session?.status === 'closed', r.json);
  check('종료 응답에 미도착 목록이 온다 (0명)', Array.isArray(r.json.data?.absentees) && r.json.data.absentees.length === 0, r.json.data?.absentees);

  r = await api(`/checkin/pass?marketId=${marketId}`, { token: seller.token });
  check('종료 후 판매자 QR 은 안 나온다', r.json.data?.sessionOpen === false, r.json.data);

  r = await api('/checkin/scan', { method: 'POST', body: { sessionId, code: sellerCode }, token: host.token });
  check('종료 후에는 스캔 불가 (SESSION_CLOSED)', r.status === 409 && r.json.code === 'SESSION_CLOSED', r.json);

  r = await api('/checkin/sessions', { method: 'POST', body: { marketId, eventDate: today }, token: host.token });
  check('같은 날짜를 다시 열면 세션 재사용', r.json.data?.session?.sessionId === sessionId, r.json.data?.session);

  r = await api('/checkin/scan', { method: 'POST', body: { token: sellerToken }, token: host.token });
  check('재시작 전 캡처된 옛 QR 은 무효 (서명 키 교체)', r.status === 400 && r.json.code === 'PASS_INVALID', r.json);

  r = await api(`/checkin/sessions?marketId=${marketId}&eventDate=${today}`, { token: host.token });
  check('재시작해도 기존 출석 기록은 남아 있다', r.json.data?.summary?.checkedInSellers === 1, r.json.data?.summary);

  /* ───────────────────────────────────────────── */
  console.log('\n── 13. 참여 집계 (마켓 단위) ────────────────────────────');
  // 집계 단위는 날짜가 아니라 **마켓** 입니다.
  //   7일 마켓에서 하루 빠진 것과 아예 안 나온 것을 똑같이 세면 안 되기 때문입니다.
  //   그리고 마켓이 끝난 뒤에만 판정합니다.

  const twoDaysAgo = dateStr(-2);

  // 앞선 검사들이 오늘 세션과 체크인을 남겨 뒀습니다.
  // 집계 규칙만 따로 보기 위해 이 마켓의 체크인 기록을 비우고 시작합니다.
  await conn.query('DELETE FROM market_checkins WHERE marketId = ?', [marketId]);
  await conn.query('DELETE FROM market_checkin_sessions WHERE marketId = ?', [marketId]);

  r = await api('/checkin/stats/me', { token: seller.token });
  check('아직 안 끝난 마켓은 집계에 들어가지 않는다', r.json.data?.totalMarkets === 0, r.json.data);

  // 마켓을 "끝난" 상태로 만들고 어제 세션을 넣어 미참여 상황을 재현합니다.
  await conn.query('UPDATE markets SET eventDate_min = ?, eventDate_max = ? WHERE marketId = ?',
    [yesterday, yesterday, marketId]);
  const [pastSession] = await conn.query(
    `INSERT INTO market_checkin_sessions (marketId, eventDate, status, secret, openedBy)
     VALUES (?, ?, 'closed', REPEAT('a',64), ?)`,
    [marketId, yesterday, host.userId]
  );

  r = await api('/checkin/stats/me', { token: seller.token });
  check('전혀 참여 안 하면 노쇼 1', r.json.data?.noShow === 1 && r.json.data?.totalMarkets === 1, r.json.data);
  check('완주율 0%', r.json.data?.attendanceRate === 0, r.json.data?.attendanceRate);
  check('outcome 이 no_show', r.json.data?.byMarket?.[0]?.outcome === 'no_show', r.json.data?.byMarket?.[0]);

  r = await api(`/checkin/stats/${seller.userId}`);
  check('공개 API 로도 보인다 (비로그인)', r.status === 200 && r.json.data?.noShow === 1, r.json.data);
  check('공개 API 에는 마켓별 상세가 없다', r.json.data?.byMarket === undefined, Object.keys(r.json.data || {}));

  r = await api('/checkin/stats/me', { token: other.token });
  check('승인 안 된 판매자는 집계되지 않는다', r.json.data?.totalMarkets === 0, r.json.data);

  await conn.query(
    `INSERT INTO market_checkins (sessionId, marketId, applicationId, sellerId, method)
     VALUES (?, ?, ?, ?, 'qr')`,
    [pastSession.insertId, marketId, a1.insertId, seller.userId]
  );
  r = await api('/checkin/stats/me', { token: seller.token });
  check('참여하면 완주 1, 노쇼 0', r.json.data?.completed === 1 && r.json.data?.noShow === 0, r.json.data);

  // 이틀짜리로 늘리고 하루만 참여 -> 중도 이탈
  await conn.query('UPDATE markets SET eventDate_min = ? WHERE marketId = ?', [twoDaysAgo, marketId]);
  await conn.query(
    `INSERT INTO market_checkin_sessions (marketId, eventDate, status, secret, openedBy)
     VALUES (?, ?, 'closed', REPEAT('b',64), ?)`,
    [marketId, twoDaysAgo, host.userId]
  );
  r = await api('/checkin/stats/me', { token: seller.token });
  check('2일 중 1일만 참여 -> 중도이탈 1 (노쇼 아님)',
    r.json.data?.partial === 1 && r.json.data?.noShow === 0, r.json.data);
  check('빠진 날 수가 기록된다', r.json.data?.byMarket?.[0]?.missedDays === 1, r.json.data?.byMarket?.[0]);

  // 부스 2칸이어도 마켓 기준이라 노쇼 1
  await conn.query('DELETE FROM market_checkins WHERE marketId = ?', [marketId]);
  r = await api('/checkin/stats/me', { token: seller.token });
  check('부스 2칸이어도 노쇼는 1로 센다', r.json.data?.noShow === 1, r.json.data);

  // 세션이 하나도 없으면 집계 대상 아님
  await conn.query('DELETE FROM market_checkin_sessions WHERE marketId = ? AND eventDate <> ?',
    [marketId, today]);
  r = await api('/checkin/stats/me', { token: seller.token });
  check('체크인을 운영하지 않은 마켓은 세지 않는다', r.json.data?.totalMarkets === 0, r.json.data);

  // 뒤 검사를 위해 개최일과 출석 기록을 복원합니다.
  //   15번(내 출석 이력)이 2건을 기대하므로 오늘 세션에 부스 2칸을 다시 찍어 둡니다.
  await conn.query('UPDATE markets SET eventDate_min = ?, eventDate_max = ? WHERE marketId = ?',
    [yesterday, tomorrow, marketId]);
  await conn.query('DELETE FROM market_checkins WHERE marketId = ?', [marketId]);
  await conn.query('DELETE FROM market_checkin_sessions WHERE marketId = ?', [marketId]);
  const [restored] = await conn.query(
    `INSERT INTO market_checkin_sessions (marketId, eventDate, status, secret, openedBy)
     VALUES (?, ?, 'open', REPEAT('c',64), ?)`,
    [marketId, today, host.userId]
  );
  await conn.query(
    `INSERT INTO market_checkins (sessionId, marketId, applicationId, sellerId, method)
     VALUES (?, ?, ?, ?, 'qr'), (?, ?, ?, ?, 'qr')`,
    [restored.insertId, marketId, a1.insertId, seller.userId,
     restored.insertId, marketId, a2.insertId, seller.userId]
  );

  /* ───────────────────────────────────────────── */
  console.log('\n── 14. 취소된 마켓 ──────────────────────────────────────');
  await conn.query('UPDATE markets SET isExpired = 2 WHERE marketId = ?', [marketId]);
  r = await api('/checkin/sessions', { method: 'POST', body: { marketId, eventDate: tomorrow }, token: host.token });
  check('취소된 마켓은 체크인을 열 수 없다', r.status === 409 && r.json.code === 'MARKET_CANCELLED', r.json);
  await conn.query('UPDATE markets SET isExpired = 0 WHERE marketId = ?', [marketId]);

  /* ───────────────────────────────────────────── */
  console.log('\n── 15. 내 출석 이력 ─────────────────────────────────────');
  r = await api(`/checkin/my?marketId=${marketId}`, { token: seller.token });
  check('판매자가 자기 출석 이력을 본다', r.status === 200 && r.json.data?.length === 2, r.json.data?.length);

  r = await api('/checkin/my', { token: other.token });
  check('출석한 적 없으면 빈 배열', r.status === 200 && r.json.data?.length === 0, r.json.data);
} catch (error) {
  fail += 1;
  console.error('\n💥 예외:', error.message);
} finally {
  console.log('\n── 정리 ────────────────────────────────────────────────');
  try {
    for (const id of created.marketIds) await conn.query('DELETE FROM markets WHERE marketId = ?', [id]);
    for (const id of created.userIds) if (id) await conn.query('DELETE FROM users WHERE userId = ?', [id]);
    console.log('  테스트 데이터 삭제 완료');
  } catch (e) {
    console.log('  ⚠️ 정리 실패(수동 삭제 필요):', e.message, created);
  }
  await conn.end();
  console.log(`\n결과: 통과 ${pass}건 / 실패 ${fail}건`);
  process.exitCode = fail === 0 ? 0 : 1;
}
