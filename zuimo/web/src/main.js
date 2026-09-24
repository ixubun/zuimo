import './styles/app.css';
import './app/actions.js';
import { VIEWS, render } from './app/router.js';
import { dictFromHash } from './views/dict.js';
import { loadIndex } from './content/data.js';
import { $, esc, view } from './core/dom.js';
import { S } from './core/state.js';
import { detectApi } from './core/sync.js';
import { tr } from './core/util.js';
import { toast } from './features/speech.js';

/* ---------- Khởi động ---------- */
if (S.theme) document.documentElement.dataset.theme = S.theme;
document.documentElement.lang = S.lang;
/* Kết quả quay về từ Google/Zalo: /?login=ok hoặc /?login=error&reason=... */
(function handleOAuthReturn() {
  const p = new URLSearchParams(location.search);
  if (!p.has('login')) return;
  const ok = p.get('login') === 'ok';
  setTimeout(() => toast(ok
    ? tr('Đăng nhập thành công.', 'Signed in.')
    : tr(`Đăng nhập không thành công (${p.get('reason') || 'lỗi không rõ'}).`, `Sign-in failed (${p.get('reason') || 'unknown'}).`)), 400);
  history.replaceState(null, '', location.pathname);
})();

(function openFromHash() {
  const r = location.hash.slice(1).split('/')[0];   /* #dict/你好 -> route dict, phần sau do trang từ điển đọc */
  if (r && VIEWS[r] && r !== 'practice') S.route = r;   /* practice cần chọn nguồn trước nên không mở thẳng */
  history.replaceState({ r: S.route }, '', S.route === 'home' ? location.pathname : '#' + S.route);
})();
/* Mục lục sách và bảng đếm rất nhỏ nhưng menu và trang chủ cần chúng, nên nạp xong mới vẽ lần đầu */
loadIndex().then(() => { render(); detectApi(); if (S.route === 'dict') dictFromHash(); })
  .catch(e => { view.innerHTML = '<p class="empty-note">Không tải được dữ liệu học: ' + esc(e.message) + '</p>'; });   /* dò backend sau khi vẽ xong: trang tĩnh vẫn dùng được ngay, không phải chờ mạng */

