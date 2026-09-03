// frontend/pages/B_host-seller/js/checkin-pass.js
// [현장 QR 체크인 - 판매자] 내 입장 QR + 6자리 코드를 띄우는 화면.
//
// 이 화면은 "보여주기" 전용입니다. 여기서 출석이 기록되지 않습니다.
// 주최자가 이 QR 을 찍어야(또는 코드를 입력해야) 비로소 출석이 남습니다.
// 그래서 판매자 혼자서는 출석을 만들 수 없고, 다중 접속으로 한꺼번에 처리되는 일도 없습니다.
//
// QR 은 90초 뒤 만료되고 화면은 45초마다 새로 받습니다.
// 화면을 캡처해 남에게 보내도 곧 못 쓰게 하기 위한 것입니다.

(function () {
  'use strict';

  var els = {};
  var state = {
    marketId: null,
    eventDate: null,
    expiresAt: 0,
    ttlSec: 90,
    refreshSec: 45,
    refreshTimer: null,
    tickTimer: null,
    lastToken: null,
    alreadyCheckedIn: false,
  };

  function $(id) { return document.getElementById(id); }

  function banner(kind, text) {
    if (!els.banner) return;
    els.banner.className = 'chk-banner ' + kind;
    els.banner.textContent = text;
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function todayStr() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /** '2026-08-29 10:14:22' / ISO 어느 쪽이 와도 "8/29 10:14:22" 로 */
  function formatCheckinTime(value) {
    if (!value) return '';
    var d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' '
      + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ---------------- QR 그리기 ---------------- */

  function drawQr(text) {
    var box = $('chk-qr');
    if (!box) return;

    if (typeof window.qrcode !== 'function') {
      // 라이브러리가 안 실려도 화면 전체가 죽지는 않게 합니다. (숫자 코드로 대체 가능)
      box.innerHTML = '<p class="chk-muted">QR 을 그릴 수 없어요.<br />아래 6자리 숫자를 알려 주세요.</p>';
      return;
    }
    // typeNumber 0 = 데이터 길이에 맞춰 자동 선택, 오류정정 M
    var qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 1, scalable: true });
    box.classList.remove('chk-qr-dim');
  }

  function dimQr() {
    var box = $('chk-qr');
    if (box) box.classList.add('chk-qr-dim');
  }

  /* ---------------- 남은 시간 표시 ---------------- */

  function tick() {
    if (!state.expiresAt) return;
    var leftMs = state.expiresAt - Date.now();
    var leftSec = Math.max(0, Math.ceil(leftMs / 1000));
    var pct = Math.max(0, Math.min(100, (leftMs / (state.ttlSec * 1000)) * 100));

    if (els.timerFill) els.timerFill.style.width = pct + '%';
    if (els.timerText) {
      els.timerText.textContent = leftSec > 0
        ? 'QR 유효시간 ' + leftSec + '초 — 자동으로 새로 만들어져요'
        : 'QR 을 새로 받는 중이에요…';
    }
    if (leftSec <= 0) dimQr();
  }

  /* ---------------- 서버에서 패스 받기 ---------------- */

  function renderBooths(booths) {
    if (!els.boothList) return;
    els.boothList.innerHTML = (booths || []).map(function (b) {
      return '<li><span class="chk-booth">' + escapeHtml(b.boothNumber) + '</span>'
        + '<span class="chk-name chk-grow">' + escapeHtml(b.itemName || '-') + '</span>'
        + '<span class="chk-tag ' + (b.status === 'Paid' ? 'in' : 'out') + '">'
        + (b.status === 'Paid' ? '결제완료' : '승인됨') + '</span></li>';
    }).join('');
    els.boothCard.hidden = (booths || []).length === 0;
  }

  async function loadPass() {
    var qs = '?marketId=' + encodeURIComponent(state.marketId);
    if (state.eventDate) qs += '&eventDate=' + encodeURIComponent(state.eventDate);

    var res = await callApi('/checkin/pass' + qs);

    if (!res || !res.success) {
      dimQr();
      els.qrCard.hidden = true;
      banner('error', (res && res.message) || '입장 QR 을 불러오지 못했어요.');
      return;
    }

    var d = res.data || {};

    // 마켓 정보
    els.marketCard.hidden = false;
    els.marketTitle.textContent = d.market ? d.market.title : '-';
    var range = d.market
      ? (d.market.eventDateMin === d.market.eventDateMax
          ? d.market.eventDateMin
          : d.market.eventDateMin + ' ~ ' + d.market.eventDateMax)
      : '';
    els.marketMeta.textContent = '개최 ' + range
      + (d.market && d.market.locationName ? ' · ' + d.market.locationName : '')
      + ' · 오늘 기준 ' + (d.eventDate || '-');

    renderBooths(d.booths);

    // 주최자가 QR 을 찍으면 여기서 바로 「참여 완료」로 바뀝니다.
    // QR 은 계속 보여줍니다 — 부스를 나중에 하나 더 승인받는 경우가 있어서,
    // 다시 찍어도 문제가 없기 때문입니다.
    if (d.alreadyCheckedIn) {
      var at = formatCheckinTime(d.checkedInAt);
      banner('ok', '✅ 참여 완료 — 부스 ' + d.checkedInBooths + '칸'
        + (at ? ' · ' + at + ' 확인' : ''));
    } else if (!d.sessionOpen) {
      banner('warn', d.message || '아직 주최자가 체크인을 시작하지 않았어요.');
    } else if (!d.isToday) {
      banner('warn', '오늘 날짜가 아니에요. 개최 당일에 다시 열어 주세요.');
    } else {
      banner('neutral', '주최자에게 이 화면을 보여 주세요.');
    }

    // 세션이 안 열렸으면 QR 자체가 없습니다.
    state.alreadyCheckedIn = !!d.alreadyCheckedIn;
    if (!d.sessionOpen || !d.token) {
      els.qrCard.hidden = true;
      state.expiresAt = 0;
      scheduleRefresh(); // 주최자가 곧 체크인을 열 수 있으므로 계속 지켜봅니다
      return;
    }

    els.qrCard.hidden = false;
    if (d.token !== state.lastToken) {
      drawQr(d.token);
      state.lastToken = d.token;
    }
    state.expiresAt = d.expiresAt || 0;
    state.ttlSec = d.ttlSec || 90;
    state.refreshSec = d.refreshSec || 45;
    state.alreadyCheckedIn = !!d.alreadyCheckedIn;

    els.code.textContent = d.code ? String(d.code).replace(/(\d{3})(\d{3})/, '$1 $2') : '------';
    els.codeHint.textContent = '약 ' + (d.codeSecondsLeft || 60) + '초 후 새 숫자로 바뀌어요';

    tick();
    scheduleRefresh();
  }

  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);

    // 아직 체크인 전이면 5초마다 확인합니다.
    //   주최자가 QR 을 찍은 뒤 판매자 화면이 45초 동안 그대로면
    //   "찍었는데 왜 안 바뀌지?" 하고 다시 줄을 서게 됩니다.
    // 체크인이 끝난 뒤에는 QR 갱신 주기(45초)로 돌아갑니다. 급할 게 없습니다.
    var wait = state.alreadyCheckedIn ? state.refreshSec : 5;

    state.refreshTimer = setTimeout(function () {
      if (document.hidden) {
        // 화면이 가려져 있으면 굳이 부르지 않고, 돌아왔을 때 즉시 받습니다. (배터리/요청 절약)
        scheduleRefresh();
        return;
      }
      loadPass();
    }, wait * 1000);
  }

  /* ---------------- 시작 ---------------- */

  document.addEventListener('DOMContentLoaded', async function () {
    els = {
      banner: $('chk-banner'),
      marketCard: $('chk-market-card'),
      marketTitle: $('chk-market-title'),
      marketMeta: $('chk-market-meta'),
      qrCard: $('chk-qr-card'),
      boothCard: $('chk-booth-card'),
      boothList: $('chk-booth-list'),
      code: $('chk-code'),
      codeHint: $('chk-code-hint'),
      timerFill: $('chk-timer-fill'),
      timerText: $('chk-timer-text'),
    };

    var params = new URLSearchParams(window.location.search);
    state.marketId = Number(params.get('marketId'));
    state.eventDate = params.get('eventDate') || todayStr();

    if (!state.marketId) {
      banner('error', '어느 마켓인지 알 수 없어요. 「내 부스 관리」에서 다시 들어와 주세요.');
      return;
    }

    // 로그인 필수 — 누가 입장하는지 모르면 QR 을 만들 수 없습니다.
    if (typeof ensureSession === 'function') {
      var okSession = await ensureSession(true);
      if (!okSession) return;
    }

    $('chk-refresh').addEventListener('click', loadPass);

    // 화면으로 돌아오면 바로 갱신 (QR 이 만료된 채 보이는 상황을 막습니다)
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) loadPass();
    });

    state.tickTimer = setInterval(tick, 1000);
    loadPass();
  });
})();
