import { render } from '../app/router.js';
import { S, store, clearPersonalData } from '../core/state.js';
import { renderTopRight } from '../ui/nav.js';
import { cur } from '../views/practice.js';

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
      S.user = { name: me.user.name, username: me.user.username, avatarUrl: me.user.avatarUrl || null, isAdmin: !!me.user.isAdmin, method: (me.providers || []).find(p => p !== 'password') || 'password' };
      store.set('user', S.user);
      await pullProgress();
    } else if (S.user) {
      // cookie phiên đã hết hạn: bỏ trạng thái đăng nhập cũ trong trình duyệt
      S.user = null; store.del('user'); clearPersonalData();   /* phiên hết hạn: không để dữ liệu của người cũ nằm lại cho người sau */
    }
    renderTopRight(); render({ keepScroll: true });
  } catch (e) { /* trang tĩnh: giữ nguyên chế độ lưu trình duyệt */ }
}

/** Nạp tiến độ từ máy chủ rồi hợp nhất với dữ liệu đang có trên máy này. */
async function pullProgress() {
  const { data } = await API.call('/progress');
  S.api.ver = data.version || 0;
  const doc = data.doc || {};
  /* Dữ liệu cục bộ của người khác (đăng nhập trước trên cùng máy) không được hợp nhất vào tài khoản này.
     owner = null nghĩa là dữ liệu học lúc chưa đăng nhập: cho phép gộp vào tài khoản đầu tiên đăng nhập. */
  const owner = store.get('progressOwner', null);
  if (owner && S.user && owner !== S.user.username) {
    clearPersonalData();
    S.p = { ...S.p, ...(doc.p || {}) };
    S.srs = { ...(doc.srs || {}) };
    store.set('progress', S.p); store.set('srs', S.srs);
    store.set('progressOwner', S.user.username);
    return;
  }
  if (S.user) store.set('progressOwner', S.user.username);
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
window.addEventListener('pagehide', () => { pushProgress(); });

/* Chuỗi song ngữ: tr('vi','en'); nội dung song ngữ: L({vi,en}) */

export { API, detectApi, pullProgress, pushProgress, queueSync, syncT };
