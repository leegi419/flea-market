// frontend/pages/A_auth-main/js/notification-settings.js
// [알림 설정] 묶음별 on/off · 마감 사전 알림 시간 · 신규 마켓 관심 지역
//
// 화면이 묶음 목록을 하드코딩하지 않고 서버에서 받아 그립니다.
//   화면과 서버 목록이 갈라지면 "저장은 되는데 표시가 안 되는" 상태가 생깁니다.
//   알림 종류를 추가할 때 서버 한 곳만 고치면 화면이 따라옵니다.

(function () {
  'use strict';

  var state = { data: null, regions: new Set(), allRegions: [], leadHours: 1, notifyHour: 10, dirty: false };

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

  function markDirty() {
    state.dirty = true;
    $('ns-dirty').textContent = '변경한 내용이 있어요. 저장을 눌러 주세요.';
  }

  function leadLabel(h) {
    return h >= 24 ? '24시간 전 (최대)' : h + '시간 전';
  }

  function render() {
    var d = state.data;
    var html = d.categories.map(function (c) {
      // 역할 구분선. 두 역할을 한 화면에 두되 어느 쪽인지 늘 보이게 합니다.
      if (c.__section) {
        return '<h2 class="ns-section ' + c.__role + '">' + esc(c.__section) + '</h2>';
      }
      var sub = '';

      if (c.hasLeadHours) {
        sub = '<div class="ns-sub" data-sub="' + c.key + '"' + (c.enabled ? '' : ' hidden') + '>'
          + '<div class="ns-lead-row">'
          + '<label for="ns-lead">마감 몇 시간 전에 알릴까요?</label>'
          + '<input type="range" id="ns-lead" min="' + d.leadHoursMin + '" max="' + d.leadHoursMax + '" '
          + 'step="1" value="' + state.leadHours + '" />'
          + '<span class="ns-lead-value" id="ns-lead-value">' + leadLabel(state.leadHours) + '</span>'
          + '</div>'
          // 결제 기한이 24시간이라 그보다 이른 알림은 의미가 없습니다.
          + '<p class="ns-desc">결제 기한은 승인 후 24시간이에요. 모집 마감은 항상 1일 전에 알려드려요.</p>'
          + '</div>';
      }

      if (c.hasNotifyHour) {
        var opts = '';
        for (var h = 0; h < 24; h++) {
          opts += '<option value="' + h + '"' + (h === state.notifyHour ? ' selected' : '') + '>'
            + (h < 12 ? '오전 ' + (h === 0 ? 12 : h) : '오후 ' + (h === 12 ? 12 : h - 12)) + '시</option>';
        }
        sub = '<div class="ns-sub" data-sub="' + c.key + '"' + (c.enabled ? '' : ' hidden') + '>'
          + '<div class="ns-lead-row">'
          + '<label for="ns-hour">몇 시에 받을까요?</label>'
          + '<select id="ns-hour">' + opts + '</select>'
          + '</div>'
          + '<p class="ns-desc">기록은 마켓이 끝난 다음 날 확정되고, 알림은 정한 시각에 보내드려요.</p>'
          + '</div>';
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
          + '</div>'
          + '<p class="ns-region-empty" id="ns-region-empty" hidden>지역을 하나도 고르지 않으면 모든 지역의 알림을 받아요.</p>'
          + '</div>';
      }

      return '<div class="ns-item">'
        + '<div class="ns-head">'
        + '<div class="ns-texts">'
        + '<div class="ns-label">' + esc(c.label)
        + (c.locked ? '<span class="ns-lock">필수</span>' : '') + '</div>'
        + '<div class="ns-desc">' + esc(c.description)
        // 왜 못 끄는지 이유를 적어둡니다. 이유 없이 잠긴 토글은 불신을 삽니다.
        + (c.locked ? '<br />결제한 부스가 취소·환불되는 상황이라 항상 받아요.' : '')
        + '</div>'
        + '</div>'
        + '<span class="ns-toggle">'
        + '<input type="checkbox" data-key="' + c.key + '"' + (c.enabled ? ' checked' : '')
        + (c.locked ? ' disabled' : '') + ' aria-label="' + esc(c.label) + '" />'
        + '<span class="ns-track"></span>'
        + '</span>'
        + '</div>'
        + sub
        + '</div>';
    }).join('');

    $('ns-list').innerHTML = html;
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
    // 토글: 하위 옵션도 같이 접고 폅니다.
    $('ns-list').querySelectorAll('input[data-key]').forEach(function (el) {
      el.addEventListener('change', function () {
        var sub = $('ns-list').querySelector('[data-sub="' + el.dataset.key + '"]');
        if (sub) sub.hidden = !el.checked;
        markDirty();
      });
    });

    var hourEl = $('ns-hour');
    if (hourEl) {
      hourEl.addEventListener('change', function () {
        state.notifyHour = Number(hourEl.value);
        markDirty();
      });
    }

    var lead = $('ns-lead');
    if (lead) {
      lead.addEventListener('input', function () {
        state.leadHours = Number(lead.value);
        $('ns-lead-value').textContent = leadLabel(state.leadHours);
        markDirty();
      });
    }

    $('ns-list').querySelectorAll('input[name="ns-region-mode"]').forEach(function (el) {
      el.addEventListener('change', function () {
        var pick = el.value === 'pick';
        var box = $('ns-regions');
        if (box) box.hidden = !pick;
        var bulk = $('ns-region-bulk');
        if (bulk) bulk.hidden = !pick;
        // "모든 지역" 을 고르면 선택을 비웁니다. 서버는 지역 행이 없으면 전체로 봅니다.
        if (!pick) {
          state.regions.clear();
          if (box) box.querySelectorAll('.ns-region').forEach(function (b) { b.classList.remove('on'); });
        }
        updateRegionWarning();
        markDirty();
      });
    });

    $('ns-list').querySelectorAll('[data-region-all]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var on = btn.dataset.regionAll === 'on';
        state.regions.clear();
        $('ns-list').querySelectorAll('.ns-region').forEach(function (b) {
          b.classList.toggle('on', on);
          if (on) state.regions.add(b.dataset.region);
        });
        updatePickedCount();
        updateRegionWarning();
        markDirty();
      });
    });

    $('ns-list').querySelectorAll('.ns-region').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = btn.dataset.region;
        if (state.regions.has(r)) { state.regions.delete(r); btn.classList.remove('on'); }
        else { state.regions.add(r); btn.classList.add('on'); }
        updatePickedCount();
        updateRegionWarning();
        markDirty();
      });
    });
  }

  function updateRegionWarning() {
    var warn = $('ns-region-empty');
    if (!warn) return;
    var pickMode = $('ns-list').querySelector('input[name="ns-region-mode"][value="pick"]');
    warn.hidden = !(pickMode && pickMode.checked && state.regions.size === 0);
  }

  async function load() {
    var res = await callApi('/notifications/settings');
    if (!res || !res.success) {
      $('ns-list').innerHTML = '';
      banner('error', (res && res.message) || '알림 설정을 불러오지 못했어요.');
      return;
    }
    // [역할 분리] 서버가 roles: {host:[...], seller:[...]} 로 내려줍니다.
    //   마이페이지에서는 두 역할을 한 화면에 보여주되, 제목으로 구분합니다.
    //   섞어서 나열하면 어느 역할의 알림인지 알 수 없습니다.
    if (res.data.roles) {
      const merged = [];
      if (res.data.roles.host && res.data.roles.host.length) {
        merged.push({ __section: '주최자 알림', __role: 'host' });
        merged.push(...res.data.roles.host);
      }
      if (res.data.roles.seller && res.data.roles.seller.length) {
        merged.push({ __section: '판매자 알림', __role: 'seller' });
        merged.push(...res.data.roles.seller);
      }
      res.data.categories = merged;
    }
    state.data = res.data;
    state.regions = new Set(res.data.regions || []);
    state.allRegions = res.data.allRegions || [];
    state.leadHours = res.data.leadHours || 1;
    state.notifyHour = res.data.notifyHour == null ? 10 : res.data.notifyHour;

    if (!res.data.available) {
      banner('warn', '알림 설정 테이블이 아직 없어요. 지금은 모든 알림을 받는 상태예요.');
    }
    render();
  }

  async function save() {
    var categories = {};
    $('ns-list').querySelectorAll('input[data-key]').forEach(function (el) {
      if (!el.disabled) categories[el.dataset.key] = el.checked;
    });

    var res = await callApi('/notifications/settings', {
      method: 'PUT',
      body: { categories: categories, regions: [...state.regions], leadHours: state.leadHours, notifyHour: state.notifyHour },
    });

    if (!res || !res.success) {
      banner('error', (res && res.message) || '저장하지 못했어요.');
      return;
    }
    state.dirty = false;
    $('ns-dirty').textContent = '';
    banner('ok', res.message || '알림 설정을 저장했어요.');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (typeof ensureSession === 'function') {
      var okSession = await ensureSession(true);
      if (!okSession) return;
    }
    $('ns-save').addEventListener('click', save);

    // 저장 안 하고 나가려 할 때 한 번 물어봅니다.
    window.addEventListener('beforeunload', function (e) {
      if (!state.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });

    load();
  });
})();
