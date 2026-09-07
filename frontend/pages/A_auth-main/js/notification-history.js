// frontend/pages/A_auth-main/js/notification-history.js
// [알림 내역] 최신순 · 페이지 넘기기 · 역할 전환 · 종류/안읽음 필터
//
// ── 왜 별도 화면인가 ──────────────────────────────────────────────
//   종 버튼은 최근 몇 건만 보여줍니다. "지난주에 온 승인 알림을 다시 보고 싶다" 를
//   할 수 없었습니다. 같은 API 를 페이지 파라미터만 붙여 씁니다.
//
// ── 역할 전환 ─────────────────────────────────────────────────────
//   주최자는 두 역할의 알림을 다 받습니다. 섞여 있으면 어느 쪽 알림인지
//   매번 헷갈리므로 전환 버튼과 배지를 둡니다.
//   판매자 계정은 판매자 알림만 받으므로 전환 버튼 자체를 숨깁니다.
//
// ── 보관 기간 ─────────────────────────────────────────────────────
//   서버가 7일 지난 알림을 지웁니다. 화면에도 그 사실을 적어 두지 않으면
//   "예전 알림이 왜 없지?" 가 됩니다.

(function () {
  'use strict';

  var state = {
    page: 1,
    limit: 20,
    audience: '',
    category: '',
    unreadOnly: false,
    totalPages: 1,
    isHost: false,
  };

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 방금·N분 전·N시간 전·날짜 — 최근 것일수록 상세하게 */
  function timeAgo(value) {
    var d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    var diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return '방금';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** 알림을 누르면 갈 곳. audience 로 화면이 갈립니다. */
  function linkOf(n) {
    if (n.audience === 'host') {
      return n.marketId ? 'https://claude.ai/pages/B_host-seller/market-detail?marketId=' + n.marketId
                        : '../B_host-seller/mymarketpage.html';
    }
    return '../B_host-seller/mybooth.html';
  }

  /* ---------------- 그리기 ---------------- */

  function renderList(rows) {
    var ul = $('nh-list');

    if (!rows || rows.length === 0) {
      ul.innerHTML = '<li class="nh-empty">'
        + (state.unreadOnly || state.category || state.audience
            ? '조건에 맞는 알림이 없어요.'
            : '아직 받은 알림이 없어요.')
        + '</li>';
      return;
    }

    ul.innerHTML = rows.map(function (n) {
      var role = n.audience === 'host' ? '주최자' : '판매자';
      return '<li><a class="nh-item' + (n.isRead ? '' : ' unread') + '"'
        + ' href="' + esc(linkOf(n)) + '" data-id="' + n.notificationId + '">'
        + '<div class="nh-top">'
        + '<span class="nh-badge ' + esc(n.audience) + '">' + role + '</span>'
        + '<span class="nh-title">' + esc(n.title) + '</span>'
        + '<span class="nh-time">' + esc(timeAgo(n.createdAt)) + '</span>'
        + '</div>'
        + '<p class="nh-msg">' + esc(n.message) + '</p>'
        + '</a></li>';
    }).join('');

    // 누르면 읽음 처리하고 이동합니다.
    ul.querySelectorAll('[data-id]').forEach(function (a) {
      a.addEventListener('click', function () {
        // 이동을 막지 않습니다. 읽음 처리가 늦어도 화면 전환은 되어야 합니다.
        callApi('/notifications/' + a.dataset.id + '/read', { method: 'PATCH' })
          .catch(function () { /* 읽음 처리 실패로 이동을 막지 않습니다 */ });
      });
    });
  }

  /**
   * 페이지 버튼.
   *   페이지가 많아지면 전부 그리지 않고 현재 위치 주변만 보여줍니다.
   *   1주일치라 많아야 몇 페이지지만, 알림이 몰리는 주최자는 넘어갈 수 있습니다.
   */
  function renderPager() {
    var nav = $('nh-pager');
    if (state.totalPages <= 1) { nav.innerHTML = ''; return; }

    var cur = state.page;
    var last = state.totalPages;
    var from = Math.max(1, cur - 2);
    var to = Math.min(last, from + 4);
    from = Math.max(1, to - 4);

    var html = '<button type="button" data-page="' + (cur - 1) + '"'
      + (cur === 1 ? ' disabled' : '') + '>이전</button>';
    if (from > 1) html += '<button type="button" data-page="1">1</button>'
      + (from > 2 ? '<button type="button" disabled>…</button>' : '');
    for (var i = from; i <= to; i++) {
      html += '<button type="button" data-page="' + i + '"'
        + (i === cur ? ' class="on"' : '') + '>' + i + '</button>';
    }
    if (to < last) html += (to < last - 1 ? '<button type="button" disabled>…</button>' : '')
      + '<button type="button" data-page="' + last + '">' + last + '</button>';
    html += '<button type="button" data-page="' + (cur + 1) + '"'
      + (cur === last ? ' disabled' : '') + '>다음</button>';

    nav.innerHTML = html;
    nav.querySelectorAll('[data-page]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = Number(b.dataset.page);
        if (!p || p === state.page || p < 1 || p > last) return;
        state.page = p;
        load();
        window.scrollTo(0, 0);
      });
    });
  }

  /* ---------------- 조회 ---------------- */

  async function load() {
    var qs = 'page=' + state.page + '&limit=' + state.limit;
    if (state.audience) qs += '&audience=' + state.audience;
    if (state.category) qs += '&category=' + encodeURIComponent(state.category);
    if (state.unreadOnly) qs += '&unreadOnly=true';

    var res = await callApi('/notifications?' + qs);
    if (!res || !res.success) {
      $('nh-list').innerHTML = '<li class="nh-empty">알림을 불러오지 못했어요.</li>';
      $('nh-pager').innerHTML = '';
      return;
    }

    var page = res.page || { total: (res.data || []).length, totalPages: 1 };
    state.totalPages = page.totalPages || 1;

    $('nh-count').textContent = page.total > 0
      ? '전체 ' + page.total + '건 · ' + state.page + '/' + state.totalPages + '쪽'
      : '';

    renderList(res.data);
    renderPager();
  }

  /** 종류 드롭다운. 서버가 준 목록으로 그려야 화면과 서버가 갈리지 않습니다. */
  async function loadFilters() {
    var res = await callApi('/notifications/filters');
    if (!res || !res.success) return;

    var d = res.data;
    if (d.retentionDays) {
      $('nh-retention').textContent =
        '최근 ' + d.retentionDays + '일간의 알림을 볼 수 있어요. 그보다 오래된 알림은 자동으로 정리돼요.';
    }

    var sel = $('nh-category');
    (d.categories || []).forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.key;
      // 어느 역할의 알림인지 드롭다운에서도 구분되게 합니다.
      o.textContent = (c.role === 'host' ? '[주최자] ' : '[판매자] ') + c.label;
      sel.appendChild(o);
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (typeof ensureSession === 'function') {
      var okSession = await ensureSession(true);
      if (!okSession) return;
    }

    // 주최자 계정만 역할 전환이 필요합니다.
    try {
      var user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
      state.isHost = Number(user.userType) === 1;
    } catch (e) { state.isHost = false; }
    $('nh-roles').hidden = !state.isHost;

    $('nh-roles').addEventListener('click', function (e) {
      var btn = e.target.closest('.nh-role');
      if (!btn) return;
      $('nh-roles').querySelectorAll('.nh-role').forEach(function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      state.audience = btn.dataset.audience || '';
      state.page = 1;   // 필터가 바뀌면 1쪽으로. 안 그러면 빈 페이지가 뜹니다.
      load();
    });

    $('nh-category').addEventListener('change', function () {
      state.category = $('nh-category').value;
      state.page = 1;
      load();
    });

    $('nh-unread').addEventListener('change', function () {
      state.unreadOnly = $('nh-unread').checked;
      state.page = 1;
      load();
    });

    $('nh-read-all').addEventListener('click', async function () {
      await callApi('/notifications/read-all', { method: 'PATCH' });
      load();
    });

    await loadFilters();
    await load();
  });
})();
