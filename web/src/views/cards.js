import { bPre, bookId, bookOf, booksOfVer, coreWords, verSeg } from '../content/books.js';
import { BOOKS, WMAP, levelWords, lvName, lvsFor, meaning, pyPairs, verName } from '../content/data.js';
import { VOCAB } from '../content/sample.js';
import { $, esc, view } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { S, store } from '../core/state.js';
import { queueSync } from '../core/sync.js';
import { L, num, shuffle, tr } from '../core/util.js';
import { py } from '../features/pinyin.js';
import { addXP } from '../features/xp.js';

/* ---------- Thẻ ghi nhớ (lịch ôn đơn giản; giai đoạn 3 thay bằng FSRS) ---------- */
let C = null;
/* Bộ thẻ: 'lesson' = từ vựng bài 1; 'L1'...'L7' = cấp HSK theo phiên bản đang chọn.
   Mỗi lượt = thẻ đến hạn + tối đa NEW_PER_SESSION từ mới để không bị ngợp. */
const NEW_PER_SESSION = 15;
function deckWords(deck) {
  if (deck === 'lesson') return VOCAB.map(v => WMAP[v.h]).filter(Boolean);
  if (deck === 'D') return Object.values(S.p.dictSaved || {});   /* từ người dùng lưu từ Từ điển */
  if (deck.startsWith('B')) {   /* B20-3 = giáo trình 2.0, bài 3; chỉ từ mới chính, không gồm từ mở rộng */
    const [pre, n] = deck.slice(1).split('-');
    const [ver, lv] = pre.includes('b') ? [pre.split('b')[0], +pre.split('b')[1]] : [pre, 1];
    const B = BOOKS[bookId(ver, lv)];
    const L = B && B.lessons.find(x => x.n === +n);
    return L ? coreWords(L) : [];
  }
  return levelWords(+deck.slice(1));
}
function startCards() {
  const ws = deckWords(S.deck), now = Date.now();
  const due = ws.filter(w => S.srs[w.s] && S.srs[w.s].due <= now).map(w => w.s);
  const fresh = ws.filter(w => !S.srs[w.s]).slice(0, S.deck === 'lesson' ? 50 : NEW_PER_SESSION).map(w => w.s);
  C = { queue: [...shuffle(due), ...fresh], flipped: false, reviewed: 0, total: ws.length, map: Object.fromEntries(ws.map(w => [w.s, w])) };
}
function ivl(g, s) { const r = s.reps || 0; return { again: 60e3, hard: 6 * 60e3, good: 864e5 * 2 ** r, easy: 864e5 * 4 * 2 ** r }[g]; }
function fmtIvl(ms) {
  const m = ms / 60e3;
  if (m < 60) return m <= 1 ? tr('<1 phút', '<1 min') : `${Math.round(m)} ${tr('phút', 'min')}`;
  return `${Math.round(ms / 864e5)} ${tr('ngày', 'd')}`;
}
function cardCtl() {
  if (!C.flipped) return `<button class="btn btn-block" data-act="flip">${tr('Lật thẻ', 'Show answer')}</button>`;
  const s = S.srs[C.queue[0]] || {};
  const b = (g, cls, l) => `<button class="btn ${cls}" data-act="rate" data-arg="${g}">${l}<small>${fmtIvl(ivl(g, s))}</small></button>`;
  return `<div class="rates">${b('again', 'r-again', tr('Quên', 'Again'))}${b('hard', 'r-hard', tr('Khó', 'Hard'))}${b('good', '', tr('Nhớ', 'Good'))}${b('easy', 'r-easy', tr('Dễ', 'Easy'))}</div>`;
}
function renderCards() {
  if (!C) startCards();
  const decks = lvsFor().map(k => ['L' + k, 'HSK ' + lvName(k)]);
  const B = bookOf();
  const deckSel = `<select class="sel" id="deckSel" aria-label="${tr('Chọn bài', 'Choose a lesson')}">
    ${S.deck.startsWith('B') ? '' : `<option value="">${tr('Chọn bài…', 'Choose a lesson…')}</option>`}
    ${Object.keys(S.p.dictSaved || {}).length ? `<option value="D" ${S.deck === 'D' ? 'selected' : ''}>${tr('Từ đã lưu từ Từ điển', 'Saved from Dictionary')} (${Object.keys(S.p.dictSaved).length})</option>` : ''}
    ${booksOfVer().map(lv => `<optgroup label="${tr('Quyển', 'Book')} ${lv}">${BOOKS[bookId(S.ver, lv)].lessons.map(L => {
      const v = `B${bPre(S.ver, lv)}-${L.n}`;
      return `<option value="${v}" ${S.deck === v ? 'selected' : ''}>${tr('Bài', 'Lesson')} ${L.n}: ${esc(L.zh)}</option>`;
    }).join('')}</optgroup>`).join('')}</select>`;
  const head = `<div class="lhead"><h1>${tr('Thẻ ghi nhớ', 'Flashcards')}</h1></div>
  <p class="lead">${tr('Nhìn chữ, tự nhớ cách đọc và nghĩa rồi lật thẻ. Mức bạn chọn quyết định khi nào thẻ quay lại.', 'Look at the word, recall the reading and meaning, then flip. Your rating decides when the card comes back.')}</p>
  ${verSeg()}
  <div class="deckrow"><span class="lbl">${tr('Theo bài', 'By lesson')}</span>${deckSel}</div>
  <div class="deckrow" role="group" aria-label="${tr('Theo cấp', 'By level')}"><span class="lbl">${tr('Theo cấp', 'By level')}</span>${decks.map(([k, l]) => `<button class="pill" data-act="deck" data-arg="${k}" aria-pressed="${S.deck === k}">${l}</button>`).join('')}</div>
  <p class="hint" style="margin:0 0 8px">${S.deck.startsWith('B')
    ? tr(`Từ mới của bài (${num(C.total)} từ, không gồm từ mở rộng).`, `This lesson's words (${num(C.total)}).`)
    : tr(`Mỗi lượt gồm các thẻ đến hạn và tối đa ${NEW_PER_SESSION} từ mới. Bộ này có ${num(C.total)} từ (${verName()}).`, `Due cards plus up to ${NEW_PER_SESSION} new words. ${num(C.total)} words.`)}</p>`;
  if (!C.queue.length) {
    const next = Math.min(...deckWords(S.deck).map(v => (S.srs[v.s] ? S.srs[v.s].due : Infinity)));
    view.innerHTML = head + `<div class="card empty">
      <div class="zh-d" lang="zh-CN">好</div>
      <h2 class="sec" style="margin-top:12px">${tr('Đã ôn xong các thẻ đến hạn', 'All due cards reviewed')}</h2>
      <p>${C.reviewed ? tr(`Bạn vừa ôn ${C.reviewed} lượt. `, `You just did ${C.reviewed} reviews. `) : ''}${isFinite(next) ? tr('Thẻ tiếp theo đến hạn sau ', 'Next card is due in ') + fmtIvl(Math.max(0, next - Date.now())) + '.' : ''}</p>
      <button class="btn btn-ghost" data-act="cardsall">${ic('refresh')}${tr('Ôn lại toàn bộ', 'Review all again')}</button>
    </div>`;
    return;
  }
  const v = C.map[C.queue[0]] || WMAP[C.queue[0]];
  view.innerHTML = head + `<div class="fc-wrap">
    <div class="fc-meta"><span>${tr('Còn lại', 'Left')}: ${C.queue.length}</span><span>${tr('Đã ôn', 'Done')}: ${C.reviewed}</span></div>
    <button class="fc ${C.flipped ? 'flip' : ''}" data-act="flip" aria-label="${tr('Lật thẻ', 'Flip card')}">
      <div class="fc-in">
        <div class="face"><span class="h" lang="zh-CN">${v.s}</span><span class="tap">${tr('Chạm để lật', 'Tap to flip')}</span></div>
        <div class="face back"><span class="h" lang="zh-CN">${v.s}</span>${py(pyPairs(v))}<span class="m">${esc(meaning(v))}</span>${S.lang === 'vi' && v.hv ? `<span class="hv">${esc(v.hv)}</span>` : ''}</div>
      </div>
    </button>
    <div id="fcCtl">${cardCtl()}</div>
    <p class="fc-note">${tr('Lịch ôn ở bản thử nghiệm là ước lượng đơn giản; bản chính thức dùng thuật toán FSRS.', 'Intervals here are a simple estimate; the full version uses FSRS.')}</p>
  </div>`;
}
function rateCard(g) {
  const h = C.queue.shift(), s = Object.assign({ reps: 0, lapses: 0 }, S.srs[h]);
  s.due = Date.now() + ivl(g, s);
  if (g === 'again') { s.lapses++; s.reps = 0; C.queue.splice(Math.min(3, C.queue.length), 0, h); }
  else s.reps++;
  S.srs[h] = s; store.set('srs', S.srs); queueSync();
  C.reviewed++; C.flipped = false;
  addXP(g === 'again' ? 0 : 2);
  renderCards();
}

/** Bỏ phiên thẻ nhớ hiện tại. */
function resetCards() { C = null; }
/** Phiên thẻ nhớ hiện tại. */
function curC() { return C; }

export { NEW_PER_SESSION, cardCtl, curC, deckWords, fmtIvl, ivl, rateCard, renderCards, resetCards, startCards };
