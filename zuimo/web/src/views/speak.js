/* ======================================================================
   Luyện phát âm (shadowing).
   Nghe mẫu (MP3 Azure hoặc đoạn clip YouTube) -> nhìn chữ Hán + pinyin màu thanh điệu -> ghi âm đọc theo -> chấm.
   Hai bộ chấm:
     azure      Pronunciation Assessment: điểm chính xác / trôi chảy / đầy đủ / ngữ điệu, từng từ, từng âm vị.
                Trình duyệt ghi âm, chuyển sang WAV 16 kHz mono rồi gửi lên API (server giữ key).
     webspeech  SpeechRecognition của trình duyệt (Chrome/Edge/Safari): nhận dạng thành chữ rồi so từng chữ với câu mẫu.
                Miễn phí, không phụ thuộc key, nhưng không chấm được thanh điệu.
   Luôn ghi âm bằng MediaRecorder để người học nghe lại giọng mình.
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
import { topicName } from './listen.js';

S.speak = S.speak || { src: 'sent', ver: null, lvl: 1, items: [], idx: 0, loadedKey: null, busy: false, cfg: null, engine: 'auto',
  recording: false, blobUrl: null, result: null, slow: false, clips: [], clip: null, seg: 0, stats: null, secs: 0 };
const P = S.speak;
const CJK = /[\u3400-\u9fff]/;
let rec = null, chunks = [], stream = null, recog = null, recogText = '', secT = null, ytPlayer = null, ytReady = null, ytTimer = null;

/* ---------------------------------------------------------------- pinyin màu thanh điệu */
const TONE_MARKS = { 1: 'āēīōūǖĀĒĪŌŪǕ', 2: 'áéíóúǘÁÉÍÓÚǗ', 3: 'ǎěǐǒǔǚǍĚǏǑǓǙ', 4: 'àèìòùǜÀÈÌÒÙǛ' };
const toneOf = syl => { for (const [t, chars] of Object.entries(TONE_MARKS)) if ([...syl].some(c => chars.includes(c))) return +t; return 5; };
const pyHtml = py => (py || '').split(' ').map(s => `<span class="t${toneOf(s)}">${esc(s)}</span>`).join(' ');

/* ---------------------------------------------------------------- dữ liệu */
async function loadCfg() { try { const { data } = await API.call('/practice/speech/config'); P.cfg = data; } catch (e) { P.cfg = { azure: false, dailyLeft: 0 }; } }
async function loadItems(force = false) {
  const k = `${P.src}:${P.ver || S.ver}:${P.lvl}`;
  if (!force && P.loadedKey === k) return;
  P.loadedKey = k; P.busy = true; P.items = []; P.result = null; P.clips = []; P.clip = null; render();
  try {
    if (P.src === 'clip') { const { data } = await API.call('/practice/clips?kind=shadowing'); P.clips = data.clips; }
    else { const { data } = await API.call(`/practice/listening/items?ver=${P.ver || S.ver}&lvl=${P.lvl}&n=10&len=any`); P.items = data.items; P.idx = 0; }
  } catch (e) { toast(e.message); }
  P.busy = false; render();
}
async function loadStats() { P.stats = { stats: null }; try { const { data } = await API.call('/practice/history?kind=speaking&n=5'); P.stats = data; } catch (e) { /* */ } }
const current = () => (P.src === 'clip' ? (P.clip && P.clip.segments[P.seg]) : P.items[P.idx]);
const currentRef = () => (P.src === 'clip' ? `clip:${P.clip.id}:${P.seg}` : P.items[P.idx].ref);
const engine = () => (P.engine === 'auto' ? (P.cfg && P.cfg.azure && P.cfg.dailyLeft > 0 ? 'azure' : 'webspeech') : P.engine);
const hasWebSpeech = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

/* ---------------------------------------------------------------- phát mẫu */
function playModel() {
  const it = current(); if (!it) return;
  if (P.src === 'clip') { playSegment(it); return; }
  const audio = $('#spAudio');
  if (it.audio && audio) { audio.src = P.slow ? it.audio.replace(/\.mp3$/, '-slow.mp3') : it.audio; audio.play().catch(() => speakFallback(it.zh)); }
  else speakFallback(it.zh);
}
function speakFallback(text) { stopSpeech(); const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; u.rate = P.slow ? 0.6 : 0.85; speechSynthesis.speak(u); }
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((ok, fail) => {
    if (window.YT && window.YT.Player) return ok();
    window.onYouTubeIframeAPIReady = () => ok();
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { ytReady = null; fail(new Error('yt')); }; document.head.appendChild(s);
    setTimeout(() => { ytReady = null; fail(new Error('yt-timeout')); }, 8000);
  });
  return ytReady;
}
async function mountYT() {
  const box = $('#spYt'); if (!P.clip || !box) return;
  try { await loadYT(); } catch (e) { box.innerHTML = `<div class="ls-ytfail"><a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${esc(P.clip.youtube_id)}">${tr('Mở trên YouTube', 'Open on YouTube')}</a></div>`; return; }
  const iframe = ytPlayer && ytPlayer.getIframe && ytPlayer.getIframe();
  if (ytPlayer && ytPlayer.__id === P.clip.youtube_id && iframe && document.body.contains(iframe)) return;
  if (ytPlayer) { try { ytPlayer.destroy(); } catch (e) { /* */ } }
  ytPlayer = new window.YT.Player('spYt', { videoId: P.clip.youtube_id, width: '100%', height: '100%', playerVars: { rel: 0, modestbranding: 1, playsinline: 1, controls: 1 } });
  ytPlayer.__id = P.clip.youtube_id;
}
function playSegment(seg) {
  if (!ytPlayer || !ytPlayer.seekTo) { toast(tr('Trình phát chưa sẵn sàng.', 'Player not ready.')); return; }
  clearInterval(ytTimer); ytPlayer.setPlaybackRate(P.slow ? 0.75 : 1); ytPlayer.seekTo(seg.start, true); ytPlayer.playVideo();
  ytTimer = setInterval(() => { try { if (ytPlayer.getCurrentTime() >= seg.end - 0.05) { ytPlayer.pauseVideo(); clearInterval(ytTimer); } } catch (e) { clearInterval(ytTimer); } }, 100);
}

/* ---------------------------------------------------------------- ghi âm */
async function startRec() {
  if (P.recording) return;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { toast(tr('Không mở được micro. Hãy cho phép trang dùng micro trong trình duyệt.', 'Microphone access denied.')); return; }
  chunks = []; recogText = '';
  rec = new MediaRecorder(stream);
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = onStop;
  rec.start();
  /* luôn bật nhận dạng trình duyệt (nếu có) làm dự phòng: Azure lỗi hay hết lượt thì vẫn có kết quả */
  if (hasWebSpeech()) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recog = new SR(); recog.lang = 'zh-CN'; recog.interimResults = false; recog.maxAlternatives = 1; recog.continuous = true;
    recog.onresult = e => { recogText = [...e.results].map(r => r[0].transcript).join(''); };
    recog.onerror = () => { /* không nhận dạng được: sẽ báo 0 điểm */ };
    try { recog.start(); } catch (e) { /* đã chạy */ }
  }
  P.recording = true; P.result = null; P.secs = 0;
  if (P.blobUrl) { URL.revokeObjectURL(P.blobUrl); P.blobUrl = null; }
  secT = setInterval(() => { P.secs++; const el = $('#spSecs'); if (el) el.textContent = P.secs; if (P.secs >= 25) stopRec(); }, 1000);
  render({ keepScroll: true });
}
function stopRec() {
  if (!P.recording) return;
  clearInterval(secT);
  try { rec.stop(); } catch (e) { /* */ }
  if (recog) { try { recog.stop(); } catch (e) { /* */ } }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  P.recording = false;
}
async function onStop() {
  const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
  P.blobUrl = URL.createObjectURL(blob);
  P.busy = true; render({ keepScroll: true });
  try {
    if (engine() === 'azure') {
      try { await assessAzure(blob); }
      catch (e) {
        toast(tr('Chấm nâng cao lỗi, dùng nhận dạng của trình duyệt: ', 'Azure failed, using browser recognition: ') + (e.message || ''));
        await new Promise(ok => setTimeout(ok, 600)); await assessWebSpeech();
      }
    } else { await new Promise(ok => setTimeout(ok, 600)); await assessWebSpeech(); }   // chờ SpeechRecognition trả kết quả cuối
  } catch (e) { toast(e.message); }
  P.busy = false; render({ keepScroll: true });
}

/** Chuyển bản ghi (webm/opus, ogg…) sang WAV PCM16 16 kHz mono ngay trên trình duyệt. */
async function toWav16k(blob) {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ac.decodeAudioData(await blob.arrayBuffer());
  const len = Math.ceil(decoded.duration * 16000);
  const off = new OfflineAudioContext(1, len, 16000);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  const pcm = out.getChannelData(0);
  const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  ac.close();
  let bin = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function assessAzure(blob) {
  const it = current();
  const wav = await toWav16k(blob);
  const { data } = await API.call('/practice/speech/assess', { method: 'POST', body: { itemRef: currentRef(), reference: it.zh, wav } });
  P.result = { engine: 'azure', ...data };
  if (P.cfg) P.cfg.dailyLeft = data.dailyLeft;
  if (data.xp) { addXP(data.xp); saveP(); }
}
/** So chữ đã nhận dạng với câu mẫu (khoảng cách chỉnh sửa) rồi lưu điểm. */
function diff(target, answer) {
  const t = [...target].filter(c => CJK.test(c)), a = [...answer].filter(c => CJK.test(c));
  const n = t.length, m = a.length, d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i; for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (t[i - 1] === a[j - 1] ? 0 : 1));
  const ops = []; let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && t[i - 1] === a[j - 1] && d[i][j] === d[i - 1][j - 1]) { ops.push({ op: 'ok', c: t[i - 1] }); i--; j--; }
    else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) { ops.push({ op: 'sub', c: t[i - 1], got: a[j - 1] }); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ op: 'miss', c: t[i - 1] }); i--; }
    else { ops.push({ op: 'extra', got: a[j - 1] }); j--; }
  }
  ops.reverse();
  return { score: n ? Math.max(0, Math.round((1 - d[n][m] / n) * 100)) : 0, ops, correct: ops.filter(o => o.op === 'ok').length, total: n };
}
async function assessWebSpeech() {
  const it = current();
  if (!hasWebSpeech()) { P.result = { engine: 'none', recognized: '', score: null }; return; }
  const r = diff(it.zh, recogText);
  const { data } = await API.call('/practice/attempt', { method: 'POST', body: { kind: 'speaking', itemRef: currentRef(), score: r.score, detail: { engine: 'webspeech', recognized: recogText, correct: r.correct, total: r.total } } });
  P.result = { engine: 'webspeech', recognized: recogText, ...r, xp: data.xp };
  if (data.xp) { addXP(data.xp); saveP(); }
}

/* ---------------------------------------------------------------- hiển thị */
const scoreCls = s => (s >= 80 ? 'good' : s >= 60 ? 'mid' : 'low');
const opsHtml = ops => ops.map(o => o.op === 'ok' ? `<span class="ls-ok">${esc(o.c)}</span>` : o.op === 'sub' ? `<span class="ls-bad">${esc(o.c)}<small>${esc(o.got)}</small></span>` : o.op === 'miss' ? `<span class="ls-miss">${esc(o.c)}</span>` : `<span class="ls-extra">${esc(o.got)}</span>`).join('');

function resultHtml(r, it) {
  if (r.engine === 'none') return `<div class="empty-note">${tr('Trình duyệt này không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome, Edge hoặc Safari, hoặc cấu hình Azure Speech để chấm nâng cao.', 'This browser has no speech recognition. Use Chrome, Edge or Safari, or configure Azure Speech.')}</div>`;
  if (r.engine === 'webspeech') return `<div class="ls-result">
    <div class="ls-score ${scoreCls(r.score)}"><b>${r.score}%</b><span>${r.correct}/${r.total} ${tr('chữ đọc đúng', 'characters recognised')}${r.xp ? ` · +${r.xp} XP` : ''}</span></div>
    <div class="ls-diff zh" lang="zh-CN">${opsHtml(r.ops)}</div>
    <p class="hint">${tr('Máy nghe được', 'Recognised')}: <span class="zh" lang="zh-CN">${esc(r.recognized || '—')}</span> · ${tr('Chế độ trình duyệt chỉ so chữ, chưa chấm thanh điệu.', 'Browser mode checks characters only, not tones.')}</p></div>`;
  if (r.status !== 'Success' || !r.scores) return `<div class="ls-result"><div class="ls-score low"><b>0%</b><span>${tr('Azure không nhận ra lời nói. Hãy nói to, rõ, gần micro hơn.', 'No speech recognised. Speak clearly, closer to the mic.')}</span></div></div>`;
  const sc = r.scores;
  const bar = (label, v) => `<div class="sp-bar"><span>${label}</span><div class="pbar"><span style="width:${v || 0}%"></span></div><b class="${scoreCls(v || 0)}">${Math.round(v || 0)}</b></div>`;
  return `<div class="ls-result">
    <div class="ls-score ${scoreCls(r.score)}"><b>${r.score}</b><span>/100 ${tr('điểm phát âm', 'pronunciation score')}${r.xp ? ` · +${r.xp} XP` : ''}</span></div>
    <div class="sp-bars">${bar(tr('Chính xác', 'Accuracy'), sc.accuracy)}${bar(tr('Trôi chảy', 'Fluency'), sc.fluency)}${bar(tr('Đầy đủ', 'Completeness'), sc.completeness)}${sc.prosody != null ? bar(tr('Ngữ điệu', 'Prosody'), sc.prosody) : ''}</div>
    <div class="sp-words zh" lang="zh-CN">${r.words.map(w => `<span class="sp-word ${w.error !== 'None' ? 'err' : scoreCls(w.accuracy || 0)}" title="${w.error === 'Omission' ? tr('bỏ sót', 'omitted') : w.error === 'Insertion' ? tr('thừa', 'inserted') : w.error === 'Mispronunciation' ? tr('phát âm sai', 'mispronounced') : `${Math.round(w.accuracy || 0)}/100`}${w.phonemes.length ? ' · ' + w.phonemes.map(p => `${p.p} ${Math.round(p.score || 0)}`).join(', ') : ''}">${esc(w.word)}<small>${w.error === 'Omission' ? '×' : w.error === 'Insertion' ? '+' : Math.round(w.accuracy || 0)}</small></span>`).join('')}</div>
    <p class="hint">${tr('Rê chuột vào từng từ để xem điểm từng âm. Màu đỏ: sai hoặc bỏ sót.', 'Hover a word for phoneme scores. Red: wrong or omitted.')}</p></div>`;
}

function itemHtml() {
  const it = current();
  if (!it) return `<p class="empty-note">${P.src === 'clip' ? tr('Chưa có clip cho luyện phát âm. Admin thêm ở trang Quản trị (chọn "Nghe và phát âm").', 'No shadowing clips yet.') : tr('Chưa có câu cho cấp này.', 'No sentences for this level.')}</p>`;
  const eng = engine(), r = P.result;
  const engNote = eng === 'azure'
    ? tr(`Chấm nâng cao Azure (còn ${P.cfg.dailyLeft} lượt hôm nay)`, `Azure assessment (${P.cfg.dailyLeft} left today)`)
    : hasWebSpeech() ? tr('Chấm bằng nhận dạng của trình duyệt', 'Browser speech recognition') : tr('Trình duyệt không hỗ trợ nhận dạng giọng nói', 'No speech recognition in this browser');
  return `
  <div class="ls-card card sp-card">
    <div class="ls-top"><span class="muted">${P.src === 'clip' ? `${esc(P.clip.title)} · ${tr('đoạn', 'segment')} ${P.seg + 1}/${P.clip.segments.length}` : `${tr('Câu', 'Item')} ${P.idx + 1}/${P.items.length}`}</span><span class="muted">${engNote}</span></div>
    ${P.src === 'clip' ? `<div class="ls-yt"><div id="spYt"></div></div>` : `<audio id="spAudio" preload="none"></audio>`}
    <div class="sp-text zh" lang="zh-CN">${esc(it.zh)}</div>
    <div class="sp-py">${pyHtml(it.py)}</div>
    ${it.vi ? `<div class="dvi">${esc(it.vi)}</div>` : ''}
    <div class="ls-playrow" style="margin-top:12px">
      <button class="btn btn-ghost" data-act="spmodel">${ic('volume')}${tr('Nghe mẫu', 'Listen')}</button>
      <button class="btn btn-ghost btn-sm ${P.slow ? 'on' : ''}" data-act="spslow" aria-pressed="${P.slow}">${tr('Chậm', 'Slow')}</button>
      ${P.recording
        ? `<button class="btn btn-verm sp-rec on" data-act="sprec"><span class="sp-dot"></span>${tr('Dừng', 'Stop')} (<span id="spSecs">${P.secs}</span>s)</button>`
        : `<button class="btn sp-rec" data-act="sprec" ${P.busy ? 'disabled' : ''}>${ic('play')}${tr('Ghi âm và đọc theo', 'Record')}</button>`}
      ${P.blobUrl && !P.recording ? `<button class="btn btn-ghost btn-sm" data-act="spme">${ic('volume')}${tr('Nghe lại giọng mình', 'Play my recording')}</button><audio id="spMe" src="${P.blobUrl}"></audio>` : ''}
    </div>
    ${P.busy && !P.recording ? `<p class="lead loading">${tr('Đang chấm…', 'Scoring…')}</p>` : ''}
    ${r ? resultHtml(r, it) : ''}
    <div class="btnrow" style="margin:12px 0 0">
      ${P.src === 'clip' ? `<button class="btn btn-ghost btn-sm" data-act="spseg" data-arg="${P.seg - 1}" ${P.seg <= 0 ? 'disabled' : ''}>${ic('back')}${tr('Đoạn trước', 'Previous')}</button><button class="btn" data-act="spseg" data-arg="${P.seg + 1}" ${P.seg >= P.clip.segments.length - 1 ? 'disabled' : ''}>${tr('Đoạn tiếp', 'Next')}${ic('chev')}</button>`
        : `<button class="btn" data-act="spnext">${tr('Câu tiếp', 'Next')}${ic('chev')}</button>`}
      <button class="btn btn-ghost btn-sm" data-act="dictgo" data-arg="${esc(it.zh.replace(/[，。！？；：、,.!?\s]/g, '').slice(0, 30))}">${ic('search')}${tr('Tra từ điển', 'Look up')}</button>
    </div>
  </div>`;
}

function clipsHtml() {
  if (P.clip) return `<div class="ls-clipnav"><button class="btn btn-ghost btn-sm" data-act="spclips">${ic('back')}${tr('Thư viện', 'Library')}</button><span class="muted">${esc(topicName(P.clip.topic))} › ${esc(P.clip.title)}</span></div>` + itemHtml()
    + `<div class="ls-seglist sp-seglist">${P.clip.segments.map((sg, i) => `<button class="ls-segitem ${i === P.seg ? 'cur' : ''}" data-act="spseg" data-arg="${i}"><span class="ls-segno">#${i + 1}</span><span class="ls-segbody zh" lang="zh-CN">${esc(sg.zh)}</span></button>`).join('')}</div>`;
  if (!P.clips.length) return `<p class="empty-note">${tr('Chưa có clip cho luyện phát âm.', 'No shadowing clips yet.')}</p>`;
  const groups = {}; P.clips.forEach(c => { (groups[c.topic] = groups[c.topic] || []).push(c); });
  return Object.entries(groups).map(([topic, list]) => `<section class="clipgroup"><h2 class="sec">${esc(topicName(topic))}</h2><div class="clipgrid">${list.map(c => `
    <button class="clipcard" data-act="spopen" data-arg="${c.id}"><span class="clipthumb"><img src="${esc(c.thumb)}" alt="" loading="lazy">${c.lvl ? `<span class="cliplvl">HSK ${c.lvl}</span>` : ''}</span><span class="cliptitle">${esc(c.title)}</span><span class="clipmeta">${c.nseg} ${tr('đoạn', 'segments')}</span></button>`).join('')}</div></section>`).join('');
}

export function renderSpeak() {
  if (!S.user) { view.innerHTML = `<div class="lhead"><h1>${tr('Luyện phát âm', 'Pronunciation')}</h1></div><p class="lead">${tr('Bạn cần đăng nhập để luyện tập.', 'Sign in to practise.')}</p>`; showAuthModal('speak'); return; }
  if (!S.api.on) { view.innerHTML = `<div class="lhead"><h1>${tr('Luyện phát âm', 'Pronunciation')}</h1></div><p class="empty-note">${tr('Phần này cần máy chủ Zuimó.', 'Needs the Zuimó server.')}</p>`; return; }
  const lvls = (P.ver || S.ver) === '30' ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6];
  const st = P.stats && P.stats.stats;
  view.innerHTML = `
  <div class="lhead"><button class="icon-btn" data-act="back" aria-label="${tr('Quay lại', 'Back')}">${ic('back')}</button><h1>${tr('Luyện phát âm', 'Pronunciation')}</h1></div>
  <p class="lead">${tr('Nghe mẫu, nhìn chữ và pinyin, rồi ghi âm đọc theo. Máy chấm từng chữ, từng âm và thanh điệu.', 'Listen, read along, record, and get scored.')}</p>
  <div class="ls-controls">
    <div class="seggroup"><button class="seg" data-act="spsrc" data-arg="sent" aria-pressed="${P.src === 'sent'}">${ic('volume')}${tr('Câu luyện', 'Sentences')}</button><button class="seg" data-act="spsrc" data-arg="clip" aria-pressed="${P.src === 'clip'}">${ic('play')}${tr('Clip YouTube', 'YouTube clips')}</button></div>
    ${P.src === 'sent' ? `<div class="seggroup"><button class="seg" data-act="spver" data-arg="20" aria-pressed="${(P.ver || S.ver) === '20'}">HSK 2.0</button><button class="seg" data-act="spver" data-arg="30" aria-pressed="${(P.ver || S.ver) === '30'}">HSK 3.0</button></div>
    <div class="seggroup">${lvls.map(n => `<button class="seg" data-act="splvl" data-arg="${n}" aria-pressed="${P.lvl === n}">${n === 7 ? '7–9' : n}</button>`).join('')}</div>` : ''}
    ${P.cfg && P.cfg.azure ? `<div class="seggroup"><button class="seg" data-act="speng" data-arg="auto" aria-pressed="${P.engine === 'auto'}">${tr('Tự chọn', 'Auto')}</button><button class="seg" data-act="speng" data-arg="azure" aria-pressed="${P.engine === 'azure'}">Azure</button><button class="seg" data-act="speng" data-arg="webspeech" aria-pressed="${P.engine === 'webspeech'}">${tr('Trình duyệt', 'Browser')}</button></div>` : ''}
  </div>
  ${!P.cfg || (P.busy && !current()) ? `<p class="lead loading">${tr('Đang tải…', 'Loading…')}</p>` : P.src === 'clip' ? clipsHtml() : itemHtml()}
  ${st && st.attempts ? `<p class="hint">${tr(`Đã luyện ${st.attempts} lượt, điểm trung bình ${st.avg_score}, tuần này ${st.week} lượt.`, `${st.attempts} attempts, average ${st.avg_score}, ${st.week} this week.`)}</p>` : ''}`;
  if (!P.cfg) { loadCfg().then(() => render()); return; }
  if (!P.stats) loadStats();
  loadItems();
  if (P.src === 'clip' && P.clip) mountYT();
}

export const SPEAK_ACT = {
  spsrc(a) { stopRec(); P.src = a; P.result = null; render(); },
  spver(a) { P.ver = a; P.lvl = Math.min(P.lvl, a === '20' ? 6 : 7); render(); },
  splvl(a) { P.lvl = +a; render(); },
  speng(a) { P.engine = a; render({ keepScroll: true }); },
  spmodel() { playModel(); },
  spslow() { P.slow = !P.slow; render({ keepScroll: true }); },
  sprec() { if (P.recording) stopRec(); else startRec(); },
  spme() { const a = $('#spMe'); if (a) a.play(); },
  spnext() { stopRec(); P.result = null; P.blobUrl = null; if (P.idx < P.items.length - 1) { P.idx++; render(); } else loadItems(true); },
  spopen(a) { const c = P.clips.find(x => x.id === +a); if (!c) return; P.clip = c; P.seg = 0; P.result = null; P.blobUrl = null; render(); },
  spclips() { stopRec(); P.clip = null; P.result = null; clearInterval(ytTimer); if (ytPlayer) { try { ytPlayer.destroy(); } catch (e) { /* */ } ytPlayer = null; } render(); },
  spseg(a) { const i = +a; if (i < 0 || i >= P.clip.segments.length) return; stopRec(); P.seg = i; P.result = null; P.blobUrl = null; render({ keepScroll: true }); }
};
