// [보안·환경 정리] 서버 주소 하드코딩('http://localhost:5000/api')을 제거했습니다.
//   주소 결정은 common/js/api.js 의 apiUrl() 한 곳에서만 합니다.
//   이 페이지들은 모두 api.js 를 먼저(또는 같은 페이지에서) 불러오고,
//   아래 호출들은 전부 사용자가 버튼을 누른 뒤 실행되므로 apiUrl 은 항상 준비돼 있습니다.
// js/marketcorrection.js
// 마켓 수정 페이지 전용 스크립트
// 흐름: URL에서 marketId 읽기 -> 기존 마켓 정보 조회(GET) -> 폼에 채우기 -> 제출 시 PATCH

// ============================================
// 0. URL에서 marketId 가져오기
// ============================================
function getMarketIdFromUrl() {
  return new URLSearchParams(window.location.search).get('marketId');
}

// ============================================
// 1. 마켓 수정 API 호출 (이미 있던 코드 그대로)
// ============================================
async function correctionMarket(marketId, payload) {
  return callApi(`/markets/${marketId}`, { method: 'PATCH', body: payload });
}

// ============================================
// 2. 기존 마켓 정보를 불러와서 폼에 채워 넣기
//    백엔드에 GET /markets/:marketId (상세 조회)가 이미 있다는 전제로 작성
// ============================================
async function loadMarketForEdit(marketId) {
  try {
    const res = await callApi(`/markets/${marketId}`); // GET, 상세 조회
    if (!res || !res.success || !res.data) {
      renderAlert('마켓 정보를 불러오지 못했습니다.');
      return;
    }

    const market = res.data;

    // 텍스트/숫자 필드 채우기
    document.getElementById('title').value = market.title || '';
    document.getElementById('booth-price').value = market.boothPrice ?? 0;

    // [부스 등급] 이미 등급이 있으면 편집기에 채워 넣습니다.
    //   빈 상태로 두면 저장 시 등급이 통째로 사라진 것으로 처리됩니다.
    if (window.BoothTypes && document.getElementById('booth-type-list')) {
      window.BoothTypes.mount({
        rootId: 'booth-type-list',
        addBtnId: 'booth-type-add',
        countId: 'booth-type-count',
        priceInputId: 'booth-price',
        priceHintId: 'booth-type-hint',
      });
      if (Array.isArray(market.boothTypes) && market.boothTypes.length > 0) {
        window.BoothTypes.setTypes(market.boothTypes);
      }
    }
    document.getElementById('max-participants').value = market.maxParticipants ?? 0;
    const overcapacityEl = document.getElementById('allow-overcapacity');
    if (overcapacityEl) overcapacityEl.checked = Number(market.allowOvercapacity) === 1;
    const duplicateApplicationEl = document.getElementById('allow-duplicate-application');
    // 값이 아직 없는(마이그레이션 전) 마켓은 기존 동작과 동일하게 허용 상태로 보여줍니다.
    if (duplicateApplicationEl) duplicateApplicationEl.checked = Number(market.allowDuplicateApplication) !== 0;
    document.getElementById('description').value = market.description || '';

    // 날짜 필드 채우기 (DB에서 오는 값이 'YYYY-MM-DDTHH:mm:ss.000Z' 형태일 수 있어 앞 10자리만 사용)
    document.getElementById('start-event-date').value = market.eventDate_min ? market.eventDate_min.slice(0, 10) : '';
    document.getElementById('end-event-date').value = market.eventDate_max ? market.eventDate_max.slice(0, 10) : '';
    document.getElementById('recruitmentDate_min').value = market.recruitmentDate_min ? market.recruitmentDate_min.slice(0, 10) : '';
    document.getElementById('recruitmentDate_max').value = market.recruitmentDate_max ? market.recruitmentDate_max.slice(0, 10) : '';

    // [날짜 제약] 채운 값이 오늘보다 이르면 min 을 낮춰 줍니다.
    //   이미 지난 모집 기간을 가진 마켓을 수정할 때, 브라우저가 min 위반으로
    //   폼 제출을 막아 "저장이 안 되는" 것처럼 보이기 때문입니다.
    if (window.MarketDate) window.MarketDate.relaxMinForExisting();

    // [주소] 저장된 주소는 「도로명주소 + 상세주소」가 합쳐진 한 덩어리입니다.
    //   (markets 테이블에 locationName 컬럼 하나뿐이라 따로 보관하지 않습니다)
    //
    //   예전에는 그 전체를 address 칸에만 넣고 detailAddress 는 **비워 뒀습니다.**
    //   그 상태에서 상세주소를 입력하면 updateFullAddress() 가
    //   "전체주소 + 새 상세주소" 로 합쳐, 원래 있던 상세주소가 중복되거나 어긋났습니다.
    //   화면상으로는 "입력해도 저장이 안 되는" 것처럼 보였습니다.
    //
    //   그래서 불러올 때 도로명 부분과 상세 부분으로 나눠 각 칸에 채웁니다.
    //   markets 에 addressBase / addressDetail / postcode 를 따로 저장하므로
    //   각 칸을 그대로 복원합니다. 합쳐진 문자열을 되돌려 자르는 방식은 쓰지 않습니다 —
    //   "가가로 15 1000 100 1500" 처럼 상세가 숫자로 끝나면 어디까지가 도로명인지
    //   알 수 없어서, 잘못 자르면 주소가 망가집니다.
    //
    //   예전 마켓은 addressBase 가 비어 있을 수 있어 locationName 으로 대신합니다.
    const savedAddress = market.locationName || '';
    document.getElementById('address').value = market.addressBase || savedAddress;
    document.getElementById('detailAddress').value = market.addressDetail || '';
    document.getElementById('fullAddress').value = savedAddress;
    const pc = document.getElementById('postcode');
    if (pc) pc.value = market.postcode || '';
    document.getElementById('region').value = market.region || '';
    document.getElementById('latitude').value = market.latitude || '';
    document.getElementById('longitude').value = market.longitude || '';

    // [지도] 저장된 좌표로 지도를 옮깁니다.
    //   이게 없으면 지도는 기본 위치(서울시청)에 머물러,
    //   주소를 다시 검색하지 않는 한 "위치가 저장 안 된" 것처럼 보입니다.
    //   marketmap.js 가 module 이라 늦게 로드될 수 있어 잠깐 기다렸다 다시 시도합니다.
    const moveMap = () => {
      if (!window.MarketMap) return false;
      const moved = window.MarketMap.moveTo(market.latitude, market.longitude);
      // 좌표가 없거나 0 인 마켓은 저장된 주소로 다시 찾습니다.
      //   그대로 두면 지도는 서울시청에 머물고, 저장할 때도 좌표가 비어 나갑니다.
      if (!moved && savedAddress) window.MarketMap.geocode(savedAddress);
      return true;
    };
    if (!moveMap()) {
      let tries = 0;
      const timer = setInterval(() => {
        if (moveMap() || (tries += 1) > 20) clearInterval(timer);
      }, 100);
    }

    // 기존 이미지 경로를 hidden input에 미리 채워둠 (새 이미지 업로드 안 하면 이 값 그대로 전송됨)
    document.getElementById('uploadedImagePath').value = market.marketImage || '';
    console.log(market.marketImage);
    // 기존 이미지 미리보기 (있을 때만)
    if (market.marketImage) {
      const statusEl = document.getElementById('image-upload-status');
      statusEl.innerHTML = `
        <p class="form-hint">현재 등록된 이미지</p>
        <img src="${apiUrl(market.marketImage)}" alt="현재 마켓 이미지"
             style="max-width:100%; max-height:180px; border-radius:8px; margin-top:6px;" />
      `;
      // [추가] 등록된 이미지가 있을 때만 삭제 버튼을 보여줍니다.
      const removeBtn = document.getElementById('remove-market-image-btn');
      if (removeBtn) removeBtn.hidden = false;
    }

  } catch (err) {
    console.error('마켓 정보 조회 오류:', err);
    renderAlert('서버에 연결할 수 없습니다.');
  }
}

// ============================================
// 3. 폼 제출 이벤트 (수정 전용으로 correctionMarket 호출)
// ============================================
function correctionMarketClick(marketId) {
  if (!marketId) return;

  const form = document.getElementById('market-create-form');
  if (!form) return;
  const submitBtn = document.getElementById('market-create-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    // ---- 1) 원본 입력값 읽기 ----
    const titleVal = document.getElementById('title').value.trim();
    const startEventDateVal = document.getElementById('start-event-date').value;
    const endEventDateVal = document.getElementById('end-event-date').value;
    const startRecruitmentDateVal = document.getElementById('recruitmentDate_min').value;
    const endRecruitmentDateVal = document.getElementById('recruitmentDate_max').value;
    const boothPriceRaw = document.getElementById('booth-price').value;
    const maxParticipantsRaw = document.getElementById('max-participants').value;
    const fullAddressVal = document.getElementById('fullAddress').value.trim();

    // ---- 2) 검증 ----
    if (!titleVal) {
      renderAlert('마켓 이름을 입력해주세요.');
      return;
    }
    if (!startEventDateVal || !endEventDateVal) {
      renderAlert('개최 일자를 모두 입력해주세요.');
      return;
    }
    if (new Date(endEventDateVal) < new Date(startEventDateVal)) {
      renderAlert('종료일은 시작일보다 빠를 수 없어요.');
      return;
    }
    if (!fullAddressVal) {
      renderAlert('개최 장소 주소를 검색해서 선택해주세요.');
      return;
    }
    const boothPriceNum = Number(boothPriceRaw);
    if (boothPriceRaw === '' || Number.isNaN(boothPriceNum) || boothPriceNum < 0) {
      renderAlert('부스료는 0 이상의 숫자로 입력해주세요.');
      return;
    }
    const maxParticipantsNum = Number(maxParticipantsRaw);
    if (maxParticipantsRaw === '' || !Number.isInteger(maxParticipantsNum) || maxParticipantsNum < 0) {
      renderAlert('허용 가능한 최대 부스 수는 0 이상의 정수로 입력해주세요.');
      return;
    }

    // ---- 3) 새 이미지를 선택했을 때만 업로드 (안 바꿨으면 기존 uploadedImagePath 값 그대로 사용) ----
    const fileInput = document.getElementById('market-image');
    if (fileInput.files && fileInput.files[0]) {
      await uploadMarketImage();
    }

    const payload = {
      title: titleVal,
      eventDate_min: startEventDateVal,
      eventDate_max: endEventDateVal,
      recruitmentDate_min: startRecruitmentDateVal,
      recruitmentDate_max: endRecruitmentDateVal,
      boothPrice: boothPriceNum,
      description: document.getElementById('description').value.trim(),
      locationName: fullAddressVal,
      // [주소] 수정 화면에서 각 칸을 복원하려면 나눠서도 저장해야 합니다.
      addressBase: document.getElementById('address')?.value.trim() || null,
      addressDetail: document.getElementById('detailAddress')?.value.trim() || null,
      postcode: document.getElementById('postcode')?.value.trim() || null,
      region: document.getElementById('region').value || null,
      latitude: document.getElementById('latitude').value || null,
      longitude: document.getElementById('longitude').value || null,
      maxParticipants: maxParticipantsNum,
      allowOvercapacity: document.getElementById('allow-overcapacity')?.checked || false,
      allowDuplicateApplication: document.getElementById('allow-duplicate-application')?.checked ?? true,
      marketImage: document.getElementById('uploadedImagePath').value || null,
    };

    // [부스 등급] 편집기가 있으면 항상 보냅니다.
    //   등록과 달리 여기서는 1개여도 보내야 합니다 — 등급을 지워서 1개로 줄인 것도
    //   저장돼야 하는데, 안 보내면 서버가 "변경 없음" 으로 보고 그대로 둡니다.
    if (window.BoothTypes && document.getElementById('booth-type-list')) {
      // validate() 는 문제가 있으면 **안내 문구(문자열)**, 없으면 null 을 돌려줍니다.
      const problem = window.BoothTypes.validate();
      if (problem) {
        renderAlert(problem);
        setButtonLoading(submitBtn, false, '수정 중...', '수정하기');
        return;
      }
      payload.boothTypes = window.BoothTypes.getTypes();
    }


    setButtonLoading(submitBtn, true, '수정 중...', '수정하기');
    try {
      const res = await correctionMarket(marketId, payload);
      if (res && res.success) {
        renderAlert('마켓 정보가 수정됐어요!', 'success');
        setTimeout(() => {
          // [수정] 고정 주소 대신, 들어온 화면으로 되돌립니다.
          window.location.href = getReturnTarget(marketId).url;
        }, 1000);
      } else {
        renderAlert(res?.message || '수정에 실패했어요. 입력값을 확인해주세요.');
        setButtonLoading(submitBtn, false, '수정 중...', '수정하기');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
      setButtonLoading(submitBtn, false, '수정 중...', '수정하기');
    }
  });
}

// ============================================
// 3-1. [추가] 수정을 마친 뒤 돌아갈 화면 계산
//
//   예전에는 저장이 끝나면 무조건 'mymarketpage.html' 로 갔습니다.
//   마켓 상세에서 「마켓 정보 수정하기」를 눌러 들어온 사람은
//   방금 보던 마켓으로 돌아가는 게 자연스러운데, 매번 목록으로 튕겼습니다.
//
//   판단 순서
//     1) 주소의 ?from=detail  (market.js 가 붙여 보냅니다)
//     2) 없으면 document.referrer 로 추측 (예전 링크로 들어온 경우 대비)
//     3) 둘 다 아니면 기존대로 「내 마켓 관리」
//
//   주소 형식(.html 유무)은 지금 보고 있는 화면을 그대로 따라갑니다.
// ============================================
function getReturnTarget(marketId) {
  const ext = /\.html$/i.test(window.location.pathname) ? '.html' : '';
  const from = new URLSearchParams(window.location.search).get('from');

  let cameFromDetail = from === 'detail';
  if (!from) {
    try {
      cameFromDetail = /market-detail/i.test(document.referrer || '');
    } catch (e) {
      cameFromDetail = false;
    }
  }

  if (cameFromDetail && marketId) {
    return {
      url: `market-detail${ext}?marketId=${encodeURIComponent(marketId)}`,
      label: '\u2190 마켓 상세로 돌아가기',
    };
  }
  return { url: `mymarketpage${ext}`, label: '\u2190 내 마켓 관리로 돌아가기' };
}

/** 화면 아래 「돌아가기」 링크도 같은 곳을 가리키게 맞춥니다. */
function applyBackLink(marketId) {
  const link = document.getElementById('correction-back-link');
  if (!link) return;
  const target = getReturnTarget(marketId);
  link.setAttribute('href', target.url);
  link.textContent = target.label;
}

// ============================================
// 4. 이미지 업로드 (기존 로직 그대로 유지)
// ============================================
async function uploadMarketImage() {
  const fileInput = document.getElementById('market-image');
  const file = fileInput.files[0];

  if (!file) return;

  const formData = new FormData();
  formData.append('marketImage', file);

  try {
    const response = await fetch(apiUrl('/upload'), {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    if (data.success) {
      document.getElementById('uploadedImagePath').value = data.filePath;
    } else {
      console.error('이미지 업로드 실패:', data.message);
    }
  } catch (error) {
    console.error('이미지 업로드 오류:', error);
  }
}

function setButtonLoading(btn, isLoading, loadingText, defaultText) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? loadingText : defaultText;
}
function renderAlert(message, type = 'error') {
  // [토스트] 화면 맨 위 alert-box 는 폼이 길면 스크롤해야 보입니다.
  //   버튼을 누른 자리 근처에 뜨도록 우측 하단 토스트로 함께 띄웁니다.
  //   기존 alert-box 도 그대로 둡니다 — 토스트 스크립트를 못 불러온 화면에서도
  //   메시지가 사라지지 않게 하려는 것입니다.
  if (window.Toast) window.Toast.show(message, type);
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('alert-error', 'alert-success');
  box.classList.add(type === 'success' ? 'alert-success' : 'alert-error', 'show');
}

function hideAlert() {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.classList.remove('show');
}

// ============================================
// 초기 실행: marketId 확인 -> 기존 정보 로드 -> 제출 이벤트 연결
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  const marketId = getMarketIdFromUrl();

  if (!marketId) {
    renderAlert('수정할 마켓 정보를 찾을 수 없습니다. (marketId 없음)');
    return;
  }
  applyBackLink(marketId);             // [추가] 돌아가기 링크를 들어온 화면에 맞춤
  await loadMarketForEdit(marketId);   // 기존 값 채우기
  correctionMarketClick(marketId); 
});

/* ---------------------- [추가] 마켓 이미지 삭제 ---------------------- */
// hidden input(uploadedImagePath)을 비워 두면 저장 시 marketImage: null 이 전송되어
// 서버에서 이미지가 지워집니다. (예전에는 기존 경로가 계속 남아 되돌릴 수 없었습니다)
(function wireRemoveMarketImage() {
  const btn = document.getElementById('remove-market-image-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const hidden = document.getElementById('uploadedImagePath');
    const fileInput = document.getElementById('market-image');
    const statusEl = document.getElementById('image-upload-status');
    const msg = document.getElementById('market-image-removed-msg');

    if (hidden) hidden.value = '';
    if (fileInput) fileInput.value = '';
    if (statusEl) statusEl.innerHTML = '';
    btn.hidden = true;
    if (msg) msg.hidden = false;
  });

  // 새 이미지를 고르면 삭제 예약 문구는 지웁니다.
  const fileInput = document.getElementById('market-image');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const msg = document.getElementById('market-image-removed-msg');
      if (msg) msg.hidden = true;
      if (fileInput.files && fileInput.files[0]) btn.hidden = false;
    });
  }
})();
