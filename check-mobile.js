/* check-mobile.js  — [모바일 최적화] 적용 확인용
   프로젝트 루트(= frontend 폴더가 보이는 곳)에 두고

       node check-mobile.js

   추가 설치 없이 돌아갑니다. 전부 OK 가 나오면 적용이 끝난 것입니다. */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, 'frontend');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const ng = (m) => { fail++; console.log('  실패 ' + m); };

if (!fs.existsSync(ROOT)) {
  console.log('frontend 폴더를 찾을 수 없습니다. 이 파일을 프로젝트 루트에 두고 실행하세요.');
  process.exit(1);
}

function listHtml(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    if (fs.statSync(f).isDirectory()) listHtml(f, out);
    else if (n.toLowerCase().endsWith('.html')) out.push(f);
  }
  return out;
}

console.log('[1] 공용 파일이 있는가');
['common/css/mobile.css', 'common/js/mobile-nav.js'].forEach((p) => {
  fs.existsSync(path.join(ROOT, p)) ? ok(p) : ng(p + ' 가 없습니다');
});

console.log('\n[2] 모든 화면에 들어갔는가');
for (const f of listHtml(ROOT)) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const html = fs.readFileSync(f, 'utf8');
  const dirRel = path.relative(ROOT, path.dirname(f));
  const pre = dirRel ? '../'.repeat(dirRel.split(path.sep).length) + 'common/' : 'common/';
  const errs = [];
  if (!/name=["']viewport["']/i.test(html)) errs.push('viewport 태그 없음');
  if (!html.includes(pre + 'css/mobile.css')) errs.push('mobile.css 미적용(또는 경로 오류)');
  if (!html.includes(pre + 'js/mobile-nav.js')) errs.push('mobile-nav.js 미적용(또는 경로 오류)');
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd < 0 ? '' : html.slice(0, headEnd);
  const mobileAt = head.indexOf('mobile.css');
  if (mobileAt < 0) errs.push('<head> 안에 없음');
  else {
    const others = [...head.matchAll(/<link[^>]+\.css/gi)]
      .map((m) => m.index)
      .filter((i) => i !== head.lastIndexOf('<link', mobileAt));
    const last = others.length ? Math.max(...others) : -1;
    if (last > mobileAt) errs.push('다른 CSS 보다 앞에 있어 덮어쓰기가 안 됩니다');
  }
  errs.length ? ng(rel + ' → ' + errs.join(' / ')) : ok(rel);
}

console.log('\n[3] mobile.css 주요 규칙');
const css = fs.readFileSync(path.join(ROOT, 'common/css/mobile.css'), 'utf8');
let depth = 0, broken = false;
for (const c of css) { if (c === '{') depth++; else if (c === '}') { depth--; if (depth < 0) broken = true; } }
(depth === 0 && !broken) ? ok('중괄호 균형') : ng('중괄호가 맞지 않습니다');
[
  ['햄버거 메뉴(860px)', /\.gnav-burger/],
  ['입력창 16px — 아이폰 자동 확대 방지', /font-size:\s*16px\s*!important/],
  ['터치 영역 44px', /min-height:\s*44px/],
  ['가로 스크롤 차단', /overflow-x:\s*hidden/],
  ['마켓 카드 1열', /grid-template-columns:\s*1fr/],
  ['지도 높이 축소', /#map-container/],
  ['검색바 폭 보정', /search-bar-container/],
].forEach(([n, re]) => (re.test(css) ? ok(n) : ng(n)));

console.log('\n[4] 지역 필터 정리 (index.html)');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
/id="region-filter-field"[^>]*\shidden/.test(idx)
  ? ok('지역 select 이 화면에서 숨겨짐')
  : ng('지역 select 이 아직 보입니다');
/<select id="region-filter">/.test(idx)
  ? ok('select 태그는 남아 있음 (지도 클릭 필터가 이걸 씁니다 — 지우면 안 됩니다)')
  : ng('select 이 삭제됐습니다 → 지도 클릭 필터가 동작하지 않습니다');
/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(
  fs.readFileSync(path.join(ROOT, 'common/css/style.css'), 'utf8'))
  ? ok('style.css 의 [hidden] 안전장치 존재')
  : ng('style.css 의 [hidden]{display:none!important} 가 없어 숨김이 안 먹을 수 있습니다');

console.log('\n결과: ' + pass + ' OK / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
