// backend/utills/regions.js
// [지역] 전국 17개 시·도 목록
//
// 왜 따로 두는가
//   알림 설정의 「관심 지역」 후보를 예전에는 `SELECT DISTINCT region FROM markets` 로
//   뽑았습니다. 그러면 **이미 마켓이 등록된 지역만** 나옵니다.
//   서비스 초기에는 두세 곳뿐이고, 아직 마켓이 없는 지역은 아예 고를 수가 없습니다.
//   "우리 동네에 마켓이 열리면 알려줘" 가 이 기능의 목적인데,
//   마켓이 없어서 그 동네를 고를 수 없다면 앞뒤가 맞지 않습니다.
//
//   그래서 고정 목록을 둡니다. 프론트의 지역 지도(region-map.js)가 쓰는 것과
//   같은 17개 시·도이고, 표기도 그대로 맞췄습니다. (예: '충청북도' 가 아니라 '충북')
//   표기가 어긋나면 markets.region 과 대조가 안 돼 알림이 한 건도 안 나갑니다.

/** 전국 17개 시·도. 화면 표시 순서 = 이 순서 (수도권 → 강원 → 충청 → 전라 → 경상 → 제주) */
export const REGIONS = [
  '서울', '인천', '경기', '강원',
  '충북', '충남', '대전', '세종',
  '전북', '전남', '광주',
  '경북', '경남', '대구', '울산', '부산',
  '제주',
];

const REGION_SET = new Set(REGIONS);

/** 목록에 있는 지역인지 확인합니다. */
export function isValidRegion(name) {
  return REGION_SET.has(String(name || '').trim());
}

/**
 * 들어온 지역 배열에서 유효한 것만 남깁니다.
 * 모르는 값을 그대로 저장하면 markets.region 과 영영 안 맞아
 * "설정은 했는데 알림이 안 온다" 가 됩니다.
 */
export function filterValidRegions(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const name = String(raw || '').trim();
    if (!REGION_SET.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export default { REGIONS, isValidRegion, filterValidRegions };
