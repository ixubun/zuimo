import { queueSync } from '../core/sync.js';

/* ---------- Lưu trữ an toàn ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('zuimo:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('zuimo:' + k, JSON.stringify(v)); } catch (e) { /* storage bị chặn: vẫn chạy trong RAM */ } },
  del(k) { try { localStorage.removeItem('zuimo:' + k); } catch (e) {} }
};
const DEFAULT_P = { xp: 0, streak: 0, lastDay: null, days: {}, answered: 0, correct: 0, seen: {}, practiced: false, charsDone: {} };
/**
 * Xoá mọi dữ liệu cá nhân lưu trong trình duyệt (tiến độ, thẻ nhớ, lịch sử tra cứu, trạng thái luyện tập).
 * Gọi khi đăng xuất và khi tài khoản đăng nhập khác với chủ của dữ liệu đang có, để hai người dùng chung
 * một máy không nhìn thấy và không kế thừa dữ liệu của nhau. Giữ lại giao diện, ngôn ngữ, phiên bản HSK.
 */
function clearPersonalData() {
  ['progress', 'srs', 'dictHist', 'progressOwner', 'deck', 'bl', 'bookLv'].forEach(k => store.del(k));
  S.p = JSON.parse(JSON.stringify(DEFAULT_P));
  S.srs = {};
  S.deck = null; S.bl = 1; S.bookLv = 1;
  if (S.dict) { S.dict.hist = []; S.dict.entry = null; S.dict.results = null; S.dict.q = ''; }
  ['listen', 'write', 'speak', 'admin'].forEach(k => { if (S[k]) { S[k].loadedKey = null; S[k].items = []; S[k].result = null; S[k].stats = null; S[k].clips = []; S[k].clip = null; if (S[k].loaded !== undefined) S[k].loaded = false; } });
  if (S.prof) S.prof.data = null;
}

const S = {
  lang: store.get('lang', 'vi'),
  theme: store.get('theme', null),
  p: Object.assign({}, DEFAULT_P, store.get('progress', {})),
  srs: store.get('srs', {}),
  route: 'home', tab: 'pinyin', wchar: '你',
  showPy: true, showTr: true,
  heroW: null, writer: null, writerChar: null,
  ver: ({ '21': '20', '25': '30' })[store.get('ver', '20')] || store.get('ver', '20'),  /* '20' = HSK 2.0, '30' = HSK 3.0 */
  bl: store.get('bl', 1), btab: 'words', bchar: null,
  bookLv: store.get('bookLv', 1),              /* quyển đang học trong phiên bản hiện tại */
  navOpen: store.get('navOpen', { lessons: true }),   /* nhóm menu đang mở */
  lib: Object.assign({ lvl: 1, tab: 'words', q: '', page: 0, char: null }, store.get('lib', {}), { q: '', page: 0 }),
  deck: (d => (d === 'lesson' || !d ? 'B20-1' : d))(store.get('deck', null)),
  pracSrc: null,                               /* 'lesson' hoặc { lvl, ver } */
  user: store.get('user', null), authTab: 'login',
  api: { on: false, providers: { password: true, google: false }, ver: 0, syncing: false, dirty: false },
  prof: { tab: 'done', editing: false, busy: false, data: null }
};
const saveP = () => { store.set('progress', S.p); queueSync(); };

export { DEFAULT_P, S, saveP, store, clearPersonalData };
