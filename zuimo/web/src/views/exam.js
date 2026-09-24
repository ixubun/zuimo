/* ======================================================================
   Luyện thi HSK.
   Sảnh: chọn phiên bản, cấp, xem cấu trúc đề và lịch sử. Phòng thi: làm theo từng phần (nghe → đọc → viết) với
   đồng hồ riêng mỗi phần như thi thật; phần nghe phát tự động theo thứ tự câu, số lần phát theo quy định cấp
   (HSK 1–2: 2 lần, HSK 3+: 1 lần); câu trả lời lưu dần lên máy chủ. Nộp bài: máy chủ chấm, hiện điểm từng phần
   quy về 100, tổng điểm, đỗ/trượt và xem lại từng câu có đáp án, lời giải.
   ====================================================================== */
import { $, esc, view } from '../core/dom.js';
import { S, saveP } from '../core/state.js';
import { tr } from '../core/util.js';
import { ic } from '../core/icons.js';
import { API } from '../core/sync.js';
import { stopSpeech, toast } from '../features/speech.js';
import { addXP } from '../features/xp.js';
import { render } from '../app/router.js';
import { showAuthModal } from './profile.js';

S.exam = S.exam || { ver: null, lvl: 1, bps: null, sets: [], bank: [], history: [], busy: false, id: null, paper: null, title: null, mode: 'exam', answers: {}, flags: {}, sec: 0, cur: 0, deadline: null, review: null, playing: null, plays: {},
  track: { items: [], i: -1, status: 'idle', rep: 0 } };
const E = S.exam;
const CJK = /[\u3400-\u9fff]/;
let tickT = null, saveT = null, audioEl = null, playQueue = [];

/* ---------------------------------------------------------------- dữ liệu */
async function loadLobby() {
  E.busy = true; render();
  try {
    const [{ data: b }, { data: h }, { data: st }] = await Promise.all([API.call('/exam/blueprints'), API.call('/exam/history'), API.call(`/exam/sets?ver=${E.ver || S.ver}&lvl=${E.lvl}`)]);
    E.bps = b.blueprints; E.history = h.papers; E.sets = st.sets; E.bank = st.bank || [];
  } catch (e) { toast(e.message); }
  E.busy = false; render();
}
async function start(setId) {
  E.busy = true; render();
  try {
    const { data } = await API.call('/exam/start', { method: 'POST', body: { ver: E.ver || S.ver, lvl: E.lvl, setId: setId || undefined, mode: E.mode } });
    E.id = data.id; E.paper = data.paper; E.title = data.title; E.answers = {}; E.flags = {}; E.sec = 0; E.cur = 0; E.review = null; E.plays = {};
    startSection(0);
  } catch (e) { toast(e.message); }
  E.busy = false; render();
}
function startSection(i) {
  E.sec = i; E.cur = 0;
  stopAllAudio(); stopTrack();
  buildTrack();                       /* dựng băng nghe trước khi vẽ, để trình phát có mặt ngay từ lần vẽ đầu */
  clearInterval(tickT);
  if (E.mode === 'practice') { E.deadline = null; return; }        // luyện tập: không giới hạn giờ
  E.deadline = Date.now() + E.paper.sections[i].minutes * 60000;
  tickT = setInterval(tick, 1000);
}
function tick() {
  const el = $('#exClock'); if (!el || !E.deadline) { if (el) el.textContent = '∞'; return; }
  const left = Math.max(0, Math.round((E.deadline - Date.now()) / 1000));
  el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  el.classList.toggle('warn', left <= 120);
  if (left <= 0) { clearInterval(tickT); nextSection(true); }
}
function queueSave() { clearTimeout(saveT); saveT = setTimeout(() => API.call('/exam/answer', { method: 'POST', body: { id: E.id, answers: E.answers } }).catch(() => {}), 1500); }
function setAnswer(id, v) { E.answers[id] = v; queueSave(); }
async function nextSection(auto = false) {
  stopAllAudio(); stopTrack();
  if (E.sec < E.paper.sections.length - 1) { if (auto) toast(tr('Hết giờ phần này, chuyển sang phần tiếp.', 'Time is up, moving on.')); startSection(E.sec + 1); render(); }
  else await submit();
}
async function submit() {
  clearInterval(tickT); stopAllAudio();
  E.busy = true; render();
  try {
    const { data } = await API.call('/exam/submit', { method: 'POST', body: { id: E.id, answers: E.answers } });
    E.review = data; E.paper = null; E.deadline = null; stopTrack();
    if (data.xp) { addXP(data.xp); saveP(); }
  } catch (e) { toast(e.message); }
  E.busy = false; render();
}

/* ---------------------------------------------------------------- âm thanh */
function stopAllAudio() { playQueue = []; if (audioEl) { audioEl.pause(); audioEl = null; } stopSpeech(); E.playing = null; }
function playClip(src, text) {
  return new Promise(resolve => {
    if (src) {
      const a = new Audio(src); audioEl = a;
      a.onended = () => resolve(); a.onerror = () => { speakText(text).then(resolve); };
      a.play().catch(() => speakText(text).then(resolve));
    } else speakText(text).then(resolve);
  });
}
function speakText(text) {
  return new Promise(resolve => {
    if (!text || !window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; u.rate = 0.85; u.onend = () => resolve(); u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
const pause = ms => new Promise(r => setTimeout(r, ms));
/** Phát nội dung nghe của một câu: (câu hỏi số) + các dòng, lặp theo số lần quy định, có nghỉ giữa lần. */
async function playItem(it) {
  const bp = E.paper;
  const key = it.id;
  if (E.mode !== 'practice' && (E.plays[key] || 0) >= bp.plays) { toast(tr(`Câu này chỉ được nghe ${bp.plays} lần.`, `This item can only be played ${bp.plays} time(s).`)); return; }
  E.plays[key] = (E.plays[key] || 0) + 1;
  E.playing = key; render({ keepScroll: true });
  if (it.audio && E.paper.audio) { await playClip(it.audio, ''); E.playing = null; render({ keepScroll: true }); return; }   // đề thật: clip đã cắt sẵn
  const lines = it.lines || [{ zh: it.text || it.zh, audio: it.audio }];
  for (let rep = 0; rep < (it.kind === 'tf_pic' ? 1 : 1); rep++) {
    for (const ln of lines) { if (E.playing !== key) return; await playClip(ln.audio, ln.zh); await pause(600); }
    if (it.question && E.playing === key) await playClip(it.question.audio, it.question.zh);
  }
  E.playing = null; render({ keepScroll: true });
}

/* ---------------------------------------------------------------- băng nghe liên tục
   Như đề thật: đọc số câu, phát nội dung, nghỉ vài giây để trả lời, lặp lại theo số lần quy định của cấp,
   chạy hết phần nghe. Có tạm dừng, tua tới câu bất kỳ, chỉnh tốc độ. Câu đang phát được tô sáng và cuộn tới. */
const NUM_AUDIO = n => `/media/audio/p/n${n}.mp3`;
function buildTrack() {
  const sec = E.paper.sections[E.sec];
  if (E.paper.audio) { E.track = { items: [], i: -1, status: 'idle', rep: 0 }; return; }
  if (sec.key !== 'listening') { E.track = { items: [], i: -1, status: 'idle', rep: 0 }; return; }
  E.track = { items: sec.parts.flatMap(p => p.items), i: -1, status: 'idle', rep: 0, speed: 1 };
}
let trackToken = 0;
async function playTrackFrom(index) {
  const t = E.track; if (!t.items.length) return;
  const my = ++trackToken;
  t.i = Math.max(0, Math.min(index, t.items.length - 1)); t.status = 'playing';
  const alive = () => trackToken === my && t.status === 'playing';
  for (; t.i < t.items.length && alive(); t.i++) {
    const it = t.items[t.i];
    E.playing = it.id; E.plays[it.id] = E.paper.plays; renderTrackUi(); scrollToItem(it.id);
    const lines = it.lines || [{ zh: it.text || it.zh, audio: it.audio }];
    await playClip(NUM_AUDIO(it.num), `${it.num}`); if (!alive()) break; await pause(400);
    for (let rep = 0; rep < E.paper.plays && alive(); rep++) {
      for (const ln of lines) { if (!alive()) break; await playClip(ln.audio, ln.zh); await pause(500); }
      if (it.question && alive()) { await playClip(it.question.audio, it.question.zh); }
      if (rep < E.paper.plays - 1 && alive()) await pause(1500);
    }
    if (alive()) await pause(it.kind === 'dlg_ans' ? 8000 : 5000);      // thời gian trả lời như băng thật
  }
  if (alive()) { t.status = 'done'; t.i = t.items.length - 1; E.playing = null; renderTrackUi(); }
}
function pauseTrack() { E.track.status = 'paused'; trackToken++; if (audioEl) { audioEl.pause(); audioEl = null; } stopSpeech(); E.playing = null; renderTrackUi(); }
function stopTrack() { E.track.status = 'idle'; trackToken++; E.playing = null; const a = $('#exRealAudio'); if (a) a.pause(); }
function renderTrackUi() {
  if (E.paper && E.paper.audio) { bindRealAudio(); return; }
  const box = $('#exTrack'); if (!box) return;
  const t = E.track, cur = t.i >= 0 ? t.items[t.i] : null;
  box.querySelector('.ex-tstate').textContent = t.status === 'playing' ? `${tr('Đang phát câu', 'Playing item')} ${cur ? cur.num : ''}` : t.status === 'paused' ? tr('Tạm dừng', 'Paused') : t.status === 'done' ? tr('Đã phát hết phần nghe', 'Listening finished') : tr('Sẵn sàng', 'Ready');
  box.querySelector('.ex-tbar span').style.width = `${t.items.length ? ((t.i + (t.status === 'done' ? 1 : 0)) / t.items.length) * 100 : 0}%`;
  box.querySelector('[data-act="extplay"]').innerHTML = t.status === 'playing' ? `${ic('x')}${tr('Tạm dừng', 'Pause')}` : `${ic('play')}${t.status === 'idle' ? tr('Phát băng nghe', 'Play audio') : tr('Tiếp tục', 'Resume')}`;
  document.querySelectorAll('.ex-item.playing').forEach(el => el.classList.remove('playing'));
  if (cur && t.status === 'playing') { const el = $('#ex_' + cur.id); if (el) el.classList.add('playing'); }
  document.querySelectorAll('.ex-pal button').forEach(b => b.classList.toggle('playing', !!cur && t.status === 'playing' && b.dataset.arg === cur.id));
}
function scrollToItem(id) { const el = $('#ex_' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function realTrackHtml() {
  const p = E.paper;
  return `<div class="ex-track ex-realtrack" id="exTrack">
    <div class="ex-tinfo">${ic('volume')}<b>${tr('Băng nghe', 'Listening audio')}</b><span class="ex-tstate muted"></span></div>
    <audio id="exRealAudio" controls preload="metadata" src="${esc(p.audio)}" style="width:100%;margin-top:6px"></audio>
    <div class="btnrow" style="margin:6px 0 0">
      <button class="btn btn-ghost btn-sm" data-act="exrealcur">${ic('chev')}${tr('Tới câu đang phát', 'Go to current item')}</button>
      ${E.mode === 'practice' ? `<button class="btn btn-ghost btn-sm" data-act="exrealprev">${ic('back')}${tr('Câu trước', 'Prev')}</button><button class="btn btn-ghost btn-sm" data-act="exrealnext">${tr('Câu sau', 'Next')}${ic('chev')}</button><span class="hint">${tr('Luyện tập: tua tự do, mỗi câu có nút Nghe riêng.', 'Practice: seek freely.')}</span>`
        : `<span class="hint">${tr('Băng chạy liên tục như trong phòng thi, không tua lại. Bạn cuộn trang tự do để đọc trước; bảng tiến độ chỉ dùng để nhảy tới câu trên trang.', 'Plays like the real exam; no seeking.')}</span>`}
    </div>
  </div>`;
}
/** Đề thật: tô sáng câu đang phát theo mốc thời gian của băng. */
function bindRealAudio() {
  const a = $('#exRealAudio'); if (!a || a.__bound) return;   // gọi mỗi lần vẽ: chỉ gắn một lần cho mỗi phần tử
  a.__bound = true;
  const its = E.paper.sections[E.sec].parts.flatMap(p => p.items).filter(it => it.t0 != null);
  /* Không can thiệp vào currentTime của trình phát: ép tua ngược có thể gây nhảy băng trên một số trình duyệt.
     Quy tắc "không nghe lại" được giữ ở bảng tiến độ và các nút (không có nút tua ở chế độ thi). */
  a.ontimeupdate = () => {
    const t = a.currentTime;
    const cur = its.find(it => t >= it.t0 - 0.3 && t <= it.t1 + 4);
    const st = $('#exTrack .ex-tstate'); if (st) st.textContent = cur ? `${tr('Đang phát câu', 'Playing item')} ${cur.num}` : '';
    const curId = cur ? cur.id : null;
    if (a.__curId === curId) return;                 // câu chưa đổi: không đụng DOM, không cuộn
    a.__curId = curId;
    document.querySelectorAll('.ex-item.playing').forEach(el => el.classList.remove('playing'));
    if (cur) { const el = $('#ex_' + cur.id); if (el) el.classList.add('playing'); }
    /* Không tự cuộn: thí sinh phải được tự do đọc trước, xem hình trước như cầm đề giấy. Muốn về câu đang phát thì bấm nút. */
    document.querySelectorAll('.ex-pal button').forEach(b => b.classList.toggle('playing', !!cur && b.dataset.arg === cur.id));
  };
}
function realSeek(delta) {
  const a = $('#exRealAudio'); if (!a) return;
  const its = E.paper.sections[E.sec].parts.flatMap(p => p.items).filter(it => it.t0 != null);
  const i = its.findIndex(it => a.currentTime < it.t0 - 0.3);
  const curIdx = i < 0 ? its.length - 1 : Math.max(0, i - 1);
  const next = its[Math.max(0, Math.min(its.length - 1, curIdx + delta))];
  if (next) { a.currentTime = Math.max(0, next.t0 - 0.3); a.play(); }
}
function trackHtml() {
  if (E.paper.audio) return E.paper.sections[E.sec].key === 'listening' ? realTrackHtml() : '';
  const t = E.track; if (!t.items.length) return '';
  return `<div class="ex-track" id="exTrack">
    <div class="ex-tinfo">${ic('volume')}<b>${tr('Băng nghe', 'Listening audio')}</b><span class="ex-tstate muted">${tr('Sẵn sàng', 'Ready')}</span></div>
    <div class="ex-tbar"><span style="width:0%"></span></div>
    <div class="btnrow" style="margin:6px 0 0">
      <button class="btn btn-sm" data-act="extplay">${ic('play')}${tr('Phát băng nghe', 'Play audio')}</button>
      <button class="btn btn-ghost btn-sm" data-act="extprev">${ic('back')}${tr('Câu trước', 'Prev')}</button>
      <button class="btn btn-ghost btn-sm" data-act="extnext">${tr('Câu sau', 'Next')}${ic('chev')}</button>
      ${E.mode === 'practice' ? `<span class="hint">${tr('Luyện tập: bấm nút Nghe ở từng câu để nghe lại không giới hạn.', 'Practice: use per-item Play to repeat.')}</span>` : `<span class="hint">${tr(`Băng phát mỗi câu ${E.paper.plays} lần rồi tự chuyển câu, như thi thật.`, 'Plays like the real exam.')}</span>`}
    </div></div>`;
}

/* ---------------------------------------------------------------- hiển thị câu */
const L = 'ABCDEF';
const picHtml = (p, cls = 'ex-pic') => (!p ? '' : typeof p === 'string' ? `<span class="${cls}">${p}</span>`
  : p.img ? `<span class="${cls} photo"><img src="${esc(p.img)}" alt="" loading="lazy"></span>` : `<span class="${cls}">${p.emoji || ''}</span>`);
const showPy = () => E.paper && E.paper.lvl <= 2;   /* đề mẫu HSK 1–2 in pinyin trên mọi chữ Hán */
const zhPy = (zh, py) => `<div class="zh ex-text" lang="zh-CN">${showPy() && py ? `<small class="dpy">${esc(py)}</small><br>` : ''}${esc(zh)}</div>`;
const optBtn = (it, letter, inner, cls = '') => `<button class="ex-opt ${cls} ${E.answers[it.id] === letter ? 'on' : ''}" data-act="exans" data-arg="${it.id}|${letter}"><b>${letter}</b>${inner}</button>`;
const optText = (it, i) => `<span class="zh" lang="zh-CN">${showPy() && it.optionsPy ? `<small class="dpy">${esc(it.optionsPy[i])}</small> ` : ''}${esc(it.options[i])}</span>`;
const tfBtns = it => `<div class="ex-tf">${['✓', '✗'].map(v => `<button class="ex-opt tf ${E.answers[it.id] === v ? 'on' : ''}" data-act="exans" data-arg="${it.id}|${v}">${v}</button>`).join('')}</div>`;
const isListening = sec => sec.key === 'listening';

function playBtn(it) {
  if (E.mode !== 'practice') return `<span class="ex-listenmark">${ic('volume')}${tr('Nghe băng', 'Audio')}</span>`;   // thi thử: chỉ nghe qua băng
  return `<button class="btn btn-ghost btn-sm ${E.playing === it.id ? 'btn-verm' : ''}" data-act="explay" data-arg="${it.id}">${ic('volume')}${E.playing === it.id ? tr('Đang phát…', 'Playing…') : tr('Nghe', 'Play')}</button>`;
}
/** Luyện tập: sau khi chọn thì hiện ngay đúng/sai và lời giải. */
function feedbackHtml(it) {
  if (E.mode !== 'practice' || it.answer === undefined) return '';
  const a = E.answers[it.id]; if (a == null || a === '') return '';
  const norm = x => [...String(x)].filter(c => CJK.test(c)).join('');
  const ok = ['order', 'char'].includes(it.kind) ? norm(a) === norm(Array.isArray(it.answer) ? it.answer.join('') : it.answer) : String(a) === String(it.answer);
  return `<div class="ex-fb ${ok ? 'ok' : 'bad'}">${ok ? '✓ ' + tr('Đúng', 'Correct') : '✗ ' + tr('Sai', 'Wrong') + ` · ${tr('Đáp án', 'Answer')}: <b>${esc(Array.isArray(it.answer) ? it.answer.join(' ') : String(it.answer))}</b>`}${it.explain ? `<div class="hint">${esc(it.explain)}</div>` : ''}</div>`;
}
function itemHtml(it, sec, part) {
  const listen = isListening(sec);
  const head = `<div class="ex-num">${it.example ? tr('Ví dụ', 'Ex.') : it.num + '.'}</div>`;
  switch (it.kind) {
    case 'tf_pic': return `${head}<div class="ex-body">${listen && !it.example ? playBtn(it) : ''}${listen && !it.example ? '' : zhPy(it.text, it.py)}<div class="ex-picbig">${picHtml(it.pic, 'ex-picinner')}</div>${tfBtns(it)}</div>`;
    case 'pick_pic': return `${head}<div class="ex-body">${it.example ? zhPy(it.zh, it.py) : playBtn(it)}<div class="ex-opts">${it.options.map((p, i) => optBtn(it, L[i], picHtml(p), 'pic')).join('')}</div></div>`;
    case 'dlg_ans': return `${head}<div class="ex-body">${it.example ? (it.lines || [{ zh: it.zh, py: it.py }]).map(l => zhPy(l.zh, l.py)).join('') + (it.question ? zhPy(it.question.zh) : '') : (listen ? playBtn(it) : zhPy(it.zh, it.py))}<div class="ex-opts ${it.optionsPy ? 'row' : 'col'}">${it.options.map((o, i) => optBtn(it, L[i], optText(it, i))).join('')}</div></div>`;
    case 'choice': return `${head}<div class="ex-body">${zhPy(it.zh, it.py)}<div class="ex-opts col">${it.options.map((o, i) => optBtn(it, L[i], optText(it, i))).join('')}</div></div>`;
    case 'tf_stmt': return `${head}<div class="ex-body">${it.example ? zhPy(it.zh, it.py) : playBtn(it)}${zhPy('★ ' + it.statement)}${tfBtns(it)}</div>`;
    case 'rtf_stmt': return `${head}<div class="ex-body">${zhPy(it.zh, it.py)}${zhPy('★ ' + it.statement)}${tfBtns(it)}</div>`;
    case 'match': return `${head}<div class="ex-body">${it.lines ? (it.example || !listen ? it.lines.map(l => zhPy(l.zh, l.py)).join('') : playBtn(it)) : zhPy(it.text, it.py)}<div class="ex-opts row">${it.pool.map((_, i) => optBtn(it, L[i], '', 'letter')).join('')}</div></div>`;
    case 'fill': return `${head}<div class="ex-body">${zhPy(it.text, it.py)}<div class="ex-opts row">${it.pool.map((_, i) => optBtn(it, L[i], '', 'letter')).join('')}</div></div>`;
    case 'order': { const ans = E.answers[it.id] || ''; const usedIdx = new Set((E.answers[it.id + ':idx'] || []));
      return `${head}<div class="ex-body"><div class="ex-chunks">${it.chunks.map((c, i) => `<button class="tile zh ${usedIdx.has(i) ? 'used' : ''}" lang="zh-CN" data-act="exchunk" data-arg="${it.id}|${i}">${esc(c)}</button>`).join('')}</div>
        <div class="ex-order zh" lang="zh-CN">${esc(ans) || `<span class="muted">${tr('Bấm các cụm theo thứ tự', 'Tap chunks in order')}</span>`}</div>
        <div class="btnrow" style="margin:6px 0 0"><button class="btn btn-ghost btn-sm" data-act="exorderclear" data-arg="${it.id}">${tr('Làm lại', 'Reset')}</button></div></div>`; }
    case 'char': return `${head}<div class="ex-body">${zhPy(it.text)}<div class="dpy">${esc(it.hint)}</div><input class="inp zh ex-in" lang="zh-CN" maxlength="2" data-ex="${it.id}" value="${esc(E.answers[it.id] || '')}" placeholder="${tr('chữ', 'character')}"></div>`;
    case 'pic_sent': return `${head}<div class="ex-body"><div class="ex-picbig">${picHtml(it.pic, 'ex-picinner')}</div>${zhPy(it.word, it.py)}<textarea class="inp zh ex-in" lang="zh-CN" rows="2" data-ex="${it.id}">${esc(E.answers[it.id] || '')}</textarea></div>`;
    case 'essay': return `${head}<div class="ex-body"><div class="zh ex-text" lang="zh-CN">${it.words.map(w => `<span class="tagchip zh">${esc(w)}</span>`).join('')}</div><p class="hint">${tr(`Viết khoảng ${it.minChars} chữ, dùng đủ các từ trên.`, `About ${it.minChars} characters, use all the words.`)}</p><textarea class="inp zh ex-in" lang="zh-CN" rows="6" data-ex="${it.id}">${esc(E.answers[it.id] || '')}</textarea><div class="hint" id="exCount_${it.id}">${[...(E.answers[it.id] || '')].filter(c => CJK.test(c)).length} ${tr('chữ', 'chars')}</div></div>`;
    default: return `${head}<div class="ex-body muted">${it.kind}</div>`;
  }
}
/** Ví dụ mẫu đầu phần (例如): in kèm đáp án, không tính điểm, không cần nghe. */
function exampleHtml(ex, sec, part) {
  if (!ex) return '';
  const saved = E.answers[ex.id]; E.answers[ex.id] = ex.answer;   // để nút đáp án hiện ở trạng thái chọn sẵn
  const html = `<div class="ex-item example"><span class="ex-exlabel">例如</span>${itemHtml(ex, sec, part)}<div class="ex-exans">${tr('Đáp án', 'Answer')}: <b>${esc(String(ex.answer))}</b></div></div>`;
  if (saved === undefined) delete E.answers[ex.id]; else E.answers[ex.id] = saved;
  return html;
}
function poolBlock(pool, from, to) {
  if (!pool || !pool.length) return '';
  const isPic = typeof pool[0] !== 'string';
  return `<div class="ex-pool ${isPic ? 'pics' : ''}"><div class="ex-poolhead muted">${tr('Câu', 'Items')} ${from}–${to}</div>${pool.map((p, i) => `<div class="ex-poolitem"><b>${L[i]}</b>${isPic ? picHtml(p) : `<span class="zh" lang="zh-CN">${esc(p)}</span>`}</div>`).join('')}</div>`;
}
/** Một phần có thể gồm nhiều nhóm, mỗi nhóm một kho A–F (đề thật: 11–15 và 16–20). Trả về kho cần chèn trước câu này. */
function poolBefore(part, idx) {
  const it = part.items[idx]; if (!it || !it.pool) return '';
  const prev = part.items[idx - 1];
  if (prev && prev.pool === it.pool) return '';
  if (prev && prev.pool && JSON.stringify(prev.pool) === JSON.stringify(it.pool)) return '';
  let end = idx; while (part.items[end + 1] && JSON.stringify(part.items[end + 1].pool) === JSON.stringify(it.pool)) end++;
  return poolBlock(it.pool, it.num, part.items[end].num);
}
function poolHtml() { return ''; }   /* giữ tên cũ; kho được chèn theo nhóm qua poolBefore() */

/* ---------------------------------------------------------------- màn hình */
function lobbyHtml() {
  const ver = E.ver || S.ver, bp = E.bps && E.bps[E.lvl];
  const bankN = lvl => { const b = E.bank.find(x => x.ver === ver && x.lvl === lvl); return b ? b.n : 0; };
  const bankSets = E.sets.filter(x => x.kind === 'bank'), realSets = E.sets.filter(x => x.kind === 'real'), customSets = E.sets.filter(x => x.kind === 'custom');
  return `
  <p class="lead">${tr('Ngân hàng đề mô phỏng theo cấu trúc chính thức. Mỗi lần thi chọn ngẫu nhiên một đề; phần nghe chạy liên tục như băng thi thật.', 'Mock exam bank in the official format; a random paper each time.')}</p>
  <div class="seggroup" style="margin-bottom:12px"><button class="seg" data-act="exver" data-arg="20" aria-pressed="${ver === '20'}">HSK 2.0</button><button class="seg" data-act="exver" data-arg="30" aria-pressed="${ver === '30'}">HSK 3.0</button></div>
  <div class="ex-levels">${[1, 2, 3, 4, 5, 6].map(n => `<button class="ex-level ${E.lvl === n ? 'on' : ''} l${n}" data-act="exlvl" data-arg="${n}"><small>HSK</small><b>${n}</b><span>${bankN(n)} ${tr('đề', 'papers')}</span></button>`).join('')}</div>
  ${bp ? `<div class="card pad ex-bp">
    <div class="ex-bphead"><h2 class="sec" style="margin:0">HSK ${ver === '30' ? '3.0' : '2.0'} · ${tr('cấp', 'level')} ${E.lvl}</h2>
      <div class="seggroup"><button class="seg" data-act="exmode" data-arg="exam" aria-pressed="${E.mode === 'exam'}">${tr('Thi thử', 'Exam')}</button><button class="seg" data-act="exmode" data-arg="practice" aria-pressed="${E.mode === 'practice'}">${tr('Luyện tập', 'Practice')}</button></div></div>
    <p class="hint">${E.mode === 'exam' ? tr('Thi thử: tính giờ từng phần, băng nghe chạy liên tục, chỉ xem đáp án sau khi nộp.', 'Timed; answers after submitting.') : tr('Luyện tập: không tính giờ, nghe lại không giới hạn, xem đáp án và lời giải ngay sau mỗi câu.', 'Untimed; instant feedback.')}</p>
    <table class="ex-table"><thead><tr><th>${tr('Phần', 'Section')}</th><th>${tr('Số câu', 'Items')}</th><th>${tr('Thời gian', 'Time')}</th><th>${tr('Điểm', 'Score')}</th></tr></thead><tbody>
      ${bp.sections.map(s => `<tr><td>${{ listening: tr('Nghe', 'Listening'), reading: tr('Đọc', 'Reading'), writing: tr('Viết', 'Writing') }[s.key]}</td><td>${s.parts.reduce((a, p) => a + p[1], 0)} <span class="muted">(${s.parts.length} ${tr('phần', 'parts')})</span></td><td>${s.minutes}′</td><td>100</td></tr>`).join('')}
      <tr><td><b>${tr('Tổng', 'Total')}</b></td><td><b>${bp.sections.reduce((a, s) => a + s.parts.reduce((b, p) => b + p[1], 0), 0)}</b></td><td><b>${bp.sections.reduce((a, s) => a + s.minutes, 0)}′</b></td><td><b>${bp.total}</b> · ${tr('đỗ', 'pass')} ≥ ${bp.pass}</td></tr>
    </tbody></table>
    <p class="hint">${tr(`Nghe ${bp.plays} lần mỗi câu.`, `${bp.plays} play(s) per item.`)} ${E.lvl >= 4 ? tr('Cấp 4–6 là đề mô phỏng rút gọn.', 'Levels 4–6 are simplified.') : ''} ${ver === '30' ? tr('HSK 3.0 dùng khung tương đương, sẽ cập nhật theo định dạng chính thức.', '') : ''}</p>
    <div class="btnrow">
      <button class="btn" data-act="exstart">${ic('play')}${bankN(E.lvl) ? tr('Bắt đầu (đề ngẫu nhiên)', 'Start (random paper)') : tr('Bắt đầu (đề sinh mới)', 'Start (new paper)')}</button>
      <a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.chinesetest.cn/userfiles/file/HSK${E.lvl}.pdf">${ic('book')}${tr('Đề mẫu chính thức (CTI)', 'Official sample (CTI)')}</a>
    </div>
    ${bankSets.length ? `<details class="ex-banklist"><summary>${tr('Chọn đề cụ thể', 'Pick a specific paper')} (${bankSets.length})</summary><div class="ex-bankgrid">${bankSets.map(st => { const done = E.history.find(h => h.source === 'set:' + st.id && h.finished_at); return `<button class="ex-bankbtn ${done ? 'done' : ''}" data-act="exstartset" data-arg="${st.id}">${esc(st.title)}${done ? `<small>${done.total}/${done.max}</small>` : ''}</button>`; }).join('')}</div></details>` : ''}
    ${realSets.length ? `<h3 class="sec" style="margin:14px 0 6px">${tr('Đề thật', 'Past papers')} <small class="muted">(${tr('nguồn CTI/汉考国际, dùng để ôn luyện', 'source: CTI')})</small></h3><div class="ex-bankgrid">${realSets.map(st => { const done = E.history.find(h => h.source === 'set:' + st.id && h.finished_at); return `<button class="ex-bankbtn real ${done ? 'done' : ''}" data-act="exstartset" data-arg="${st.id}">${ic('book')}${esc(st.title)}${done ? `<small>${done.total}/${done.max}</small>` : ''}</button>`; }).join('')}</div>` : ''}
    ${customSets.map(st => `<button class="btn btn-ghost btn-sm" data-act="exstartset" data-arg="${st.id}">${ic('book')}${esc(st.title)}</button>`).join('')}
  </div>` : ''}
  ${E.history.length ? `<h2 class="sec">${tr('Đề đã làm', 'Past exams')}</h2><div class="ex-hist">${E.history.slice(0, 20).map(h => `
    <button class="drow" data-act="exreview" data-arg="${h.id}"><span class="dbody"><span class="dpy">${h.title ? esc(h.title) + ' · ' : ''}HSK ${h.ver === '30' ? '3.0' : '2.0'} ${tr('cấp', 'level')} ${h.lvl}${h.mode === 'practice' ? ' · ' + tr('luyện tập', 'practice') : ''}</span><span class="dvi">${new Date(h.started_at).toLocaleString(S.lang === 'vi' ? 'vi-VN' : 'en-GB')}</span></span>
      <span class="ex-histscore ${h.finished_at ? (h.pass ? 'good' : 'low') : ''}">${h.finished_at ? `${h.total}/${h.max} · ${h.pass ? tr('Đỗ', 'Pass') : tr('Trượt', 'Fail')}` : tr('Đang làm dở', 'In progress')}</span></button>`).join('')}</div>` : ''}`;
}

function paletteHtml() {
  const p = E.paper;
  const secName = k => ({ listening: tr('Nghe', 'Listening'), reading: tr('Đọc', 'Reading'), writing: tr('Viết', 'Writing') })[k];
  const all = p.sections.flatMap(s => s.parts.flatMap(pt => pt.items));
  const done = all.filter(it => E.answers[it.id] != null && E.answers[it.id] !== '').length;
  return `<aside class="ex-pal">
    <div class="ex-palhead"><b>${tr('Tiến độ', 'Progress')}</b><span class="muted">${done}/${all.length} (${Math.round(done / all.length * 100)}%)</span></div>
    <div class="pbar"><span style="width:${done / all.length * 100}%"></span></div>
    ${p.sections.map((sec, si) => `<div class="ex-palsec ${si === E.sec ? 'cur' : si < E.sec ? 'past' : 'next'}"><small>${secName(sec.key)}</small><div class="ex-palgrid">${sec.parts.flatMap(pt => pt.items).map(it => {
      const a = E.answers[it.id]; const st = a != null && a !== '' ? 'done' : ''; const fl = E.flags[it.id] ? 'flag' : '';
      return `<button class="${st} ${fl}" data-act="exgoto" data-arg="${it.id}" ${si !== E.sec ? 'disabled' : ''}>${it.num}</button>`; }).join('')}</div></div>`).join('')}
    <div class="ex-pallegend"><span class="d"></span>${tr('Đã trả lời', 'Answered')} <span class="f"></span>${tr('Đánh dấu', 'Flagged')}</div>
  </aside>`;
}
function roomHtml() {
  const p = E.paper, sec = p.sections[E.sec];
  return `
  <div class="ex-bar">
    <div><b>${E.title ? esc(E.title) + ' · ' : ''}HSK ${p.ver === '30' ? '3.0' : '2.0'} ${tr('cấp', 'level')} ${p.lvl}</b> <span class="muted">· ${p.sections.map((s, i) => `<span class="${i === E.sec ? 'ex-secon' : ''}">${s.title[1]}</span>`).join(' → ')}</span>${E.mode === 'practice' ? ` <span class="hchip">${tr('Luyện tập', 'Practice')}</span>` : ''}</div>
    <div class="ex-clock" id="exClock">${E.mode === 'practice' ? '∞' : '--:--'}</div>
    <button class="btn btn-sm" data-act="exnextsec">${E.sec < p.sections.length - 1 ? tr('Nộp phần này', 'Finish section') : tr('Nộp bài', 'Submit')}${ic('chev')}</button>
    <button class="btn btn-ghost btn-sm" data-act="exquit">${tr('Thoát', 'Exit')}</button>
  </div>
  <div class="ex-layout">
  <div class="ex-main">
  <h2 class="ex-sech">${esc(sec.title[0])} ${sec.title[1]} <small class="muted">${sec.minutes} ${tr('phút', 'min')}</small></h2>
  ${trackHtml()}
  ${sec.parts.map(part => `<section class="ex-part">
    <h3>${esc(part.title[0])} ${part.title[1]}</h3>
    <p class="ex-instr"><span class="zh" lang="zh-CN">${esc(part.instr[0])}</span><br><span class="muted">${esc(part.instr[1])}</span></p>
    ${exampleHtml(part.example, sec, part)}
    ${poolHtml(part)}
    ${part.items.map((it, idx) => `${poolBefore(part, idx)}<div class="ex-item ${E.answers[it.id] != null && E.answers[it.id] !== '' ? 'done' : ''} ${E.flags[it.id] ? 'flagged' : ''}" id="ex_${it.id}">${itemHtml(it, sec, part)}<button class="ex-flag ${E.flags[it.id] ? 'on' : ''}" data-act="exflag" data-arg="${it.id}" title="${tr('Đánh dấu xem lại', 'Flag for review')}">⚑</button>${feedbackHtml(it)}</div>`).join('')}
  </section>`).join('')}
  <div class="btnrow" style="margin:16px 0"><button class="btn" data-act="exnextsec">${E.sec < p.sections.length - 1 ? tr('Nộp phần này và sang phần tiếp', 'Finish section') : tr('Nộp bài', 'Submit exam')}${ic('chev')}</button></div>
  </div>
  ${paletteHtml()}
  </div>`;
}

function reviewHtml() {
  const r = E.review, res = r.result, p = r.paper, ans = r.answers;
  const secName = k => ({ listening: tr('Nghe', 'Listening'), reading: tr('Đọc', 'Reading'), writing: tr('Viết', 'Writing') })[k];
  return `
  <div class="card pad ex-result ${res.pass ? 'pass' : 'fail'}">
    <div class="ex-total"><b>${res.total}</b><span>/${res.max}</span></div>
    <div class="ex-verdict">${res.pass ? tr('ĐẠT', 'PASS') : tr('CHƯA ĐẠT', 'FAIL')} <small class="muted">(${tr('ngưỡng', 'threshold')} ${res.threshold})</small>${r.xp ? ` <span class="hchip">+${r.xp} XP</span>` : ''}</div>
    <div class="ex-secs">${Object.entries(res.sections).map(([k, s]) => `<div class="ex-sec"><span>${secName(k)}</span><b>${s.scaled}</b><small>${s.raw}/${s.count} ${tr('câu', 'items')}</small></div>`).join('')}</div>
    <p class="hint">${tr('Điểm mỗi phần quy về thang 100 theo tỉ lệ câu đúng, như cách quy đổi của đề chính thức. Phần viết tự luận chấm tự động rút gọn (đủ từ, đủ độ dài).', 'Each section is scaled to 100.')}</p>
    <div class="btnrow"><button class="btn" data-act="exlobby">${ic('back')}${tr('Về sảnh thi', 'Back to lobby')}</button><button class="btn btn-ghost" data-act="exstart">${tr('Thi lại đề mới', 'New exam')}</button></div>
  </div>
  ${p.sections.map(sec => `<h2 class="ex-sech">${esc(sec.title[0])} ${sec.title[1]} · <span class="muted">${res.sections[sec.key].scaled}/100</span></h2>
    ${sec.parts.map(part => `<section class="ex-part">${part.items.map((it, idx) => { const got = res.sections[sec.key].items.find(x => x.id === it.id) || {}; const ok = got.got >= 1;
      return `${poolBefore(part, idx)}<div class="ex-item review ${ok ? 'ok' : got.got > 0 ? 'part' : 'bad'}"><div class="ex-num">${it.num}.</div><div class="ex-body">
        ${it.kind === 'tf_pic' || it.kind === 'pic_sent' ? `<div class="ex-picbig small">${picHtml(it.pic, 'ex-picinner')}</div>` : ''}
        ${it.lines ? it.lines.map(l => `<div class="zh" lang="zh-CN">${l.who ? `<b>${esc(l.who)}：</b>` : ''}${esc(l.zh)} <span class="dpy">${esc(l.py || '')}</span></div>`).join('') + (it.question ? `<div class="zh" lang="zh-CN"><b>问：</b>${esc(it.question.zh)}</div>` : '') : (it.zh || it.text) ? `<div class="zh" lang="zh-CN">${esc(it.zh || it.text)}${it.statement ? `<br>★ ${esc(it.statement)}` : ''}</div>` : ''}
        ${it.options ? `<div class="muted">${it.options.map((o, i) => `${L[i]}. ${typeof o === 'string' ? esc(o) : picHtml(o, 'ex-pic sm')}`).join(' &nbsp; ')}</div>` : ''}
        ${it.chunks ? `<div class="muted">${it.chunks.map(c => esc(c)).join(' / ')}</div>` : ''}
        <div class="ex-ans"><span>${tr('Bạn', 'You')}: <b class="${ok ? 'good' : 'low'}">${esc(String(ans[it.id] ?? '—'))}</b></span><span>${tr('Đáp án', 'Answer')}: <b class="good">${esc(Array.isArray(it.answer) ? it.answer.join(' ') : String(it.answer))}</b></span>${got.got > 0 && got.got < 1 ? `<span class="muted">${Math.round(got.got * 100)}%</span>` : ''}</div>
        ${it.explain ? `<div class="hint">${esc(it.explain)}</div>` : ''}
        ${it.audio && r.paper.audio ? `<audio controls preload="none" src="${esc(it.audio)}" style="height:32px;margin-top:4px"></audio>` : ''}
      </div></div>`; }).join('')}</section>`).join('')}`).join('')}`;
}

export function renderExam() {
  if (!S.user) { view.innerHTML = `<div class="lhead"><h1>${tr('Luyện thi HSK', 'HSK mock exams')}</h1></div>`; showAuthModal('exam'); return; }
  if (!S.api.on) { view.innerHTML = `<div class="lhead"><h1>${tr('Luyện thi HSK', 'HSK mock exams')}</h1></div><p class="empty-note">${tr('Cần máy chủ Zuimó.', 'Needs the Zuimó server.')}</p>`; return; }
  view.innerHTML = `<div class="lhead">${E.paper ? '' : `<button class="icon-btn" data-act="back" aria-label="${tr('Quay lại', 'Back')}">${ic('back')}</button>`}<h1>${tr('Luyện thi HSK', 'HSK mock exams')}</h1></div>
    ${E.busy && !E.paper ? `<p class="lead loading">${tr('Đang chuẩn bị đề…', 'Preparing…')}</p>` : E.paper ? roomHtml() : E.review ? reviewHtml() : lobbyHtml()}`;
  if (!E.paper && !E.review && !E.bps && !E.busy) loadLobby();
  if (E.paper) { tick(); renderTrackUi(); }
}

function updateOrderDom(id, it) {
  const box = $('#ex_' + id); if (!box) return;
  const used = new Set(E.answers[id + ':idx'] || []);
  box.querySelectorAll('.ex-chunks .tile').forEach(t => t.classList.toggle('used', used.has(+t.dataset.arg.split('|')[1])));
  const o = box.querySelector('.ex-order'); if (o) o.innerHTML = esc(E.answers[id] || '') || `<span class="muted">${tr('Bấm các cụm theo thứ tự', 'Tap chunks in order')}</span>`;
  updateItemDom(id);
}
/** Cập nhật DOM cho một câu sau khi trả lời hoặc đánh dấu: nút đã chọn, trạng thái câu, ô ở bảng tiến độ, phản hồi luyện tập. */
function updateItemDom(id) {
  const box = $('#ex_' + id); if (!box) return;
  const v = E.answers[id];
  box.querySelectorAll('.ex-opt').forEach(b => { const letter = (b.dataset.arg || '').split('|')[1]; b.classList.toggle('on', letter !== undefined && letter === v); });
  box.classList.toggle('done', v != null && v !== '');
  box.classList.toggle('flagged', !!E.flags[id]);
  const flag = box.querySelector('.ex-flag'); if (flag) flag.classList.toggle('on', !!E.flags[id]);
  const it = E.paper.sections[E.sec].parts.flatMap(p => p.items).find(x => x.id === id);
  if (it) {
    const old = box.querySelector('.ex-fb'); if (old) old.remove();
    const fb = feedbackHtml(it); if (fb) box.insertAdjacentHTML('beforeend', fb);
  }
  const pal = document.querySelector(`.ex-palgrid button[data-arg="${id}"]`);
  if (pal) { pal.classList.toggle('done', v != null && v !== ''); pal.classList.toggle('flag', !!E.flags[id]); }
  const all = E.paper.sections.flatMap(s => s.parts.flatMap(pt => pt.items));
  const done = all.filter(x => E.answers[x.id] != null && E.answers[x.id] !== '').length;
  const head = document.querySelector('.ex-palhead .muted'); if (head) head.textContent = `${done}/${all.length} (${Math.round(done / all.length * 100)}%)`;
  const bar = document.querySelector('.ex-pal .pbar span'); if (bar) bar.style.width = `${done / all.length * 100}%`;
}

/* nhập chữ trong ô viết: lưu ngay khi gõ */
document.addEventListener('input', e => {
  const id = e.target && e.target.dataset && e.target.dataset.ex; if (!id) return;
  setAnswer(id, e.target.value);
  const c = $('#exCount_' + id); if (c) c.textContent = `${[...e.target.value].filter(ch => CJK.test(ch)).length} ${tr('chữ', 'chars')}`;
  const wrap = e.target.closest('.ex-item'); if (wrap) wrap.classList.toggle('done', !!e.target.value.trim());
});
window.addEventListener('beforeunload', e => { if (E.paper) { e.preventDefault(); e.returnValue = ''; } });

export const EXAM_ACT = {
  exver(a) { E.ver = a; E.bps = null; render(); },
  exlvl(a) { E.lvl = +a; E.bps = null; render(); },
  exstart() { E.review = null; start(); },
  exstartset(a) { E.review = null; start(+a); },
  exlobby() { E.review = null; E.bps = null; render(); },
  async exreview(a) {
    E.busy = true; render();
    try { const { data } = await API.call('/exam/paper?id=' + a); if (data.finished) { E.review = data; E.paper = null; } else { E.id = data.id; E.paper = data.paper; E.mode = data.mode || 'exam'; E.answers = data.answers || {}; E.flags = {}; E.plays = {}; startSection(0); } }
    catch (e) { toast(e.message); }
    E.busy = false; render();
  },
  exmode(a) { E.mode = a; render({ keepScroll: true }); },
  /* Trả lời / đánh dấu: cập nhật tại chỗ, KHÔNG vẽ lại trang. Vẽ lại sẽ tạo mới <audio> làm băng dừng và mất vị trí. */
  exans(a) { const [id, v] = a.split('|'); setAnswer(id, v); updateItemDom(id); },
  exflag(a) { E.flags[a] = !E.flags[a]; updateItemDom(a); },
  exgoto(a) {
    scrollToItem(a);
    /* thi thử: chỉ cuộn tới câu, không tua băng (thi thật không được nghe lại); luyện tập thì tua */
    if (E.mode !== 'practice') return;
    const a1 = $('#exRealAudio'); const it = E.paper && E.paper.sections[E.sec].parts.flatMap(p => p.items).find(x => x.id === a);
    if (a1 && it && it.t0 != null) { a1.currentTime = Math.max(0, it.t0 - 0.3); a1.play(); }
  },
  exrealcur() { const a1 = $('#exRealAudio'); if (a1 && a1.__curId) scrollToItem(a1.__curId); },
  exrealprev() { realSeek(-1); },
  exrealnext() { realSeek(1); },
  exquit() { if (confirm(tr('Thoát? Bài đang làm được lưu, bạn có thể tiếp tục từ mục "Đề đã làm".', 'Exit? Progress is saved.'))) { stopTrack(); stopAllAudio(); clearInterval(tickT); E.paper = null; E.bps = null; render(); } },
  extplay() { const t = E.track; if (t.status === 'playing') pauseTrack(); else playTrackFrom(t.status === 'idle' || t.status === 'done' ? 0 : t.i); },
  extprev() { const t = E.track; pauseTrack(); playTrackFrom(Math.max(0, t.i - 1)); },
  extnext() { const t = E.track; pauseTrack(); playTrackFrom(Math.min(t.items.length - 1, t.i + 1)); },
  explay(a) { const it = E.paper.sections[E.sec].parts.flatMap(p => p.items).find(x => x.id === a); if (it) playItem(it); },
  exchunk(a) { const [id, i] = a.split('|'); const it = E.paper.sections[E.sec].parts.flatMap(p => p.items).find(x => x.id === id);
    const idx = E.answers[id + ':idx'] || []; if (idx.includes(+i)) return; const next = [...idx, +i]; E.answers[id + ':idx'] = next; setAnswer(id, next.map(k => it.chunks[k]).join('')); updateOrderDom(id, it); },
  exorderclear(a) { const it = E.paper.sections[E.sec].parts.flatMap(p => p.items).find(x => x.id === a); delete E.answers[a + ':idx']; setAnswer(a, ''); updateOrderDom(a, it); },
  exnextsec() { if (confirm(E.sec < E.paper.sections.length - 1 ? tr('Nộp phần này? Bạn không quay lại được.', 'Finish this section? You cannot return.') : tr('Nộp bài?', 'Submit the exam?'))) nextSection(false); }
};
