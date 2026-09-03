// frontend/pages/B_host-seller/js/checkin-scan.js
// [현장 QR 체크인 - 주최자] 판매자의 입장 QR 을 찍어 출석을 확인하는 화면.
//
// 세 가지 방법을 한 화면에 둡니다. 현장에서는 하나가 반드시 막히기 때문입니다.
//   1) 카메라 스캔    — 가장 빠름. 다만 브라우저가 https 또는 localhost 가 아니면 카메라를 안 열어줍니다.
//                        (팀처럼 http://192.168.0.x 로 접속하면 여기서 막힙니다 — 그때 안내 문구를 띄웁니다)
//   2) 6자리 코드 입력 — 판매자가 숫자를 불러주면 입력. 카메라 없이도 됩니다.
//   3) 명단에서 직접   — QR 도 코드도 안 될 때 이름을 찾아 누릅니다. (method=manual 로 기록)
//
// 노쇼는 이 화면에서 만들지 않습니다. 그날 체크인을 못 받은 사람이
// 날짜가 지나면 자동으로 노쇼가 됩니다. (서버가 기록에서 계산 — utills/checkinStats.js)

(function () {
  'use strict';

  var els = {};
  var state = {
    marketId: null,
    eventDate: null,
    session: null,
    isToday: false,
    isPast: false,
    days: [],
    eventDates: [],
    market: null,
    pollTimer: null,
    camera: { stream: null, raf: null, running: false, lastText: '', lastAt: 0 },
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function banner(kind, text) {
    els.banner.className = 'chk-banner ' + kind;
    els.banner.textContent = text;
  }

  function result(kind, text) {
    els.scanResult.innerHTML = '<div class="chk-banner ' + kind + '">' + escapeHtml(text) + '</div>';
  }

  function todayStr() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /** 개최 시작일~종료일 사이의 날짜를 모두 만듭니다. (탭으로 쓰기 위해) */
  function eachDate(min, max) {
    var out = [];
    if (!min || !max) return out;
    var d = new Date(min + 'T00:00:00');
    var end = new Date(max + 'T00:00:00');
    var guard = 0;
    while (d <= end && guard++ < 60) {
      var p = function (n) { return String(n).padStart(2, '0'); };
      out.push(d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  /** '2026-08-29 10:14:22' / ISO 어느 쪽이 와도 "10:14:22" 로 */
  function formatTime(value) {
    if (!value) return '';
    var d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ---------------- 화면 그리기 ---------------- */

  function renderDayTabs() {
    if (!state.market) return;
    var dates = eachDate(state.market.eventDateMin, state.market.eventDateMax);
    var today = todayStr();
    var byDate = {};
    state.days.forEach(function (d) { byDate[d.eventDate] = d; });

    els.dayTabs.innerHTML = dates.map(function (d) {
      var info = byDate[d];
      var label = d.slice(5).replace('-', '/');
      var mark = d === today ? ' (오늘)' : (d < today ? ' 지남' : '');
      var count = info ? ' · ' + info.checkedIn : '';
      return '<button type="button" class="chk-day-tab' + (d === state.eventDate ? ' active' : '')
        + '" data-date="' + d + '">' + label + mark + count + '</button>';
    }).join('');
  }

  function renderRoster(roster) {
    if (!roster || roster.length === 0) {
      els.roster.innerHTML = '';
      els.rosterHint.textContent = '승인·결제 완료된 신청이 아직 없어요.';
      return;
    }

    // 지난 날짜면 미출석 = 이미 확정된 노쇼라는 걸 문구로 구분합니다.
    els.rosterHint.textContent = state.isPast
      ? '지난 날짜예요. 체크인되지 않은 판매자는 노쇼로 기록됐어요.'
      : '이름을 눌러 직접 출석 처리할 수도 있어요.';

    els.roster.innerHTML = roster.map(function (r) {
      var cls = r.checkedIn ? 'done' : (state.isPast ? 'absent-final' : '');
      // 체크인 "시각"을 반드시 보여줍니다.
      //   나중에 "왔다/안 왔다" 다툼이 생기면 이 시각이 근거가 됩니다.
      //   어떤 방법으로 확인했는지(QR/코드/수동)도 함께 남겨야 기록의 성격을 알 수 있습니다.
      var methodLabel = r.method === 'manual' ? '수동' : (r.method === 'code' ? '코드' : 'QR');
      var tag = r.checkedIn
        ? '<span class="chk-tag in">출석 ' + escapeHtml(formatTime(r.checkedInAt)) + '</span>'
          + '<span class="chk-tag ' + (r.method === 'manual' ? 'manual' : 'out') + '">' + methodLabel + '</span>'
        : (state.isPast ? '<span class="chk-tag noshow">노쇼</span>' : '<span class="chk-tag out">미도착</span>');

      var action = '';
      if (!r.checkedIn && state.session && state.session.isOpen && !state.isPast) {
        action = '<button type="button" class="btn btn-outline btn-sm" data-manual="'
          + r.applicationId + '">출석 처리</button>';
      } else if (r.checkedIn && !state.isPast && state.session && state.session.isOpen) {
        action = '<button type="button" class="btn btn-outline btn-sm" data-cancel="'
          + r.checkinId + '">취소</button>';
      }

      return '<li class="' + cls + '">'
        + '<span class="chk-booth">' + escapeHtml(r.boothNumber) + '</span>'
        + '<span class="chk-name">' + escapeHtml(r.sellerNickname || ('판매자 ' + r.sellerId)) + '</span>'
        + '<span class="chk-grow chk-muted">' + escapeHtml(r.itemName || '') + '</span>'
        + tag + action + '</li>';
    }).join('');
  }

  function renderSummary(summary) {
    els.statIn.textContent = summary ? summary.checkedInSellers : '-';
    els.statOut.textContent = summary ? summary.absentSellers : '-';
    els.statTotal.textContent = summary ? summary.totalSellers : '-';
    els.statOutLabel.textContent = state.isPast ? '노쇼' : '미도착';
  }

  /* ---------------- 서버 조회 ---------------- */

  async function load() {
    var res = await callApi('/checkin/sessions?marketId=' + encodeURIComponent(state.marketId)
      + '&eventDate=' + encodeURIComponent(state.eventDate));

    if (!res || !res.success) {
      banner('error', (res && res.message) || '체크인 현황을 불러오지 못했어요.');
      return;
    }

    var d = res.data || {};
    state.market = d.market;
    state.session = d.session;
    state.isToday = !!d.isToday;
    state.isPast = !!d.isPast;
    state.days = d.days || [];
    state.eventDates = d.eventDates || [];

    els.marketTitle.textContent = (d.market ? d.market.title : '')
      + ' · ' + state.eventDate + (state.isToday ? ' (오늘)' : '');

    renderDayTabs();
    renderDayRows();
    renderSummary(d.summary);
    renderRoster(d.roster);

    // 서버가 시간대까지 따져 계산한 값입니다. status 문자열로 판단하면
    // 예약된 시간에 자동으로 열린 세션을 '안 열림'으로 잘못 보게 됩니다.
    var open = !!(state.session && state.session.isOpen);

    // 버튼/스캐너 노출 결정
    els.start.hidden = open;
    els.close.hidden = !open;
    els.scanCard.hidden = !open;

    if (d.market && d.market.isCancelled) {
      banner('error', '취소된 마켓이에요. 체크인을 진행할 수 없어요.');
      els.start.hidden = true;
      els.close.hidden = true;
      els.scanCard.hidden = true;
      return;
    }

    if (state.isPast) {
      banner('neutral', '지난 날짜라 더 이상 체크인할 수 없어요. 이날의 출석은 확정됐어요.');
      els.start.hidden = true;
      els.scanCard.hidden = true;
      return;
    }

    if (!state.isToday) {
      els.start.textContent = '이 날짜 체크인 미리 열기';
      banner('warn', '개최 당일이 아니에요. 미리 열어 둘 수는 있어요.');
    } else {
      els.start.textContent = '체크인 시작';
      if (open) {
        banner('ok', '체크인 진행 중이에요. 판매자의 QR 을 찍어 주세요.');
      } else if (state.session) {
        banner('warn', (state.session.reason || '체크인이 열려 있지 않아요.')
          + ' 늦게 온 판매자가 있으면 「체크인 시작」을 눌러 주세요.');
      } else {
        banner('neutral', '아직 체크인을 시작하지 않았어요. 판매자 화면에도 QR 이 나오지 않아요.');
      }
    }
  }

  function startPolling() {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(function () {
      if (!document.hidden) load();
    }, 6000);
  }

  /* ---------------- 동작 ---------------- */

  async function startSession() {
    var res = await callApi('/checkin/sessions', {
      method: 'POST',
      body: { marketId: state.marketId, eventDate: state.eventDate },
    });
    if (!res || !res.success) {
      banner('error', (res && res.message) || '체크인을 시작하지 못했어요.');
      return;
    }
    await load();
  }

  async function closeSession() {
    if (!state.session) return;
    if (!window.confirm('체크인을 종료할까요?\n아직 오지 않은 판매자는 날짜가 지나면 노쇼로 기록돼요.')) return;

    var res = await callApi('/checkin/sessions/' + state.session.sessionId + '/close', { method: 'PATCH' });
    if (!res || !res.success) {
      banner('error', (res && res.message) || '체크인을 종료하지 못했어요.');
      return;
    }
    stopCamera();

    var absent = (res.data && res.data.absentees) || [];
    if (absent.length > 0) {
      var names = absent.map(function (a) { return a.sellerNickname || ('판매자 ' + a.sellerId); }).join(', ');
      window.alert('체크인을 종료했어요.\n\n아직 안 온 판매자 ' + absent.length + '명: ' + names
        + '\n\n오늘이 지나면 이분들은 이 마켓에 대해 노쇼 1회로 기록돼요.\n지금 도착하면 다시 시작해서 처리할 수 있어요.');
    } else {
      window.alert('체크인을 종료했어요. 미도착 인원은 없어요.');
    }
    await load();
  }

  /** QR/코드/수동 어느 쪽이든 결과 표시는 한 곳으로 모읍니다. */
  function showScanOutcome(res) {
    if (!res || !res.success) {
      result('error', (res && res.message) || '처리하지 못했어요.');
      return false;
    }
    var d = res.data || {};
    // 방금 찍힌 시각을 그대로 보여줍니다. 주최자가 "처리됐다"를 눈으로 확인하고
    // 바로 다음 사람을 찍을 수 있어야 줄이 밀리지 않습니다.
    var at = (d.booths && d.booths[0] && d.booths[0].checkedInAt) ? formatTime(d.booths[0].checkedInAt) : '';
    var suffix = d.newlyChecked > 0
      ? (at ? ' (' + at + ') — 다음 분 찍어 주세요' : ' — 다음 분 찍어 주세요')
      : (at ? ' (' + at + ' 확인됨)' : '');
    result(d.newlyChecked > 0 ? 'ok' : 'warn', res.message + suffix);
    return true;
  }

  async function submitToken(token) {
    var res = await callApi('/checkin/scan', { method: 'POST', body: { token: token } });
    showScanOutcome(res);
    load();
  }

  async function submitCode() {
    var code = (els.codeInput.value || '').replace(/\D/g, '');
    if (code.length !== 6) {
      result('error', '6자리 숫자를 입력해 주세요.');
      return;
    }
    if (!state.session) {
      result('error', '체크인을 먼저 시작해 주세요.');
      return;
    }
    var res = await callApi('/checkin/scan', {
      method: 'POST',
      body: { sessionId: state.session.sessionId, code: code },
    });
    if (showScanOutcome(res)) els.codeInput.value = '';
    load();
  }

  async function manualCheck(applicationId) {
    if (!state.session) return;
    var res = await callApi('/checkin/manual', {
      method: 'POST',
      body: { sessionId: state.session.sessionId, applicationId: Number(applicationId) },
    });
    showScanOutcome(res);
    load();
  }

  async function cancelCheck(checkinId) {
    if (!window.confirm('이 출석을 취소할까요?')) return;
    var res = await callApi('/checkin/records/' + Number(checkinId), { method: 'DELETE' });
    showScanOutcome(res);
    load();
  }

  /* ---------------- 체크인 시간 설정 ---------------- */
  //
  // 두 가지를 한 화면에서 다룹니다.
  //   ① 위쪽 칸에 시간을 넣고 「모든 날짜에 채우기」 -> 아래 모든 줄이 한 번에 채워짐
  //   ② 특정 날짜 줄만 직접 고침 (토요일만 늦게 시작하는 경우)
  // 어느 쪽이든 마지막에 「저장」 한 번으로 서버에 보냅니다.
  //
  // 채우기와 저장을 나눈 이유 — 채우기가 곧바로 저장이면 실수로 눌렀을 때
  // 이미 잡아둔 날짜별 시간이 통째로 날아갑니다. 눈으로 확인하고 저장하게 했습니다.

  var WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

  function weekdayOf(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : WEEKDAY[d.getDay()];
  }

  /** 개최 기간의 모든 날짜를 한 줄씩 그립니다. 아직 예약 안 된 날도 빈 칸으로 나옵니다. */
  function renderDayRows() {
    var dates = state.eventDates || [];
    if (dates.length === 0) { els.dayRows.innerHTML = ''; return; }

    var byDate = {};
    (state.days || []).forEach(function (d) { byDate[d.eventDate] = d; });
    var today = todayStr();

    els.dayRows.innerHTML = dates.map(function (date) {
      var info = byDate[date] || {};
      var past = date < today;
      var manual = info.status === 'open' || info.status === 'closed';

      // 지난 날짜는 출석이 확정돼 손댈 수 없고,
      // 주최자가 직접 열고 닫은 날은 시간표가 그 결정을 덮지 않습니다.
      var locked = past || manual;
      var note = past ? '지난 날짜 · 확정됨'
               : manual ? ('주최자가 직접 ' + (info.status === 'open' ? '연' : '닫은') + ' 날')
               : (info.startTime ? '예약됨' : '미설정');

      return '<div class="chk-day-row' + (locked ? ' locked' : '') + '" data-date="' + date + '">'
        + '<span class="chk-day-label">' + date.slice(5).replace('-', '/')
        + ' <em>(' + weekdayOf(date) + ')</em></span>'
        + '<input type="time" class="row-start" value="' + (info.startTime || '') + '"'
        + (locked ? ' disabled' : '') + ' />'
        + '<span class="chk-day-tilde">~</span>'
        + '<input type="time" class="row-end" value="' + (info.endTime || '') + '"'
        + (locked ? ' disabled' : '') + ' />'
        + '<select class="row-lead"' + (locked ? ' disabled' : '') + '>'
        + [0, 30, 60, 120].map(function (v) {
            var sel = Number(info.leadMinutes != null ? info.leadMinutes : 60) === v ? ' selected' : '';
            return '<option value="' + v + '"' + sel + '>' + (v === 0 ? '즉시' : v + '분 전') + '</option>';
          }).join('')
        + '</select>'
        + '<span class="chk-day-note">' + note + '</span>'
        + '</div>';
    }).join('');
  }

  /** 위쪽 일괄 칸의 값을 잠기지 않은 모든 줄에 채웁니다. (저장은 아직) */
  function applyToAllRows() {
    var start = els.startTime.value;
    var end = els.endTime.value;
    var lead = els.lead.value;
    if (!start || !end) {
      els.scheduleResult.innerHTML = '<div class="chk-banner error">시작·종료 시간을 먼저 입력해 주세요.</div>';
      return;
    }

    var rows = els.dayRows.querySelectorAll('.chk-day-row:not(.locked)');
    rows.forEach(function (row) {
      row.querySelector('.row-start').value = start;
      row.querySelector('.row-end').value = end;
      row.querySelector('.row-lead').value = lead;
    });

    els.scheduleResult.innerHTML = '';
    els.dirtyHint.textContent = rows.length + '일에 채웠어요. 저장을 눌러 주세요.';
  }

  /** 화면의 모든 줄을 모아 한 번에 저장합니다. */
  async function saveSchedule() {
    var rows = els.dayRows.querySelectorAll('.chk-day-row:not(.locked)');
    var days = [];
    var invalid = null;

    rows.forEach(function (row) {
      var start = row.querySelector('.row-start').value;
      var end = row.querySelector('.row-end').value;
      if (!start && !end) return;                      // 비워 두면 그 날은 건너뜁니다
      if (!start || !end) { invalid = invalid || row.dataset.date + ': 시작과 종료를 모두 입력해 주세요.'; return; }
      if (start >= end) { invalid = invalid || row.dataset.date + ': 종료가 시작보다 늦어야 해요.'; return; }
      days.push({
        eventDate: row.dataset.date,
        startTime: start,
        endTime: end,
        leadMinutes: Number(row.querySelector('.row-lead').value),
      });
    });

    if (invalid) {
      els.scheduleResult.innerHTML = '<div class="chk-banner error">' + escapeHtml(invalid) + '</div>';
      return;
    }
    if (days.length === 0) {
      els.scheduleResult.innerHTML = '<div class="chk-banner warn">저장할 날짜가 없어요. 시간을 입력하거나 「모든 날짜에 채우기」를 눌러 주세요.</div>';
      return;
    }

    var res = await callApi('/checkin/schedule', {
      method: 'POST',
      body: { marketId: state.marketId, days: days },
    });

    if (!res || !res.success) {
      els.scheduleResult.innerHTML = '<div class="chk-banner error">'
        + escapeHtml((res && res.message) || '저장하지 못했어요.') + '</div>';
      return;
    }

    var d = res.data || {};
    var html = '<div class="chk-banner ok">' + escapeHtml(res.message) + '</div>';

    // 건너뛴 날짜는 이유를 그대로 보여줍니다.
    // "7일인데 5일만 됐다"를 말없이 넘기면 현장에서야 알게 됩니다.
    if (d.skipped && d.skipped.length > 0) {
      html += '<ul class="chk-list">' + d.skipped.map(function (x) {
        return '<li><span class="chk-booth">' + escapeHtml(x.eventDate) + '</span>'
          + '<span class="chk-grow chk-muted">' + escapeHtml(x.reason) + '</span>'
          + '<span class="chk-tag out">건너뜀</span></li>';
      }).join('') + '</ul>';
    }
    els.scheduleResult.innerHTML = html;
    els.dirtyHint.textContent = '';
    load();
  }

  function syncLeadLabel() {
    var v = Number(els.lead.value);
    els.leadLabel.textContent = v === 0 ? '(미리 안 띄움)'
      : v >= 60 ? (v / 60) + '시간' : v + '분';
  }

  /* ---------------- 카메라 ---------------- */

  function cameraSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof window.jsQR === 'function');
  }

  async function startCamera() {
    if (!cameraSupported()) {
      // 브라우저가 카메라를 막는 가장 흔한 이유를 그대로 알려줍니다.
      // "안 된다"만 뜨면 원인을 못 찾고 헤매게 됩니다.
      var insecure = window.location.protocol !== 'https:'
        && window.location.hostname !== 'localhost'
        && window.location.hostname !== '127.0.0.1';
      result('error', insecure
        ? '이 주소(' + window.location.protocol + '//' + window.location.hostname + ')에서는 브라우저가 카메라를 열어주지 않아요. https 로 접속하거나, 아래 6자리 코드 입력을 사용해 주세요.'
        : '이 브라우저에서 카메라를 쓸 수 없어요. 아래 6자리 코드 입력을 사용해 주세요.');
      return;
    }

    try {
      state.camera.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // 후면 카메라 우선
        audio: false,
      });
    } catch (e) {
      result('error', '카메라를 켤 수 없어요 (' + (e && e.name ? e.name : '권한 거부')
        + '). 아래 6자리 코드 입력을 사용해 주세요.');
      return;
    }

    els.video.srcObject = state.camera.stream;
    await els.video.play();
    els.scanner.hidden = false;
    els.camStart.hidden = true;
    els.camStop.hidden = false;
    state.camera.running = true;
    result('neutral', '판매자의 QR 을 화면 안에 맞춰 주세요.');
    requestAnimationFrame(scanFrame);
  }

  function stopCamera() {
    state.camera.running = false;
    if (state.camera.raf) cancelAnimationFrame(state.camera.raf);
    if (state.camera.stream) {
      state.camera.stream.getTracks().forEach(function (t) { t.stop(); });
      state.camera.stream = null;
    }
    els.scanner.hidden = true;
    els.camStart.hidden = false;
    els.camStop.hidden = true;
  }

  function scanFrame() {
    if (!state.camera.running) return;
    var video = els.video;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      var canvas = els.canvas;
      var w = video.videoWidth;
      var h = video.videoHeight;
      if (w && h) {
        // 큰 해상도를 그대로 해석하면 폰에서 프레임이 뚝뚝 끊깁니다. 가로 480 정도로 줄여서 봅니다.
        var scale = Math.min(1, 480 / w);
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var found = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });

        if (found && found.data) {
          var now = Date.now();
          // 같은 QR 이 카메라 앞에 계속 있으면 초당 수십 번 요청이 나갑니다. 3초 동안은 무시합니다.
          if (found.data !== state.camera.lastText || now - state.camera.lastAt > 3000) {
            state.camera.lastText = found.data;
            state.camera.lastAt = now;
            submitToken(found.data);
          }
        }
      }
    }
    state.camera.raf = requestAnimationFrame(scanFrame);
  }

  /* ---------------- 시작 ---------------- */

  document.addEventListener('DOMContentLoaded', async function () {
    els = {
      banner: $('chk-banner'),
      marketTitle: $('chk-market-title'),
      dayTabs: $('chk-day-tabs'),
      statIn: $('chk-stat-in'),
      statOut: $('chk-stat-out'),
      statOutLabel: $('chk-stat-out-label'),
      statTotal: $('chk-stat-total'),
      start: $('chk-start'),
      close: $('chk-close'),
      scanCard: $('chk-scan-card'),
      scanResult: $('chk-scan-result'),
      scanner: $('chk-scanner'),
      video: $('chk-video'),
      canvas: $('chk-canvas'),
      camStart: $('chk-cam-start'),
      camStop: $('chk-cam-stop'),
      codeInput: $('chk-code-input'),
      codeSubmit: $('chk-code-submit'),
      roster: $('chk-roster'),
      rosterHint: $('chk-roster-hint'),
      startTime: $('chk-start-time'),
      endTime: $('chk-end-time'),
      lead: $('chk-lead'),
      leadLabel: $('chk-lead-label'),
      scheduleSave: $('chk-schedule-save'),
      applyAll: $('chk-apply-all'),
      dayRows: $('chk-day-rows'),
      dirtyHint: $('chk-dirty-hint'),
      scheduleResult: $('chk-schedule-result'),
    };

    var params = new URLSearchParams(window.location.search);
    state.marketId = Number(params.get('marketId'));
    state.eventDate = params.get('eventDate') || todayStr();

    if (!state.marketId) {
      banner('error', '어느 마켓인지 알 수 없어요. 「내 마켓 관리」에서 다시 들어와 주세요.');
      return;
    }

    if (typeof ensureSession === 'function') {
      var okSession = await ensureSession(true);
      if (!okSession) return;
    }

    els.scheduleSave.addEventListener('click', saveSchedule);
    els.applyAll.addEventListener('click', applyToAllRows);
    els.lead.addEventListener('change', syncLeadLabel);
    syncLeadLabel();

    els.start.addEventListener('click', startSession);
    els.close.addEventListener('click', closeSession);
    els.camStart.addEventListener('click', startCamera);
    els.camStop.addEventListener('click', stopCamera);
    els.codeSubmit.addEventListener('click', submitCode);
    els.codeInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitCode();
    });

    els.dayTabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.chk-day-tab');
      if (!btn) return;
      state.eventDate = btn.dataset.date;
      stopCamera();
      load();
    });

    els.roster.addEventListener('click', function (e) {
      var m = e.target.closest('[data-manual]');
      if (m) return manualCheck(m.dataset.manual);
      var c = e.target.closest('[data-cancel]');
      if (c) return cancelCheck(c.dataset.cancel);
    });

    // 탭을 벗어나면 카메라를 끕니다. (폰 배터리 + 카메라 표시등이 계속 켜져 있는 문제)
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopCamera();
    });
    window.addEventListener('pagehide', stopCamera);

    await load();
    startPolling();
  });
})();
