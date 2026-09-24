import { bKey, bookOf } from '../content/books.js';
import { lvName, verName } from '../content/data.js';
import { $, $$, esc, view } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { S, saveP } from '../core/state.js';
import { L, shuffle, tr } from '../core/util.js';
import { buildLevelSession } from '../features/level-session.js';
import { parsePinyin, py } from '../features/pinyin.js';
import { KIND, buildSession } from '../features/session.js';
import { speak } from '../features/speech.js';
import { addXP } from '../features/xp.js';
import { buildBookSession } from '../views/book.js';

/* ---------- Luyện tập ---------- */
let P = null;
const cur = () => P.items[P.i];
const optLabel = (it, o) => (typeof o.o === 'string' ? o.o : L(o.o));
function startPractice() {
  const src = S.pracSrc;
  const byBook = src && src.book;
  const byLevel = src && src !== 'lesson' && !byBook;
  const items = byBook ? buildBookSession(src.book, src.lv || 1, src.n) : byLevel ? buildLevelSession(src.lvl, src.ver) : buildSession();
  const label = byBook
    ? `${verName(src.book)}, ${tr('quyển', 'book')} ${src.lv || 1}, ${tr('bài', 'lesson')} ${src.n}: ${(bookOf(src.book, src.lv || 1).lessons.find(x => x.n === src.n) || {}).zh || ''}`
    : byLevel ? `${verName(src.ver)}, ${tr('cấp', 'level')} ${lvName(src.lvl)}` : tr('Nhập môn: 你好', 'Starter: 你好');
  P = { items, label, i: 0, right: 0, xp: 0, t0: Date.now(), finished: null };
  initStep();
}
function initStep() {
  const it = cur();
  Object.assign(P, { sel: null, checked: false, order: [], mistakes: 0, lock: false });
  if (it.tiles) P.tiles = shuffle(it.tiles);
  if (it.pairs) P.m = { L: shuffle(it.pairs.map((_, i) => i)), R: shuffle(it.pairs.map((_, i) => i)), sl: null, sr: null, done: [], bad: [] };
}
function renderPractice() {
  if (!P) startPractice();
  if (P.finished) return renderFinish();
  const it = cur(), n = P.items.length;
  let stim = '';
  if (it.type === 'listen') stim = `<div class="stim"><button class="speaker" data-act="speak" data-arg="${it.audio}" aria-label="${tr('Nghe lại', 'Play again')}">${ic('volume')}</button><span class="hint">${tr('Bấm để nghe lại', 'Tap to replay')}</span></div>`;
  else if (it.hanzi) stim = `<div class="stim"><span class="zh" lang="zh-CN">${it.hanzi}</span><button class="icon-btn spk-b" data-act="speak" data-arg="${it.hanzi}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button></div>`;
  else if (it.quote) stim = `<div class="stim"><span class="quote ${it.quoteZh ? 'zh' : ''}">${esc(L(it.quote))}</span></div>`;

  let body = '';
  if (it.options) {
    body = `<div class="opts">${it.options.map((o, i) => `<button class="opt ${it.optZh ? 'zh-o' : ''} ${it.optPy ? 'py-o' : ''}" data-act="opt" data-arg="${i}"><span class="k">${i + 1}</span><span>${esc(optLabel(it, o))}</span></button>`).join('')}</div>`;
  } else if (it.tiles) {
    body = `<div id="orderBox">${orderHtml()}</div>`;
  } else if (it.pairs) {
    body = `<div id="matchBox">${matchHtml()}</div>`;
  } else if (it.type === 'type') {
    body = `<label class="sr" for="pyInput">${tr('Pinyin', 'Pinyin')}</label>
      <input class="inp" id="pyInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${tr('Ví dụ: ni3 hao3 hoặc nǐ hǎo', 'e.g. ni3 hao3 or nǐ hǎo')}">
      <div class="err" id="pyErr" role="alert"></div>
      <div class="hint">${tr('Có thể gõ số thanh (1–4) sau mỗi âm tiết, hoặc gõ dấu thanh. Với bàn phím Telex, dấu hỏi (ả) được hiểu là thanh 3.', 'Type tone numbers (1–4) after each syllable, or use tone marks.')}</div>`;
  }

  view.innerHTML = `
  <div class="prac">
    <div class="prac-top">
      <button class="icon-btn" data-act="nav" data-arg="home" aria-label="${tr('Thoát bài luyện tập', 'Quit practice')}">${ic('x')}</button>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${P.i}"><span style="width:${(P.i / n) * 100}%"></span></div>
      <span class="prac-count">${P.i + 1}/${n}</span>
    </div>
    <div class="prac-body">
      <span class="prac-src">${esc(P.label)}</span>
      <span class="kind">${esc(L(it.kindLabel || KIND[it.type]))}</span>
      <h2 class="prac-q">${esc(L(it.prompt))}</h2>
      ${stim}${body}
    </div>
    <div class="checkbar" id="checkbar">
      <div class="fb" id="fb" aria-live="polite"></div>
      <button class="btn" id="checkBtn" data-act="check" ${it.type === 'type' ? '' : 'disabled'}>${tr('Kiểm tra', 'Check')}</button>
    </div>
  </div>`;
  if (it.type === 'listen') setTimeout(() => speak(it.audio), 250);
  if (it.type === 'type') $('#pyInput').focus();
}
function orderHtml() {
  const dis = P.checked ? 'disabled' : '';
  return `<div class="aline" aria-label="${tr('Câu trả lời của bạn', 'Your answer')}">${P.order.map((id, pos) => `<button class="tile" data-act="tilerm" data-arg="${pos}" ${dis} lang="zh-CN">${esc(P.tiles[id])}</button>`).join('')}</div>
  <div class="bank">${P.tiles.map((t, id) => { const used = P.order.includes(id); return `<button class="tile ${used ? 'used' : ''}" data-act="tileadd" data-arg="${id}" ${used || P.checked ? 'disabled' : ''} ${used ? 'aria-hidden="true" tabindex="-1"' : ''} lang="zh-CN">${esc(t)}</button>`; }).join('')}</div>`;
}
function matchHtml() {
  const it = cur(), m = P.m;
  const cls = (side, i) => {
    const c = [];
    if (m.done.includes(i)) c.push('done');
    if ((side === 'L' ? m.sl : m.sr) === i) c.push('sel');
    if (m.bad.length && m.bad[side === 'L' ? 0 : 1] === i) c.push('wrong', 'shake');
    return c.join(' ');
  };
  return `<div class="match">
    <div class="col">${m.L.map(i => `<button class="opt zh-o ${cls('L', i)}" data-act="ml" data-arg="${i}" ${m.done.includes(i) ? 'disabled' : ''} lang="zh-CN">${it.pairs[i][0]}</button>`).join('')}</div>
    <div class="col">${m.R.map(i => `<button class="opt ${cls('R', i)}" data-act="mr" data-arg="${i}" ${m.done.includes(i) ? 'disabled' : ''}>${esc(L(it.pairs[i][1]))}</button>`).join('')}</div>
  </div>`;
}
function setCheckEnabled(on) { const b = $('#checkBtn'); if (b && !P.checked) b.disabled = !on; }
function selectOpt(i) {
  if (!P || P.checked) return;
  P.sel = i;
  $$('.opt').forEach((b, j) => b.classList.toggle('sel', j === i));
  setCheckEnabled(true);
}
function tryMatch() {
  const it = cur(), m = P.m;
  if (m.sl != null && m.sr != null) {
    if (m.sl === m.sr) { m.done.push(m.sl); speak(it.pairs[m.sl][0]); m.sl = m.sr = null; }
    else {
      P.mistakes++; m.bad = [m.sl, m.sr]; m.sl = m.sr = null; P.lock = true;
      setTimeout(() => { if (!P) return; m.bad = []; P.lock = false; const box = $('#matchBox'); if (box) box.innerHTML = matchHtml(); }, 500);
    }
  }
  $('#matchBox').innerHTML = matchHtml();
  if (m.done.length === it.pairs.length) { setCheckEnabled(true); setTimeout(() => { if (P && !P.checked) check(); }, 350); }
}
const PRAISE = [{ vi: 'Chính xác!', en: 'Correct!' }, { vi: 'Tuyệt vời!', en: 'Great job!' }, { vi: 'Chuẩn luôn!', en: 'Spot on!' }];
function check() {
  const it = cur();
  let ok = false, ans = '', title = '';
  if (it.options) {
    if (P.sel == null) return;
    ok = it.options[P.sel].ok;
    ans = optLabel(it, it.options.find(o => o.ok));
  } else if (it.tiles) {
    if (!P.order.length) return;
    ok = P.order.map(id => P.tiles[id]).join('') === it.answer.join('');
    ans = it.ansText || (it.answer.join('') + (it.type === 'rewrite' ? '？' : '。'));
  } else if (it.type === 'type') {
    const inp = $('#pyInput'), v = inp.value.trim();
    if (!v) { $('#pyErr').textContent = tr('Nhập pinyin trước khi kiểm tra.', 'Type the pinyin before checking.'); inp.focus(); return; }
    const r = parsePinyin(v);
    ok = r.letters === it.letters && r.tones.join() === it.tones.join();
    if (!ok && r.letters === it.letters) title = tr('Đúng âm, sai thanh điệu', 'Right sounds, wrong tones');
    ans = it.display; inp.disabled = true;
  } else if (it.pairs) {
    ok = P.mistakes === 0;
    if (!ok) title = tr(`Đã ghép xong, nhưng sai ${P.mistakes} lần`, `All matched, with ${P.mistakes} mistake${P.mistakes > 1 ? 's' : ''}`);
  }
  P.checked = true;
  if (ok) { P.right++; P.xp += 10; }
  if (it.options) $$('.opt').forEach((b, i) => { b.disabled = true; b.classList.remove('sel'); if (it.options[i].ok) b.classList.add('right'); else if (i === P.sel) b.classList.add('wrong'); });
  if (it.tiles) $('#orderBox').innerHTML = orderHtml();
  $('#checkbar').classList.add(ok ? 'ok' : 'bad');
  const praise = L(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
  $('#fb').innerHTML = `<strong>${esc(title || (ok ? praise : tr('Chưa đúng rồi', 'Not quite')))}</strong>
    ${!ok && ans ? `<p>${tr('Đáp án đúng', 'Correct answer')}: <b class="${it.ansZh ? 'zh' : ''}" style="font-size:17px">${esc(ans)}</b></p>` : ''}
    ${it.explain ? `<p>${esc(L(it.explain))}</p>` : ''}`;
  const btn = $('#checkBtn');
  btn.textContent = tr('Tiếp tục', 'Continue'); btn.disabled = false; btn.focus();
  if (ok && it.tiles) speak(it.answer.join(''));
}
function nextStep() {
  P.i++;
  if (P.i >= P.items.length) {
    const n = P.items.length;
    P.finished = { acc: Math.round(P.right / n * 100), secs: Math.round((Date.now() - P.t0) / 1000) };
    S.p.answered += n; S.p.correct += P.right;
    if (S.pracSrc === 'lesson') S.p.practiced = true;
    if (S.pracSrc && S.pracSrc.book) { S.p.bdone = S.p.bdone || {}; S.p.bdone[bKey(S.pracSrc.n, S.pracSrc.book, S.pracSrc.lv || 1)] = 1; }
    addXP(P.xp);
    saveP();
  } else initStep();
  renderPractice();
  window.scrollTo(0, 0);
}
function renderFinish() {
  const f = P.finished, m = Math.floor(f.secs / 60), s = String(f.secs % 60).padStart(2, '0');
  view.innerHTML = `
  <div class="done-screen">
    <div class="zh-d" lang="zh-CN">${f.acc >= 80 ? '棒' : '加油'}</div>
    <h1>${f.acc >= 80 ? tr('Làm tốt lắm!', 'Nicely done!') : tr('Cố lên, ôn lại chút nữa nhé', 'Keep going, a bit more review')}</h1>
    <p>${f.acc >= 80 ? tr('棒 bàng nghĩa là "giỏi quá".', '棒 bàng means "awesome".') : tr('加油 jiāyóu nghĩa là "cố lên".', '加油 jiāyóu means "keep it up".')}</p>
    <div class="dstats">
      <div class="dstat" style="--c:var(--sun-d)"><div class="l">${tr('XP nhận được', 'XP earned')}</div><div class="v">+${P.xp}</div></div>
      <div class="dstat" style="--c:var(--jade)"><div class="l">${tr('Độ chính xác', 'Accuracy')}</div><div class="v">${f.acc}%</div></div>
      <div class="dstat" style="--c:var(--t1)"><div class="l">${tr('Thời gian', 'Time')}</div><div class="v">${m}:${s}</div></div>
    </div>
    <div class="done-btns">
      <button class="btn btn-ghost" data-act="again">${ic('refresh')}${tr('Luyện lại', 'Practice again')}</button>
      <button class="btn" data-act="nav" data-arg="home">${tr('Về trang chủ', 'Back to home')}</button>
    </div>
  </div>`;
}

/** Bỏ phiên luyện tập hiện tại (router gọi khi mở lại trang luyện tập). */
function resetPractice() { P = null; }
/** Phiên luyện tập hiện tại, cho module xử lý sự kiện (binding của let không import được). */
function curP() { return P; }

export { PRAISE, check, cur, curP, initStep, matchHtml, nextStep, optLabel, orderHtml, renderFinish, renderPractice, resetPractice, selectOpt, setCheckEnabled, startPractice, tryMatch };
