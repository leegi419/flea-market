// backend/utills/checkinToken.js
// [현장 QR 체크인] 판매자 폰에 뜨는 「입장 패스」의 발급 / 검증
//
// ┌─ 방식 ───────────────────────────────────────────────────────────┐
// │  판매자가 자기 폰에 QR 을 띄우고, 주최자가 그 QR 을 찍습니다.      │
// │  (주최자 화면에 QR 을 띄우고 판매자들이 찍는 반대 방식이 아닙니다) │
// └──────────────────────────────────────────────────────────────────┘
//
// 왜 판매자가 QR 을 띄우고 주최자가 찍나
//   1) 주최자 화면에 QR 을 띄우면 그 QR 이미지 하나로 여러 명이 동시에 찍을 수 있습니다.
//      사진을 찍어 단톡방에 뿌리면 현장에 오지 않은 사람도 출석 처리되고,
//      그러면 노쇼 집계 자체가 의미를 잃습니다.
//   2) 판매자별 QR 을 주최자가 한 명씩 찍으면, 줄을 서서 사람과 부스를 눈으로 확인하며
//      처리하게 됩니다. 출석 기록에 "주최자가 직접 확인했다"는 의미가 생깁니다.
//   3) 결과적으로 체크인 권한이 주최자 한 명에게 모여 다중 접속/동시 처리가 생기지 않습니다.
//
// 패스 토큰 형식:  sessionId.sellerId.만료시각.서명
//   예)  12.7.1788000000.9f2a1c4b7d5e6a8b
//   짧게 유지하는 이유 — QR 격자가 촘촘하면 행사장 조명/흔들림에서 인식률이 떨어집니다.
//
// 만료를 짧게(기본 90초) 두는 이유
//   판매자 화면의 QR 을 캡처해서 다른 사람에게 보내면 대리 체크인이 됩니다.
//   화면이 45초마다 새 패스를 받아 갈아끼우므로, 캡처본은 곧 못 쓰게 됩니다.
//
// 숫자 코드(6자리)를 함께 주는 이유
//   주최자 폰의 카메라 권한이 막히는 경우가 실제로 자주 있습니다.
//   브라우저는 https 또는 localhost 가 아니면 카메라를 아예 열어주지 않습니다.
//   (팀처럼 http://192.168.0.x 로 접속하면 스캐너가 동작하지 않습니다)
//   그때 판매자가 숫자를 불러주고 주최자가 입력하면 같은 결과가 됩니다.

import crypto from 'crypto';

/** 패스 1장의 유효 시간(초) */
export const PASS_TTL_SEC = 90;

/** 판매자 화면이 패스를 다시 받는 주기(초). TTL 보다 짧아야 화면이 끊기지 않습니다. */
export const PASS_REFRESH_SEC = 45;

/** 숫자 코드가 바뀌는 주기(초). 앞 구간 1개까지 인정하므로 실제 유효시간은 최대 120초입니다. */
export const CODE_WINDOW_SEC = 60;

/** 서명 길이(hex 문자 수). 16자 = 64비트 — 90초짜리 토큰을 찍어 맞히기엔 충분합니다. */
const SIGNATURE_LENGTH = 16;

/** 체크인 세션 하나당 하나씩 발급되는 서명 키 */
export function createSessionSecret() {
  return crypto.randomBytes(32).toString('hex'); // 64자
}

function hmac(secret, payload) {
  return crypto.createHmac('sha256', String(secret)).update(payload).digest('hex');
}

function sign(secret, payload) {
  return hmac(secret, payload).slice(0, SIGNATURE_LENGTH);
}

/** 길이가 달라도 예외가 나지 않는 상수시간 비교 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ------------------------------------------------------------------ */
/* QR 패스                                                             */
/* ------------------------------------------------------------------ */

/**
 * 판매자 폰에 띄울 패스를 발급합니다.
 * @param {{sessionId:number, secret:string}} session
 * @param {number} sellerId
 * @param {number} [ttlSec]
 * @returns {{token:string, expiresAt:number, ttlSec:number}} expiresAt 은 ms (프론트 카운트다운용)
 */
export function issueSellerPass(session, sellerId, ttlSec = PASS_TTL_SEC) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${session.sessionId}.${Number(sellerId)}.${exp}`;
  return {
    token: `${payload}.${sign(session.secret, payload)}`,
    expiresAt: exp * 1000,
    ttlSec,
  };
}

/**
 * 서명 검증 전에 sessionId / sellerId 만 꺼냅니다. (DB 에서 secret 을 찾기 위한 용도)
 * 형식이 아니면 null 을 돌려주므로 호출부에서 반드시 null 검사를 하세요.
 */
export function parseSellerPass(token) {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 4) return null;

  const sessionId = Number(parts[0]);
  const sellerId = Number(parts[1]);
  const exp = Number(parts[2]);
  if (!Number.isInteger(sessionId) || sessionId <= 0) return null;
  if (!Number.isInteger(sellerId) || sellerId <= 0) return null;
  if (!Number.isInteger(exp) || exp <= 0) return null;
  if (!/^[0-9a-f]+$/i.test(parts[3])) return null;

  return { sessionId, sellerId, exp, signature: parts[3].toLowerCase() };
}

/**
 * 패스의 서명과 만료를 검증합니다.
 * @returns {{ok:true, sessionId:number, sellerId:number} | {ok:false, code:string, message:string}}
 */
export function verifySellerPass(token, secret) {
  const parsed = parseSellerPass(token);
  if (!parsed) {
    return { ok: false, code: 'PASS_MALFORMED', message: '이 마켓의 입장 QR 이 아니에요.' };
  }

  const expected = sign(secret, `${parsed.sessionId}.${parsed.sellerId}.${parsed.exp}`);
  if (!safeEqual(expected, parsed.signature)) {
    return { ok: false, code: 'PASS_INVALID', message: '유효하지 않은 QR 이에요. 판매자 화면을 새로고침해 달라고 안내해 주세요.' };
  }

  // 서명이 맞을 때만 만료를 따집니다. (위조 토큰에 "만료됐다"고 알려줄 이유가 없습니다)
  if (parsed.exp * 1000 <= Date.now()) {
    return { ok: false, code: 'PASS_EXPIRED', message: 'QR 이 만료됐어요. 판매자 화면의 새 QR 을 찍어 주세요.' };
  }

  return { ok: true, sessionId: parsed.sessionId, sellerId: parsed.sellerId };
}

/* ------------------------------------------------------------------ */
/* 숫자 코드 (카메라를 못 쓸 때의 대체 수단)                            */
/* ------------------------------------------------------------------ */

/** 현재 시간 구간 번호 */
function currentWindow(offset = 0) {
  return Math.floor(Date.now() / 1000 / CODE_WINDOW_SEC) + offset;
}

/**
 * 세션 × 판매자 × 시간구간 으로 6자리 코드를 만듭니다.
 * DB 에 저장하지 않습니다 — 같은 입력이면 어디서 계산해도 같은 값이 나옵니다.
 */
export function deriveSellerCode(session, sellerId, windowOffset = 0) {
  const payload = `code.${session.sessionId}.${Number(sellerId)}.${currentWindow(windowOffset)}`;
  const digest = hmac(session.secret, payload);
  // 앞 8자(32비트)를 숫자로 바꿔 6자리로 자릅니다.
  const num = parseInt(digest.slice(0, 8), 16) % 1000000;
  return String(num).padStart(6, '0');
}

/** 코드가 남은 시간(초). 화면에 "N초 후 갱신"을 표시하기 위한 값입니다. */
export function codeSecondsLeft() {
  const now = Math.floor(Date.now() / 1000);
  return CODE_WINDOW_SEC - (now % CODE_WINDOW_SEC);
}

/**
 * 주최자가 입력한 코드가 이 판매자의 것인지 확인합니다.
 * 직전 구간(offset -1)까지 인정합니다 — 판매자가 코드를 부르는 사이에 갱신될 수 있기 때문입니다.
 */
export function matchSellerCode(session, sellerId, inputCode) {
  const code = String(inputCode || '').trim();
  if (!/^\d{6}$/.test(code)) return false;
  return safeEqual(deriveSellerCode(session, sellerId, 0), code)
      || safeEqual(deriveSellerCode(session, sellerId, -1), code);
}

export default {
  PASS_TTL_SEC,
  PASS_REFRESH_SEC,
  CODE_WINDOW_SEC,
  createSessionSecret,
  issueSellerPass,
  parseSellerPass,
  verifySellerPass,
  deriveSellerCode,
  codeSecondsLeft,
  matchSellerCode,
};
