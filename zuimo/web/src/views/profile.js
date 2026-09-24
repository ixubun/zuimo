import { backBtn, go, goBack, render } from '../app/router.js';
import { bPre, bookId, bookPct, booksOfVer } from '../content/books.js';
import { BOOKS, once } from '../content/data.js';
import { $, esc, view } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { S, store, clearPersonalData } from '../core/state.js';
import { API, pullProgress, queueSync } from '../core/sync.js';
import { L, num, tr } from '../core/util.js';
import { field, hashPw, pwField, setErr, socialButtons, val } from '../features/level-session.js';
import { toast } from '../features/speech.js';
import { liveStreak } from '../features/xp.js';
import { renderTopRight } from '../ui/nav.js';
import { bestStreak, userLevel } from '../views/home.js';
import { check } from '../views/practice.js';

/* ---------- Hồ sơ người dùng ---------- */

/** Nạp số liệu hồ sơ từ máy chủ; chế độ ngoại tuyến thì dựng từ dữ liệu trong trình duyệt. */
async function loadProfile() {
  if (!S.api.on || !S.user) { S.prof.data = localProfile(); return; }
  try {
    const { data } = await API.call('/profile');
    S.prof.data = data;
    if (data.user) { S.user = { ...S.user, name: data.user.name, avatarUrl: data.user.avatarUrl }; store.set('user', S.user); }
  } catch (e) {
    S.prof.data = localProfile();   // mất mạng vẫn xem được hồ sơ, chỉ là số liệu của máy này
  }
}
function localProfile() {
  const p = S.p, xp = p.xp || 0;
  return {
    user: { ...(S.user || { name: tr('Khách', 'Guest') }), createdAt: null },
    providers: [], level: userLevel(xp),
    stats: {
      totalXp: xp, activeDays: Object.values(p.days || {}).filter(v => v > 0).length,
      bestStreak: bestStreak(), currentStreak: liveStreak(), answered: p.answered || 0, correct: p.correct || 0,
      lessonsDone: Object.keys(p.bdone || {}).length, lessonsStarted: Object.keys(p.bseen || {}).length,
      charsWritten: Object.keys(p.charsDone || {}).length, cards: Object.keys(S.srs || {}).length, lastSyncAt: null
    },
    days: Object.entries(p.days || {}).map(([day, v]) => ({ day, xp: v })).sort((a, b) => a.day < b.day ? -1 : 1)
  };
}

/** Danh sách bài đã hoàn thành / đang học, lấy từ khoá tiến độ dạng "20b2-5". */
function lessonProgress() {
  const done = [], doing = [];
  ['20', '30'].forEach(ver => booksOfVer(ver).forEach(lv => {
    const B = BOOKS[bookId(ver, lv)];
    B.lessons.forEach(L => {
      const key = bPre(ver, lv) + '-' + L.n;
      const item = { ver, lv, L, key, pct: bookPct(L.n, ver, lv) };
      if ((S.p.bdone || {})[key]) done.push(item);
      else if ((S.p.bseen || {})[key]) doing.push(item);
    });
  }));
  return { done, doing };
}

function renderProfile() {
  if (!S.user) { S.route = 'login'; return renderLogin(); }
  const d = S.prof.data;
  if (!d) { view.innerHTML = `<p class="lead">${tr('Đang tải hồ sơ…', 'Loading profile…')}</p>`; loadProfile().then(() => render({ keepScroll: true })); return; }
  const u = d.user, L = d.level, st = d.stats, lp = lessonProgress();
  const list = S.prof.tab === 'done' ? lp.done : lp.doing;
  const stat = (ic_, label, value) => `<div class="pstat"><span class="badge-ic bi-jade">${ic(ic_)}</span><div><b>${value}</b><span>${label}</span></div></div>`;

  view.innerHTML = `
  <div class="lhead">${backBtn()}<h1>${tr('Hồ sơ của bạn', 'Your profile')}</h1></div>
  <div class="prof-grid">
    <section class="card pad prof-left">
      <div class="prof-head">
        ${avatarHtml(u, 'av-xl')}
        <div>
          <div class="pname">${esc(u.name)}</div>
          <div class="muted">${u.username ? '@' + esc(u.username) : ''}</div>
          <div class="lvrow"><span class="lvchip">${tr('Cấp', 'Level')} ${L.level}</span><span class="rankchip">${L.rank.vi ? (S.lang === 'vi' ? L.rank.vi : L.rank.en) : L.rank}</span></div>
        </div>
      </div>

      <div class="lvbox">
        <div class="lvline"><span>${num(L.xp)} XP</span><span>${tr('Cấp', 'Level')} ${L.level + 1}: ${num(xpToReachSafe(L))} XP</span></div>
        <div class="pbar big"><span style="width:${L.percent}%"></span></div>
        <div class="sub">${tr(`Còn ${num(L.toNext)} XP để lên cấp ${L.level + 1}`, `${num(L.toNext)} XP to level ${L.level + 1}`)}</div>
      </div>

      ${S.prof.editing ? `
        <div class="edit-box">
          <h3 class="sec" style="margin-top:0">${tr('Chỉnh sửa hồ sơ', 'Edit profile')}</h3>
          ${field('pName', tr('Tên hiển thị', 'Display name'), 'text', 'name')}
          <div class="fld">
            <label for="pAvatar">${tr('Ảnh đại diện', 'Profile picture')}</label>
            <div class="avrow">
              ${avatarHtml(u, 'av-lg')}
              <div>
                <input class="inp" id="pAvatar" type="file" accept="image/png,image/jpeg,image/webp">
                <small class="hint">${tr('Ảnh được tự thu nhỏ còn 256×256 trước khi gửi. Tối đa 200 KB.', 'Resized to 256×256 before upload, max 200 KB.')}</small>
              </div>
            </div>
            <div class="err" id="pAvatarErr" aria-live="polite"></div>
          </div>
          <div class="btnrow">
            <button class="btn btn-sm" data-act="profsave" ${S.prof.busy ? 'disabled' : ''}>${ic('check')}${tr('Lưu thay đổi', 'Save')}</button>
            <button class="btn btn-ghost btn-sm" data-act="profedit" data-arg="off">${tr('Huỷ', 'Cancel')}</button>
            ${u.avatarUrl ? `<button class="btn btn-ghost btn-sm" data-act="profavdel">${tr('Xoá ảnh', 'Remove photo')}</button>` : ''}
          </div>
        </div>`
      : `<div class="btnrow">
          <button class="btn btn-sm" data-act="profedit" data-arg="on">${ic('pen')}${tr('Chỉnh sửa', 'Edit profile')}</button>
          <button class="btn btn-ghost btn-sm" data-act="nav" data-arg="stats">${ic('chart')}${tr('Thống kê', 'Progress')}</button>
        </div>`}

      <div class="prof-meta">
        <div><span>${tr('Cách đăng nhập', 'Sign-in methods')}</span><b>${(d.providers.length ? d.providers.map(p => p.provider === 'google' ? 'Google' : tr('Mật khẩu', 'Password')).join(', ') : tr('Lưu trên trình duyệt', 'Browser only'))}</b></div>
        ${u.email ? `<div><span>Email</span><b>${esc(u.email)}</b></div>` : ''}
        ${u.createdAt ? `<div><span>${tr('Tham gia', 'Joined')}</span><b>${new Date(u.createdAt).toLocaleDateString(S.lang === 'vi' ? 'vi-VN' : 'en-GB')}</b></div>` : ''}
        ${st.lastSyncAt ? `<div><span>${tr('Đồng bộ', 'Last sync')}</span><b>${new Date(st.lastSyncAt).toLocaleString(S.lang === 'vi' ? 'vi-VN' : 'en-GB')}</b></div>` : ''}
      </div>

      <div class="btnrow">
        <button class="btn btn-ghost btn-sm" data-act="logout">${tr('Đăng xuất', 'Sign out')}</button>
        ${S.api.on ? `<button class="btn btn-ghost btn-sm danger" data-act="profdel">${tr('Xoá tài khoản', 'Delete account')}</button>` : ''}
      </div>
    </section>

    <div class="prof-right">
      <section class="card pad">
        <h2 class="sec" style="margin-top:0">${tr('Thống kê học tập', 'Learning stats')}</h2>
        <div class="pstats">
          ${stat('bolt', tr('tổng XP', 'total XP'), num(st.totalXp))}
          ${stat('flame', tr('chuỗi dài nhất', 'best streak'), st.bestStreak)}
          ${stat('book', tr('bài đã hoàn thành', 'lessons done'), st.lessonsDone)}
          ${stat('cards', tr('thẻ đang ôn', 'cards in review'), st.cards)}
          ${stat('pen', tr('chữ đã tập viết', 'characters written'), st.charsWritten)}
          ${stat('target', tr('câu đã trả lời', 'questions answered'), num(st.answered))}
        </div>
        ${st.answered ? `<p class="hint">${tr(`Tỉ lệ đúng: ${Math.round(st.correct / st.answered * 100)}% (${num(st.correct)}/${num(st.answered)} câu).`, `Accuracy: ${Math.round(st.correct / st.answered * 100)}%.`)}</p>` : ''}
      </section>

      <section class="card pad">
        <h2 class="sec" style="margin-top:0">${tr('Tiến độ bài học', 'Lesson progress')}</h2>
        <div class="tabs" role="tablist">
          <button class="tab" role="tab" data-act="proftab" data-arg="done" aria-selected="${S.prof.tab === 'done'}">${ic('check')}${tr('Đã hoàn thành', 'Completed')} (${lp.done.length})</button>
          <button class="tab" role="tab" data-act="proftab" data-arg="doing" aria-selected="${S.prof.tab === 'doing'}">${tr('Đang học', 'In progress')} (${lp.doing.length})</button>
        </div>
        ${list.length ? `<div class="plessons">${list.map(x => `
          <button class="plesson" data-act="goles" data-arg="${x.ver}-${x.lv}-${x.L.n}">
            <span class="zhb num">${x.L.n}</span>
            <span class="grow">
              <span class="ut zh" lang="zh-CN">${esc(x.L.zh)}</span>
              <span class="us" style="display:block">HSK ${x.ver === '20' ? '2.0' : '3.0'} · ${tr('quyển', 'book')} ${x.lv} · ${esc(S.lang === 'vi' ? x.L.vi : x.L.en)}</span>
              <span class="pbar" style="display:block"><span style="width:${x.pct}%"></span></span>
            </span>
            <span class="end">${ic('chev')}</span>
          </button>`).join('')}</div>`
        : `<p class="empty-note">${S.prof.tab === 'done'
            ? tr('Chưa hoàn thành bài nào. Học xong một bài rồi bấm Luyện tập để đánh dấu hoàn thành.', 'No lessons completed yet.')
            : tr('Chưa có bài nào đang học.', 'No lessons in progress.')}</p>`}
      </section>
    </div>
  </div>`;
}
/** L.need có thể là 0 với dữ liệu cũ; hàm này chỉ để hiển thị mốc XP của cấp kế tiếp. */
const xpToReachSafe = (L) => (L.xp - L.into) + L.need;

/** Thẻ đăng nhập/đăng ký: dùng ở trang đăng nhập và trong cửa sổ bật lên khi cần đăng nhập để luyện. */
function authCardHtml() {
  const isReg = S.authTab === 'register';
  return `<div class="card auth-card">
    <div class="brand big"><img class="logo logo-l" src="/brand/logo-light.png" alt="Zuimó" width="217" height="87"><img class="logo logo-d" src="/brand/logo-dark.png" alt="" aria-hidden="true" width="217" height="87"></div>
    <p class="demo-flag">${S.api.on
      ? tr('Tài khoản và tiến độ được lưu trên máy chủ Zuimó, đồng bộ giữa các thiết bị.', 'Your account and progress sync across devices.')
      : tr('Bản demo giao diện. Tài khoản chỉ lưu trên trình duyệt này.', 'Interface demo. Accounts are stored in this browser only.')}</p>
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-act="authtab" data-arg="login" aria-selected="${!isReg}">${tr('Đăng nhập', 'Sign in')}</button>
      <button class="tab" role="tab" data-act="authtab" data-arg="register" aria-selected="${isReg}">${tr('Đăng ký', 'Sign up')}</button>
    </div>
    ${socialButtons()}
    <div class="orline">${isReg ? tr('hoặc tạo tài khoản bằng mật khẩu', 'or create a password account') : tr('hoặc đăng nhập bằng mật khẩu', 'or sign in with a password')}</div>
    ${isReg ? `
      ${field('aName', tr('Tên hiển thị', 'Display name'), 'text', 'name')}
      ${field('aUser', tr('Tên đăng nhập', 'Username'), 'text', 'username', tr('3–24 ký tự: chữ thường, số, dấu chấm hoặc gạch dưới.', '3–24 characters: lowercase letters, digits, dot or underscore.'))}
      ${field('aMail', tr('Email (không bắt buộc)', 'Email (optional)'), 'email', 'email', tr('Dùng để đặt lại mật khẩu khi có máy chủ thư ở giai đoạn sau.', 'Used for password resets once mail is set up.'))}
      ${pwField('aPass', tr('Mật khẩu', 'Password'), 'new-password', tr('Tối thiểu 8 ký tự. Bấm vào con mắt để xem lại mật khẩu vừa nhập.', 'At least 8 characters. Tap the eye to check what you typed.'))}
      ${pwField('aPass2', tr('Nhập lại mật khẩu', 'Confirm password'), 'new-password')}
      <button class="btn btn-block" id="authSubmit" data-act="register">${tr('Tạo tài khoản', 'Create account')}</button>
      <p class="auth-foot">${tr('Tạo tài khoản nghĩa là bạn đồng ý với điều khoản sử dụng của Zuimó.', 'By creating an account you accept the Zuimó terms.')}</p>`
    : `
      ${field('aUser', tr('Tên đăng nhập hoặc email', 'Username or email'), 'text', 'username')}
      ${pwField('aPass', tr('Mật khẩu', 'Password'), 'current-password')}
      <button class="btn btn-block" id="authSubmit" data-act="login">${tr('Đăng nhập', 'Sign in')}</button>
      <p class="auth-foot"><button class="linkbtn" data-act="forgot">${tr('Quên mật khẩu?', 'Forgot password?')}</button></p>`}
  </div>`;
}
function renderLogin() {
  if (S.user) { S.route = 'profile'; return renderProfile(); }
  view.innerHTML = `<div class="auth">${S.hist.length ? `<div class="lhead">${backBtn()}<h1 class="muted" style="font-size:16px">${tr('Quay lại', 'Back')}</h1></div>` : ''}${authCardHtml()}</div>`;
}

/** Cửa sổ yêu cầu đăng nhập: mở khi người chưa đăng nhập bấm vào mục luyện tập. Đăng nhập xong đi tiếp tới mục đó. */
function showAuthModal(nextRoute) {
  S.authNext = nextRoute || null;
  let m = $('#authModal');
  if (!m) { m = document.createElement('div'); m.id = 'authModal'; m.className = 'modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="modal-back" data-act="authclose"></div>
    <div class="modal-box" role="dialog" aria-modal="true" aria-label="${tr('Đăng nhập', 'Sign in')}">
      <button class="icon-btn modal-x" data-act="authclose" aria-label="${tr('Đóng', 'Close')}">${ic('x')}</button>
      <p class="modal-note">${tr('Đăng nhập để luyện tập và lưu kết quả của bạn.', 'Sign in to practise and keep your results.')}</p>
      ${authCardHtml()}
    </div>`;
  m.hidden = false;
  const first = m.querySelector('#aUser') || m.querySelector('#aName'); if (first) first.focus();
}
function closeAuthModal() { const m = $('#authModal'); if (m) { m.hidden = true; m.innerHTML = ''; } }
function rerenderAuthModal() { const m = $('#authModal'); if (m && !m.hidden) showAuthModal(S.authNext); }
/** Hiển thị lỗi theo từng ô mà máy chủ trả về (422 kèm fields). */
function showApiErrors(e) {
  const f = (e.data && e.data.fields) || {};
  const map = { name: 'aName', username: 'aUser', email: 'aMail', password: 'aPass', next: 'aPass' };
  let first = null;
  Object.entries(f).forEach(([k, m]) => { const id = map[k] || k; setErr(id, m); first = first || id; });
  if (!Object.keys(f).length) toast(e.message || tr('Không kết nối được máy chủ.', 'Cannot reach the server.'));
  if (first && $('#' + first)) $('#' + first).focus();
}
async function apiLogin(id, p) {
  if (!id) { setErr('aUser', tr('Nhập tên đăng nhập hoặc email.', 'Enter your username or email.')); return; }
  if (!p) { setErr('aPass', tr('Nhập mật khẩu.', 'Enter your password.')); return; }
  try {
    const { data } = await API.call('/auth/login', { method: 'POST', body: { id, password: p } });
    signIn({ name: data.user.name, username: data.user.username, avatarUrl: data.user.avatarUrl || null, isAdmin: !!data.user.isAdmin, method: 'password' });
    await pullProgress();
  } catch (e) {
    if (e.status === 401) setErr('aPass', tr('Thông tin đăng nhập không đúng.', 'Those details do not match an account.'));
    else if (e.status === 429) toast(e.message);
    else showApiErrors(e);
  }
}
async function apiRegister() {
  const body = { name: val('aName').trim(), username: val('aUser').trim().toLowerCase(), email: val('aMail').trim() || null, password: val('aPass') };
  if (val('aPass2') !== body.password) { setErr('aPass2', tr('Hai mật khẩu chưa khớp nhau.', 'Passwords do not match.')); return; }
  try {
    const { data } = await API.call('/auth/register', { method: 'POST', body });
    signIn({ name: data.user.name, username: data.user.username, isAdmin: !!data.user.isAdmin, method: 'password' });
    store.set('progressOwner', data.user.username);   /* tiến độ học lúc chưa đăng nhập thuộc về tài khoản vừa tạo */
    queueSync(0);                      // đẩy tiến độ đã học lúc chưa đăng nhập lên tài khoản mới
  } catch (e) {
    if (e.status === 409) setErr('aUser', tr('Tên đăng nhập hoặc email đã được dùng.', 'Username or email already in use.'));
    else showApiErrors(e);
  }
}

/** Ảnh đại diện: có ảnh thì hiện ảnh, không thì hiện chữ cái đầu của tên. */
function avatarHtml(u, cls = 'av-lg') {
  const name = (u && u.name) || '?';
  return u && u.avatarUrl
    ? `<span class="${cls} has-img"><img src="${esc(u.avatarUrl)}" alt=""></span>`
    : `<span class="${cls}">${esc(name.charAt(0).toUpperCase())}</span>`;
}

/**
 * Thu nhỏ ảnh ngay trên trình duyệt trước khi gửi: cạnh dài tối đa 256 px, xuất WebP (PNG nếu trình duyệt cũ).
 * Làm ở client để không phải cài thư viện xử lý ảnh trên server và để tiết kiệm băng thông của người dùng.
 */
function shrinkImage(file, max = 256) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error(tr('Chỉ nhận ảnh PNG, JPEG hoặc WebP.', 'PNG, JPEG or WebP only.')));
    if (file.size > 8 * 1024 * 1024) return reject(new Error(tr('Tệp quá lớn (giới hạn 8 MB).', 'File too large (8 MB limit).')));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, w, h);
      let out = cv.toDataURL('image/webp', 0.85);
      if (!out.startsWith('data:image/webp')) out = cv.toDataURL('image/png');   // Safari cũ không xuất được WebP
      if (out.length > 260000) out = cv.toDataURL('image/jpeg', 0.7);
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr('Không đọc được tệp ảnh.', 'Could not read the image.'))); };
    img.src = url;
  });
}

/** Lưu hồ sơ: có backend thì gọi API, không thì lưu trong trình duyệt để bản demo vẫn dùng được. */
async function saveProfile(patch) {
  S.prof.busy = true;
  try {
    if (S.api.on) {
      const { data } = await API.call('/account/profile', { method: 'POST', body: patch });
      S.user = { ...S.user, name: data.user.name, avatarUrl: data.user.avatarUrl };
      S.prof.data.user = { ...S.prof.data.user, ...data.user };
    } else {
      S.user = { ...S.user, ...(patch.name ? { name: patch.name } : {}), ...(patch.avatar !== undefined ? { avatarUrl: patch.avatar } : {}) };
      S.prof.data.user = { ...S.prof.data.user, ...S.user };
    }
    store.set('user', S.user);
    S.prof.editing = false;
    toast(tr('Đã lưu hồ sơ.', 'Profile saved.'));
  } catch (e) {
    const f = (e.data && e.data.fields) || {};
    if (f.name) setErr('pName', f.name);
    if (f.avatar) setErr('pAvatar', f.avatar);
    if (!f.name && !f.avatar) toast(e.message || tr('Không lưu được hồ sơ.', 'Could not save the profile.'));
  } finally {
    S.prof.busy = false;
    render({ keepScroll: true });
    renderTopRight();
  }
}

function signIn(u) {
  S.user = u; S.authTab = 'login'; S.prof.data = null; store.set('user', u);
  toast(tr(`Chào ${u.name}!`, `Welcome, ${u.name}!`));
  closeAuthModal();
  const next = S.authNext; S.authNext = null;
  go(next || 'home');
}
const AUTH_ACT = {
  authtab(a) { S.authTab = a; if ($('#authModal') && !$('#authModal').hidden) rerenderAuthModal(); else render({ keepScroll: true }); },
  authclose() { closeAuthModal(); },
  proftab(a) { S.prof.tab = a; render({ keepScroll: true }); },
  back() { goBack(); },
  profedit(a) { S.prof.editing = a === 'on'; render({ keepScroll: true }); if (S.prof.editing && $('#pName')) $('#pName').value = (S.prof.data.user.name || ''); },
  async profsave() {
    const name = ($('#pName') && $('#pName').value.trim()) || '';
    if (!name) { setErr('pName', tr('Nhập tên hiển thị.', 'Enter a display name.')); return; }
    const file = $('#pAvatar') && $('#pAvatar').files[0];
    let avatar;
    if (file) {
      try { avatar = await shrinkImage(file); }
      catch (e) { setErr('pAvatar', e.message); return; }
    }
    await saveProfile({ name, ...(avatar ? { avatar } : {}) });
  },
  async profavdel() { await saveProfile({ avatar: null }); },
  async profdel() {
    if (!confirm(tr('Xoá vĩnh viễn tài khoản và toàn bộ tiến độ học? Không thể hoàn tác.', 'Permanently delete your account and all progress?'))) return;
    try {
      await API.call('/account', { method: 'DELETE' });
      S.user = null; S.prof.data = null; store.del('user');
      toast(tr('Đã xoá tài khoản.', 'Account deleted.'));
      go('home');
    } catch (e) { toast(e.message || tr('Không xoá được tài khoản.', 'Could not delete the account.')); }
  },
  /* Hiện/ẩn mật khẩu: giữ nguyên con trỏ để người dùng gõ tiếp được ngay */
  pwtoggle(a) {
    const inp = $('#' + a), btn = $(`[data-act="pwtoggle"][data-arg="${a}"]`);
    if (!inp) return;
    const show = inp.type === 'password';
    const pos = inp.selectionStart;
    inp.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? tr('Ẩn mật khẩu', 'Hide password') : tr('Hiện mật khẩu', 'Show password'));
    btn.classList.toggle('on', show);
    inp.focus();
    try { inp.setSelectionRange(pos, pos); } catch (e) { /* một số trình duyệt không cho với type=email */ }
  },
  /* Google và Zalo đều cần backend + domain đã xác minh, nên bản demo tĩnh chỉ giải thích các bước còn thiếu */
  oauth(a) {
    /* Có backend và Google đã cấu hình thì chuyển hướng thật; bản tĩnh chỉ giải thích phần còn thiếu */
    if (S.api.on && S.api.providers[a]) { location.href = '/api/auth/' + a; return; }
    toast(tr('Đăng nhập Google cần backend đang chạy và OAuth Client ID đã cấu hình.', 'Google sign-in needs the backend running with an OAuth client configured.'));
  },
  async login() {
    const id = val('aUser').trim().toLowerCase(), p = val('aPass');
    if (S.api.on) return apiLogin(id, p);
    let bad = false;
    if (!id) { setErr('aUser', tr('Nhập tên đăng nhập hoặc email.', 'Enter your username or email.')); bad = true; }
    if (!p) { setErr('aPass', tr('Nhập mật khẩu.', 'Enter your password.')); bad = true; }
    if (bad) return;
    const users = store.get('users', {});
    /* cho phép đăng nhập bằng email đã đăng ký, không chỉ tên đăng nhập */
    const u = users[id] ? id : Object.keys(users).find(k => (users[k].email || '').toLowerCase() === id);
    const rec = u && users[u];
    if (!rec || rec.hash !== await hashPw(p, rec.salt)) { setErr('aPass', tr('Thông tin đăng nhập không đúng.', 'Those details do not match an account.')); return; }
    signIn({ name: rec.name, username: u, method: 'password' });
  },
  async register() {
    if (S.api.on) return apiRegister();
    const name = val('aName').trim(), u = val('aUser').trim().toLowerCase(), mail = val('aMail').trim(), p = val('aPass'), p2 = val('aPass2');
    const users = store.get('users', {});
    const errs = {};
    if (!name) errs.aName = tr('Nhập tên hiển thị.', 'Enter a display name.');
    if (!/^[a-z0-9._]{3,24}$/.test(u)) errs.aUser = tr('Tên đăng nhập gồm 3–24 ký tự: chữ thường, số, dấu chấm hoặc gạch dưới.', 'Use 3–24 lowercase letters, digits, dots or underscores.');
    else if (users[u]) errs.aUser = tr('Tên đăng nhập này đã có người dùng.', 'That username is taken.');
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) errs.aMail = tr('Email chưa đúng định dạng.', 'That email does not look valid.');
    else if (mail && Object.values(users).some(r => (r.email || '').toLowerCase() === mail.toLowerCase())) errs.aMail = tr('Email này đã được dùng.', 'That email is already in use.');
    if (p.length < 8) errs.aPass = tr('Mật khẩu cần tối thiểu 8 ký tự.', 'Password needs at least 8 characters.');
    if (p2 !== p) errs.aPass2 = tr('Hai mật khẩu chưa khớp nhau.', 'Passwords do not match.');
    Object.entries(errs).forEach(([k, m]) => setErr(k, m));
    if (Object.keys(errs).length) { $('#' + Object.keys(errs)[0]).focus(); return; }
    const salt = Math.random().toString(36).slice(2);
    users[u] = { name, salt, hash: await hashPw(p, salt), created: Date.now(), email: mail };
    store.set('users', users);
    signIn({ name, username: u, method: 'password' });
  },
  forgot() {
    toast(tr('Chưa có mail server nên quản trị viên sẽ tạo link đặt lại mật khẩu dùng một lần trong trang quản trị và gửi cho bạn.', 'Without a mail server, an admin creates a one-time reset link for you.'));
  },
  async logout() {
    if (S.api.on) { try { await API.call('/auth/logout', { method: 'POST' }); } catch (e) { /* vẫn đăng xuất phía trình duyệt */ } }
    S.user = null; S.authTab = 'login'; S.api.ver = 0; store.del('user');
    clearPersonalData();   /* người sau dùng máy này bắt đầu sạch, không thấy XP, thẻ, lịch sử của người trước */
    toast(tr('Đã đăng xuất.', 'Signed out.'));
    render();
  }
};

export { AUTH_ACT, authCardHtml, showAuthModal, closeAuthModal, apiLogin, apiRegister, avatarHtml, lessonProgress, loadProfile, localProfile, renderLogin, renderProfile, saveProfile, showApiErrors, shrinkImage, signIn, xpToReachSafe };
