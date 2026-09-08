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

/**
 * [지역명 정규화] 카카오맵이 주는 이름을 프로젝트 표기로 맞춥니다.
 *
 *   카카오 `region_1depth_name` 은 행정 정식 명칭을 그대로 줍니다.
 *     제주특별자치도 / 강원특별자치도 / 전북특별자치도 / 세종특별자치시
 *   그런데 이 프로젝트의 지역 목록과 지도(region-map.js)는 짧은 표기를 씁니다.
 *     제주 / 강원 / 전북 / 세종
 *
 *   맞추지 않으면 그 지역 마켓이 **지역 필터와 지도 개수에서 통째로 빠집니다.**
 *   신규 마켓 알림의 관심 지역 대조도 어긋나 알림이 한 건도 안 갑니다.
 *
 *   접두 일치로 처리합니다. "제주특별자치도" 는 "제주" 로 시작하므로
 *   행정명이 또 바뀌어도(예: 무슨무슨자치도) 대체로 걸립니다.
 */
export function normalizeRegion(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (REGION_SET.has(raw)) return raw;

  // 긴 이름부터 짧은 표기로. '서울특별시' → '서울'
  const hit = REGIONS.find((r) => raw.startsWith(r));
  if (hit) return hit;

  // 옛 표기나 축약형도 흡수합니다.
  const ALIAS = {
    '서울시': '서울', '부산시': '부산', '대구시': '대구', '인천시': '인천',
    '광주시': '광주', '대전시': '대전', '울산시': '울산',
    '경기도': '경기', '강원도': '강원', '제주도': '제주',
    '충청북도': '충북', '충청남도': '충남',
    '전라북도': '전북', '전라남도': '전남',
    '경상북도': '경북', '경상남도': '경남',
  };
  return ALIAS[raw] || '';
}

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

export default { REGIONS, isValidRegion, filterValidRegions, normalizeRegion };
