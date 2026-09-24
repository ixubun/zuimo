#!/usr/bin/env python3
"""Zuimó v10: trang quản lý hồ sơ (đổi tên hiển thị, ảnh đại diện), hệ thống cấp độ và theo dõi tiến độ.
Chạy sau patch_v2 → patch_v9."""
import pathlib

P = pathlib.Path(__file__).parent / "template.html"
s = P.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f"khớp {n} lần (cần {count}): {old[:90]!r}"
    s = s.replace(old, new)


def cut(start_mark, end_mark, new):
    global s
    a = s.index(start_mark)
    b = s.index(end_mark, a)
    s = s[:a] + new + s[b:]


# ---------------------------------------------------------------- trạng thái
rep("""  api: { on: false, providers: { password: true, google: false, zalo: false }, ver: 0, syncing: false, dirty: false }""",
    """  api: { on: false, providers: { password: true, google: false }, ver: 0, syncing: false, dirty: false },
  prof: { tab: 'done', editing: false, busy: false, data: null }""")

# ---------------------------------------------------------------- hệ thống cấp độ (khớp server/src/level.js)
rep("""/* Cấp người học: 150 XP một cấp */
const userLevel = xp => { const lv = Math.floor(xp / 150) + 1; return { lv, into: xp - (lv - 1) * 150, need: 150 }; };""",
    r"""/* Hệ thống cấp độ – công thức phải khớp server/src/level.js, nếu lệch thì số hiển thị sẽ nhảy khi đồng bộ.
   Cấp 1→2 cần 100 XP, mỗi cấp sau cộng thêm 50 XP. */
const LV_BASE = 100, LV_STEP = 50;
const xpToReach = n => (n <= 1 ? 0 : ((n - 1) * (2 * LV_BASE + (n - 2) * LV_STEP)) / 2);
const rankOf = lv => lv >= 40 ? tr('Cao thủ', 'Master')
  : lv >= 25 ? tr('Thành thạo', 'Expert')
  : lv >= 15 ? tr('Nâng cao', 'Advanced')
  : lv >= 8 ? tr('Trung cấp', 'Intermediate')
  : lv >= 3 ? tr('Sơ cấp', 'Beginner')
  : tr('Nhập môn', 'Starter');
function userLevel(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let lv = 1;
  while (xpToReach(lv + 1) <= x) lv += 1;
  const floor = xpToReach(lv), next = xpToReach(lv + 1);
  return { lv, level: lv, xp: x, into: x - floor, need: next - floor, toNext: next - x,
           percent: Math.round(((x - floor) / (next - floor)) * 100), rank: rankOf(lv) };
}""")

# trang chủ: thẻ cấp độ hiển thị thêm danh hiệu
rep("""        <div class="big">${tr('Cấp', 'Level')} ${U.lv}</div>
        <div class="pbar"><span style="width:${Math.round(U.into / U.need * 100)}%"></span></div>
        <div class="sub">${tr(`Còn ${U.need - U.into} XP đến cấp ${U.lv + 1}`, `${U.need - U.into} XP to level ${U.lv + 1}`)}</div>""",
    """        <div class="big">${tr('Cấp', 'Level')} ${U.lv} <span class="rankchip">${U.rank}</span></div>
        <div class="pbar"><span style="width:${U.percent}%"></span></div>
        <div class="sub">${tr(`Còn ${U.toNext} XP đến cấp ${U.lv + 1}`, `${U.toNext} XP to level ${U.lv + 1}`)}</div>""")

# ---------------------------------------------------------------- avatar dùng chung
rep("""function signIn(u) {""",
    r"""/** Ảnh đại diện: có ảnh thì hiện ảnh, không thì hiện chữ cái đầu của tên. */
function avatarHtml(u, cls = 'av-lg') {
  const name = (u && u.name) || '?';
  return u && u.avatarUrl
    ? `<span class="${cls} has-img"><img src="${esc(u.avatarUrl)}" alt=""></span>`
    : `<span class="${cls}">${esc(name.charAt(0).toUpperCase())}</span>`;
}

function signIn(u) {""")

# ---------------------------------------------------------------- trang hồ sơ thay cho thẻ tài khoản cũ
cut("""function renderLogin() {
  if (S.user) {""", """  const isReg = S.authTab === 'register';""", r"""/* ---------- Hồ sơ người dùng ---------- */

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

function renderLogin() {
  if (S.user) { S.route = 'profile'; return renderProfile(); }
""")

# ---------------------------------------------------------------- hành động hồ sơ
rep("""  authtab(a) { S.authTab = a; render({ keepScroll: true }); },""",
    r"""  authtab(a) { S.authTab = a; render({ keepScroll: true }); },
  proftab(a) { S.prof.tab = a; render({ keepScroll: true }); },
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
  },""")

# ---------------------------------------------------------------- lưu hồ sơ + thu nhỏ ảnh
rep("""function signIn(u) {""",
    r"""/**
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

function signIn(u) {""")

# ---------------------------------------------------------------- route + ảnh đại diện ở thanh trên
rep("""const VIEWS = { home: renderHome, library: renderLibrary, lessons: renderBookList, book: renderBook,""",
    """const VIEWS = { home: renderHome, library: renderLibrary, lessons: renderBookList, book: renderBook, profile: renderProfile,""")
rep("""${S.user ? `<span class="av-sm">${esc(S.user.name.charAt(0).toUpperCase())}</span>` : ic('user')}""",
    """${S.user ? avatarHtml(S.user, 'av-sm') : ic('user')}""")
rep("""  <button class="icon-btn" data-act="nav" data-arg="login" aria-label="${S.user ? tr('Tài khoản', 'Account') : tr('Đăng nhập', 'Sign in')}">""",
    """  <button class="icon-btn" data-act="nav" data-arg="${S.user ? 'profile' : 'login'}" aria-label="${S.user ? tr('Tài khoản', 'Account') : tr('Đăng nhập', 'Sign in')}">""")
# đăng nhập xong thì vào thẳng hồ sơ nếu người dùng đang ở trang đăng nhập
rep("""function signIn(u) {
  S.user = u; S.authTab = 'login'; store.set('user', u);""",
    """function signIn(u) {
  S.user = u; S.authTab = 'login'; S.prof.data = null; store.set('user', u);""")

# ---------------------------------------------------------------- CSS
rep(""".navgroup .submenu{""", """/* tab vốn chỉ có chữ; khi thêm biểu tượng phải ghim kích thước, không thì SVG giãn hết ô */
.tabs .tab svg{width:16px;height:16px;flex:none;vertical-align:-3px;margin-right:6px}
.prof-grid{display:grid;grid-template-columns:minmax(300px,380px) 1fr;gap:16px;align-items:start}
@media (max-width:900px){.prof-grid{grid-template-columns:1fr}}
.prof-head{display:flex;gap:14px;align-items:center;margin-bottom:16px}
.pname{font-size:22px;font-weight:800;line-height:1.2}
.av-xl{width:84px;height:84px;border-radius:24px;display:grid;place-items:center;background:var(--jade);color:#fff;font-size:34px;font-weight:800;flex:none;overflow:hidden}
.av-lg.has-img,.av-sm.has-img,.av-xl.has-img{background:none;padding:0}
.av-lg.has-img img,.av-sm.has-img img,.av-xl.has-img img{width:100%;height:100%;object-fit:cover;display:block}
.av-sm.has-img{overflow:hidden;border-radius:10px}
.lvrow{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.lvchip{padding:3px 10px;border-radius:999px;background:var(--jade);color:#fff;font-size:12px;font-weight:800}
.rankchip{padding:3px 10px;border-radius:999px;background:var(--sun-soft);color:var(--sun-ink);font-size:12px;font-weight:800}
.lvbox{border:2px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:14px}
.lvline{display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:var(--ink-2);margin-bottom:6px}
.pbar.big{height:10px}
.lvbox .sub{font-size:12px;color:var(--ink-3);margin-top:6px}
.btnrow{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.btn.danger{color:var(--verm-ink);border-color:var(--verm-soft)}
.edit-box{border:2px solid var(--jade);border-radius:14px;padding:14px;margin-bottom:14px;background:var(--jade-soft)}
.avrow{display:flex;gap:12px;align-items:center}
.avrow .inp{padding:8px;font-size:14px}
.prof-meta{border-top:2px solid var(--line);padding-top:12px;margin-bottom:14px;display:grid;gap:8px}
.prof-meta div{display:flex;justify-content:space-between;gap:10px;font-size:14px}
.prof-meta span{color:var(--ink-3)}
.prof-right{display:grid;gap:16px}
.pstats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.pstat{display:flex;align-items:center;gap:10px;border:2px solid var(--line);border-radius:14px;padding:12px}
.pstat b{display:block;font-size:20px;font-weight:800;line-height:1.1}
.pstat span:last-child{font-size:12px;color:var(--ink-3)}
.plessons{display:grid;gap:10px;margin-top:12px}
.plesson{display:flex;align-items:center;gap:12px;width:100%;padding:12px;border-radius:14px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;text-align:left;cursor:pointer}
.plesson:hover{border-color:var(--jade)}
.navgroup .submenu{""")

P.write_text(s, encoding="utf-8")
print("patched v10 OK")
