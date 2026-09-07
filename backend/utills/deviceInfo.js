// backend/utills/deviceInfo.js
// [로그인 기기] User-Agent 해석 + IP 마스킹
//
// ── 왜 서버에서 해석하나 ──────────────────────────────────────────
//   User-Agent 원문을 그대로 내려주면 화면이 파싱해야 하고,
//   나중에 관리자 화면이나 알림에서도 같은 파싱을 또 만들게 됩니다.
//   한 곳에서 해석해 "Windows · Chrome" 형태로 내려줍니다.
//
// ── 왜 IP 를 가리나 ───────────────────────────────────────────────
//   "어디서 로그인했는지" 를 알려주는 게 목적이지, 정확한 주소가 필요한 건 아닙니다.
//   전체 IP 가 화면에 그대로 뜨면 어깨너머로 보이거나 캡처가 돌아다닐 때
//   그 자체가 위험합니다. 마지막 자리를 가려도 "우리 집인지 아닌지" 는 구분됩니다.
//
// ── 원격 로그아웃을 넣지 않은 이유 ────────────────────────────────
//   계정이 이미 털린 상태라면 공격자도 그 버튼을 쓸 수 있습니다.
//   진짜 주인을 먼저 끊어버리는 도구가 되기 때문에, 이 화면은 **조회 전용**입니다.
//   수상한 접속이 보이면 비밀번호를 바꾸는 것이 순서입니다.
//   (비밀번호 변경 시 세션을 끊는 처리는 별도 과제)

/** 잘 알려진 브라우저를 앞에서부터 찾습니다. 순서가 중요합니다. */
const BROWSERS = [
  // Edge/Samsung 은 Chrome 문자열도 함께 갖고 있어 먼저 봐야 합니다.
  { re: /Edg[ieA]?\/[\d.]+/i, name: 'Edge' },
  { re: /SamsungBrowser\//i, name: '삼성 인터넷' },
  { re: /Whale\//i, name: '웨일' },
  { re: /OPR\/|Opera/i, name: 'Opera' },
  { re: /FxiOS|Firefox\//i, name: 'Firefox' },
  { re: /CriOS|Chrome\//i, name: 'Chrome' },
  { re: /Safari\//i, name: 'Safari' },
];

const PLATFORMS = [
  { re: /iPhone/i, name: 'iPhone', kind: 'mobile' },
  { re: /iPad/i, name: 'iPad', kind: 'tablet' },
  { re: /Android/i, name: 'Android', kind: 'mobile' },
  { re: /Windows NT/i, name: 'Windows', kind: 'desktop' },
  { re: /Mac OS X|Macintosh/i, name: 'Mac', kind: 'desktop' },
  { re: /Linux/i, name: 'Linux', kind: 'desktop' },
];

/**
 * User-Agent 를 사람이 읽는 형태로 바꿉니다.
 * @returns {{label:string, platform:string, browser:string, kind:string}}
 */
export function describeDevice(userAgent) {
  const ua = String(userAgent || '').trim();
  if (!ua) return { label: '알 수 없는 기기', platform: '', browser: '', kind: 'unknown' };

  const p = PLATFORMS.find((x) => x.re.test(ua));
  const b = BROWSERS.find((x) => x.re.test(ua));

  const platform = p ? p.name : '';
  const browser = b ? b.name : '';
  const kind = p ? p.kind : 'unknown';

  // 둘 다 못 알아보면 원문 일부라도 보여줍니다. "알 수 없음" 만 뜨면 확인할 방법이 없습니다.
  const label = platform && browser ? `${platform} · ${browser}`
              : platform || browser || ua.slice(0, 40);

  return { label, platform, browser, kind };
}

/**
 * IP 마지막 자리를 가립니다.
 *   IPv4  192.168.0.42        -> 192.168.0.*
 *   IPv6  2001:db8::1a2b:3c4d -> 2001:db8::1a2b:*
 *   IPv4-mapped ::ffff:1.2.3.4 -> 1.2.3.*
 */
export function maskIp(ip) {
  const raw = String(ip || '').trim();
  if (!raw) return '';

  // ::ffff:1.2.3.4 형태는 뒤쪽 IPv4 만 씁니다.
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const addr = mapped ? mapped[1] : raw;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(addr)) {
    return addr.replace(/\.\d+$/, '.*');
  }

  if (addr.includes(':')) {
    const parts = addr.split(':');
    // 마지막 "값이 있는" 조각을 가립니다. (:: 로 끝나는 경우 빈 조각을 건드리지 않게)
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (parts[i] !== '') { parts[i] = '*'; break; }
    }
    return parts.join(':');
  }

  return addr;
}

export default { describeDevice, maskIp };
