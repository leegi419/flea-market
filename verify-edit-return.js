/* 마켓 수정하기 → 되돌아가는 화면 검증 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require('jsdom');
const ROOT = '/home/claude/fm/Flea-market-clone/frontend';
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  PASS ' + m); };
const ng = m => { fail++; console.log('  FAIL ' + m); };
const eq = (got, want, m) => got === want ? ok(m + ' → ' + got) : ng(m + ' → 기대 ' + want + ' / 실제 ' + got);

const correctionSrc = fs.readFileSync(path.join(ROOT, 'pages/B_host-seller/js/marketcorrection.js'), 'utf8');

/* getReturnTarget / applyBackLink 만 떼어내 실행합니다. (모듈 전체는 API 호출이 걸려 있음) */
function makeCtx(pathname, search, referrer, backLinkHtml) {
  const dom = new JSDOM(backLinkHtml || '<a id="correction-back-link" href="mymarketpage.html">← 내 마켓 관리로 돌아가기</a>',
    { url: 'http://localhost:3000' + pathname + search, referrer: referrer || undefined });
  const w = dom.window;
  const body = correctionSrc.slice(
    correctionSrc.indexOf('function getReturnTarget'),
    correctionSrc.indexOf('// 4. 이미지 업로드')
  );
  vm.createContext(w);
  vm.runInContext(body + '\n;window.__t = getReturnTarget; window.__b = applyBackLink;', w);
  return w;
}

const D = '/pages/B_host-seller/correctionMarket';

console.log('[1] 마켓 상세에서 들어온 경우 (?from=detail)');
let w = makeCtx(D, '?marketId=26&from=detail');
eq(w.__t('26').url, 'market-detail?marketId=26', '돌아갈 주소');
eq(w.__t('26').label, '← 마켓 상세로 돌아가기', '링크 글자');

console.log('\n[2] 내 마켓 관리 목록에서 들어온 경우 (from 없음, referrer 도 목록)');
w = makeCtx(D, '?marketId=26', 'http://localhost:3000/pages/B_host-seller/mymarketpage');
eq(w.__t('26').url, 'mymarketpage', '기존 동작 유지');

console.log('\n[3] from 이 없어도 referrer 가 상세면 상세로 (예전 링크 대비)');
w = makeCtx(D, '?marketId=26', 'http://localhost:3000/pages/B_host-seller/market-detail?marketId=26');
eq(w.__t('26').url, 'market-detail?marketId=26', 'referrer 로 추측');

console.log('\n[4] 주소 형식(.html) 을 그대로 따라가는가');
w = makeCtx(D + '.html', '?marketId=26&from=detail');
eq(w.__t('26').url, 'market-detail.html?marketId=26', '.html 주소');
w = makeCtx(D + '.html', '?marketId=26');
eq(w.__t('26').url, 'mymarketpage.html', '.html 주소 (목록)');

console.log('\n[5] 값이 이상할 때 안전하게 목록으로');
w = makeCtx(D, '?from=detail');
eq(w.__t('').url, 'mymarketpage', 'marketId 없음 → 목록');
w = makeCtx(D, '?marketId=26&from=list');
eq(w.__t('26').url, 'mymarketpage', 'from=list → 목록');
w = makeCtx(D, '?marketId=26');   // referrer 없음
eq(w.__t('26').url, 'mymarketpage', 'referrer 없음 → 목록');

console.log('\n[6] marketId 이스케이프');
w = makeCtx(D, '?marketId=' + encodeURIComponent('2 6') + '&from=detail');
eq(w.__t('2 6').url, 'market-detail?marketId=2%206', '공백 인코딩');

console.log('\n[7] 화면 아래 「돌아가기」 링크도 같이 바뀌는가');
w = makeCtx(D, '?marketId=26&from=detail');
w.__b('26');
const link = w.document.getElementById('correction-back-link');
eq(link.getAttribute('href'), 'market-detail?marketId=26', 'back-link href');
eq(link.textContent, '← 마켓 상세로 돌아가기', 'back-link 글자');

console.log('\n[8] 상세 화면의 「마켓 정보 수정하기」 버튼이 from=detail 을 붙이는가');
const marketSrc = fs.readFileSync(path.join(ROOT, 'pages/B_host-seller/js/market.js'), 'utf8');
/correctionMarket\$\{ext\}\?marketId=\$\{marketId\}&from=detail/.test(marketSrc)
  ? ok('market.js 가 from=detail 을 붙임') : ng('from=detail 이 없음');
/const ext = \/\\\.html\$\/i\.test\(window\.location\.pathname\)/.test(marketSrc)
  ? ok('market.js 도 주소 형식을 따라감') : ng('주소 형식 처리 없음');

console.log('\n[9] HTML');
const chtml = fs.readFileSync(path.join(ROOT, 'pages/B_host-seller/correctionMarket.html'), 'utf8');
/id="correction-back-link"/.test(chtml) ? ok('back-link 에 id 부여됨') : ng('id 없음');
/marketcorrection\.js\?v=10/.test(chtml) ? ok('캐시 버전 v=10') : ng('캐시 버전 안 올림');
/market\.js\?v=23/.test(fs.readFileSync(path.join(ROOT, 'pages/B_host-seller/market-detail.html'), 'utf8'))
  ? ok('market.js 캐시 버전 v=23') : ng('캐시 버전 안 올림');

console.log('\n결과: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
