// frontend/pages/A_auth-main/js/login-devices.js
// [로그인 기기] 내 계정에 로그인된 기기 목록 — 조회 전용
//
// ── 원격 로그아웃 ─────────────────────────────────────────────────
//   모르는 기기를 발견했을 때 바로 끊을 수 있어야 합니다.
//   다만 **현재 기기는 여기서 끊지 못합니다.** 자기 발밑을 끊고 나면
//   화면이 어떤 상태인지 알 수 없어집니다. 그건 로그아웃 버튼의 몫입니다.
//
//   서버가 "내 세션인지" 를 다시 확인하므로, sessionId 를 알아내도
//   남의 기기는 끊을 수 없습니다.
//
//   끊은 뒤에는 비밀번호 변경을 함께 안내합니다.
//   비밀번호를 그대로 두면 상대가 다시 로그인할 수 있습니다.
//
// ── 서버가 이미 가공해서 줍니다 ───────────────────────────────────
//   기기 이름(Windows · Chrome)과 IP 마스킹(192.168.0.*)은 서버에서 처리합니다.
//   화면이 User-Agent 를 파싱하면, 나중에 관리자 화면에서도 같은 파싱을 또 만들게 됩니다.

(function () {
  'use strict';

  // 기기 종류별 아이콘. 서버가 deviceKind 로 desktop/mobile/tablet 을 줍니다.
  var ICONS = { desktop: '💻', mobile: '📱', tablet: '📱', unknown: '🖥️' };

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 방금 · N분 전 · N시간 전 · 날짜 */
  function timeAgo(value) {
    var d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    var diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return '방금 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    return Math.floor(diff / 86400) + '일 전';
  }

  function formatDate(value) {
    var d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function render(data) {
    var list = data.sessions || [];
    var ul = $('ld-list');

    if (list.length === 0) {
      ul.innerHTML = '<li class="ld-empty">로그인된 기기 정보가 없어요.</li>';
      return;
    }

    // 현재 기기를 맨 위로 올립니다. 자기 기기를 먼저 확인하고
    // 나머지 중에 모르는 것이 있는지 보는 순서가 자연스럽습니다.
    list.sort(function (a, b) {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
    });

    ul.innerHTML = list.map(function (s) {
      return '<li class="ld-item' + (s.current ? ' current' : '') + '">'
        + '<span class="ld-icon" aria-hidden="true">' + (ICONS[s.deviceKind] || ICONS.unknown) + '</span>'
        + '<div class="ld-body">'
        + '<div class="ld-name">' + esc(s.deviceLabel)
        + (s.current ? '<span class="ld-now">현재 기기</span>' : '') + '</div>'
        + '<div class="ld-meta">'
        + 'IP <span class="ld-ip">' + esc(s.ipMasked || '알 수 없음') + '</span><br />'
        + '마지막 사용 ' + esc(timeAgo(s.lastUsedAt)) + '<br />'
        + '로그인 ' + esc(formatDate(s.issuedAt))
        + '</div>'
        + (s.current ? '' :
            '<button type="button" class="ld-kick" data-sid="' + esc(s.sessionId) + '">로그아웃</button>')
        + '</div></li>';
    }).join('');

    // 개별 로그아웃
    ul.querySelectorAll('[data-sid]').forEach(function (btn) {
      btn.addEventListener('click', function () { kick(btn); });
    });

    var other = list.filter(function (s) { return !s.current; }).length;
    $('ld-info').innerHTML =
      '로그인 유지 기간은 <b>' + esc(String(data.refreshTokenTtlDays || 14)) + '일</b>이에요. '
      + '그 뒤에는 자동으로 로그아웃돼요.<br />'
      + (other > 0
          ? '현재 기기 외에 <b>' + other + '대</b>가 더 로그인되어 있어요.'
          : '현재 기기에서만 로그인되어 있어요.');

    var all = $('ld-kick-all');
    if (all) all.hidden = other === 0;   // 끊을 기기가 없으면 버튼을 숨깁니다
  }

  /** 기기 하나 로그아웃 */
  async function kick(btn) {
    var name = btn.closest('.ld-item')?.querySelector('.ld-name')?.textContent.trim() || '이 기기';
    if (!window.confirm(name + '에서 로그아웃할까요?\n\n모르는 기기라면 로그아웃 후 비밀번호도 함께 바꿔 주세요.')) return;

    btn.disabled = true;
    btn.textContent = '처리 중…';

    var res = await callApi('/auth/sessions/' + encodeURIComponent(btn.dataset.sid), { method: 'DELETE' });
    if (!res || !res.success) {
      banner('error', (res && res.message) || '로그아웃하지 못했어요.');
      btn.disabled = false;
      btn.textContent = '로그아웃';
      return;
    }
    // 끊은 것으로 끝내지 않고 비밀번호 변경을 권합니다.
    banner('warn', res.message + ' 모르는 기기였다면 비밀번호도 바꿔 주세요.');
    load();
  }

  /** 현재 기기만 남기고 모두 로그아웃 */
  async function kickAll() {
    if (!window.confirm('현재 기기만 남기고 모두 로그아웃할까요?')) return;

    var res = await callApi('/auth/sessions', { method: 'DELETE' });
    if (!res || !res.success) {
      banner('error', (res && res.message) || '로그아웃하지 못했어요.');
      return;
    }
    banner('warn', res.message + ' 모르는 기기가 있었다면 비밀번호도 바꿔 주세요.');
    load();
  }

  function banner(kind, text) {
    var el = $('ld-banner');
    el.className = 'ld-banner ' + kind;
    el.textContent = text;
    el.hidden = false;
  }

  async function load() {
    var res;
    try {
      res = await callApi('/auth/sessions');
    } catch (e) {
      $('ld-list').innerHTML = '';
      banner('error', '서버에 연결할 수 없어요.');
      return;
    }

    if (!res || !res.success) {
      $('ld-list').innerHTML = '';
      banner('error', (res && res.message) || '기기 목록을 불러오지 못했어요.');
      return;
    }

    render(res.data || {});
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (typeof ensureSession === 'function') {
      var okSession = await ensureSession(true);
      if (!okSession) return;
    }
    $('ld-refresh').addEventListener('click', function () { $('ld-banner').hidden = true; load(); });
    $('ld-kick-all').addEventListener('click', kickAll);
    load();
  });
})();
