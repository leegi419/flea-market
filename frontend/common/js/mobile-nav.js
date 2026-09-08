// frontend/common/js/mobile-nav.js
// [공통] 좁은 화면에서 상단 고정 바를 햄버거 메뉴로 접습니다.
//
// 왜 필요한가
//   global-nav.js 가 만드는 메뉴는 링크 2개 + 버튼 3~4개 + 역할 전환 + 알림 종입니다.
//   폭 375px 짜리 휴대폰에서는 이게 3~4줄로 늘어나 화면 위쪽 150px 정도를 잡아먹고,
//   본문이 그만큼 아래로 밀려 첫 화면에 마켓 카드가 거의 안 보입니다.
//
// 하는 일
//   1) 상단 바에 햄버거 버튼을 넣습니다.
//   2) 알림 종(#gnav-notify)만 상단 바에 남기고, 나머지 메뉴는 접었다 폈다 합니다.
//   3) 넓은 화면으로 돌아가면 원래 자리(.nav-links 맨 끝)로 되돌립니다.
//
// 충돌 방지
//   - global-nav.js / role-routing.js 는 한 줄도 고치지 않습니다.
//   - 저쪽이 메뉴를 다시 만들어도(MutationObserver) 배치를 다시 맞춥니다.
//   - 접고 펴는 건 CSS 클래스(.is-open)로만 하므로 저쪽 로직과 겹치지 않습니다.
//
// 사용법
//   <head> 맨 뒤에서 mobile.css 와 함께 defer 로 불러옵니다.
//     <link rel="stylesheet" href="../../common/css/mobile.css" />
//     <script src="../../common/js/mobile-nav.js" defer></script>

(function () {
  'use strict';

  var BREAKPOINT = 860; // mobile.css 의 햄버거 기준 폭과 반드시 같아야 합니다.
  var observer = null;
  var arranging = false; // 우리가 DOM 을 만지는 동안 관찰을 잠시 멈추는 표시

  function isNarrow() {
    return window.innerWidth <= BREAKPOINT;
  }

  function getHeader() {
    return document.querySelector('header.nav.gnav');
  }

  /* ------------------------------------------------------------------ */
  /* 햄버거 버튼                                                          */
  /* ------------------------------------------------------------------ */

  function ensureBurger(header) {
    var inner = header.querySelector('.gnav-inner') || header;
    var burger = header.querySelector('.gnav-burger');

    if (!burger) {
      burger = document.createElement('button');
      burger.type = 'button';
      burger.className = 'gnav-burger';
      burger.id = 'gnav-burger';
      burger.setAttribute('aria-label', '메뉴 열기');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-controls', 'gnav-links');
      burger.innerHTML =
        '<span class="gnav-burger-bar" aria-hidden="true"></span>' +
        '<span class="gnav-burger-bar" aria-hidden="true"></span>' +
        '<span class="gnav-burger-bar" aria-hidden="true"></span>';
      burger.addEventListener('click', function (e) {
        e.stopPropagation();
        toggle();
      });
    }

    // 항상 맨 오른쪽 끝에 두기
    if (burger.parentNode !== inner || inner.lastElementChild !== burger) {
      inner.appendChild(burger);
    }
    return burger;
  }

  /* ------------------------------------------------------------------ */
  /* 알림 종 위치 (좁으면 상단 바 / 넓으면 메뉴 안)                       */
  /* ------------------------------------------------------------------ */

  function placeNotify(header) {
    var inner = header.querySelector('.gnav-inner') || header;
    var links = header.querySelector('.nav-links');
    var notify = header.querySelector('#gnav-notify');
    if (!notify) return;

    if (isNarrow()) {
      // 서랍 안에 있으면 상단 바로 꺼냅니다. (햄버거 버튼 바로 앞)
      var burger = header.querySelector('.gnav-burger');
      if (notify.parentNode !== inner || (burger && notify.nextElementSibling !== burger)) {
        if (burger) inner.insertBefore(notify, burger);
        else inner.appendChild(notify);
      }
    } else if (links && notify.parentNode !== links) {
      // 넓은 화면에서는 global-nav.js 가 두던 자리(메뉴 맨 끝)로 복귀
      links.appendChild(notify);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 열기 / 닫기                                                          */
  /* ------------------------------------------------------------------ */

  function open() {
    var header = getHeader();
    if (!header) return;
    header.classList.add('is-open');
    var burger = header.querySelector('.gnav-burger');
    if (burger) {
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', '메뉴 닫기');
    }
    document.addEventListener('click', onOutsideClick, true);
    document.addEventListener('keydown', onKeydown);
  }

  function close() {
    var header = getHeader();
    if (!header) return;
    header.classList.remove('is-open');
    var burger = header.querySelector('.gnav-burger');
    if (burger) {
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', '메뉴 열기');
    }
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onKeydown);
  }

  function toggle() {
    var header = getHeader();
    if (!header) return;
    if (header.classList.contains('is-open')) close();
    else open();
  }

  function onOutsideClick(e) {
    var header = getHeader();
    if (!header) return;
    if (!header.contains(e.target)) close();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  /* ------------------------------------------------------------------ */
  /* 배치 갱신                                                            */
  /* ------------------------------------------------------------------ */

  function arrange() {
    var header = getHeader();
    if (!header) return;
    if (arranging) return;
    arranging = true;

    var links = header.querySelector('.nav-links');
    if (links && !links.id) links.id = 'gnav-links';

    ensureBurger(header);
    placeNotify(header);

    // 넓은 화면으로 돌아오면 열림 상태를 반드시 해제 (서랍이 남아 있으면 안 됩니다)
    if (!isNarrow() && header.classList.contains('is-open')) close();

    arranging = false;
  }

  // 메뉴 안의 링크/버튼을 누르면 서랍을 닫습니다.
  // (같은 화면 안에서 동작하는 버튼도 있어서 이동 여부와 상관없이 닫습니다.)
  function bindAutoClose(header) {
    var links = header.querySelector('.nav-links');
    if (!links || links.dataset.mobileNavBound) return;
    links.dataset.mobileNavBound = '1';
    links.addEventListener('click', function (e) {
      var hit = e.target.closest ? e.target.closest('a, button') : null;
      if (!hit) return;
      if (hit.closest('.gnav-notify')) return; // 알림 팝업은 예외
      close();
    });
  }

  function watch(header) {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver(function () {
      if (arranging) return;
      arrange();
      bindAutoClose(header);
    });
    observer.observe(header, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------------ */
  /* 실행                                                                 */
  /* ------------------------------------------------------------------ */

  function init() {
    var header = getHeader();
    if (!header) return false;
    arrange();
    bindAutoClose(header);
    watch(header);
    return true;
  }

  function boot() {
    if (document.body && document.body.getAttribute('data-gnav') === 'off') return;

    // global-nav.js 도 defer 라 순서가 보장되지 않을 수 있어, 헤더가 생길 때까지 몇 번 재시도합니다.
    if (init()) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (init() || tries > 40) clearInterval(timer); // 최대 약 4초
    }, 100);
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(arrange, 120);
  });
  window.addEventListener('orientationchange', function () {
    setTimeout(arrange, 200);
  });
  window.addEventListener('pageshow', function () {
    setTimeout(arrange, 0);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.MobileNav = { open: open, close: close, toggle: toggle, refresh: arrange };
})();
