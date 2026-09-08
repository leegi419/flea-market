// 담당 B/D: 포트원 실결제 프론트 로직

// 📌 포트원 콘솔에서 발급받은 값으로 교체하세요
const PORTONE_STORE_ID = "store-6187aa03-b350-43a3-96c7-31c846d1aa1c";
const PORTONE_CHANNEL_KEY = "channel-key-15892876-53e7-45a8-8a44-923ec53d5ae1";

// ============================================
// 백엔드 API 호출 함수들
// ============================================

// 결제 완료 후, 서버에 검증 요청 (applicationId + paymentId 둘 다 전달해야 함)
async function confirmPayment(applicationId, paymentId) {
  return callApi('/payments/confirm', {
    method: 'POST',
    body: { applicationId, paymentId },
  });
}

// ── 정산 / 결제 내역 ────────────────────────────────────────────
//   같은 화면이지만 보는 관점이 반대입니다.
//     주최자 = 「정산 내역」 (받을 돈)
//     판매자 = 「결제 내역」 (낸 돈)
//   금액 합계는 서버가 계산합니다. 화면마다 따로 더하면 계산이 갈립니다.

let paymentData = null;
let expandedMarketIds = new Set();
let settlementPeriod = 'all';

const PERIOD_LABELS = [
  { value: 'this_month', label: '이번 달' },
  { value: '3months', label: '최근 3개월' },
  { value: '6months', label: '최근 6개월' },
  { value: 'all', label: '전체' },
];

async function historys(period) {
  return callApi('/payments/history', {
    method: 'POST',
    body: { period: period || settlementPeriod },
  });
}

async function changePagePayment() {
  const page = document.getElementById('profile-panel');
  const ui = document.getElementById('payment-list');
  const editUi = document.getElementById('edit-panel');
  if (!page) return;
  if (!ui) return;
  // [UI 통일] mypage.html 에서만 정의된 헬퍼라서, 이 스크립트를 쓰는 다른 화면
  // (payment.html 등)에서는 존재하지 않을 수 있어 안전하게 확인 후 호출합니다.
  if (typeof setActiveMypageTab === 'function') setActiveMypageTab('payment');
  page.hidden = true;
  ui.hidden = false;
  if (editUi) editUi.hidden = true;
  payment_history();
}

async function payment_history() {
  const ui = document.getElementById('payment-list');
  if (!ui) return;
  try {
    const data = await historys();
    if (data && data.success) {
      paymentData = data.data;
      renderPaymentGroups();
    } else {
      ui.innerHTML = '<p class="list-empty">내역을 불러오지 못했습니다.</p>';
    }
  } catch (error) {
    // [수정] 예전에는 renderAlert("오류") 로 빨간 경고만 띄워 원인을 알 수 없었습니다.
    console.error('payment_history 오류:', error);
    ui.innerHTML = '<p class="list-empty">서버에 연결할 수 없어요.</p>';
  }
}

function won(n) {
  return (Number(n) || 0).toLocaleString('ko-KR') + '원';
}

function escapeSettle(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 기간 선택 버튼 */
function renderPeriodTabs() {
  return `<div class="settle-periods">${PERIOD_LABELS.map((p) => `
    <button type="button" class="settle-period${p.value === settlementPeriod ? ' on' : ''}"
            data-period="${p.value}">${p.label}</button>`).join('')}</div>`;
}

/**
 * 상단 요약.
 *   주최자에게는 확정/대기를 나눠 보여줍니다.
 *   마켓이 끝나야 금액이 굳는데, 진행 중인 마켓 금액을 같이 더해 두면
 *   나중에 환불이 나올 때 숫자가 바뀌어 "왜 줄었지?" 가 됩니다.
 */
function renderSummary(d) {
  const s = d.summary;
  const isHost = d.role === 'host';

  const cards = isHost
    ? [
        { label: '총 매출', value: won(s.grossAmount), cls: '' },
        { label: '환불', value: '-' + won(s.refundAmount), cls: 'minus' },
        { label: '정산 예정', value: won(s.netAmount), cls: 'main' },
      ]
    : [
        { label: '총 결제', value: won(s.grossAmount), cls: '' },
        { label: '환불받음', value: won(s.refundAmount), cls: 'minus' },
        { label: '실제 지출', value: won(s.netAmount), cls: 'main' },
      ];

  return `
    <div class="settle-summary">
      ${cards.map((c) => `
        <div class="settle-card ${c.cls}">
          <span class="settle-card-label">${c.label}</span>
          <b class="settle-card-value">${c.value}</b>
        </div>`).join('')}
    </div>
    ${isHost ? `
    <div class="settle-split">
      <span>확정 <b>${won(s.settledAmount)}</b></span>
      <span class="settle-pending">진행 중 <b>${won(s.pendingAmount)}</b></span>
      <span class="settle-note">마켓이 끝나야 금액이 확정돼요</span>
    </div>` : ''}
    <p class="settle-count">마켓 ${s.marketCount}곳 · 부스 ${s.boothCount}칸</p>
  `;
}

const SETTLE_BADGE = {
  settled: { label: '정산 확정', cls: 'ok' },
  pending: { label: '진행 중', cls: 'wait' },
  cancelled: { label: '마켓 취소', cls: 'bad' },
};

function renderPaymentGroups() {
  const ui = document.getElementById('payment-list');
  if (!ui) return;

  const d = paymentData;
  if (!d) { ui.innerHTML = ''; return; }

  const isHost = d.role === 'host';

  // 마이페이지 탭 이름도 역할에 맞춥니다.
  //   주최자에게 「결제내역 확인」은 자기가 결제한 것처럼 읽힙니다.
  //   실제로는 받을 돈이라 「정산 내역」이 맞습니다.
  const tabLabel = document.getElementById('payment-tab-label');
  if (tabLabel) tabLabel.textContent = isHost ? '정산 내역' : '결제 내역';

  const head = `<h2 class="settle-title">${isHost ? '정산 내역' : '결제 내역'}</h2>` + renderPeriodTabs();

  if (!d.groups || d.groups.length === 0) {
    ui.innerHTML = head + `<p class="list-empty">${isHost
      ? '이 기간에 정산할 내역이 없어요.' : '이 기간에 결제 내역이 없어요.'}</p>`;
    bindPeriodTabs(ui);
    return;
  }

  ui.innerHTML = head + renderSummary(d) + d.groups.map((group) => {
    const isExpanded = expandedMarketIds.has(String(group.marketId));
    const badge = SETTLE_BADGE[group.settlementStatus] || SETTLE_BADGE.pending;
    const period = group.eventDateMin === group.eventDateMax
      ? group.eventDateMin : `${group.eventDateMin} ~ ${group.eventDateMax}`;

    return `
    <div class="item-card settle-row">
      <div class="item-card-top">
        <span class="item-card-title">${escapeSettle(group.marketTitle)}</span>
        <span class="settle-badge ${badge.cls}">${badge.label}</span>
      </div>
      <p class="settle-meta">${period} · 부스 ${group.boothCount}칸${
        isHost ? '' : ` · 주최 ${escapeSettle(group.hostNickname)}`}</p>

      <!-- 마켓 단위 금액은 접힌 상태에서도 보여야 합니다.
           예전에는 「자세히 보기」를 눌러야만 숫자가 나왔습니다. -->
      <div class="settle-amounts">
        <span>매출 <b>${won(group.grossAmount)}</b></span>
        ${group.refundAmount > 0 ? `<span class="minus">환불 <b>-${won(group.refundAmount)}</b></span>` : ''}
        <span class="settle-net">${isHost ? '정산' : '지출'} <b>${won(group.netAmount)}</b></span>
      </div>

      <button type="button" class="btn btn-outline btn-sm" data-action="toggle-detail" data-market-id="${group.marketId}">
        ${isExpanded ? '접기' : '부스별 보기'}
      </button>
      <div id="detail-${group.marketId}" class="detail-wrap ${isExpanded ? 'open' : ''}">
        ${isExpanded ? renderGroupDetail(group, isHost) : ''}
      </div>
    </div>`;
  }).join('');

  bindPeriodTabs(ui);
  ui.querySelectorAll('[data-action="toggle-detail"]').forEach((btn) => {
    btn.addEventListener('click', () => handleToggleDetail(btn.dataset.marketId));
  });
}

function bindPeriodTabs(ui) {
  ui.querySelectorAll('[data-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settlementPeriod = btn.dataset.period;
      // 기간을 바꾸면 펼쳐둔 마켓이 목록에서 사라질 수 있어 초기화합니다.
      expandedMarketIds.clear();
      payment_history();
    });
  });
}

function renderGroupDetail(group, isHost) {
  return `
    <div class="item-card-detail">
      <table class="detail-table">
        <thead>
          <tr>
            <th>${isHost ? '판매자' : '부스'}</th>
            <th class="num">결제</th>
            <th class="num">환불</th>
            <th class="num">${isHost ? '정산' : '지출'}</th>
          </tr>
        </thead>
        <tbody>
          ${group.items.map((item) => `
            <tr>
              <td>${escapeSettle(isHost ? item.sellerNickname : (item.boothNumber || item.itemName))}</td>
              <td class="num">${won(item.amount)}</td>
              <td class="num${item.refundAmount > 0 ? ' minus' : ''}">${
                item.refundAmount > 0 ? '-' + won(item.refundAmount) : '-'}</td>
              <td class="num"><b>${won(item.netAmount)}</b></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}
function handleToggleDetail(marketId) {
  const key = String(marketId);
  if (expandedMarketIds.has(key)) {
    expandedMarketIds.delete(key);
  } else {
    expandedMarketIds.add(key);
  }
  renderPaymentGroups();
}

// ============================================
// 알림 관련 유틸
// ============================================
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
// URL 파라미터에서 결제 정보 읽어와 화면에 표시
// (예: payment.html?applicationId=12&amount=20000&orderName=홍대야간플리마켓+부스료)
// ============================================
function getPaymentParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    applicationId: params.get('applicationId'),
    amount: Number(params.get('amount')) || 0,
    orderName: params.get('orderName') || '플리마켓 부스료',
  };
}

function prefillPaymentAmount(amount) {
  const amountEl = document.getElementById('amount');
  if (amountEl) amountEl.textContent = amount.toLocaleString();

  // 부스료 0원(무료 부스)이면 안내 문구/버튼 라벨을 결제가 아닌 등록 확정 흐름으로 표시
  if (amount === 0) {
    const hintEl = document.querySelector('.form-hint');
    if (hintEl) hintEl.textContent = '무료 부스입니다. 등록하기를 누르면 신청이 확정돼요.';

    const btn = document.getElementById('pay-btn');
    if (btn) btn.textContent = '등록하기';
  }
}

// 부스료 0원(무료 부스): 포트원 결제창 없이 바로 서버에 등록 확정 요청
async function handleFreeBoothConfirm(applicationId, btn, originalText) {
  btn.textContent = '등록 확인 중...';

  try {
    const res = await confirmPayment(applicationId, null);
    if (res && res.success) {
      renderAlert('무료 부스 등록이 완료됐어요!', 'success');
      btn.textContent = '등록 완료됨';
    } else {
      renderAlert(res?.message || '등록 처리에 실패했어요. 고객센터에 문의해주세요.');
      btn.disabled = false;
      btn.textContent = originalText;
    }
  } catch (err) {
    console.error('무료 부스 등록 처리 오류:', err);
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ============================================
// 결제 버튼 클릭 -> 포트원 결제창 호출 -> 서버 검증
// ============================================
function handlePaymentClick() {
  const btn = document.getElementById('pay-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    hideAlert();

    const { applicationId, amount, orderName } = getPaymentParamsFromUrl();

    if (!applicationId) {
      renderAlert('신청 정보를 찾을 수 없어요. 부스 신청 화면부터 다시 진행해주세요.');
      return;
    }
    // amount가 음수이거나 숫자가 아닌 경우만 오류로 처리 (0원=무료 부스는 정상 케이스)
    if (amount == null || Number.isNaN(amount) || amount < 0) {
      renderAlert('결제 금액 정보가 올바르지 않아요.');
      return;
    }

    const original = btn.textContent;
    btn.disabled = true;

    // 무료 부스는 포트원 결제 자체를 건너뛰고 바로 서버에 등록 확정 요청
    if (amount === 0) {
      await handleFreeBoothConfirm(applicationId, btn, original);
      return;
    }

    if (typeof PortOne === 'undefined') {
      renderAlert('결제 모듈을 불러오지 못했어요. 새로고침 후 다시 시도해주세요.');
      btn.disabled = false;
      btn.textContent = original;
      return;
    }

    btn.textContent = '결제창 여는 중...';

    // 결제마다 고유해야 하는 결제 ID (충돌 방지를 위해 applicationId + 타임스탬프 조합)
    const paymentId = `application-${applicationId}-${Date.now()}`;

    try {
      // 1) 포트원 결제창 호출
      const response = await PortOne.requestPayment({
        storeId: PORTONE_STORE_ID,
        channelKey: PORTONE_CHANNEL_KEY,
        paymentId: paymentId,
        orderName: orderName,
        totalAmount: amount,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD',
        customer: {
          fullName: '판매자',
        },
      });

      // 결제 실패/취소 시 response.code가 존재함
      if (response == null || response.code != null) {
        renderAlert(response?.message || '결제가 취소되었어요.');
        btn.disabled = false;
        btn.textContent = original;
        return;
      }

      // 2) 결제 완료 -> 반드시 서버에 검증 요청 (프론트 응답만으로 완료 처리하지 않음)
      btn.textContent = '결제 확인 중...';
      const res = await confirmPayment(applicationId, paymentId);
      console.log("res")
      if (res && res.success) {
        renderAlert('결제가 완료됐어요!', 'success');
        btn.textContent = '결제 완료됨';
      } else {
        renderAlert(res?.message || '결제 검증에 실패했어요. 고객센터에 문의해주세요.');
        btn.disabled = false;
        btn.textContent = original;
      }
    } catch (err) {
      console.error('결제 처리 오류:', err);
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
      btn.disabled = false;
      btn.textContent = original;
    }
    setTimeout(() => {
      window.location.href = '../B_host-seller/mybooth';
    }, 1000);
  });
}

// ============================================
// 초기 실행
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const { amount } = getPaymentParamsFromUrl();
  prefillPaymentAmount(amount);
  handlePaymentClick();
});