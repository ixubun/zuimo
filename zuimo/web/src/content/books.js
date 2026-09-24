import { BOOKS, meaning } from '../content/data.js';
import { $, esc } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { S } from '../core/state.js';
import { L, tr } from '../core/util.js';
import { py } from '../features/pinyin.js';
import { speak } from '../features/speech.js';

/* =====================================================================
   Lộ trình giáo trình (sinh bởi content-pipeline/build_books.py)
   BOOKS.hsk20_1: Giáo trình chuẩn HSK 1 (HSK标准教程, đề cương 2.0)
   BOOKS.hsk30_1: 新HSK教程 1 (đề cương 3.0)
   Mỗi bài: words (k: core | again), extra (vượt cấp, không bắt buộc), proper, grammar,
            pinyin/hanzi (chỉ 2.0), chars (chữ để tập viết)
   ===================================================================== */
/* BOOKS: mục lục nạp lúc khởi động, từng quyển nạp khi mở (xem content/data.js) */
/* Mỗi phiên bản có nhiều quyển: hsk20_1, hsk20_2, hsk30_1, hsk30_2… */
const bookId = (ver, lv) => `hsk${ver}_${lv}`;
const booksOfVer = (ver = S.ver) => [1, 2, 3, 4, 5, 6].filter(l => BOOKS[bookId(ver, l)]);
const bookOf = (ver = S.ver, lv = S.bookLv) => BOOKS[bookId(ver, lv)] || BOOKS[bookId(ver, 1)];
/* Khoá tiến độ/thẻ: quyển 1 giữ dạng cũ "20-5" để người dùng không mất tiến độ đã có; quyển sau là "20b2-5" */
const bPre = (ver, lv) => (lv === 1 ? ver : `${ver}b${lv}`);
const bKey = (n, ver = S.ver, lv = S.bookLv) => `${bPre(ver, lv)}-${n}`;
const bookTabs = (ver = S.ver) => [
  ['words', tr('Từ mới', 'Vocabulary')],
  ['dialogue', tr('Hội thoại', 'Dialogue')],
  ['grammar', tr('Ngữ pháp', 'Grammar')],
  ...(ver === '20' ? [['sounds', tr('Phát âm và chữ Hán', 'Sounds and characters')]] : []),
  ['writing', tr('Tập viết', 'Writing')]
];
function bookPct(n, ver = S.ver) {
  const seen = ((S.p.bseen || {})[bKey(n, ver)]) || {};
  return Math.round(Object.keys(seen).length / bookTabs(ver).length * 60 + (((S.p.bdone || {})[bKey(n, ver)]) ? 40 : 0));
}
const verSeg = () => `<div class="seggroup" role="group" aria-label="${tr('Giáo trình', 'Textbook')}">
  <button class="seg" data-act="ver" data-arg="20" aria-pressed="${S.ver === '20'}">HSK 2.0</button>
  <button class="seg" data-act="ver" data-arg="30" aria-pressed="${S.ver === '30'}">HSK 3.0</button></div>`;
const coreWords = L => (L.words || []).filter(w => w.k === 'core');
/* Số từ mới: dùng con số trong mục lục khi quyển chưa nạp đầy đủ */
const coreCount = L => (L.nCore != null ? L.nCore : coreWords(L).length);
const extraCount = L => (L.extra ? L.extra.length : L.nExtra || 0);

/* pinyin theo cách ghi của sách, giữ khoảng trắng và dấu cách âm, tô màu theo từng âm tiết */
function bookPy(w) {
  const bp = w.bp || '';
  if (!w.sy || bp.includes('/') || bp.includes('…')) return `<span class="py">${esc(bp || (w.sy || []).join(''))}</span>`;
  let i = 0;
  const parts = w.sy.map((s, k) => {
    i += s.length;
    let sp = '';
    while (i < bp.length && /[\s'’]/.test(bp[i])) { sp += bp[i]; i++; }
    return [s + sp, w.tn[k]];
  });
  return py(parts);
}
function wordRows(list) {
  return `<div class="wlist">${list.map(w => {
    const tag = w.from ? `${tr('ghép từ', 'from')} ${esc(w.from)}` : w.lvl ? esc(w.lvl) : w.k === 'again' ? `${tr('học ở bài', 'first in lesson')} ${w.ls[0]}` : '';
    return `<div class="wrow">
    <button class="icon-btn spk-b" data-act="speak" data-arg="${esc(w.s)}" aria-label="${tr('Nghe', 'Listen to')} ${esc(w.s)}">${ic('volume')}</button>
    <span class="wz" lang="zh-CN">${esc(w.s)}</span>
    <span class="wp">${bookPy(w)}</span>
    <span class="wm">${esc(meaning(w))}${S.lang === 'vi' && !w.vi ? '<span class="en-tag">EN</span>' : ''}${S.lang === 'vi' && w.hv ? `<small>${esc(w.hv)}</small>` : ''}</span>
    <span class="wlv">${tag}</span></div>`;
  }).join('')}</div>`;
}
const exLi = e => `<li><button class="icon-btn spk-b" data-act="speak" data-arg="${esc(e.zh)}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button><div><span class="zh" lang="zh-CN">${esc(e.zh)}</span><span class="p">${esc(e.py || '')}</span>${S.lang === 'vi' && e.vi ? `<span class="tr">${esc(e.vi)}</span>` : ''}</div></li>`;

export { bKey, bPre, bookId, bookOf, bookPct, bookPy, bookTabs, booksOfVer, coreCount, coreWords, exLi, extraCount, verSeg, wordRows };
