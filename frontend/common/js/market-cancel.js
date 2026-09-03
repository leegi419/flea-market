// frontend/common/js/market-cancel.js
// [마켓 취소 + 전액 환불] 미리보기 -> 확인 모달 -> 실행
//
// 왜 공용 파일로 두는가
//   취소 버튼이 「마켓 상세」와 「내 마켓 관리」 두 곳에 있습니다.
//   각자 모달을 만들면 금액 계산과 문구가 갈리고, 한쪽만 고치는 일이 생깁니다.
//   여기 한 곳만 두고 양쪽이 window.MarketCancel.run() 을 부릅니다.
//
// 왜 window.confirm 이 아닌가
//   confirm 은 한 줄 문장만 보여줍니다. "부스 5건 75,000원을 환불합니다" 같은
//   표를 보여줄 수 없어서, 주최자가 금액을 모른 채 되돌릴 수 없는 작업을 누르게 됩니다.
//   별도 HTML 파일 없이 이 스크립트가 모달을 만들어 띄웁니다.
//
// 서버도 같은 확인을 요구합니다 (confirmRefund 없으면 409).
// 화면만 막으면 API 를 직접 호출해 건너뛸 수 있기 때문입니다.

(function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function won(n) {
    return (Number(n) || 0).toLocaleString('ko-KR') + '원';
  }

  /** 환불 예상 내역 조회 (DB 를 바꾸지 않습니다) */
  async function fetchPreview(marketId) {
    return callApi('/markets/' + encodeURIComponent(marketId) + '/cancel-preview');
  }

  /** 취소 사유 목록 (서버가 검증에 쓰는 것과 같은 목록) */
  async function fetchReasons() {
    try {
      var res = await callApi('/markets/cancel-reasons');
      if (res && res.success && Array.isArray(res.data)) return res.data;
    } catch (err) { /* 아래 기본값으로 대체 */ }
    // 목록을 못 받아도 취소는 할 수 있어야 하므로 최소한의 기본값을 둡니다.
    // 서버가 코드를 검증하므로 여기 값이 틀리면 400 으로 걸립니다.
    return [{ code: 'other', label: '기타 (직접 입력)' }];
  }

  /** 실제 취소 실행. confirmRefund 와 사유를 함께 보냅니다. */
  async function requestCancel(marketId, reason) {
    return callApi('/markets/closed/' + encodeURIComponent(marketId), {
      method: 'PATCH',
      body: {
        confirmRefund: true,
        cancelReasonCode: reason.code,
        cancelReasonDetail: reason.detail,
      },
    });
  }

  function buildTable(preview) {
    if (!preview || !preview.byBoothType || preview.byBoothType.length === 0) {
      return '<p class="mc-empty">신청자가 없어요. 환불할 결제 건도 없습니다.</p>';
    }

    var rows = preview.byBoothType.map(function (g) {
      return '<tr>'
        + '<td>' + esc(g.boothTypeName) + '</td>'
        + '<td class="num">' + (g.paidCount || 0) + '건</td>'
        + '<td class="num">' + (g.unpaidCount || 0) + '건</td>'
        + '<td class="num">' + won(g.refundTotal) + '</td>'
        + '</tr>';
    }).join('');

    return '<table class="mc-table">'
      + '<thead><tr><th>부스 종류</th><th class="num">결제됨</th>'
      + '<th class="num">미결제</th><th class="num">환불 금액</th></tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '<tfoot><tr><th>합계</th>'
      + '<th class="num">' + (preview.refundCount || 0) + '건</th>'
      + '<th class="num">' + (preview.unpaidCount || 0) + '건</th>'
      + '<th class="num">' + won(preview.refundTotal) + '</th></tr></tfoot>'
      + '</table>';
  }

  /**
   * 확인 모달을 띄우고 사용자의 선택을 기다립니다.
   * @returns {Promise<boolean>} 「예」를 누르면 true
   */
  function showConfirm(preview, opts) {
    var reasons = (opts && opts.reasons) || [];
    return new Promise(function (resolve) {
      var hasRefund = preview && preview.refundCount > 0;
      var failedNote = opts && opts.previewFailed
        // 미리보기를 못 불러온 것과 "신청자가 없는 것"은 전혀 다릅니다.
        // 구분하지 않으면 주최자가 금액을 0원으로 오해한 채 누르게 됩니다.
        ? '<p class="mc-warn">환불 예상 내역을 불러오지 못했어요. '
          + '결제된 부스가 있다면 그대로 환불되니, 확인 후 진행해 주세요.</p>'
        : '';

      var overlay = document.createElement('div');
      overlay.className = 'mc-overlay';
      overlay.innerHTML =
        '<div class="mc-modal" role="dialog" aria-modal="true" aria-labelledby="mc-title">'
        + '<h2 id="mc-title">마켓을 취소할까요?</h2>'
        + '<p class="mc-sub">' + esc((preview && preview.marketTitle) || '') + '</p>'
        + failedNote
        + buildTable(preview)
        + (hasRefund
            ? '<p class="mc-notice"><b>결제된 부스 ' + preview.refundCount + '건('
              + won(preview.refundTotal) + ')을 환불해야 합니다.</b><br />진행하시겠습니까?</p>'
            : '<p class="mc-notice">환불할 결제 건은 없어요. 마켓만 취소됩니다.<br />진행하시겠습니까?</p>')
        + '<p class="mc-caution">취소한 마켓은 되돌릴 수 없어요. 환불은 항상 전액입니다.</p>'
        // [취소 사유] 판매자에게 그대로 전달되고 마켓에 계속 표기됩니다.
        + '<div class="mc-reason">'
        + '<label for="mc-reason-code">취소 사유 <span class="mc-req">필수</span></label>'
        + '<select id="mc-reason-code">'
        + '<option value="">사유를 선택해 주세요</option>'
        + reasons.map(function (r) {
            return '<option value="' + esc(r.code) + '">' + esc(r.label) + '</option>';
          }).join('')
        + '</select>'
        + '<textarea id="mc-reason-detail" rows="3" maxlength="300" '
        + 'placeholder="판매자에게 전달할 설명을 적어 주세요."></textarea>'
        + '<p class="mc-reason-hint" id="mc-reason-hint">이 내용은 판매자에게 그대로 전달되고, 취소된 마켓에 계속 표시돼요.</p>'
        + '<p class="mc-reason-error" id="mc-reason-error" hidden></p>'
        + '</div>'
        + '<div class="mc-actions">'
        + '<button type="button" class="mc-btn mc-no" data-mc="no">아니오, 마켓 취소를 하지 않겠습니다</button>'
        + '<button type="button" class="mc-btn mc-yes" data-mc="yes">예, 환불하고 취소하겠습니다</button>'
        + '</div>'
        + '<div class="mc-progress" hidden>처리 중이에요… 잠시만 기다려 주세요.</div>'
        + '</div>';

      document.body.appendChild(overlay);
      document.body.classList.add('mc-open');

      var done = false;
      function close(answer) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey);
        document.body.classList.remove('mc-open');
        overlay.remove();
        resolve(answer);
      }

      function onKey(e) {
        if (e.key === 'Escape') close(false); // ESC 는 "아니오" 와 같습니다
      }
      document.addEventListener('keydown', onKey);

      overlay.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-mc]');
        if (btn) {
          if (btn.dataset.mc === 'yes') {
            var picked = codeEl.value;
            var detail = (detailEl.value || '').trim();
            var errEl = overlay.querySelector('#mc-reason-error');

            // 서버도 같은 검증을 하지만, 여기서 먼저 막아야
            // 사유를 안 고른 채 환불이 시작되는 일이 없습니다.
            if (!picked) {
              errEl.textContent = '취소 사유를 선택해 주세요.';
              errEl.hidden = false;
              codeEl.focus();
              return;
            }
            if (picked === 'other' && detail.length < 5) {
              errEl.textContent = '기타 사유는 5자 이상 적어 주세요. 판매자에게 그대로 전달됩니다.';
              errEl.hidden = false;
              detailEl.focus();
              return;
            }
            errEl.hidden = true;

            // 두 번 눌러 환불이 두 번 나가지 않도록 즉시 잠급니다.
            overlay.querySelectorAll('.mc-btn').forEach(function (b) { b.disabled = true; });
            overlay.querySelector('.mc-progress').hidden = false;
            close({ code: picked, detail: detail });
          } else {
            close(false);
          }
          return;
        }
        // 바깥을 눌러도 닫히게 하되, 실수로 취소가 실행되지는 않습니다.
        if (e.target === overlay) close(false);
      });

      var codeEl = overlay.querySelector('#mc-reason-code');
      var detailEl = overlay.querySelector('#mc-reason-detail');
      var hintEl = overlay.querySelector('#mc-reason-hint');

      codeEl.addEventListener('change', function () {
        var isOther = codeEl.value === 'other';
        detailEl.placeholder = isOther
          ? '취소 사유를 직접 적어 주세요. (5자 이상)'
          : '덧붙일 설명이 있으면 적어 주세요. (선택)';
        hintEl.textContent = isOther
          ? '직접 적은 내용이 그대로 판매자에게 전달돼요.'
          : '이 내용은 판매자에게 그대로 전달되고, 취소된 마켓에 계속 표시돼요.';
        overlay.querySelector('#mc-reason-error').hidden = true;
      });

      // 위험한 버튼에 처음 포커스가 가지 않도록 「아니오」에 둡니다.
      var no = overlay.querySelector('.mc-no');
      if (no) no.focus();
    });
  }

  /**
   * 취소 전체 흐름.
   * @param {number|string} marketId
   * @param {{onSuccess?:function, onError?:function}} [handlers]
   */
  async function run(marketId, handlers) {
    handlers = handlers || {};

    var preview = null;
    var previewFailed = false;
    try {
      var pre = await fetchPreview(marketId);
      if (pre && pre.success) preview = pre.data;
      else previewFailed = true;
    } catch (err) {
      previewFailed = true;
    }

    var reasons = await fetchReasons();
    var agreed = await showConfirm(preview, { previewFailed: previewFailed, reasons: reasons });
    if (!agreed) return { cancelled: true };

    try {
      var res = await requestCancel(marketId, agreed);
      if (res && res.success) {
        if (handlers.onSuccess) handlers.onSuccess(res);
        return { ok: true, res: res };
      }
      var msg = (res && res.message) || '마켓을 취소하지 못했어요.';
      if (handlers.onError) handlers.onError(msg, res);
      else window.alert(msg);
      return { ok: false, res: res };
    } catch (err) {
      var m = '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.';
      if (handlers.onError) handlers.onError(m);
      else window.alert(m);
      return { ok: false };
    }
  }

  window.MarketCancel = { run: run, showConfirm: showConfirm, fetchPreview: fetchPreview, fetchReasons: fetchReasons, requestCancel: requestCancel };
})();
