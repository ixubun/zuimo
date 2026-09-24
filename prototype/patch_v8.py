#!/usr/bin/env python3
"""Zuimó v8: nối giao diện vào API thật.

Nguyên tắc: web vẫn chạy được khi KHÔNG có backend (bản demo tĩnh).
Lúc khởi động, app gọi /api/health; có API thì chuyển sang chế độ máy chủ
(đăng nhập thật, đồng bộ tiến độ), không có thì giữ nguyên chế độ lưu trình duyệt.
Chạy sau patch_v2 → patch_v7."""
import pathlib

P = pathlib.Path(__file__).parent / "template.html"
s = P.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f"khớp {n} lần (cần {count}): {old[:90]!r}"
    s = s.replace(old, new)


# ---------------------------------------------------------------- trạng thái máy chủ
rep("""  user: store.get('user', null), authTab: 'login'""",
    """  user: store.get('user', null), authTab: 'login',
  api: { on: false, providers: { password: true, google: false, zalo: false }, ver: 0, syncing: false, dirty: false }""")

# ---------------------------------------------------------------- lớp gọi API + đồng bộ
rep("""const saveP = () => store.set('progress', S.p);""",
    r"""const saveP = () => { store.set('progress', S.p); queueSync(); };

/* ======================================================================
   Kết nối API (chỉ hoạt động khi trang được phục vụ cùng domain với backend).
   Mọi lệnh gọi dùng cookie phiên HttpOnly, nên không có token nào nằm trong JS.
   ====================================================================== */
const API = {
  async call(path, { method = 'GET', body } = {}) {
    const r = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await r.json(); } catch (e) { /* 204 hoặc body rỗng */ }
    if (!r.ok && r.status !== 409) throw Object.assign(new Error(data.message || 'Lỗi kết nối'), { status: r.status, data });
    return { status: r.status, data };
  }
};

/** Dò backend một lần khi mở trang; hỏng hoặc không có thì chạy chế độ ngoại tuyến. */
async function detectApi() {
  try {
    const h = await fetch('/api/health', { credentials: 'same-origin', signal: AbortSignal.timeout(4000) });
    if (!h.ok) return;
    S.api.on = true;
    const [{ data: prov }, { data: me }] = await Promise.all([
      API.call('/auth/providers'), API.call('/auth/me')
    ]);
    S.api.providers = prov;
    if (me.user) {
      S.user = { name: me.user.name, username: me.user.username, method: (me.providers || []).find(p => p !== 'password') || 'password' };
      store.set('user', S.user);
      await pullProgress();
    } else if (S.user) {
      // cookie phiên đã hết hạn: bỏ trạng thái đăng nhập cũ trong trình duyệt
      S.user = null; store.del('user');
    }
    renderTopRight(); render({ keepScroll: true });
  } catch (e) { /* trang tĩnh: giữ nguyên chế độ lưu trình duyệt */ }
}

/** Nạp tiến độ từ máy chủ rồi hợp nhất với dữ liệu đang có trên máy này. */
async function pullProgress() {
  const { data } = await API.call('/progress');
  S.api.ver = data.version || 0;
  const doc = data.doc || {};
  if (doc.p) {
    const local = S.p, remote = doc.p;
    const days = { ...(remote.days || {}) };
    Object.entries(local.days || {}).forEach(([k, v]) => { days[k] = Math.max(days[k] || 0, v); });
    S.p = {
      ...remote, ...local, days,
      xp: Math.max(local.xp || 0, remote.xp || 0),
      streak: Math.max(local.streak || 0, remote.streak || 0),
      answered: Math.max(local.answered || 0, remote.answered || 0),
      correct: Math.max(local.correct || 0, remote.correct || 0),
      seen: { ...(remote.seen || {}), ...(local.seen || {}) },
      bseen: { ...(remote.bseen || {}), ...(local.bseen || {}) },
      bdone: { ...(remote.bdone || {}), ...(local.bdone || {}) },
      charsDone: { ...(remote.charsDone || {}), ...(local.charsDone || {}) }
    };
    store.set('progress', S.p);
  }
  if (doc.srs) {
    Object.entries(doc.srs).forEach(([k, v]) => {
      const cur = S.srs[k];
      if (!cur || new Date(v.due || 0) > new Date(cur.due || 0)) S.srs[k] = v;
    });
    store.set('srs', S.srs);
  }
  S.api.dirty = true;         // đẩy bản đã hợp nhất lên để hai bên khớp nhau
  queueSync();
}

/** Gom nhiều thay đổi liên tiếp thành một lần gửi, tránh mỗi câu trả lời là một request. */
let syncT = null;
function queueSync(delay = 2500) {
  if (!S.api.on || !S.user) return;
  S.api.dirty = true;
  clearTimeout(syncT);
  syncT = setTimeout(pushProgress, delay);
}
async function pushProgress() {
  if (!S.api.on || !S.user || S.api.syncing || !S.api.dirty) return;
  S.api.syncing = true;
  try {
    const { status, data } = await API.call('/progress', { method: 'PUT', body: { version: S.api.ver, doc: { p: S.p, srs: S.srs } } });
    S.api.ver = data.version;
    S.api.dirty = false;
    if (status === 409 && data.doc) {
      // thiết bị khác đã lưu trước: nhận bản máy chủ đã hợp nhất rồi vẽ lại
      S.p = { ...S.p, ...data.doc.p };
      S.srs = { ...S.srs, ...(data.doc.srs || {}) };
      store.set('progress', S.p); store.set('srs', S.srs);
      render({ keepScroll: true }); renderTopRight();
    }
  } catch (e) {
    S.api.dirty = true;       // giữ cờ để lần sau gửi lại, không mất tiến độ
  } finally {
    S.api.syncing = false;
  }
}
/* Đóng tab hay chuyển sang app khác thì đẩy nốt phần chưa lưu */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushProgress(); });
window.addEventListener('pagehide', () => { pushProgress(); });""")

# ---------------------------------------------------------------- lưu trạng thái thẻ nhớ cũng đồng bộ
rep("""  S.srs[h] = s; store.set('srs', S.srs);""",
    """  S.srs[h] = s; store.set('srs', S.srs); queueSync();""")

# ---------------------------------------------------------------- đăng nhập / đăng ký qua API
rep("""  async login() {
    const id = val('aUser').trim().toLowerCase(), p = val('aPass');""",
    """  async login() {
    const id = val('aUser').trim().toLowerCase(), p = val('aPass');
    if (S.api.on) return apiLogin(id, p);""")
rep("""  async register() {
    const name = val('aName').trim(),""",
    """  async register() {
    if (S.api.on) return apiRegister();
    const name = val('aName').trim(),""")
rep("""  logout() { S.user = null; S.authTab = 'login'; store.del('user'); toast(tr('Đã đăng xuất.', 'Signed out.')); render(); }""",
    """  async logout() {
    if (S.api.on) { try { await API.call('/auth/logout', { method: 'POST' }); } catch (e) { /* vẫn đăng xuất phía trình duyệt */ } }
    S.user = null; S.authTab = 'login'; S.api.ver = 0; store.del('user');
    toast(tr('Đã đăng xuất.', 'Signed out.'));
    render();
  }""")
rep("""  oauth(a) {
    const isG = a === 'google';""",
    """  oauth(a) {
    /* Có backend và provider đã cấu hình thì chuyển hướng thật; còn lại giải thích phần còn thiếu */
    if (S.api.on && S.api.providers[a]) { location.href = '/api/auth/' + a; return; }
    const isG = a === 'google';""")

# ---------------------------------------------------------------- hàm gọi API cho biểu mẫu
rep("""function signIn(u) {""",
    r"""/** Hiển thị lỗi theo từng ô mà máy chủ trả về (422 kèm fields). */
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
    signIn({ name: data.user.name, username: data.user.username, method: 'password' });
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
    signIn({ name: data.user.name, username: data.user.username, method: 'password' });
    queueSync(0);                      // đẩy tiến độ đã học lúc chưa đăng nhập lên tài khoản mới
  } catch (e) {
    if (e.status === 409) setErr('aUser', tr('Tên đăng nhập hoặc email đã được dùng.', 'Username or email already in use.'));
    else showApiErrors(e);
  }
}

function signIn(u) {""")

# ---------------------------------------------------------------- ẩn nút provider chưa cấu hình + thông báo sau OAuth
rep("""const socialButtons = () => `""",
    """const socialButtons = () => (S.api.on && !S.api.providers.google && !S.api.providers.zalo ? '' : `""")
rep("""    <span class="zalo-ic" aria-hidden="true">Z</span>${tr('Tiếp tục với Zalo', 'Continue with Zalo')}
  </button>`;""",
    """    <span class="zalo-ic" aria-hidden="true">Z</span>${tr('Tiếp tục với Zalo', 'Continue with Zalo')}
  </button>`);""")
rep("""    <p class="demo-flag">${tr('Bản demo giao diện. Tài khoản chỉ lưu trên trình duyệt này.', 'Interface demo. Accounts are stored in this browser only.')}</p>""",
    """    <p class="demo-flag">${S.api.on
      ? tr('Tài khoản và tiến độ được lưu trên máy chủ Zuimó, đồng bộ giữa các thiết bị.', 'Your account and progress sync across devices.')
      : tr('Bản demo giao diện. Tài khoản chỉ lưu trên trình duyệt này.', 'Interface demo. Accounts are stored in this browser only.')}</p>""")
rep("""      <p class="hint">${tr('Tiến độ học hiện vẫn lưu trên trình duyệt. Ở giai đoạn 1, tiến độ sẽ đồng bộ theo tài khoản trên server.', 'Progress is still stored in this browser. From phase 1 it syncs to your account.')}</p>""",
    """      <p class="hint">${S.api.on
        ? tr('Tiến độ được đồng bộ lên máy chủ sau mỗi phiên học.', 'Progress syncs to the server after each session.')
        : tr('Tiến độ học hiện lưu trên trình duyệt này.', 'Progress is stored in this browser only.')}</p>""")

# ---------------------------------------------------------------- khởi động: dò API, xử lý kết quả OAuth
rep("""if (!window.HanziWriter) console.error('Hanzi Writer chưa nạp được');
render();""",
    """/* Kết quả quay về từ Google/Zalo: /?login=ok hoặc /?login=error&reason=... */
(function handleOAuthReturn() {
  const p = new URLSearchParams(location.search);
  if (!p.has('login')) return;
  const ok = p.get('login') === 'ok';
  setTimeout(() => toast(ok
    ? tr('Đăng nhập thành công.', 'Signed in.')
    : tr(`Đăng nhập không thành công (${p.get('reason') || 'lỗi không rõ'}).`, `Sign-in failed (${p.get('reason') || 'unknown'}).`)), 400);
  history.replaceState(null, '', location.pathname);
})();

if (!window.HanziWriter) console.error('Hanzi Writer chưa nạp được');
render();
detectApi();   /* dò backend sau khi vẽ xong: trang tĩnh vẫn dùng được ngay, không phải chờ mạng */""", 1)

P.write_text(s, encoding="utf-8")
print("patched v8 OK")
