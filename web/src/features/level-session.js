import { levelWords, meaning, shortEn } from '../content/data.js';
import { $ } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { S } from '../core/state.js';
import { shuffle, tr } from '../core/util.js';
import { MARKS } from '../features/pinyin.js';
import { buildSession } from '../features/session.js';

/* ---------- Phiên luyện tập sinh tự động theo cấp ---------- */
const VOWELS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
const bareSyl = x => [...x.normalize('NFC')].map(c => (MARKS[c] ? MARKS[c][0] : c)).join('');
/* Đặt dấu thanh theo quy tắc: a/e trước, rồi o trong "ou", còn lại là nguyên âm cuối */
function retone(syl, t) {
  const b = bareSyl(syl).toLowerCase();
  if (t === 5) return b;
  let k = b.search(/[ae]/);
  if (k < 0) k = b.indexOf('ou');
  if (k < 0) k = Math.max(b.lastIndexOf('i'), b.lastIndexOf('o'), b.lastIndexOf('u'), b.lastIndexOf('ü'));
  return k < 0 ? b : b.slice(0, k) + VOWELS[b[k]][t - 1] + b.slice(k + 1);
}
function buildLevelSession(n, ver) {
  const all = levelWords(n, ver).filter(w => w.s.length <= 4);
  return buildWordSession(all, all);
}
/* targets: từ được hỏi; distract: kho từ để lấy phương án nhiễu (bài hiện tại + các bài trước) */
function buildWordSession(targetsIn, distract) {
  /* Một phiên chỉ dùng MỘT ngôn ngữ nghĩa: nếu trộn Việt/Anh thì phương án tiếng Việt duy nhất sẽ lộ đáp án.
     Dùng tiếng Việt khi kho từ đã có >= 60% nghĩa tiếng Việt. */
  const useVi = S.lang === 'vi' && distract.filter(w => w.vi).length >= distract.length * 0.6;
  const meaning = w => (useVi ? w.vi : shortEn(w.en));
  const pool = shuffle(distract.filter(w => meaning(w) && w.s.length <= 4 && !/…/.test(w.s)));
  const targets = shuffle(targetsIn.filter(w => meaning(w) && w.s.length <= 4 && !/…/.test(w.s)));
  if (pool.length < 8 || !targets.length) return buildSession();
  const used = new Set();
  /* ưu tiên từ chưa hỏi; bài ít từ thì cho phép hỏi lại */
  const take = pred => {
    let w = targets.find(x => !used.has(x.s) && pred(x));
    if (!w) w = shuffle(targets).find(pred);
    if (w) used.add(w.s);
    return w;
  };
  const others = (w, key) => {
    const seen = new Set([key(w)]), out = [];
    for (const x of shuffle(pool)) { if (out.length === 3) break; if (!seen.has(key(x))) { seen.add(key(x)); out.push(x); } }
    return out;
  };
  const opts = (w, key) => shuffle([w, ...others(w, key)]).map(x => ({ o: key(x), ok: x === w }));
  const expl = w => `${w.s} ${w.sy.join('')}: ${meaning(w)}${S.lang === 'vi' && w.hv ? ` (Hán Việt: ${w.hv})` : ''}`;
  const P_ = {
    mcq: { vi: 'Từ này nghĩa là gì?', en: 'What does this word mean?' },
    rev: { vi: 'Chọn từ có nghĩa này', en: 'Pick the word with this meaning' },
    listen: { vi: 'Nghe và chọn từ bạn nghe được', en: 'Listen and pick what you hear' },
    tone: { vi: 'Chọn pinyin đúng của chữ này', en: 'Pick the correct pinyin' },
    type: { vi: 'Gõ pinyin có thanh điệu', en: 'Type the pinyin with tones' },
    match: { vi: 'Ghép từ với nghĩa', en: 'Match each word to its meaning' }
  };
  const make = {
    mcq() { const w = take(() => true); return w && { type: 'mcq', prompt: P_.mcq, hanzi: w.s, options: opts(w, meaning), explain: expl(w) }; },
    rev() { const w = take(() => true); return w && { type: 'mcq', prompt: P_.rev, quote: meaning(w), options: opts(w, x => x.s), optZh: true, ansZh: true, explain: expl(w) }; },
    listen() { const w = take(() => true); return w && { type: 'listen', prompt: P_.listen, audio: w.s, options: opts(w, x => x.s), optZh: true, ansZh: true, explain: expl(w) }; },
    tone() {
      const w = take(x => x.s.length === 1 && x.tn[0] >= 1 && x.tn[0] <= 4);
      return w && { type: 'tone', prompt: P_.tone, hanzi: w.s, optPy: true, explain: expl(w),
        options: shuffle([1, 2, 3, 4].map(t => ({ o: retone(w.sy[0], t), ok: t === w.tn[0] }))) };
    },
    type() {
      const w = take(x => x.sy.length <= 3 && x.tn.every(t => t >= 1 && t <= 4) && /^[a-zü]+$/.test(bareSyl(x.sy.join('')).toLowerCase()));
      return w && { type: 'type', prompt: P_.type, hanzi: w.s, letters: bareSyl(w.sy.join('')).toLowerCase(), tones: w.tn.slice(), display: w.bp || w.sy.join(''), explain: expl(w) };
    },
    match() {
      const ws = [];
      for (let k = 0; k < 5; k++) {
        const w = take(x => x.s.length <= 3 && meaning(x).length <= 30 && !ws.some(y => y.s === x.s || meaning(y) === meaning(x)));
        if (w) ws.push(w);
      }
      return ws.length >= 4 && { type: 'match', prompt: P_.match, pairs: ws.map(w => [w.s, meaning(w)]),
        explain: { vi: 'Ghép đủ các cặp mà không sai lần nào mới được tính điểm.', en: 'Match every pair without a mistake to score.' } };
    }
  };
  return ['mcq', 'tone', 'listen', 'rev', 'match', 'type', 'mcq', 'listen', 'type', 'rev'].map(k => make[k]()).filter(Boolean);
}

/* ---------- Tài khoản (demo giao diện) ----------
   Bản chính thức: API Node + PostgreSQL, mật khẩu băm scrypt, đăng nhập Google qua OAuth,
   Zalo OAuth v4 + PKCE. Ở đây chỉ mô phỏng luồng để duyệt trải nghiệm. */
/* Ô mật khẩu có nút con mắt: người dùng xem lại đúng/sai trước khi gửi.
   Dùng type=password mặc định để trình duyệt vẫn lưu và tự điền được. */
const pwField = (id, label, auto, hint = '') => `<div class="fld">
  <label for="${id}">${label}</label>
  <div class="pwwrap">
    <input class="inp" id="${id}" type="password" autocomplete="${auto}" autocapitalize="off" spellcheck="false">
    <button type="button" class="pweye" data-act="pwtoggle" data-arg="${id}" aria-label="${tr('Hiện mật khẩu', 'Show password')}" aria-pressed="false">${ic('eye')}</button>
  </div>
  ${hint ? `<small class="hint">${hint}</small>` : ''}
  <div class="err" id="${id}Err" aria-live="polite"></div>
</div>`;
/* Đăng nhập mạng xã hội: nút dùng chung cho cả tab đăng nhập và đăng ký */
/* Chỉ hiện khối này khi chạy chế độ tĩnh (giải thích cần backend) hoặc khi Google đã được cấu hình */
const socialButtons = () => (S.api.on && !S.api.providers.google ? '' : `
  <button class="btn btn-google btn-block" data-act="oauth" data-arg="google">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 21.4 7.6 24 12 24z"/><path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.6 0 3.7 2.6 1.8 6.1l3.8 3C6.5 6.7 9 4.8 12 4.8z"/></svg>
    ${tr('Tiếp tục với Google', 'Continue with Google')}
  </button>
`);
async function hashPw(pw, salt) {
  const data = new TextEncoder().encode(salt + ':' + pw);
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0; for (const b of data) h = (h * 31 + b) >>> 0; return 'x' + h.toString(16);
}
const field = (id, label, type = 'text', auto = 'off', hint = '') =>
  `<div class="fld"><label for="${id}">${label}</label><input class="inp" id="${id}" type="${type}" autocomplete="${auto}" ${type === 'text' ? 'autocapitalize="off" spellcheck="false"' : ''}>${hint ? `<small class="hint">${hint}</small>` : ''}<div class="err" id="${id}Err" role="alert"></div></div>`;
const setErr = (id, msg) => { const e = $('#' + id + 'Err'); if (e) e.textContent = msg; };
const val = id => ($('#' + id) ? $('#' + id).value : '');

export { VOWELS, bareSyl, buildLevelSession, buildWordSession, field, hashPw, pwField, retone, setErr, socialButtons, val };
