import { go, render } from '../app/router.js';
import { bPre, bookId, verSeg } from '../content/books.js';
import { BOOKS, WORDS, catName, fold, hasStroke, levelCount, levelGram, levelHanzi, levelWords, lvName, lvsFor, meaning, pyPairs, wLevel, wordMatches } from '../content/data.js';
import { $, esc, view } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { S, store } from '../core/state.js';
import { L, num, reducedMotion, tr } from '../core/util.js';
import { py } from '../features/pinyin.js';
import { speak } from '../features/speech.js';
import { gridSvg, mountLibWriter, releaseWriters, wStatus } from '../features/writer.js';

/* ---------- Thư viện ---------- */
const PAGE = 60;
function renderLibrary() {
  const lb = S.lib, n = lb.lvl;
  const tabs = [
    ['words', tr('Từ vựng', 'Vocabulary'), levelWords(n).length],
    ['hanzi', tr('Chữ Hán', 'Characters'), levelHanzi(n).length],
    ['grammar', tr('Ngữ pháp', 'Grammar'), levelGram(n).length]
  ];
  view.innerHTML = `
  <div class="lhead"><h1>${tr('Thư viện HSK', 'HSK library')}</h1></div>
  ${verSeg()}
  <p class="vernote">${S.ver === '20'
    ? tr('Đề cương HSK 2.0 (6 cấp: 150, 150, 300, 600, 1.300, 2.500 từ), khớp với bộ Giáo trình chuẩn HSK. Ngữ pháp cấp 1 lấy theo từng bài của giáo trình.', 'HSK 2.0 syllabus (6 levels), matching the HSK Standard Course. Level 1 grammar follows the textbook lessons.')
    : tr('Đề cương HSK 3.0 áp dụng từ 07/2026 (HSK 1 khoảng 300 từ), khớp với bộ 新HSK教程. Chữ Hán và ngữ pháp tham chiếu chuẩn GF0025-2021, nền tảng của HSK 3.0.', 'HSK 3.0 syllabus effective July 2026, matching 新HSK教程. Characters and grammar reference the GF0025-2021 standard.')}</p>
  <div class="lvlbar" role="group" aria-label="${tr('Cấp độ', 'Level')}">
    ${lvsFor().map(k => `<button class="lchip" data-act="lvl" data-arg="${k}" aria-pressed="${k === n}"><b>HSK ${lvName(k)}</b><span>${num(levelCount('w', k))} ${tr('từ', 'words')}</span></button>`).join('')}
  </div>
  <div class="tabs" role="tablist">
    ${tabs.map(([k, l, c]) => `<button class="tab" role="tab" data-act="libtab" data-arg="${k}" aria-selected="${lb.tab === k}">${l}<span class="cnt">${num(c)}</span></button>`).join('')}
  </div>
  <div class="libtools">
    <div class="searchbox">${ic('search')}
      <label class="sr" for="libQ">${tr('Tìm kiếm', 'Search')}</label>
      <input class="inp" id="libQ" type="search" autocomplete="off" value="${esc(lb.q)}" placeholder="${lb.tab === 'grammar' ? tr('Tìm điểm ngữ pháp, ví dụ 比 hoặc so sánh', 'Search grammar, e.g. 比') : tr('Tìm chữ Hán, pinyin hoặc nghĩa', 'Search characters, pinyin or meaning')}">
    </div>
    ${lb.tab === 'words' ? `<button class="btn btn-sm" data-act="lvlprac" data-arg="${n}">${ic('target')}${tr('Luyện tập', 'Practice')}</button>
    <button class="btn btn-ghost btn-sm" data-act="lvlcards" data-arg="${n}">${ic('cards')}${tr('Ôn thẻ', 'Flashcards')}</button>` : ''}
  </div>
  <div id="libRes"></div>`;
  renderLibResults();
}
function renderLibResults() {
  const box = $('#libRes');
  if (!box) return;
  releaseWriters();
  const n = S.lib.lvl;
  if (S.lib.tab === 'words') box.innerHTML = libWords(n);
  else if (S.lib.tab === 'hanzi') { box.innerHTML = libHanzi(n); mountLibWriter(); }
  else box.innerHTML = libGrammar(n);
}
function libWords(n) {
  const all = wordMatches(levelWords(n), S.lib.q);
  if (!all.length) return `<p class="empty-note">${tr('Không có từ nào khớp. Thử gõ pinyin không dấu, ví dụ "pengyou", hoặc nghĩa tiếng Việt không dấu.', 'No matching words. Try pinyin without tones, e.g. "pengyou".')}</p>`;
  const pages = Math.ceil(all.length / PAGE);
  const pg = Math.min(Math.max(S.lib.page, 0), pages - 1);
  S.lib.page = pg;
  const other = S.ver === '20' ? 'l25' : 'l20';
  const otherName = S.ver === '20' ? 'HSK 3.0' : 'HSK 2.0';
  const rows = all.slice(pg * PAGE, (pg + 1) * PAGE);
  return `<p class="hint">${num(all.length)} ${tr('từ', 'words')}${pages > 1 ? `, ${tr('trang', 'page')} ${pg + 1}/${pages}` : ''}</p>
  <div class="wlist">${rows.map(w => `<div class="wrow">
    <button class="icon-btn spk-b" data-act="speak" data-arg="${w.s}" aria-label="${tr('Nghe', 'Listen to')} ${w.s}">${ic('volume')}</button>
    <span class="wz" lang="zh-CN">${w.s}</span>
    <span class="wp">${py(pyPairs(w))}</span>
    <span class="wm">${esc(meaning(w))}${S.lang === 'vi' && !w.vi ? `<span class="en-tag" title="${tr('Nghĩa tiếng Việt đang được biên soạn', '')}">EN</span>` : ''}${S.lang === 'vi' && w.hv ? `<small>${esc(w.hv)}</small>` : ''}</span>
    <span class="wlv">${w[other] ? `${otherName}: HSK ${lvName(w[other])}` : ''}</span>
  </div>`).join('')}</div>
  ${pages > 1 ? `<div class="pager">
    <button class="btn btn-ghost btn-sm" data-act="page" data-arg="-1" ${pg === 0 ? 'disabled' : ''}>${ic('back')}${tr('Trước', 'Prev')}</button>
    <span>${pg + 1} / ${pages}</span>
    <button class="btn btn-ghost btn-sm" data-act="page" data-arg="1" ${pg >= pages - 1 ? 'disabled' : ''}>${tr('Sau', 'Next')}${ic('chev')}</button>
  </div>` : ''}`;
}
function libHanzi(n) {
  const q = S.lib.q.trim(), fq = fold(q);
  const list = levelHanzi(n).filter(h => !q || q.includes(h.c) || fold(h.py).startsWith(fq) || fold(h.hv) === fq);
  if (!list.length) return `<p class="empty-note">${tr('Không có chữ nào khớp.', 'No matching characters.')}</p>`;
  if (!list.some(h => h.c === S.lib.char)) S.lib.char = list[0].c;
  const h = list.find(x => x.c === S.lib.char);
  const has = hasStroke(h.c);
  const related = WORDS.filter(w => w.s.length > 1 && w.s.includes(h.c) && wLevel(w) && wLevel(w) <= n).slice(0, 8);
  return `<p class="hint">${S.ver === '20' ? tr('HSK 2.0 không có bảng chữ riêng: đây là các chữ xuất hiện lần đầu trong từ vựng của cấp này.', 'Characters appearing for the first time in this level’s vocabulary.') : tr('Danh sách chữ theo chuẩn 2021 (đề cương 2026 chưa tách chữ theo cấp).', 'Character list of the 2021 standard.')}</p>
  <div class="card hzpanel">
    <div class="gbox md">${gridSvg()}${has ? '<div class="writer" id="libW"></div>' : `<div class="hzstatic" lang="zh-CN">${h.c}</div>`}</div>
    <div class="winfo">
      <div class="big-py">${py([[h.py, h.tn]])}</div>
      ${S.lang === 'vi' && h.hv ? `<div class="m">${tr('Hán Việt', 'Sino-Vietnamese')}: ${esc(h.hv)}</div>` : ''}
      <div class="meta">${h.sc ? `${h.sc} ${tr('nét', 'strokes')}. ` : ''}${has ? tr('Phần tô đỏ là bộ thủ.', 'The red part is the radical.') : ''}</div>
      ${has ? `<div class="wbtns">
          <button class="btn btn-ghost btn-sm" data-act="wanim">${ic('play')}${tr('Xem cách viết', 'Show strokes')}</button>
          <button class="btn btn-sm" data-act="wquiz">${ic('pen')}${tr('Tự viết', 'Write it')}</button>
          <button class="icon-btn spk-b" data-act="speak" data-arg="${h.c}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button>
        </div><div class="wstatus" id="wStatus" aria-live="polite"></div>`
      : `<p class="hint">${tr('Bản chính thức tải dữ liệu nét của mọi chữ theo nhu cầu. Bản demo chỉ nhúng sẵn các chữ HSK 1.', 'The full version loads stroke data on demand; this demo bundles HSK 1 characters only.')}</p>
         <button class="icon-btn spk-b" data-act="speak" data-arg="${h.c}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button>`}
      ${related.length ? `<div class="hzwords">${related.map(w => `<button class="chipw" data-act="speak" data-arg="${w.s}"><span class="zh" lang="zh-CN">${w.s}</span><small>${esc(meaning(w))}</small></button>`).join('')}</div>` : ''}
    </div>
  </div>
  <div class="hzgrid">${list.map(x => `<button class="hz ${x.c === h.c ? 'on' : ''}" data-act="hz" data-arg="${x.c}" aria-pressed="${x.c === h.c}"><span class="zh" lang="zh-CN">${x.c}</span><small class="t${x.tn}">${esc(x.py)}</small></button>`).join('')}</div>`;
}
function libGrammar(n) {
  const raw = S.lib.q.trim(), q = fold(raw);
  const list = levelGram(n).filter(g => !q || fold(g.zh).includes(q) || fold(g.vi).includes(q) || fold(g.note).includes(q) || g.code.includes(raw) || g.ex.some(e => e.zh.includes(raw)));
  if (!levelGram(n).length) return `<p class="empty-note">${tr(`Ngữ pháp HSK 2.0 cấp ${n} sẽ được bổ sung khi có giáo trình tương ứng.`, 'Grammar for this level will be added with its textbook.')}</p>`;
  if (!list.length) return `<p class="empty-note">${tr('Không có điểm ngữ pháp nào khớp.', 'No matching grammar points.')}</p>`;
  const noVi = S.lang === 'vi' && !list.some(g => g.vi);
  const refNote = S.ver === '30' ? `<p class="hint">${tr('Đây là ngữ pháp tham chiếu theo cấp. Ngữ pháp theo từng bài của giáo trình 新HSK教程 nằm trong mục Bài học.', 'Reference grammar by level; per-lesson grammar is in Lessons.')}</p>` : '';
  let last = '';
  return `${refNote}${noVi ? `<div class="note" style="margin:0 0 12px"><p>${tr('Giải thích tiếng Việt cho cấp này đang được biên soạn. Hiện đã có tên điểm ngữ pháp gốc, pinyin và toàn bộ câu ví dụ theo chuẩn.', '')}</p></div>` : ''}
  <div>${list.map(g => {
    const cat = g.cat.join('/');
    const head = cat !== last ? `<h3 class="gcat">${esc(catName(g.cat))}</h3>` : '';
    last = cat;
    const title = S.lang === 'vi' && g.vi ? `<b>${esc(g.vi)}</b><span class="zh">${esc(g.zh)}</span>` : `<b class="zh">${esc(g.zh)}</b>`;
    return head + `<details class="gp"><summary><span class="gcode" title="${esc(g.code)}">#${esc(g.code.replace(/^\D+/, ''))}</span><span class="gt">${title}</span>${ic('chev', 'gchev')}</summary>
      <div class="gbody">
        ${S.lang === 'vi' && g.note ? `<p class="gnote">${esc(g.note)}</p>` : ''}
        <ul class="exs">${g.ex.map(e => e.k === 'h'
          ? `<li class="exh" lang="zh-CN">${esc(e.zh)}</li>`
          : `<li><button class="icon-btn spk-b" data-act="speak" data-arg="${esc(e.zh)}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button><div><span class="zh" lang="zh-CN">${esc(e.zh)}</span><span class="p">${esc(e.py || '')}</span>${S.lang === 'vi' && e.vi ? `<span class="tr">${esc(e.vi)}</span>` : ''}</div></li>`).join('')}</ul>
      </div></details>`;
  }).join('')}</div>`;
}

const LIB_ACT = {
  ver(a) {
    S.ver = a; store.set('ver', a); S.lib.page = 0; S.lib.char = null;
    if (!lvsFor().includes(S.lib.lvl)) S.lib.lvl = lvsFor().slice(-1)[0];
    if (!BOOKS[bookId(a, S.bookLv)]) { S.bookLv = 1; store.set('bookLv', 1); }
    S.bl = 1;
    if (S.deck && S.deck.startsWith('B')) S.deck = `B${bPre(a, S.bookLv)}-1`;
    render({ keepScroll: true });
  },
  lvl(a) { Object.assign(S.lib, { lvl: +a, page: 0, char: null }); store.set('lib', { lvl: S.lib.lvl, tab: S.lib.tab }); render({ keepScroll: true }); },
  libtab(a) { Object.assign(S.lib, { tab: a, q: '', page: 0 }); store.set('lib', { lvl: S.lib.lvl, tab: a }); render({ keepScroll: true }); },
  golvl(a) { Object.assign(S.lib, { lvl: +a, tab: 'words', q: '', page: 0, char: null }); store.set('lib', { lvl: +a, tab: 'words' }); go('library'); },
  page(a) {
    S.lib.page += +a;
    renderLibResults();
    const top = $('#libRes').getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  },
  hz(a) {
    S.lib.char = a;
    renderLibResults();
    const top = $('#libRes').getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  },
  lvlprac(a) { S.pracSrc = { lvl: +a, ver: S.ver }; go('practice'); },
  lvlcards(a) { S.deck = 'L' + a; store.set('deck', S.deck); go('cards'); }
};

export { LIB_ACT, PAGE, libGrammar, libHanzi, libWords, renderLibResults, renderLibrary };
