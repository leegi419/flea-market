// frontend/common/js/no-show-badge.js
// [현장 QR 체크인] 프로필 화면(마이페이지 / 남의 프로필)에 「노쇼」 지표를 붙입니다.
//
// 왜 mypage.js / user-profile.js 를 고치지 않고 별도 파일로 만들었나
//   그 두 파일은 팀원이 계속 손대는 파일입니다. 통계 블록 안에 코드를 끼워 넣으면
//   병합할 때마다 충돌합니다. 이 파일은 기존 통계 카드에 항목만 덧붙이므로
//   HTML 에 <script> 한 줄만 추가하면 되고, 팀원 코드는 한 글자도 건드리지 않습니다.
//
// 표기 기준 (서버 utills/checkinStats.js 와 동일)
//   노쇼 = 체크인이 열렸던 "지난" 날짜 중, 그날 체크인을 받지 못한 날의 수.
//   당일은 아직 세지 않습니다. 자정을 넘겨야 확정됩니다.
//   부스를 3칸 잡고 안 나와도 1로 셉니다. (사람이 안 온 날 기준)

(function () {
  'use strict';

  // 체크인 기록이 하나도 없으면(=아직 이 기능을 쓴 적 없는 마켓만 있으면) 지표를 아예 숨깁니다.
  // "노쇼 0회"가 늘 떠 있으면 새 사용자에게 의미 없는 정보만 늘어납니다.
  // [표시 정책] 기록이 없어도 "아직 없음" 을 보여줍니다.
  //
  //   예전에는 체크인이 운영된 마켓이 없으면(totalMarkets === 0) 통째로 숨겼습니다.
  //   그런데 이 항목을 가장 필요로 하는 사람은 **신청자를 심사하는 주최자**입니다.
  //   아무것도 안 보이면 "노쇼가 없는 사람" 인지 "아직 기록이 쌓이지 않은 사람" 인지
  //   구분할 수 없어, 판단할 근거가 없는 채로 승인·반려를 해야 합니다.
  //
  //   그래서 숨기지 않고 0 과 안내 문구를 보여줍니다.
  //   참여 이력은 **마켓이 끝난 뒤** 집계되므로, 신규 판매자나
  //   아직 진행 중인 마켓만 신청한 사람은 정상적으로 0 입니다.
  var HIDE_WHEN_NO_DATA = false;

  function findStatsBlock() {
    // 판매자 통계 카드가 있으면 그 안, 없으면 프로필 섹션 어디든.
    return document.getElementById('seller-stats-block');
  }

  function statsRow(block) {
    // 기존 통계 숫자(.profile-stat-num)의 부모의 부모가 한 줄입니다.
    var num = block.querySelector('.profile-stat-num');
    return num ? num.parentElement.parentElement : null;
  }

  /** 통계 항목 하나를 만듭니다. (기존 통계 카드와 같은 마크업) */
  function buildItem(id, num, label, isBad, tip) {
    var wrap = document.createElement('div');
    wrap.className = 'profile-stat';
    wrap.id = id;
    wrap.innerHTML =
      '<span class="profile-stat-num chk-noshow-num' + (isBad ? ' is-bad' : '') + '">'
      + num + '</span>'
      + '<span class="profile-stat-label">' + label + '</span>';
    wrap.title = tip;
    return wrap;
  }

  /**
   * 참여 완료 / 중도 이탈 / 노쇼 도넛.
   *
   * 왜 세 갈래인가
   *   7일 마켓에서 하루 빠진 사람과 아예 안 나온 사람을 똑같이 「노쇼 1회」로 세면
   *   성실한 참가자가 억울해집니다. 반대로 7일 내내 안 나온 사람이 노쇼 7회가 되는 것도
   *   약속 하나를 어긴 것치고 과합니다. 그래서 마켓 하나를 단위로 보고
   *   전부 참여 / 일부만 / 전혀 로 나눕니다.
   *
   * 왜 「마켓 참여」를 조각에 넣지 않았나
   *   마켓 참여는 결제까지 마친 마켓 수라 분모가 다릅니다.
   *   체크인이 운영되지 않은 마켓도 포함되므로 한 링에 섞으면 합이 맞지 않습니다.
   *
   * 라이브러리를 쓰지 않고 SVG 로 직접 그립니다. 조각이 셋뿐이라 dasharray 로 충분하고,
   * 차트 라이브러리를 새로 들이면 다른 화면 번들까지 영향을 받습니다.
   */
  function buildDonut(stats) {
    var total = stats.totalMarkets;
    var rate = total > 0 ? Math.round((stats.completed / total) * 100) : 0;

    var R = 52, CIRC = 2 * Math.PI * R;
    var seg = [
      { n: stats.completed, color: '#2f8f4e' },
      { n: stats.partial,   color: '#E0912F' },
      { n: stats.noShow,    color: '#c0392b' },
    ];

    var offset = 0;
    var arcs = seg.map(function (x) {
      if (!x.n || total === 0) return '';
      var len = (x.n / total) * CIRC;
      var el = '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + x.color + '"'
        + ' stroke-width="16" stroke-dasharray="' + len.toFixed(2) + ' ' + (CIRC - len).toFixed(2) + '"'
        + ' stroke-dashoffset="' + (-offset).toFixed(2) + '"'
        + ' transform="rotate(-90 70 70)" stroke-linecap="butt"/>';
      offset += len;
      return el;
    }).join('');

    var box = document.createElement('div');
    box.className = 'chk-donut-box';
    box.id = 'chk-donut';
    box.innerHTML =
      '<svg viewBox="0 0 140 140" class="chk-donut" role="img"'
      + ' aria-label="참여 완료 ' + stats.completed + ', 중도 이탈 ' + stats.partial
      + ', 노쇼 ' + stats.noShow + '">'
      + '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#e6ddcd" stroke-width="16"/>'
      + arcs
      + '<text x="70" y="66" text-anchor="middle" class="chk-donut-rate">' + rate + '%</text>'
      + '<text x="70" y="86" text-anchor="middle" class="chk-donut-sub">완주율</text>'
      + '</svg>'
      + '<ul class="chk-donut-legend">'
      + '<li><i class="dot ok"></i>참여 완료 <b>' + stats.completed + '</b></li>'
      + '<li><i class="dot warn"></i>중도 이탈 <b>' + stats.partial + '</b></li>'
      + '<li><i class="dot bad"></i>노쇼 <b>' + stats.noShow + '</b></li>'
      + '<li><i class="dot neutral"></i>마켓 참여 <b>' + (stats.paidMarkets || 0) + '</b>곳</li>'
      + '</ul>';
    box.title = '현장 체크인이 운영된 마켓 ' + total + '곳 기준 · '
      + '중도 이탈은 일부 날짜만 참여한 경우예요';
    return box;
  }

  function buildItems(stats) {
    var tip = '체크인이 운영된 마켓 ' + stats.totalMarkets + '곳 중 '
      + '완주 ' + stats.completed + ' / 중도 이탈 ' + stats.partial + ' / 노쇼 ' + stats.noShow;
    return [
      buildItem('chk-attend-stat', stats.completed, '참여 완료', false, tip),
      buildItem('chk-partial-stat', stats.partial, '중도 이탈', stats.partial > 0, tip),
      buildItem('chk-noshow-stat', stats.noShow, '노쇼', stats.noShow > 0, tip),
    ];
  }

  async function run() {
    var block = findStatsBlock();
    if (!block) return;
    if (document.getElementById('chk-noshow-stat')) return; // 중복 삽입 방지

    // 남의 프로필이면 ?userId= 가 붙어 있고, 마이페이지면 없습니다.
    var userId = new URLSearchParams(window.location.search).get('userId');
    var path = userId ? '/checkin/stats/' + encodeURIComponent(userId) : '/checkin/stats/me';

    var res;
    try {
      res = await callApi(path);
    } catch (e) {
      return; // 통계 하나 때문에 프로필 화면이 깨지면 안 됩니다.
    }
    if (!res || !res.success || !res.data) return;

    var stats = res.data;
    // available=false 는 체크인 테이블이 없는 DB(마이그레이션 전)라는 뜻입니다.
    if (!stats.available) return;
    if (HIDE_WHEN_NO_DATA && stats.totalMarkets === 0) return;

    // 기록이 아직 없는 경우: 숫자 대신 안내 한 줄만 붙입니다.
    //   0/0/0 도넛을 그려봐야 빈 원만 보이고 완주율도 계산할 수 없습니다.
    if (stats.totalMarkets === 0) {
      var row0 = block.querySelector('.profile-stats-row') || block;
      var note = document.createElement('p');
      note.id = 'chk-noshow-stat';   // 중복 삽입 방지 표시를 겸합니다
      note.className = 'chk-empty-note';
      note.textContent = '현장 참여 기록이 아직 없어요. 마켓이 끝나면 참여·노쇼가 집계돼요.';
      (block.querySelector('.profile-stats-row') ? row0.parentNode : block)
        .insertBefore(note, row0.nextSibling);
      return;
    }

    var row = statsRow(block);
    if (row) buildItems(stats).forEach(function (el) { row.appendChild(el); });

    // 도넛은 통계 줄 아래에 붙입니다. (숫자 -> 그림 순서가 읽기 편합니다)
    if (!document.getElementById('chk-donut')) block.appendChild(buildDonut(stats));
  }

  // 기존 스크립트가 통계 블록을 나중에 채우므로, DOM 이 준비된 뒤 한 박자 늦게 붙입니다.
  // hidden 이 풀리는 시점을 기다리기 위해 짧게 재시도합니다.
  document.addEventListener('DOMContentLoaded', function () {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      var block = findStatsBlock();
      if ((block && !block.hidden) || tries > 12) {
        clearInterval(timer);
        run();
      }
    }, 400);
  });
})();
