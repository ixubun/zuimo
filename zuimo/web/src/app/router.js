import { needsFor } from '../content/data.js';
import { $, esc, view } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { S } from '../core/state.js';
import { tr } from '../core/util.js';
import { stopSpeech } from '../features/speech.js';
import { releaseWriters } from '../features/writer.js';
import { renderNav, renderTopRight } from '../ui/nav.js';
import { renderAbout } from '../views/about.js';
import { renderDict, dictFromHash } from '../views/dict.js';
import { renderListen } from '../views/listen.js';
import { renderAdmin } from '../views/admin.js';
import { renderWrite } from '../views/write.js';
import { renderSpeak } from '../views/speak.js';
import { renderExam } from '../views/exam.js';
import { renderBook, renderBookList } from '../views/book.js';
import { renderCards, resetCards } from '../views/cards.js';
import { renderHome, renderLesson } from '../views/home.js';
import { renderLibrary } from '../views/library.js';
import { renderPractice, resetPractice } from '../views/practice.js';
import { renderLogin, renderProfile } from '../views/profile.js';
import { renderStats } from '../views/stats.js';

/* ---------- Router ---------- */
const VIEWS = { home: renderHome, library: renderLibrary, lessons: renderBookList, book: renderBook, profile: renderProfile, dict: renderDict, listen: renderListen, admin: renderAdmin, write: renderWrite, speak: renderSpeak, exam: renderExam, lesson: renderLesson, practice: renderPractice, cards: renderCards, stats: renderStats, login: renderLogin, about: renderAbout };
function render(opts = {}) {
  const need = needsFor(S.route);
  if (need) {
    view.innerHTML = `<p class="lead loading">${tr('Đang tải…', 'Loading…')}</p>`;
    need.then(() => render(opts)).catch(e => { view.innerHTML = `<p class="empty-note">${tr('Không tải được dữ liệu.', 'Could not load data.')} ${esc(e.message || '')}</p>`; });
    return;
  }
  releaseWriters();
  document.body.classList.toggle('focus', S.route === 'practice');
  renderNav(); renderTopRight();
  (VIEWS[S.route] || renderHome)();
  if (!opts.keepScroll) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
}
/* Mỗi lần đổi trang là một mục trong lịch sử trình duyệt, nên nút Back của trình duyệt,
   cử chỉ vuốt trên điện thoại và nút Quay lại trong app đều đưa về đúng trang trước.
   URL dùng dạng #route để chia sẻ được link sâu mà vẫn là một file tĩnh. */
S.hist = [];
function go(r, { replace = false } = {}) {
  stopSpeech();
  if (r === 'practice') resetPractice();
  if (r === 'cards') resetCards();
  if (r !== S.route) {
    if (replace) history.replaceState({ r }, '', '#' + r);
    else { S.hist.push(S.route); if (S.hist.length > 30) S.hist.shift(); history.pushState({ r }, '', '#' + r); }
  }
  S.route = r;
  render();
}
/* Trình duyệt Back/Forward: chỉ đổi trang, không đẩy thêm mục lịch sử */
window.addEventListener('popstate', e => {
  const r = (e.state && e.state.r) || location.hash.slice(1).split('/')[0] || 'home';
  if (!VIEWS[r]) return;
  stopSpeech();
  if (r === 'practice') resetPractice();
  if (r === 'cards') resetCards();
  S.hist.pop();
  S.route = r;
  render();
  if (r === 'dict') dictFromHash();
});
/** Quay lại: có lịch sử trong app thì lùi một bước, không thì về trang chủ. */
function goBack() {
  if (S.hist.length) history.back();
  else go('home', { replace: true });
}
const backBtn = () => `<button class="icon-btn" data-act="back" aria-label="${tr('Quay lại', 'Back')}">${ic('back')}</button>`;

export { VIEWS, backBtn, go, goBack, render };
