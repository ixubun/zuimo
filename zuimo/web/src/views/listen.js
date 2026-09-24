/* ======================================================================
   Luyện nghe (nghe – chép).
   Hai nguồn: (1) câu do Zuimó soạn, MP3 Azure TTS; (2) thư viện clip YouTube theo chủ đề do admin thêm,
   có transcript chia đoạn. Trang clip gồm video bên trái, bản chép từng đoạn bên phải: mỗi đoạn hiện
   số chữ dạng chấm, người học nghe đoạn đó, gõ lại, chấm ngay; tiến độ cả clip tính theo phần trăm.
   Ba mức: Dễ (hiện pinyin và số chữ), Thường (số chữ), Khó (không gợi ý).
   Dữ liệu chỉ tải một lần cho mỗi bộ tham số (loadedKey) - trước đây tải lại mỗi lần vẽ khi danh sách trống,
   gây vòng lặp vô hạn làm treo trang.
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

S.listen = S.listen || {
  src: 'sent', ver: null, lvl: 1, len: 'short', items: [], idx: 0, result: null, busy: false, plays: 0, slow: false, revealed: false, stats: null,
  loadedKey: null,
  topics: [], clips: [], topic: null, clipLvl: 0, clip: null, seg: 0, level: 'normal', segResults: {}, ytFail: false
};
const L = S.listen;
const CJK = /[\u3400-\u9fff]/;
let ytPlayer = null, ytReady = null, ytTimer = null;

/* ---------------------------------------------------------------- tên chủ đề */
const TOPIC_VI = { kids: ['Tiếng Trung cho trẻ em', 'Chinese for kids'], daily: ['Hội thoại hằng ngày', 'Daily conversation'], hsk: ['Theo giáo trình HSK', 'HSK textbook'],
  story: ['Truyện và kể chuyện', 'Stories'], news: ['Tin tức', 'News'], culture: ['Văn hoá', 'Culture'], music: ['Âm nhạc', 'Music'], travel: ['Du lịch', 'Travel'],
  business: ['Kinh doanh', 'Business'], tech: ['Công nghệ', 'Technology'], food: ['Ẩm thực', 'Food'], podcast: ['Podcast', 'Podcast'], ted: ['TED tiếng Trung', 'TED in Chinese'], general: ['Chủ đề khác', 'Other'] };
export const TOPIC_KEYS = Object.keys(TOPIC_VI);
export const topicName = t => (TOPIC_VI[t] ? tr(TOPIC_VI[t][0], TOPIC_VI[t][1]) : t);
const fmtDur = s => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

/* ---------------------------------------------------------------- tải dữ liệu (một lần cho mỗi bộ tham số) */
const sentKey = () => `sent:${L.ver || S.ver}:${L.lvl}:${L.len}`;
async function loadSentences(force = false) {
  const key = sentKey();
  if (!force && L.loadedKey === key) return;
  L.loadedKey = key; L.busy = true; L.result = null; L.revealed = false; L.plays = 0; L.items = []; render();
  try { const { data } = await API.call(`/practice/listening/items?ver=${L.ver || S.ver}&lvl=${L.lvl}&n=10&len=${L.len}`); L.items = data.items; L.idx = 0; }
  catch (e) { toast(e.message); }
  L.busy = false; render();
}
async function loadLibrary(force = false) {
  const key = `lib:${L.topic || ''}:${L.clipLvl}`;
  if (!force && L.loadedKey === key) return;
  L.loadedKey = key; L.busy = true; render();
  try {
    const [{ data: t }, { data: c }] = await Promise.all([
      API.call('/practice/topics?kind=listening'),
      API.call(`/practice/clips?kind=listening${L.topic ? '&topic=' + encodeURIComponent(L.topic) : ''}${L.clipLvl ? '&lvl=' + L.clipLvl : ''}`)
    ]);
    L.topics = t.topics; L.clips = c.clips;
  } catch (e) { toast(e.message); L.topics = []; L.clips = []; }
  L.busy = false; render();
}
async function loadStats() { L.stats = { stats: null }; try { const { data } = await API.call('/practice/history?kind=listening&n=5'); L.stats = data; } catch (e) { /* bỏ qua */ } }

/* ---------------------------------------------------------------- câu luyện */
function playSentence() {
  const it = L.items[L.idx]; if (!it) return;
  L.plays++; const c = $('#lsPlays'); if (c) c.textContent = L.plays;
  const audio = $('#lsAudio');
  if (it.audio && audio) { audio.src = L.slow ? it.audio.replace(/\.mp3$/, '-slow.mp3') : it.audio; audio.play().catch(() => speakFallback(it.zh)); }
  else speakFallback(it.zh);
}
function speakFallback(text) { stopSpeech(); const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; u.rate = L.slow ? 0.6 : 0.85; speechSynthesis.speak(u); }
async function submit(itemRef, target, answer, detail) {
  const { data } = await API.call('/practice/attempt', { method: 'POST', body: { kind: 'listening', itemRef, target, answer, detail } });
  if (data.xp) { addXP(data.xp); saveP(); }
  return data;
}
async function checkSentence() {
  const it = L.items[L.idx]; const inp = $('#lsAnswer'); if (!it || !inp) return;
  const answer = inp.value.trim();
  if (!answer) { toast(tr('Hãy gõ những gì bạn nghe được.', 'Type what you heard.')); return; }
  L.busy = true; render();
  try { L.result = { ...(await submit(it.ref, it.zh, answer, { plays: L.plays, slow: L.slow, src: 'sent' })), answer }; } catch (e) { toast(e.message); }
  L.busy = false; render();
}

/* ---------------------------------------------------------------- YouTube */
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((ok, fail) => {
    if (window.YT && window.YT.Player) return ok();
    window.onYouTubeIframeAPIReady = () => ok();
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytReady = null; fail(new Error('yt')); };
    document.head.appendChild(s);
    setTimeout(() => { ytReady = null; fail(new Error('yt-timeout')); }, 8000);
  });
  return ytReady;
}
const ytFallbackHtml = () => `<div class="ls-ytfail"><p>${tr('Không tải được trình phát YouTube (mạng hoặc trình chặn quảng cáo).', 'YouTube player could not load.')}</p>
  <a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${esc(L.clip.youtube_id)}">${tr('Mở trên YouTube', 'Open on YouTube')}</a></div>`;
async function mountYT() {
  const box = $('#ytBox'); if (!L.clip || !box) return;
  try { await loadYT(); } catch (e) { L.ytFail = true; const b = $('#ytBox'); if (b) b.innerHTML = ytFallbackHtml(); return; }
  const iframe = ytPlayer && ytPlayer.getIframe && ytPlayer.getIframe();
  if (ytPlayer && ytPlayer.__id === L.clip.youtube_id && iframe && document.body.contains(iframe)) return;
  if (ytPlayer) { try { ytPlayer.destroy(); } catch (e) { /* đã gỡ */ } }
  ytPlayer = new window.YT.Player('ytBox', { videoId: L.clip.youtube_id, width: '100%', height: '100%', playerVars: { rel: 0, modestbranding: 1, playsinline: 1, controls: 1 } });
  ytPlayer.__id = L.clip.youtube_id;
}
function playSegment(seg) {
  if (!ytPlayer || !ytPlayer.seekTo) { toast(tr('Trình phát chưa sẵn sàng, thử lại sau một giây.', 'Player not ready yet.')); return; }
  clearInterval(ytTimer);
  L.plays++;
  ytPlayer.setPlaybackRate(L.slow ? 0.75 : 1);
  ytPlayer.seekTo(seg.start, true); ytPlayer.playVideo();
  ytTimer = setInterval(() => { try { if (ytPlayer.getCurrentTime() >= seg.end - 0.05) { ytPlayer.pauseVideo(); clearInterval(ytTimer); } } catch (e) { clearInterval(ytTimer); } }, 100);
}
function stopYT() { clearInterval(ytTimer); if (ytPlayer) { try { ytPlayer.destroy(); } catch (e) { /* */ } ytPlayer = null; } }
async function checkSegment() {
  const seg = L.clip.segments[L.seg]; const inp = $('#lsSegAnswer'); if (!seg || !inp) return;
  const answer = inp.value.trim();
  if (!answer) { toast(tr('Hãy gõ những gì bạn nghe được.', 'Type what you heard.')); return; }
  L.busy = true; render();
  try { L.segResults[L.seg] = { ...(await submit(`clip:${L.clip.id}:${L.seg}`, seg.zh, answer, { plays: L.plays, slow: L.slow, src: 'clip', level: L.level })), answer }; }
  catch (e) { toast(e.message); }
  L.busy = false; L.plays = 0; render();
}
const clipProgress = () => { const n = L.clip ? L.clip.segments.length : 0; return n ? Math.round(Object.values(L.segResults).reduce((a, r) => a + r.score, 0) / n) : 0; };

/* ---------------------------------------------------------------- khối hiển thị */
const opsHtml = ops => ops.map(o => o.op === 'ok' ? `<span class="ls-ok">${esc(o.c)}</span>`
  : o.op === 'sub' ? `<span class="ls-bad" title="${tr('bạn gõ', 'you typed')}: ${esc(o.got)}">${esc(o.c)}<small>${esc(o.got)}</small></span>`
  : o.op === 'miss' ? `<span class="ls-miss">${esc(o.c)}</span>` : `<span class="ls-extra">${esc(o.got)}</span>`).join('');
const scoreCls = s => (s >= 80 ? 'good' : s >= 60 ? 'mid' : 'low');
const maskHtml = zh => [...zh].map(c => (CJK.test(c) ? '<i class="dot"></i>' : `<span class="punc">${esc(c)}</span>`)).join('');

const headHtml = () => `<div class="lhead"><button class="icon-btn" data-act="back" aria-label="${tr('Quay lại', 'Back')}">${ic('back')}</button><h1>${tr('Luyện nghe', 'Listening')}</h1></div>
  <div class="seggroup ls-src" role="group">
    <button class="seg" data-act="lssrc" data-arg="sent" aria-pressed="${L.src === 'sent'}">${ic('volume')}${tr('Câu luyện', 'Sentences')}</button>
    <button class="seg" data-act="lssrc" data-arg="clip" aria-pressed="${L.src === 'clip'}">${ic('play')}${tr('Clip YouTube', 'YouTube clips')}</button>
  </div>`;

const resultHtml = (r, zh, py, vi, nextAct, retryAct, nextDisabled) => `<div class="ls-result">
  <div class="ls-score ${scoreCls(r.score)}"><b>${r.score}%</b><span>${r.correct}/${r.total} ${tr('chữ đúng', 'correct')}${r.xp ? ` · +${r.xp} XP` : ''}</span></div>
  <div class="ls-diff zh" lang="zh-CN">${opsHtml(r.ops)}</div>
  <div class="ls-answer"><div class="zh" lang="zh-CN">${esc(zh)}</div>${py ? `<div class="dpy">${esc(py)}</div>` : ''}${vi ? `<div class="dvi">${esc(vi)}</div>` : ''}</div>
  <div class="btnrow" style="margin:12px 0 0"><button class="btn" data-act="${nextAct}" ${nextDisabled ? 'disabled' : ''}>${tr('Tiếp', 'Next')}${ic('chev')}</button><button class="btn btn-ghost btn-sm" data-act="${retryAct}">${tr('Gõ lại', 'Try again')}</button><button class="btn btn-ghost btn-sm" data-act="dictgo" data-arg="${esc(zh.replace(/[，。！？；：、,.!?\s]/g, '').slice(0, 30))}">${ic('search')}${tr('Tra từ điển', 'Look up')}</button></div>
</div>`;

function sentencesHtml() {
  const lvls = (L.ver || S.ver) === '30' ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6];
  const it = L.items[L.idx], r = L.result;
  return `
  <div class="ls-controls">
    <div class="seggroup"><button class="seg" data-act="lsver" data-arg="20" aria-pressed="${(L.ver || S.ver) === '20'}">HSK 2.0</button><button class="seg" data-act="lsver" data-arg="30" aria-pressed="${(L.ver || S.ver) === '30'}">HSK 3.0</button></div>
    <div class="seggroup">${lvls.map(n => `<button class="seg" data-act="lslvl" data-arg="${n}" aria-pressed="${L.lvl === n}">${n === 7 ? '7–9' : n}</button>`).join('')}</div>
    <div class="seggroup"><button class="seg" data-act="lslen" data-arg="short" aria-pressed="${L.len === 'short'}">${tr('Câu ngắn', 'Short')}</button><button class="seg" data-act="lslen" data-arg="long" aria-pressed="${L.len === 'long'}">${tr('Câu dài', 'Long')}</button><button class="seg" data-act="lslen" data-arg="any" aria-pressed="${L.len === 'any'}">${tr('Tất cả', 'Any')}</button></div>
  </div>
  ${L.busy && !it ? `<p class="lead loading">${tr('Đang tải…', 'Loading…')}</p>` : !it ? `<p class="empty-note">${tr('Chưa có câu luyện cho cấp này.', 'No sentences for this level yet.')}</p>` : `
  <div class="ls-card card">
    <div class="ls-top"><span class="muted">${tr('Câu', 'Item')} ${L.idx + 1}/${L.items.length}</span><span class="muted">${tr('Đã nghe', 'Played')}: <b id="lsPlays">${L.plays}</b></span></div>
    <audio id="lsAudio" preload="none"></audio>
    <div class="ls-playrow">
      <button class="btn" data-act="lsplay">${ic('play')}${tr('Nghe', 'Play')}</button>
      <button class="btn btn-ghost btn-sm ${L.slow ? 'on' : ''}" data-act="lsslow" aria-pressed="${L.slow}">${tr('Chậm', 'Slow')}</button>
      ${!r ? `<button class="btn btn-ghost btn-sm" data-act="lsreveal">${ic('eye')}${L.revealed ? tr('Ẩn gợi ý', 'Hide hint') : tr('Gợi ý', 'Hint')}</button>` : ''}
    </div>
    ${L.revealed && !r ? `<p class="ls-hint">Pinyin: <span class="dpy">${esc(it.py || '')}</span>${it.vi ? ` · ${esc(it.vi)}` : ''}</p>` : ''}
    ${r ? resultHtml(r, it.zh, it.py, it.vi, 'lsnext', 'lsretry', false) : `
    <label for="lsAnswer" class="ls-label">${tr('Bạn nghe được gì? Gõ lại bằng chữ Hán.', 'What did you hear?')}</label>
    <textarea id="lsAnswer" class="inp zh" lang="zh-CN" rows="2" autocomplete="off" spellcheck="false"></textarea>
    <div class="btnrow" style="margin:10px 0 0"><button class="btn" data-act="lscheck" ${L.busy ? 'disabled' : ''}>${ic('check')}${tr('Kiểm tra', 'Check')}</button><button class="btn btn-ghost btn-sm" data-act="lsnext">${tr('Bỏ qua', 'Skip')}</button></div>`}
  </div>`}`;
}

function libraryHtml() {
  const cardHtml = c => `
    <button class="clipcard" data-act="lsopen" data-arg="${c.id}">
      <span class="clipthumb"><img src="${esc(c.thumb)}" alt="" loading="lazy"><span class="clipdur">${fmtDur(c.duration)}</span>${c.lvl ? `<span class="cliplvl">HSK ${c.lvl === 7 ? '7–9' : c.lvl}</span>` : ''}</span>
      <span class="cliptitle">${esc(c.title)}</span>
      <span class="clipmeta">${c.nseg} ${tr('đoạn', 'segments')}${c.tags.length ? ' · ' + c.tags.slice(0, 3).map(t => '#' + esc(t)).join(' ') : ''}</span>
    </button>`;
  const groups = {}; L.clips.forEach(c => { (groups[c.topic] = groups[c.topic] || []).push(c); });
  return `
  <div class="ls-controls">
    <div class="seggroup ls-topics">
      <button class="seg" data-act="lstopic" data-arg="" aria-pressed="${!L.topic}">${tr('Tất cả', 'All')}</button>
      ${L.topics.map(t => `<button class="seg" data-act="lstopic" data-arg="${esc(t.topic)}" aria-pressed="${L.topic === t.topic}">${esc(topicName(t.topic))} <small>${t.n}</small></button>`).join('')}
    </div>
    <div class="seggroup"><button class="seg" data-act="lscliplvl" data-arg="0" aria-pressed="${!L.clipLvl}">${tr('Mọi cấp', 'Any level')}</button>${[1, 2, 3, 4, 5, 6].map(n => `<button class="seg" data-act="lscliplvl" data-arg="${n}" aria-pressed="${L.clipLvl === n}">HSK ${n}</button>`).join('')}</div>
  </div>
  ${L.busy ? `<p class="lead loading">${tr('Đang tải…', 'Loading…')}</p>`
    : !L.clips.length ? `<div class="empty-note"><p>${tr('Chưa có clip nào cho lựa chọn này.', 'No clips for this selection yet.')}</p>${S.user && S.user.isAdmin ? `<button class="btn btn-sm" data-act="nav" data-arg="admin">${tr('Thêm clip trong trang Quản trị', 'Add clips in Admin')}</button>` : `<p class="hint">${tr('Quản trị viên sẽ bổ sung dần các clip công khai từ YouTube.', 'Admins are adding public YouTube clips over time.')}</p>`}</div>`
    : Object.entries(groups).map(([topic, list]) => `<section class="clipgroup"><h2 class="sec">${esc(topicName(topic))} <small class="muted">(${list.length})</small></h2><div class="clipgrid">${list.map(cardHtml).join('')}</div></section>`).join('')}`;
}

function clipHtml() {
  const c = L.clip, segs = c.segments, cur = segs[L.seg], r = L.segResults[L.seg], pct = clipProgress();
  return `
  <div class="ls-clipnav"><button class="btn btn-ghost btn-sm" data-act="lslib">${ic('back')}${tr('Thư viện', 'Library')}</button><span class="muted">${esc(topicName(c.topic))} › ${esc(c.title)}</span></div>
  <div class="ls-cliplayout">
    <div class="ls-clipleft">
      <div class="ls-yt"><div id="ytBox">${L.ytFail ? ytFallbackHtml() : ''}</div></div>
      <div class="ls-playrow">
        <button class="btn" data-act="lssegplay">${ic('play')}${tr('Nghe đoạn', 'Play segment')} ${L.seg + 1}</button>
        <button class="btn btn-ghost btn-sm ${L.slow ? 'on' : ''}" data-act="lsslow" aria-pressed="${L.slow}">${tr('Chậm', 'Slow')}</button>
        <div class="seggroup"><button class="seg" data-act="lslevel" data-arg="easy" aria-pressed="${L.level === 'easy'}">${tr('Dễ', 'Easy')}</button><button class="seg" data-act="lslevel" data-arg="normal" aria-pressed="${L.level === 'normal'}">${tr('Thường', 'Normal')}</button><button class="seg" data-act="lslevel" data-arg="hard" aria-pressed="${L.level === 'hard'}">${tr('Khó', 'Hard')}</button></div>
      </div>
      <div class="ls-card card">
        <div class="ls-top"><span class="muted">${tr('Đoạn', 'Segment')} ${L.seg + 1}/${segs.length} · ${fmtDur(cur.start)}–${fmtDur(cur.end)}</span></div>
        ${L.level !== 'hard' && !r ? `<div class="ls-mask zh" lang="zh-CN">${maskHtml(cur.zh)}</div>` : ''}
        ${L.level === 'easy' && !r && cur.py ? `<div class="ls-seghint dpy">${esc(cur.py)}</div>` : ''}
        ${r ? resultHtml(r, cur.zh, cur.py, cur.vi, 'lssegnext', 'lssegretry', L.seg >= segs.length - 1) : `
        <textarea id="lsSegAnswer" class="inp zh" lang="zh-CN" rows="2" autocomplete="off" spellcheck="false" placeholder="${tr('Gõ những gì bạn nghe được…', 'Type what you heard…')}"></textarea>
        <div class="btnrow" style="margin:10px 0 0"><button class="btn" data-act="lssegcheck" ${L.busy ? 'disabled' : ''}>${ic('check')}${tr('Kiểm tra', 'Check')}</button><button class="btn btn-ghost btn-sm" data-act="lssegreveal">${ic('eye')}${tr('Xem đáp án', 'Show answer')}</button><button class="btn btn-ghost btn-sm" data-act="lssegnext" ${L.seg >= segs.length - 1 ? 'disabled' : ''}>${tr('Bỏ qua', 'Skip')}</button></div>`}
      </div>
    </div>
    <aside class="ls-transcript">
      <div class="ls-tshead"><b>${tr('Bản chép', 'Transcript')}</b><span class="ls-pct ${scoreCls(pct)}">${pct}%</span></div>
      <div class="pbar"><span style="width:${pct}%"></span></div>
      <div class="ls-seglist">${segs.map((sg, i) => { const rr = L.segResults[i]; return `
        <button class="ls-segitem ${i === L.seg ? 'cur' : ''} ${rr ? scoreCls(rr.score) : ''}" data-act="lsseg" data-arg="${i}">
          <span class="ls-segno">#${i + 1}</span><span class="ls-segtime">${fmtDur(sg.start)}</span>
          <span class="ls-segbody zh" lang="zh-CN">${rr ? esc(sg.zh) : maskHtml(sg.zh)}</span>${rr ? `<span class="ls-segscore">${rr.score}%</span>` : ''}
        </button>`; }).join('')}</div>
    </aside>
  </div>`;
}

export function renderListen() {
  if (!S.user) { view.innerHTML = `<div class="lhead"><h1>${tr('Luyện nghe', 'Listening')}</h1></div><p class="lead">${tr('Bạn cần đăng nhập để luyện tập.', 'Sign in to practise.')}</p>`; showAuthModal('listen'); return; }
  if (!S.api.on) { view.innerHTML = `<div class="lhead"><h1>${tr('Luyện nghe', 'Listening')}</h1></div><p class="empty-note">${tr('Phần luyện nghe cần máy chủ Zuimó.', 'Listening practice needs the Zuimó server.')}</p>`; return; }
  const st = L.stats && L.stats.stats;
  view.innerHTML = headHtml() + (L.src === 'sent' ? sentencesHtml() : L.clip ? clipHtml() : libraryHtml())
    + (st && st.attempts ? `<p class="hint">${tr(`Đã luyện ${st.attempts} lượt, điểm trung bình ${st.avg_score}%, tuần này ${st.week} lượt.`, `${st.attempts} attempts, average ${st.avg_score}%, ${st.week} this week.`)}</p>` : '');
  if (!L.stats) loadStats();
  if (L.src === 'sent') loadSentences(); else if (!L.clip) loadLibrary(); else mountYT();
  const inp = $('#lsAnswer') || $('#lsSegAnswer'); if (inp) inp.focus();
}

document.addEventListener('keydown', e => {
  if (!e.target || e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
  if (e.target.id === 'lsAnswer') { e.preventDefault(); checkSentence(); }
  if (e.target.id === 'lsSegAnswer') { e.preventDefault(); checkSegment(); }
});

export const LISTEN_ACT = {
  lssrc(a) { L.src = a; L.clip = null; L.result = null; L.loadedKey = null; stopYT(); render(); },   /* đổi tab thì tải mới: admin có thể vừa thêm clip */
  lsver(a) { L.ver = a; L.lvl = Math.min(L.lvl, a === '20' ? 6 : 7); render(); },
  lslvl(a) { L.lvl = +a; render(); },
  lslen(a) { L.len = a; render(); },
  lsplay() { playSentence(); },
  lsslow() { L.slow = !L.slow; render({ keepScroll: true }); },
  lsreveal() { L.revealed = !L.revealed; render({ keepScroll: true }); },
  lscheck() { checkSentence(); },
  lsnext() { L.result = null; L.revealed = false; L.plays = 0; if (L.idx < L.items.length - 1) { L.idx++; render(); } else loadSentences(true); },
  lsretry() { L.result = null; L.plays = 0; render({ keepScroll: true }); },
  lstopic(a) { L.topic = a || null; render(); },
  lscliplvl(a) { L.clipLvl = +a; render(); },
  lsopen(a) { const c = L.clips.find(x => x.id === +a); if (!c) return; L.clip = c; L.seg = 0; L.segResults = {}; L.ytFail = false; L.plays = 0; stopYT(); render(); },
  lslib() { L.clip = null; stopYT(); render(); },
  lslevel(a) { L.level = a; render({ keepScroll: true }); },
  lsseg(a) { L.seg = +a; L.plays = 0; render({ keepScroll: true }); const sg = L.clip.segments[L.seg]; if (sg && ytPlayer && ytPlayer.seekTo) playSegment(sg); },
  lssegplay() { playSegment(L.clip.segments[L.seg]); },
  lssegcheck() { checkSegment(); },
  lssegnext() { if (L.seg < L.clip.segments.length - 1) { L.seg++; L.plays = 0; render({ keepScroll: true }); } },
  lssegretry() { delete L.segResults[L.seg]; render({ keepScroll: true }); },
  async lssegreveal() {
    /* xem đáp án trước = nộp bài trống, ghi 0 điểm cho đoạn đó để điểm cả clip phản ánh đúng */
    const seg = L.clip.segments[L.seg];
    try { L.segResults[L.seg] = { ...(await submit(`clip:${L.clip.id}:${L.seg}`, seg.zh, '', { revealed: true, src: 'clip' })), answer: '' }; } catch (e) { toast(e.message); }
    render({ keepScroll: true });
  }
};
