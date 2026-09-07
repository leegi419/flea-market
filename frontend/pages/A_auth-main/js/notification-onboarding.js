// frontend/pages/A_auth-main/js/notification-onboarding.js
// [가입 직후 알림 설정] 주최자는 2단계, 판매자는 1단계.
//
// ── 왜 역할별로 창을 나누는가 ─────────────────────────────────────
//   이 사이트는 주최자도 판매자로 전환해 부스를 신청할 수 있습니다.
//   두 역할의 알림을 한 화면에 섞어 놓으면 "이게 내가 주최한 마켓 알림인지,
//   내가 참가하는 마켓 알림인지" 를 매번 헷갈리게 됩니다.
//   그래서 단계를 나누고 각 단계에 역할 배지를 붙였습니다.
//
// ── 왜 가입 직후에만 보여주는가 ───────────────────────────────────
//   로그인할 때마다 뜨면 성가십니다. "봤는지" 를 저장하려면 컬럼이 하나 더 늘고,
//   그걸 관리하는 코드도 따라 붙습니다.
//   가입 흐름에서 한 번만 보여주면 컬럼 없이도 충분합니다.
//   다시 보고 싶으면 마이페이지 → 알림 설정으로 언제든 들어갈 수 있습니다.
//
// ── 「나중에 하기」를 눌러도 알림은 정상 동작합니다 ───────────────
//   설정 행이 없으면 서버가 "켜짐" 으로 봅니다.
//   설정을 안 했다고 알림이 안 가면, 승인·환불처럼 놓치면 안 되는 것까지 놓칩니다.

(function () {
  'use strict';

  var ROLE_META = {
    host:   { badge: '주최자', cls: 'host',
              title: '주최자 알림',
              sub: '내가 <b>주최한 마켓</b>에서 오는 알림이에요.' },
    seller: { badge: '판매자', cls: 'seller',
              title: '판매자 알림',
              sub: '내가 <b>참가하는 마켓</b>에서 오는 알림이에요.' },
  };

  var state = {
    steps: [],        // 이 사용자가 거칠 역할 순서
    index: 0,
    data: null,       // 현재 단계의 서버 응답
    regions: new Set(),
    allRegions: [],
    leadHours: 1,
    notifyHour: 10,
  };

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function banner(kind, text) {
    var el = $('ns-banner');
    el.className = 'ns-banner ' + kind;
    el.textContent = text;
    el.hidden = false;
  }

  function leadLabel(h) { return h >= 24 ? '24시간 전 (최대)' : h + '시간 전'; }

  function hourLabel(h) {
    return h < 12 ? '오전 ' + (h === 0 ? 12 : h) + '시'
                  : '오후 ' + (h === 12 ? 12 : h - 12) + '시';
  }

  /* ---------------- 그리기 ---------------- */

  function renderHeader() {
    var role = state.steps[state.index];
    var meta = ROLE_META[role];

    // 주최자는 2단계라 "1/2" 를 보여줍니다. 판매자는 한 단계뿐이라 숨깁니다.
    var stepEl = $('onb-step');
    if (state.steps.length > 1) {
      stepEl.textContent = (state.index + 1) + ' / ' + state.steps.length;
      stepEl.hidden = false;
    } else {
      stepEl.hidden = true;
    }

    $('onb-title').innerHTML = esc(meta.title)
      + '<span class="ns-role-badge ' + meta.cls + '">' + meta.badge + '</span>';
    $('onb-sub').innerHTML = meta.sub;

    // 마지막 단계에서만 「완료」로 바꿉니다.
    $('onb-next').textContent = (state.index === state.steps.length - 1) ? '완료' : '다음';
  }

  function renderList() {
    var list = state.data.categories || [];

    $('ns-list').innerHTML = list.map(function (c) {
      var sub = '';

      if (c.hasLeadHours) {
        sub = '<div class="ns-sub" data-sub="' + c.key + '"' + (c.enabled ? '' : ' hidden') + '>'
          + '<div class="ns-lead-row">'
          + '<label for="ns-lead">마감 몇 시간 전에 알릴까요?</label>'
          + '<input type="range" id="ns-lead" min="' + state.data.leadHoursMin + '" max="'
          + state.data.leadHoursMax + '" step="1" value="' + state.leadHours + '" />'
          + '<span class="ns-lead-value" id="ns-lead-value">' + leadLabel(state.leadHours) + '</span>'
          + '</div></div>';
      }

      if (c.hasNotifyHour) {
        var opts = '';
        for (var h = 0; h < 24; h++) {
          opts += '<option value="' + h + '"' + (h === state.notifyHour ? ' selected' : '') + '>'
            + hourLabel(h) + '</option>';
        }
        sub = '<div class="ns-sub" data-sub="' + c.key + '"' + (c.enabled ? '' : ' hidden') + '>'
          + '<div class="ns-lead-row"><label for="ns-hour">몇 시에 받을까요?</label>'
          + '<select id="ns-hour">' + opts + '</select></div></div>';
      }

      if (c.hasRegions) {
        var all = state.regions.size === 0;
        sub = '<div class="ns-sub" data-sub="' + c.key + '"' + (c.enabled ? '' : ' hidden') + '>'
          + '<div class="ns-region-mode">'
          + '<label><input type="radio" name="ns-region-mode" value="all"' + (all ? ' checked' : '') + ' /> 모든 지역 받기</label>'
          + '<label><input type="radio" name="ns-region-mode" value="pick"' + (all ? '' : ' checked') + ' /> 지역 선택하기</label>'
          + '</div>'
          // 지역이 17개라 하나씩 누르면 번거롭습니다. 일괄 버튼을 둡니다.
          + '<div class="ns-region-bulk" id="ns-region-bulk"' + (all ? ' hidden' : '') + '>'
          + '<button type="button" data-region-all="on">전체 선택</button>'
          + '<button type="button" data-region-all="off">전체 해제</button>'
          + '<span class="ns-region-picked" id="ns-region-picked"></span>'
          + '</div>'
          + '<div class="ns-regions" id="ns-regions"' + (all ? ' hidden' : '') + '>'
          + state.allRegions.map(function (r) {
              return '<button type="button" class="ns-region' + (state.regions.has(r) ? ' on' : '')
                + '" data-region="' + esc(r) + '">' + esc(r) + '</button>';
            }).join('')
          + '</div></div>';
      }

      return '<div class="ns-item">'
        + '<div class="ns-head"><div class="ns-texts">'
        + '<div class="ns-label">' + esc(c.label)
        + (c.locked ? '<span class="ns-lock">필수</span>' : '') + '</div>'
        + '<div class="ns-desc">' + esc(c.description)
        + (c.locked ? '<br />결제한 부스가 취소·환불되는 상황이라 항상 받아요.' : '')
        + '</div></div>'
        + '<span class="ns-toggle">'
        + '<input type="checkbox" data-key="' + c.key + '"' + (c.enabled ? ' checked' : '')
        + (c.locked ? ' disabled' : '') + ' aria-label="' + esc(c.label) + '" />'
        + '<span class="ns-track"></span></span>'
        + '</div>' + sub + '</div>';
    }).join('');

    bind();
  }

  /** 고른 지역 수를 보여줍니다. 17개 중 몇 개인지 한눈에 보이게. */
  function updatePickedCount() {
    var el = document.getElementById('ns-region-picked');
    if (!el) return;
    var n = state.regions.size;
    el.textContent = n === 0 ? '아직 고른 지역이 없어요 (전체 알림)' : n + '개 지역 선택';
  }

  function bind() {
    var root = $('ns-list');

    root.querySelectorAll('input[data-key]').forEach(function (el) {
      el.addEventListener('change', function () {
        var sub = root.querySelector('[data-sub="' + el.dataset.key + '"]');
        if (sub) sub.hidden = !el.checked;
      });
    });

    var lead = $('ns-lead');
    if (lead) {
      lead.addEventListener('input', function () {
        state.leadHours = Number(lead.value);
        $('ns-lead-value').textContent = leadLabel(state.leadHours);
      });
    }

    var hour = $('ns-hour');
    if (hour) hour.addEventListener('change', function () { state.notifyHour = Number(hour.value); });

    root.querySelectorAll('input[name="ns-region-mode"]').forEach(function (el) {
      el.addEventListener('change', function () {
        var pick = el.value === 'pick';
        var box = $('ns-regions');
        if (box) box.hidden = !pick;
        var bulk = $('ns-region-bulk');
        if (bulk) bulk.hidden = !pick;
        if (!pick) {
          // "모든 지역" 을 고르면 선택을 비웁니다. 서버는 지역 행이 없으면 전체로 봅니다.
          state.regions.clear();
          if (box) box.querySelectorAll('.ns-region').forEach(function (b) { b.classList.remove('on'); });
        }
      });
    });

    root.querySelectorAll('[data-region-all]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var on = btn.dataset.regionAll === 'on';
        state.regions.clear();
        root.querySelectorAll('.ns-region').forEach(function (b) {
          b.classList.toggle('on', on);
          if (on) state.regions.add(b.dataset.region);
        });
        updatePickedCount();
      });
    });

    root.querySelectorAll('.ns-region').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = btn.dataset.region;
        if (state.regions.has(r)) { state.regions.delete(r); btn.classList.remove('on'); }
        else { state.regions.add(r); btn.classList.add('on'); }
        updatePickedCount();
      });
    });
  }

  /* ---------------- 흐름 ---------------- */

  async function loadStep() {
    var role = state.steps[state.index];
    var res = await callApi('/notifications/settings?role=' + role);

    if (!res || !res.success) {
      // 설정을 못 불러와도 가입 자체는 끝난 상태입니다. 막다른 길로 두지 않습니다.
      banner('error', (res && res.message) || '알림 설정을 불러오지 못했어요. 나중에 마이페이지에서 설정할 수 있어요.');
      $('ns-list').innerHTML = '';
      return;
    }

    state.data = res.data;
    state.regions = new Set(res.data.regions || []);
    state.allRegions = res.data.allRegions || [];
    state.leadHours = res.data.leadHours || 1;
    state.notifyHour = res.data.notifyHour == null ? 10 : res.data.notifyHour;

    renderHeader();
    renderList();
  }

  /** 현재 단계의 선택을 저장합니다. */
  async function saveStep() {
    var categories = {};
    $('ns-list').querySelectorAll('input[data-key]').forEach(function (el) {
      if (!el.disabled) categories[el.dataset.key] = el.checked;
    });

    var body = { categories: categories };
    // 판매자 단계에서만 지역·시간 설정이 있습니다.
    if (state.steps[state.index] === 'seller') {
      body.regions = [].slice.call(state.regions);
      body.leadHours = state.leadHours;
      body.notifyHour = state.notifyHour;
    }

    try {
      await callApi('/notifications/settings', { method: 'PUT', body: body });
    } catch (e) {
      // 저장 실패로 가입 흐름을 막지 않습니다. 설정은 나중에 다시 할 수 있습니다.
      console.error('알림 설정 저장 실패:', e);
    }
  }

  function finish() {
    // 가입 직후 한 번만 보여주므로, 끝나면 로그인 화면으로 돌려보냅니다.
    window.location.replace('login.html');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    // 가입 직후에만 접근합니다. 직접 주소를 치고 들어온 경우는 로그인으로 보냅니다.
    var raw = sessionStorage.getItem('loggedInUser');
    if (!raw || !sessionStorage.getItem('token')) {
      window.location.replace('login.html');
      return;
    }

    var user;
    try { user = JSON.parse(raw); } catch (e) { user = null; }

    // 주최자 계정은 두 역할의 알림을 다 받으므로 2단계,
    // 판매자 계정은 판매자 알림만 있으므로 1단계입니다.
    state.steps = Number(user && user.userType) === 1 ? ['host', 'seller'] : ['seller'];

    $('onb-skip').addEventListener('click', finish);
    $('onb-next').addEventListener('click', async function () {
      $('onb-next').disabled = true;
      await saveStep();
      if (state.index < state.steps.length - 1) {
        state.index += 1;
        $('ns-banner').hidden = true;
        await loadStep();
        window.scrollTo(0, 0);
        $('onb-next').disabled = false;
      } else {
        finish();
      }
    });

    await loadStep();
  });
})();
