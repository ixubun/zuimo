import { go, render } from '../app/router.js';
import { strokeCount } from '../content/data.js';
import { DIALOGUE } from '../content/sample.js';
import { $, $$ } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { DEFAULT_P, S, saveP, store } from '../core/state.js';
import { tr } from '../core/util.js';
import { py } from '../features/pinyin.js';
import { speak, stopSpeech, toast, utter, voiceCheck } from '../features/speech.js';
import { wStatus } from '../features/writer.js';
import { addXP } from '../features/xp.js';
import { isDark } from '../ui/nav.js';
import { BOOK_ACT } from '../views/book.js';
import { cardCtl, curC, deckWords, rateCard, renderCards, resetCards } from '../views/cards.js';
import { LIB_ACT, renderLibResults } from '../views/library.js';
import { check, cur, curP, nextStep, orderHtml, selectOpt, setCheckEnabled, tryMatch } from '../views/practice.js';
import { AUTH_ACT } from '../views/profile.js';
import { DICT_ACT } from '../views/dict.js';
import { LISTEN_ACT } from '../views/listen.js';
import { ADMIN_ACT } from '../views/admin.js';
import { WRITE_ACT } from '../views/write.js';
import { SPEAK_ACT } from '../views/speak.js';
import { EXAM_ACT } from '../views/exam.js';
import { showAuthModal } from '../views/profile.js';

/* ---------- Event delegation ---------- */
const ACT = {
  nav(a) { if (a === 'practice') S.pracSrc = { lvl: S.lib.lvl, ver: S.ver }; go(a); },
  again() { go('practice'); },
  lessonprac() { S.pracSrc = 'lesson'; go('practice'); },
  ...LIB_ACT,
  ...BOOK_ACT,
  ...AUTH_ACT,
  ...DICT_ACT,
  ...LISTEN_ACT,
  ...ADMIN_ACT,
  ...WRITE_ACT,
  ...SPEAK_ACT,
  ...EXAM_ACT,
  /* mục luyện cần đăng nhập: chưa đăng nhập thì mở cửa sổ đăng nhập, xong tự đi tiếp */
  gated(a) { if (S.user) go(a); else showAuthModal(a); },
  soon() { toast(tr('Phần này đang được xây dựng.', 'Coming soon.')); },
  lang() { S.lang = S.lang === 'vi' ? 'en' : 'vi'; store.set('lang', S.lang); document.documentElement.lang = S.lang; render({ keepScroll: true }); },
  theme() {
    const next = isDark() ? 'light' : 'dark';
    S.theme = next; store.set('theme', next);
    document.documentElement.dataset.theme = next;
    render({ keepScroll: true }); /* vẽ lại Hanzi Writer với màu mới */
  },
  speak(a) { speak(a); },
  tab(a) { S.tab = a; stopSpeech(); render({ keepScroll: true }); },
  speakline(a) { speak(DIALOGUE.lines[+a].h); },
  playall() {
    if (!voiceCheck()) return;
    speechSynthesis.cancel();
    const bubbles = $$('#dlg .bubble');
    DIALOGUE.lines.forEach((l, i) => {
      const u = utter(l.h, l.s === 'A' ? 1.2 : 0.85);
      u.onstart = () => bubbles.forEach((b, j) => b.classList.toggle('playing', i === j));
      if (i === DIALOGUE.lines.length - 1) u.onend = () => bubbles.forEach(b => b.classList.remove('playing'));
      speechSynthesis.speak(u);
    });
  },
  togglepy(_, b) { S.showPy = !S.showPy; b.setAttribute('aria-pressed', S.showPy); $('#dlg').classList.toggle('hide-py', !S.showPy); },
  toggletr(_, b) { S.showTr = !S.showTr; b.setAttribute('aria-pressed', S.showTr); $('#dlg').classList.toggle('hide-tr', !S.showTr); },
  wchar(a) { S.wchar = a; render({ keepScroll: true }); },
  wanim() {
    if (!S.writer) return;
    try { S.writer.cancelQuiz(); } catch (e) {}
    S.writer.showOutline();
    S.writer.animateCharacter({ onComplete: () => wStatus(tr('Giờ thử tự viết nhé.', 'Now try writing it yourself.')) });
    wStatus(tr('Quan sát thứ tự nét…', 'Watch the stroke order…'));
  },
  wquiz() {
    if (!S.writer) return;
    const c = S.writerChar, total = strokeCount(c);
    S.writer.hideCharacter();
    wStatus(tr(`Viết nét 1/${total}`, `Stroke 1/${total}`));
    S.writer.quiz({
      onCorrectStroke: d => wStatus(d.strokesRemaining ? tr(`Tốt! Viết nét ${d.strokeNum + 2}/${total}`, `Good! Stroke ${d.strokeNum + 2}/${total}`) : '', 'ok'),
      onMistake: d => wStatus(d.mistakesOnStroke >= 2 ? tr('Nhìn gợi ý rồi viết lại nét này.', 'Follow the hint and try again.') : tr('Chưa đúng nét, thử lại.', 'Not that stroke, try again.'), 'bad'),
      onComplete: d => {
        wStatus(d.totalMistakes ? tr(`Hoàn thành, sai ${d.totalMistakes} lần.`, `Done with ${d.totalMistakes} mistake(s).`) : tr('Hoàn hảo, không sai nét nào!', 'Perfect, no mistakes!'), 'ok');
        if (!S.p.charsDone[c]) { S.p.charsDone[c] = 1; saveP(); addXP(5); toast('+5 XP'); const btn = $(`.wchar[data-arg="${c}"]`); if (btn && !btn.querySelector('.dot')) btn.insertAdjacentHTML('beforeend', `<span class="dot">${ic('check')}</span>`); }
      }
    });
  },
  opt(a) { selectOpt(+a); },
  tileadd(a) { if (curP().checked || curP().order.includes(+a)) return; curP().order.push(+a); speak(curP().tiles[+a]); $('#orderBox').innerHTML = orderHtml(); setCheckEnabled(true); },
  tilerm(a) { if (curP().checked) return; curP().order.splice(+a, 1); $('#orderBox').innerHTML = orderHtml(); setCheckEnabled(curP().order.length > 0); },
  ml(a) { if (curP().checked || curP().lock) return; curP().m.sl = +a; tryMatch(); },
  mr(a) { if (curP().checked || curP().lock) return; curP().m.sr = +a; tryMatch(); },
  check() { if (curP().checked) nextStep(); else check(); },
  flip() {
    if (!curC() || !curC().queue.length) return;
    curC().flipped = !curC().flipped;
    $('.fc').classList.toggle('flip', curC().flipped);
    $('#fcCtl').innerHTML = cardCtl();
    if (curC().flipped) speak(curC().queue[0]);
  },
  rate(a) { rateCard(a); },
  cardsall() { deckWords(S.deck).forEach(w => { if (S.srs[w.s]) S.srs[w.s].due = 0; }); store.set('srs', S.srs); resetCards(); renderCards(); },
  deck(a) { if (!a) return; S.deck = a; store.set('deck', a); resetCards(); renderCards(); },
  reset(_, b) {
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = tr('Bấm lần nữa để xóa hẳn', 'Click again to confirm'); b.classList.add('btn-verm'); return; }
    S.p = JSON.parse(JSON.stringify(DEFAULT_P)); S.srs = {};
    store.del('progress'); store.del('srs');
    toast(tr('Đã xóa dữ liệu học thử.', 'Demo progress cleared.'));
    render();
  }
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  if (b.tagName === 'A') e.preventDefault();
  const fn = ACT[b.dataset.act];
  if (fn) fn(b.dataset.arg, b, e);
});
let libT = null;
document.addEventListener('change', e => { if (e.target.id === 'deckSel') ACT.deck(e.target.value); });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'pyInput') { const er = $('#pyErr'); if (er) er.textContent = ''; }
  if (t.id === 'libQ') { clearTimeout(libT); libT = setTimeout(() => { S.lib.q = t.value; S.lib.page = 0; renderLibResults(); }, 160); }
  const f = t.closest && t.closest('.fld'); if (f) { const er = f.querySelector('.err'); if (er) er.textContent = ''; }
});
document.addEventListener('keydown', e => {
  /* Enter trong form đăng nhập/đăng ký = bấm nút chính (không dùng thẻ <form>) */
  if (S.route === 'login' && e.key === 'Enter' && e.target.matches && e.target.matches('.auth input')) {
    e.preventDefault(); const b = $('#authSubmit'); if (b) b.click(); return;
  }
  /* thẻ div có role=button cần kích hoạt được bằng bàn phím */
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); return; }
  if (S.route !== 'practice' || !curP() || curP().finished) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'button') return; /* Enter trên nút đã tự click */
  if (e.key === 'Enter') { const btn = $('#checkBtn'); if (btn && !btn.disabled) { e.preventDefault(); btn.click(); } return; }
  if (tag === 'input') return;
  const it = cur();
  if (it.options && !curP().checked && /^[1-9]$/.test(e.key) && +e.key <= it.options.length) selectOpt(+e.key - 1);
});
/* Theo dõi đổi theme hệ thống khi người dùng chưa chọn */
if (window.matchMedia) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if (!S.theme && S.route !== 'practice') render({ keepScroll: true }); };
  mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
}

export { ACT, libT };
