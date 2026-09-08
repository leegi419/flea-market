// frontend/common/js/toast.js
// [알림 토스트] 화면 우측 하단에 결과를 띄웁니다.
//
// ── 왜 만들었나 ───────────────────────────────────────────────────
//   결과 메시지가 화면 **맨 위** alert-box 에만 떴습니다.
//   마켓 등록·수정처럼 폼이 긴 화면에서는 아래쪽 버튼을 누르고 나서
//   위로 스크롤해야 성공했는지 알 수 있었습니다.
//   버튼을 누른 자리 근처에 떠야 확인하러 올라가지 않습니다.
//
// ── 기존 코드를 안 고치는 이유 ────────────────────────────────────
//   renderAlert() 호출부가 수십 군데입니다. 하나씩 고치면 반드시 빠뜨립니다.
//   그래서 각 파일의 renderAlert 안에서 이 함수를 부르게만 했습니다.
//
// ── 성공은 사라지고 실패는 남습니다 ───────────────────────────────
//   성공은 확인하면 끝이지만, 실패는 읽고 조치해야 합니다.
//   3초 뒤 사라지면 못 읽고 놓칠 수 있습니다.

(function () {
  'use strict';

  var HIDE_AFTER_MS = 3000;   // 성공 메시지가 사라지기까지
  var MAX_ITEMS = 3;          // 화면을 덮지 않도록 동시에 보이는 개수 제한

  function ensureRoot() {
    var root = document.getElementById('toast-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'toast-root';
    // 화면 낭독기가 새 메시지를 읽도록 알립니다.
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
    return root;
  }

  /**
   * @param {string} message 보여줄 문구
   * @param {'success'|'error'|'warn'} [type]
   */
  function show(message, type) {
    var text = String(message == null ? '' : message).trim();
    if (!text) return;

    var kind = type === 'success' ? 'success' : type === 'warn' ? 'warn' : 'error';
    var root = ensureRoot();

    // 같은 문구가 연달아 뜨면 하나로 둡니다. (폴링·중복 호출 대비)
    var last = root.lastElementChild;
    if (last && last.dataset.msg === text) return;

    var el = document.createElement('div');
    el.className = 'toast toast-' + kind;
    el.dataset.msg = text;
    el.innerHTML = '<span class="toast-icon" aria-hidden="true">'
      + (kind === 'success' ? '✅' : kind === 'warn' ? '⚠️' : '❌') + '</span>'
      + '<span class="toast-text"></span>'
      + '<button type="button" class="toast-close" aria-label="닫기">&times;</button>';
    el.querySelector('.toast-text').textContent = text;   // 사용자 입력이 섞일 수 있어 textContent

    function remove() {
      if (!el.parentNode) return;
      el.classList.add('is-leaving');
      setTimeout(function () { if (el.parentNode) el.remove(); }, 200);
    }
    el.querySelector('.toast-close').addEventListener('click', remove);

    root.appendChild(el);

    // 오래된 것부터 정리합니다.
    while (root.children.length > MAX_ITEMS) root.firstElementChild.remove();

    // 성공만 자동으로 사라집니다. 실패·경고는 사용자가 닫습니다.
    if (kind === 'success') setTimeout(remove, HIDE_AFTER_MS);
  }

  function clear() {
    var root = document.getElementById('toast-root');
    if (root) root.innerHTML = '';
  }

  window.Toast = { show: show, clear: clear };
})();
