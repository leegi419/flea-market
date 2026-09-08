// ============================================
// 공통: 오늘 기준 최소 선택 가능 날짜 (내일)
// ============================================
function getMinDate(baseDate = new Date(), addDays = 0) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + addDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const minDate = getMinDate(); // 오늘 기준 내일

// ============================================
// 요소 가져오기
// ============================================
const startEventDateInput = document.getElementById('start-event-date');
const endEventDateInput = document.getElementById('end-event-date');
const startRecruitmentDateInput = document.getElementById('recruitmentDate_min');
const endRecruitmentDateInput = document.getElementById('recruitmentDate_max');

// ============================================
// 초기 min 값 설정
// ============================================
//
// [수정 화면 주의] 이미 저장된 마켓을 수정할 때는 **지난 날짜가 들어 있을 수 있습니다.**
//   모집 기간이 2026-08-27 ~ 09-06 인 마켓을 9월 7일에 열면
//   min(=오늘) 보다 이른 값이라 브라우저가 폼 제출 자체를 막습니다.
//   "저장 버튼을 눌러도 아무 일이 없다" 로 보이고, 이유도 표시되지 않습니다.
//
//   그래서 min 을 걸되, **값이 이미 그보다 이르면 그 값을 min 으로 낮춥니다.**
//   (등록 화면은 값이 비어 있으므로 종전처럼 오늘 이후만 고를 수 있습니다)
function applyMin(input, min) {
  if (!input) return;
  const current = input.value;
  input.setAttribute('min', current && current < min ? current : min);
}

applyMin(startEventDateInput, minDate);
applyMin(endEventDateInput, minDate);
applyMin(startRecruitmentDateInput, minDate);
applyMin(endRecruitmentDateInput, minDate);

// 값이 나중에 채워지는 화면(마켓 수정)을 위해, 채워진 뒤 한 번 더 맞춥니다.
//   marketcorrection.js 가 값을 넣는 시점이 이 스크립트보다 늦습니다.
[startEventDateInput, endEventDateInput, startRecruitmentDateInput, endRecruitmentDateInput]
  .forEach((el) => {
    if (!el) return;
    // 값이 채워지면 min 을 다시 계산합니다.
    const observer = new MutationObserver(() => applyMin(el, minDate));
    observer.observe(el, { attributes: true, attributeFilter: ['value'] });
  });

window.MarketDate = {
  /** 마켓 수정 화면이 값을 다 채운 뒤 부릅니다. 지난 날짜도 저장할 수 있게 min 을 낮춥니다. */
  relaxMinForExisting() {
    applyMin(startEventDateInput, minDate);
    applyMin(endEventDateInput, minDate);
    applyMin(startRecruitmentDateInput, minDate);
    applyMin(endRecruitmentDateInput, minDate);
  },
};

// ============================================
// 개최 일자: 시작일 선택 시, 종료일의 min을 그 날짜로
// ============================================
startEventDateInput.addEventListener('change', () => {
  const selectedStart = startEventDateInput.value;

  if (selectedStart) {
    endEventDateInput.setAttribute('min', selectedStart);
    if (endEventDateInput.value && endEventDateInput.value < selectedStart) {
      endEventDateInput.value = selectedStart;
    }
  }
});

// ============================================
// 모집 일자: 시작일 선택 시, 모집 종료일의 min을 그 날짜로
// ============================================
startRecruitmentDateInput.addEventListener('change', () => {
  const selectedStart = startRecruitmentDateInput.value;

  if (selectedStart) {
    endRecruitmentDateInput.setAttribute('min', selectedStart);
    if (endRecruitmentDateInput.value && endRecruitmentDateInput.value < selectedStart) {
      endRecruitmentDateInput.value = selectedStart;
    }
  }
});

// ============================================
// 📌 핵심 추가: 모집 마감일이 정해지면, 개최 시작일은 그로부터 최소 7일 뒤부터 선택 가능
// ============================================
endRecruitmentDateInput.addEventListener('change', () => {
  const recruitmentMax = endRecruitmentDateInput.value;
  if (!recruitmentMax) return;

  // 모집 마감일 + 7일을 개최 시작일의 최소값으로 설정
  const earliestEventDate = getMinDate(new Date(recruitmentMax), 7);
  startEventDateInput.setAttribute('min', earliestEventDate);

  // 이미 선택되어 있던 개최 시작일이 새 최소값보다 이르면 자동 보정
  if (startEventDateInput.value && startEventDateInput.value < earliestEventDate) {
    startEventDateInput.value = earliestEventDate;
    // 개최 종료일도 같이 맞춰줘야 하니, change 이벤트를 강제로 한 번 실행
    startEventDateInput.dispatchEvent(new Event('change'));
  }
});