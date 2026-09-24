/* ======================================================================
   Luyện viết (gõ chữ Hán).
   Ba chế độ:
     vi2zh   cho câu tiếng Việt, gõ câu chữ Hán tương ứng
     copy    cho câu chữ Hán KHÔNG có pinyin, gõ lại đúng (tuỳ chọn ẩn sau 5 giây để luyện trí nhớ)
     word    cho nghĩa Việt của một từ HSK, gõ từ đó
   Chấm bằng API attempt kind=writing (khoảng cách chỉnh sửa, tô màu từng chữ), cộng XP.

   Bộ gõ pinyin trên trang: người dùng chưa cài bàn phím tiếng Trung vẫn gõ được.
   Gõ pinyin không dấu vào ô nhỏ, gợi ý lấy từ từ điển (từ HSK lên trước); Space hoặc số 1–9 để chọn,
   Enter chèn nguyên pinyin, Backspace khi ô trống thì xoá chữ cuối của câu trả lời.
   ====================================================================== */
import { $, esc, view } from '../core/dom.js';
import { S, saveP, store } from '../core/state.js';
import { tr } from '../core/util.js';
import { ic } from '../core/icons.js';
import { API } from '../core/sync.js';
import { toast } from '../features/speech.js';
import { addXP } from '../features/xp.js';
import { render } from '../app/router.js';
import { showAuthModal } from './profile.js';

S.write = S.write || { mode: 'vi2zh', ver: null, lvl: 1, items: [], idx: 0, result: null, busy: false, loadedKey: null,
  hint: false, hideAfter: false, hidden: false, ime: store.get('imeOn', false), cands: [], stats: null };
const W = S.write;
let hideT = null, imeT = null, imeSeq = 0;

/* ---------------------------------------------------------------- dữ liệu */
const key = () => `w:${W.mode}:${W.ver || S.ver}:${W.lvl}`;
async function loadItems(force = false) {
  const k = key();
  if (!force && W.loadedKey === k) return;
  W.loadedKey = k; W.busy = true; W.items = []; W.result = null; W.hint = false; W.hidden = false; render();
  try {
    const { data } = await API.call(`/practice/writing/items?ver=${W.ver || S.ver}&lvl=${W.lvl}&n=10&mode=${W.mode === 'word' ? 'word' : 'sentence'}`);
    W.items = data.items; W.idx = 0;
  } catch (e) { toast(e.message); }
  W.busy = false; render();
}
async function loadStats() { W.stats = { stats: null }; try { const { data } = await API.call('/practice/history?kind=writing&n=5'); W.stats = data; } catch (e) { /* */ } }
const current = () => W.items[W.idx];

async function check() {
  const it = current(); const inp = $('#wrAnswer'); if (!it || !inp) return;
  const answer = inp.value.trim();
  if (!answer) { toast(tr('Hãy gõ câu trả lời.', 'Type your answer.')); return; }
  W.busy = true; render();
  try {
    const { data } = await API.call('/practice/attempt', { method: 'POST', body: { kind: 'writing', itemRef: it.ref, target: it.zh, answer, detail: { mode: W.mode, hint: W.hint, ime: W.ime } } });
    W.result = { ...data, answer };
    if (data.xp) { addXP(data.xp); saveP(); }
  } catch (e) { toast(e.message); }
  W.busy = false; render();
}
function next() {
  W.result = null; W.hint = false; W.hidden = false; clearTimeout(hideT);
  if (W.idx < W.items.length - 1) { W.idx++; render(); } else loadItems(true);
}

/* ---------------------------------------------------------------- bộ gõ pinyin */
async function imeSuggest(q) {
  const plain = q.toLowerCase().replace(/[^a-z]/g, '');
  const box = $('#imeCands'); if (!box) return;
  if (!plain) { W.cands = []; box.innerHTML = ''; return; }
  const seq = ++imeSeq;
  try {
    const { data } = await API.call('/practice/ime?q=' + encodeURIComponent(plain));
    if (seq !== imeSeq) return;
    W.cands = data.cands; drawCands();
  } catch (e) { /* mất mạng: bỏ qua */ }
}
function drawCands() {
  const box = $('#imeCands'); if (!box) return;
  box.innerHTML = W.cands.map((c, i) => `<button class="imecand" data-act="wrpick" data-arg="${i}" tabindex="-1"><small>${i + 1}</small><span class="zh" lang="zh-CN">${esc(c.s)}</span><em>${esc(c.py)}</em></button>`).join('');
}
function insertAtCursor(text) {
  const ta = $('#wrAnswer'); if (!ta) return;
  const a = ta.selectionStart, b = ta.selectionEnd;
  ta.value = ta.value.slice(0, a) + text + ta.value.slice(b);
  ta.selectionStart = ta.selectionEnd = a + text.length;
}
function pick(i) {
  const c = W.cands[i]; if (!c) return;
  insertAtCursor(c.s);
  const ime = $('#imeInput'); if (ime) { ime.value = ''; ime.focus(); }
  W.cands = []; drawCands();
}

/* ---------------------------------------------------------------- hiển thị */
const opsHtml = ops => ops.map(o => o.op === 'ok' ? `<span class="ls-ok">${esc(o.c)}</span>`
  : o.op === 'sub' ? `<span class="ls-bad" title="${tr('bạn gõ', 'you typed')}: ${esc(o.got)}">${esc(o.c)}<small>${esc(o.got)}</small></span>`
  : o.op === 'miss' ? `<span class="ls-miss">${esc(o.c)}</span>` : `<span class="ls-extra">${esc(o.got)}</span>`).join('');
const scoreCls = s => (s >= 80 ? 'good' : s >= 60 ? 'mid' : 'low');

function promptHtml(it) {
  if (W.mode === 'vi2zh') return `<div class="wr-prompt"><span class="wr-label">${tr('Dịch sang chữ Hán', 'Translate into Chinese')}</span><div class="wr-vi">${esc(it.vi)}</div>${W.hint ? `<div class="ls-hint">Pinyin: <span class="dpy">${esc(it.py || '')}</span></div>` : ''}</div>`;
  if (W.mode === 'word') return `<div class="wr-prompt"><span class="wr-label">${tr('Gõ từ có nghĩa', 'Type the word meaning')}</span><div class="wr-vi">${esc(it.vi)}</div><div class="muted">${it.nchar} ${tr('chữ', 'characters')}${it.hv ? ` · ${tr('Hán Việt', 'Sino-Vietnamese')}: ${esc(it.hv)}` : ''}</div>${W.hint ? `<div class="ls-hint">Pinyin: <span class="dpy">${esc(it.py || '')}</span></div>` : ''}</div>`;
  return `<div class="wr-prompt"><span class="wr-label">${tr('Gõ lại đúng câu này', 'Type this sentence exactly')}</span>
    <div class="wr-zh zh ${W.hidden ? 'hidden' : ''}" lang="zh-CN">${W.hidden ? `<button class="btn btn-ghost btn-sm" data-act="wrshow">${ic('eye')}${tr('Xem lại', 'Show again')}</button>` : esc(it.zh)}</div>
    ${W.hint ? `<div class="ls-hint">Pinyin: <span class="dpy">${esc(it.py || '')}</span>${it.vi ? ` · ${esc(it.vi)}` : ''}</div>` : ''}</div>`;
}

function imeHtml() {
  if (!W.ime) return '';
  return `<div class="ime">
    <div class="ime-row"><span class="ime-tag">拼音</span><input class="inp ime-in" id="imeInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${tr('gõ pinyin không dấu: nihao, xuexi…', 'type pinyin: nihao, xuexi…')}"></div>
    <div class="ime-cands" id="imeCands"></div>
    <p class="hint">${tr('Space hoặc số 1–9 để chọn chữ · Enter chèn nguyên chữ Latin · Backspace khi ô trống xoá chữ cuối của câu trả lời.', 'Space or 1–9 to pick · Enter inserts Latin text · Backspace on empty box deletes the last answer character.')}</p>
  </div>`;
}

export function renderWrite() {
  if (!S.user) { view.innerHTML = `<div class="lhead"><h1>${tr('Luyện viết', 'Writing')}</h1></div><p class="lead">${tr('Bạn cần đăng nhập để luyện tập.', 'Sign in to practise.')}</p>`; showAuthModal('write'); return; }
  if (!S.api.on) { view.innerHTML = `<div class="lhead"><h1>${tr('Luyện viết', 'Writing')}</h1></div><p class="empty-note">${tr('Phần luyện viết cần máy chủ Zuimó.', 'Writing practice needs the Zuimó server.')}</p>`; return; }
  const lvls = (W.ver || S.ver) === '30' ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6];
  const it = current(), r = W.result, st = W.stats && W.stats.stats;
  view.innerHTML = `
  <div class="lhead"><button class="icon-btn" data-act="back" aria-label="${tr('Quay lại', 'Back')}">${ic('back')}</button><h1>${tr('Luyện viết', 'Writing')}</h1></div>
  <p class="lead">${tr('Gõ chữ Hán bằng bàn phím: dịch câu tiếng Việt, chép lại câu chữ Hán, hoặc gõ từ theo nghĩa.', 'Type Chinese: translate, copy, or type words by meaning.')}</p>
  <div class="ls-controls">
    <div class="seggroup"><button class="seg" data-act="wrmode" data-arg="vi2zh" aria-pressed="${W.mode === 'vi2zh'}">${tr('Việt → Hán', 'VI → ZH')}</button><button class="seg" data-act="wrmode" data-arg="copy" aria-pressed="${W.mode === 'copy'}">${tr('Chép câu Hán', 'Copy Chinese')}</button><button class="seg" data-act="wrmode" data-arg="word" aria-pressed="${W.mode === 'word'}">${tr('Từ vựng', 'Words')}</button></div>
    <div class="seggroup"><button class="seg" data-act="wrver" data-arg="20" aria-pressed="${(W.ver || S.ver) === '20'}">HSK 2.0</button><button class="seg" data-act="wrver" data-arg="30" aria-pressed="${(W.ver || S.ver) === '30'}">HSK 3.0</button></div>
    <div class="seggroup">${lvls.map(n => `<button class="seg" data-act="wrlvl" data-arg="${n}" aria-pressed="${W.lvl === n}">${n === 7 ? '7–9' : n}</button>`).join('')}</div>
    <button class="btn btn-ghost btn-sm ${W.ime ? 'on' : ''}" data-act="wrime" aria-pressed="${W.ime}">${ic('pen')}${tr('Bộ gõ pinyin', 'Pinyin keyboard')}</button>
    ${W.mode === 'copy' ? `<button class="btn btn-ghost btn-sm ${W.hideAfter ? 'on' : ''}" data-act="wrhide" aria-pressed="${W.hideAfter}">${ic('eye')}${tr('Ẩn sau 5 giây', 'Hide after 5 s')}</button>` : ''}
  </div>
  ${W.busy && !it ? `<p class="lead loading">${tr('Đang tải…', 'Loading…')}</p>` : !it ? `<p class="empty-note">${tr('Chưa có đề cho lựa chọn này.', 'No items for this selection.')}</p>` : `
  <div class="ls-card card">
    <div class="ls-top"><span class="muted">${tr('Câu', 'Item')} ${W.idx + 1}/${W.items.length}</span>${!r ? `<button class="btn btn-ghost btn-sm" data-act="wrhint">${ic('eye')}${W.hint ? tr('Ẩn gợi ý', 'Hide hint') : tr('Gợi ý pinyin', 'Pinyin hint')}</button>` : ''}</div>
    ${promptHtml(it)}
    ${r ? `<div class="ls-result">
      <div class="ls-score ${scoreCls(r.score)}"><b>${r.score}%</b><span>${r.correct}/${r.total} ${tr('chữ đúng', 'correct')}${r.xp ? ` · +${r.xp} XP` : ''}</span></div>
      <div class="ls-diff zh" lang="zh-CN">${opsHtml(r.ops)}</div>
      <div class="ls-answer"><div class="zh" lang="zh-CN">${esc(it.zh)} <button class="icon-btn sm" data-act="dictsay" data-arg="${esc(it.zh)}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button></div>${it.py ? `<div class="dpy">${esc(it.py)}</div>` : ''}${it.vi && W.mode !== 'vi2zh' ? `<div class="dvi">${esc(it.vi)}</div>` : ''}</div>
      <div class="btnrow" style="margin:12px 0 0"><button class="btn" data-act="wrnext">${tr('Câu tiếp', 'Next')}${ic('chev')}</button><button class="btn btn-ghost btn-sm" data-act="wrretry">${tr('Gõ lại', 'Try again')}</button><button class="btn btn-ghost btn-sm" data-act="dictgo" data-arg="${esc(it.zh.replace(/[，。！？；：、,.!?\s]/g, '').slice(0, 30))}">${ic('search')}${tr('Tra từ điển', 'Look up')}</button></div>
    </div>` : `
    <textarea id="wrAnswer" class="inp zh" lang="zh-CN" rows="2" autocomplete="off" spellcheck="false" placeholder="${tr('Gõ chữ Hán ở đây…', 'Type Chinese here…')}"></textarea>
    ${imeHtml()}
    <div class="btnrow" style="margin:10px 0 0"><button class="btn" data-act="wrcheck" ${W.busy ? 'disabled' : ''}>${ic('check')}${tr('Kiểm tra', 'Check')}</button><button class="btn btn-ghost btn-sm" data-act="wrnext">${tr('Bỏ qua', 'Skip')}</button></div>`}
  </div>`}
  ${st && st.attempts ? `<p class="hint">${tr(`Đã luyện ${st.attempts} câu, điểm trung bình ${st.avg_score}%, tuần này ${st.week} câu.`, `${st.attempts} attempts, average ${st.avg_score}%, ${st.week} this week.`)}</p>` : ''}`;
  if (!W.stats) loadStats();
  loadItems();
  if (W.mode === 'copy' && W.hideAfter && it && !r && !W.hidden) { clearTimeout(hideT); hideT = setTimeout(() => { if (S.route === 'write' && !W.result) { W.hidden = true; render({ keepScroll: true }); } }, 5000); }
  const focusEl = W.ime ? $('#imeInput') : $('#wrAnswer'); if (focusEl && !r) focusEl.focus();
}

/* phím trong ô pinyin và ô trả lời */
document.addEventListener('input', e => {
  if (e.target && e.target.id === 'imeInput') { clearTimeout(imeT); const v = e.target.value; imeT = setTimeout(() => imeSuggest(v), 120); }
});
document.addEventListener('keydown', e => {
  if (!e.target) return;
  if (e.target.id === 'imeInput') {
    const v = e.target.value;
    if (e.key === ' ' && W.cands.length) { e.preventDefault(); pick(0); return; }
    if (/^[1-9]$/.test(e.key) && W.cands.length && v) { e.preventDefault(); pick(+e.key - 1); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (v) { insertAtCursor(v); e.target.value = ''; W.cands = []; drawCands(); } else check(); return; }
    if (e.key === 'Backspace' && !v) { e.preventDefault(); const ta = $('#wrAnswer'); if (ta && ta.value) ta.value = ta.value.slice(0, -1); return; }
    if (e.key === 'Escape') { e.target.value = ''; W.cands = []; drawCands(); return; }
    if (e.key === 'Tab') { e.preventDefault(); const ta = $('#wrAnswer'); if (ta) ta.focus(); }
  }
  if (e.target.id === 'wrAnswer' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); check(); }
});

export const WRITE_ACT = {
  wrmode(a) { W.mode = a; render(); },
  wrver(a) { W.ver = a; W.lvl = Math.min(W.lvl, a === '20' ? 6 : 7); render(); },
  wrlvl(a) { W.lvl = +a; render(); },
  wrime() { W.ime = !W.ime; store.set('imeOn', W.ime); render({ keepScroll: true }); },
  wrhide() { W.hideAfter = !W.hideAfter; W.hidden = false; render({ keepScroll: true }); },
  wrshow() { W.hidden = false; clearTimeout(hideT); render({ keepScroll: true }); },
  wrhint() { W.hint = !W.hint; render({ keepScroll: true }); },
  wrcheck() { check(); },
  wrnext() { next(); },
  wrretry() { W.result = null; render({ keepScroll: true }); },
  wrpick(a) { pick(+a); }
};
