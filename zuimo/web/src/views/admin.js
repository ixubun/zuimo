/* ======================================================================
   Quản trị (chỉ tài khoản is_admin): thư viện clip YouTube cho Luyện nghe và Luyện phát âm.
   Transcript nhận 4 định dạng, tự nhận diện:
     1. SRT      "1\n00:00:01,000 --> 00:00:03,500\n你好！"
     2. WebVTT   "00:01.000 --> 00:03.500\n你好！"
     3. Dạng ống "0 | 3.5 | 你好！ | nǐ hǎo | Xin chào!"
     4. Dòng thời gian "0:01 你好！" (kết thúc = bắt đầu dòng sau, dòng cuối +4 giây)
   Dòng tiếp theo bắt đầu bằng "py:" hoặc "vi:" bổ sung pinyin / nghĩa cho đoạn trước (với SRT/VTT/thời gian).
   Cấp quyền admin: docker compose exec api node tools/admin.mjs grant <username>.
   ====================================================================== */
import { $, esc, view } from '../core/dom.js';
import { S } from '../core/state.js';
import { tr } from '../core/util.js';
import { ic } from '../core/icons.js';
import { API } from '../core/sync.js';
import { toast } from '../features/speech.js';
import { render } from '../app/router.js';
import { TOPIC_KEYS, topicName } from './listen.js';

S.admin = S.admin || { clips: [], loaded: false, busy: false, edit: null, preview: null, msg: '', sets: [], setsLoaded: false, setForm: null,
  imgLvl: 1, imgWords: null, imgConfigured: false, imgWord: null, imgQuery: '', imgPhotos: [], imgBusy: false, imgFilter: 'missing', realSet: null, impFiles: null, impUp: null, impJob: null, impLog: '' };
const A = S.admin;
const CJK = /[\u3400-\u9fff]/;

/* ---------------------------------------------------------------- phân tích transcript */
const ts = s => { // "hh:mm:ss,mmm" | "mm:ss.mmm" | "m:ss" | "12.5"
  const m = /^(?:(\d+):)?(?:(\d+):)?(\d+)(?:[.,](\d{1,3}))?$/.exec(s.trim());
  if (!m) return NaN;
  const [, a, b, c, ms] = m;
  const parts = [a, b, c].filter(x => x !== undefined).map(Number);
  let sec = 0; parts.forEach(p => { sec = sec * 60 + p; });
  return sec + (ms ? Number('0.' + ms.padEnd(3, '0')) : 0);
};
export function parseTranscript(text) {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim());
  const segs = [];
  const addExtra = l => { const last = segs[segs.length - 1]; if (!last) return false;
    const m = /^(py|vi)\s*:\s*(.+)$/i.exec(l); if (!m) return false; last[m[1].toLowerCase()] = m[2]; return true; };
  // 1–2: SRT / VTT
  if (/-->/.test(text)) {
    let cur = null;
    for (const l of lines) {
      const m = /^(\S+)\s*-->\s*(\S+)/.exec(l);
      if (m) { cur = { start: ts(m[1]), end: ts(m[2]), zh: '', py: '', vi: '' }; segs.push(cur); continue; }
      if (!l || /^\d+$/.test(l) || /^WEBVTT/i.test(l) || !cur) continue;
      if (addExtra(l)) continue;
      cur.zh = cur.zh ? cur.zh + l : l;
    }
    return segs.filter(s => CJK.test(s.zh));
  }
  // 3: dạng ống
  if (lines.some(l => l.split('|').length >= 3)) {
    for (const l of lines) {
      if (!l) continue;
      const p = l.split('|').map(x => x.trim());
      if (p.length < 3) { addExtra(l); continue; }
      segs.push({ start: ts(p[0]), end: ts(p[1]), zh: p[2], py: p[3] || '', vi: p[4] || '' });
    }
    return segs;
  }
  // 4: "m:ss câu" từng dòng
  for (const l of lines) {
    if (!l) continue;
    const m = /^(\d+:\d{1,2}(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s+(.+)$/.exec(l);
    if (m && CJK.test(m[2])) { segs.push({ start: ts(m[1]), end: NaN, zh: m[2], py: '', vi: '' }); continue; }
    addExtra(l);
  }
  segs.forEach((s, i) => { if (!(s.end > s.start)) s.end = segs[i + 1] ? segs[i + 1].start : s.start + 4; });
  return segs;
}

/* ---------------------------------------------------------------- dữ liệu */
async function load() {
  A.busy = true; render();
  try { const { data } = await API.call('/practice/clips?all=1'); A.clips = data.clips; A.loaded = true; } catch (e) { toast(e.message); }
  A.busy = false; render();
}
const blank = () => ({ id: null, youtubeId: '', title: '', topic: 'daily', lvl: '', kind: 'both', tags: '', description: '', transcript: '', enabled: true });
function formFromClip(c) {
  return { id: c.id, youtubeId: c.youtube_id, title: c.title, topic: c.topic, lvl: c.lvl || '', kind: c.kind, tags: c.tags.join(', '), description: c.description || '', enabled: c.enabled,
    transcript: c.segments.map(s => `${s.start} | ${s.end} | ${s.zh} | ${s.py || ''} | ${s.vi || ''}`).join('\n') };
}
function readForm() {
  const f = A.edit;
  ['youtubeId', 'title', 'topic', 'lvl', 'kind', 'tags', 'description', 'transcript'].forEach(k => { const el = $('#ad_' + k); if (el) f[k] = el.value; });
  const en = $('#ad_enabled'); if (en) f.enabled = en.checked;
  return f;
}
async function save() {
  const f = readForm();
  const segments = parseTranscript(f.transcript);
  if (!segments.length) { toast(tr('Transcript chưa có đoạn nào hợp lệ.', 'No valid segments in the transcript.')); return; }
  A.busy = true; render();
  try {
    await API.call('/practice/clips', { method: 'POST', body: { youtubeId: f.youtubeId, title: f.title, topic: f.topic, lvl: +f.lvl || null, kind: f.kind,
      tags: f.tags.split(',').map(t => t.trim()).filter(Boolean), description: f.description, segments, enabled: f.enabled } });
    toast(tr('Đã lưu clip.', 'Clip saved.')); A.edit = null; A.preview = null; if (S.listen) S.listen.loadedKey = null; await load();
  } catch (e) { toast(e.message + (e.data && e.data.fields ? ' ' + JSON.stringify(e.data.fields) : '')); A.busy = false; render(); }
}

/* ---------------------------------------------------------------- hiển thị */
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function formHtml() {
  const f = A.edit, p = A.preview;
  return `
  <section class="card pad ad-form">
    <h2 class="sec" style="margin-top:0">${f.id ? tr('Sửa clip', 'Edit clip') : tr('Thêm clip', 'Add clip')}</h2>
    <div class="ad-grid">
      <div class="fld"><label for="ad_youtubeId">${tr('Link hoặc mã YouTube', 'YouTube link or ID')}</label><input class="inp" id="ad_youtubeId" value="${esc(f.youtubeId)}" placeholder="https://www.youtube.com/watch?v=…"></div>
      <div class="fld"><label for="ad_title">${tr('Tiêu đề', 'Title')}</label><input class="inp" id="ad_title" value="${esc(f.title)}"></div>
      <div class="fld"><label for="ad_topic">${tr('Chủ đề', 'Topic')}</label><select class="inp" id="ad_topic">${TOPIC_KEYS.map(k => `<option value="${k}" ${f.topic === k ? 'selected' : ''}>${esc(topicName(k))}</option>`).join('')}</select></div>
      <div class="fld"><label for="ad_lvl">${tr('Cấp HSK (để trống = mọi cấp)', 'HSK level')}</label><select class="inp" id="ad_lvl"><option value="">${tr('Mọi cấp', 'Any')}</option>${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${String(f.lvl) === String(n) ? 'selected' : ''}>HSK ${n === 7 ? '7–9' : n}</option>`).join('')}</select></div>
      <div class="fld"><label for="ad_kind">${tr('Dùng cho', 'Use for')}</label><select class="inp" id="ad_kind"><option value="both" ${f.kind === 'both' ? 'selected' : ''}>${tr('Nghe và phát âm', 'Listening and shadowing')}</option><option value="listening" ${f.kind === 'listening' ? 'selected' : ''}>${tr('Chỉ luyện nghe', 'Listening only')}</option><option value="shadowing" ${f.kind === 'shadowing' ? 'selected' : ''}>${tr('Chỉ luyện phát âm', 'Shadowing only')}</option></select></div>
      <div class="fld"><label for="ad_tags">${tr('Thẻ (phân cách bằng dấu phẩy)', 'Tags, comma separated')}</label><input class="inp" id="ad_tags" value="${esc(f.tags)}" placeholder="kids, daihua, hsk1"></div>
    </div>
    <div class="fld"><label for="ad_description">${tr('Mô tả ngắn', 'Short description')}</label><input class="inp" id="ad_description" value="${esc(f.description)}"></div>
    <div class="fld"><label for="ad_transcript">${tr('Transcript', 'Transcript')} <small class="muted">${tr('(SRT, WebVTT, dạng "giây bắt đầu | kết thúc | chữ Hán | pinyin | nghĩa", hoặc "m:ss câu")', '(SRT, WebVTT, pipe or "m:ss line")')}</small></label>
      <textarea class="inp" id="ad_transcript" rows="10" spellcheck="false">${esc(f.transcript)}</textarea></div>
    <label class="ad-check"><input type="checkbox" id="ad_enabled" ${f.enabled ? 'checked' : ''}> ${tr('Hiện cho người học', 'Visible to learners')}</label>
    <div class="btnrow">
      <button class="btn btn-ghost btn-sm" data-act="adpreview">${ic('eye')}${tr('Xem trước đoạn', 'Preview segments')}</button>
      <button class="btn btn-sm" data-act="adsave" ${A.busy ? 'disabled' : ''}>${ic('check')}${tr('Lưu', 'Save')}</button>
      <button class="btn btn-ghost btn-sm" data-act="adcancel">${tr('Huỷ', 'Cancel')}</button>
    </div>
    ${p ? `<div class="ad-preview"><b>${p.length} ${tr('đoạn', 'segments')}</b>${p.length ? `<ol>${p.slice(0, 60).map(s => `<li><span class="muted">${fmt(s.start)}–${fmt(s.end)}</span> <span class="zh" lang="zh-CN">${esc(s.zh)}</span>${s.py ? ` <span class="dpy">${esc(s.py)}</span>` : ''}${s.vi ? ` <span class="muted">${esc(s.vi)}</span>` : ''}</li>`).join('')}</ol>` : `<p class="empty-note">${tr('Không nhận ra đoạn nào. Kiểm tra lại định dạng.', 'No segments recognised.')}</p>`}</div>` : ''}
  </section>`;
}
function listHtml() {
  if (A.busy && !A.loaded) return `<p class="lead loading">${tr('Đang tải…', 'Loading…')}</p>`;
  if (!A.clips.length) return `<p class="empty-note">${tr('Chưa có clip nào. Bấm "Thêm clip" để bắt đầu.', 'No clips yet.')}</p>`;
  return `<div class="ad-list">${A.clips.map(c => `
    <div class="ad-row ${c.enabled ? '' : 'off'}">
      <img class="ad-thumb" src="${esc(c.thumb)}" alt="" loading="lazy">
      <div class="ad-body"><b>${esc(c.title)}</b><span class="muted">${esc(topicName(c.topic))}${c.lvl ? ` · HSK ${c.lvl}` : ''} · ${c.nseg} ${tr('đoạn', 'segments')} · ${fmt(c.duration || 0)} · ${c.kind}${c.enabled ? '' : ' · ' + tr('đang ẩn', 'hidden')}</span></div>
      <div class="btnrow" style="margin:0">
        <button class="btn btn-ghost btn-sm" data-act="adedit" data-arg="${c.id}">${ic('pen')}${tr('Sửa', 'Edit')}</button>
        <button class="btn btn-ghost btn-sm" data-act="adtoggle" data-arg="${c.id}">${c.enabled ? tr('Ẩn', 'Hide') : tr('Hiện', 'Show')}</button>
        <button class="btn btn-ghost btn-sm danger" data-act="addel" data-arg="${c.id}">${tr('Xoá', 'Delete')}</button>
      </div>
    </div>`).join('')}</div>`;
}

/* ---------------------------------------------------------------- bộ đề thi riêng */
const SET_EXAMPLE = `{
  "ver": "20", "lvl": 1, "title": "Đề mẫu HSK 1 – bộ 1",
  "paper": {
    "plays": 2, "total": 200, "pass": 120,
    "sections": [
      { "key": "listening", "title": ["听力", "Nghe"], "minutes": 15, "parts": [
        { "title": ["第一部分", "Phần 1"], "instr": ["听录音，判断对错。", "Nghe và xét đúng sai."], "items": [
          { "kind": "tf_pic", "text": "苹果", "audio": null, "pic": "🍎", "answer": "✓", "explain": "苹果 = táo" },
          { "kind": "dlg_ans", "zh": "你好吗？", "audio": null, "options": ["我很好。", "我是学生。", "他在家。"], "answer": "A" } ] } ] },
      { "key": "reading", "title": ["阅读", "Đọc"], "minutes": 17, "parts": [
        { "title": ["第一部分", "Phần 1"], "instr": ["选词填空。", "Chọn từ điền vào chỗ trống."], "items": [
          { "kind": "fill", "text": "我＿＿学生。", "pool": ["是", "有", "在"], "answer": "A" },
          { "kind": "order", "chunks": ["很好", "我", "今天"], "answer": "我今天很好" },
          { "kind": "char", "text": "＿好！", "hint": "nǐ", "answer": "你" } ] } ] }
    ]
  }
}`;
async function loadSets() { try { const { data } = await API.call('/exam/sets?all=1'); A.sets = data.sets; A.setsLoaded = true; } catch (e) { toast(e.message); } render(); }
function setsHtml() {
  return `<h2 class="sec">${tr('Bộ đề thi riêng', 'Custom exam sets')} (${A.sets.length})</h2>
  <p class="hint">${tr('Nhập bộ đề dạng JSON theo cùng cấu trúc đề tự sinh: sections → parts → items, mỗi item có kind và answer. audio để null thì trình duyệt đọc bằng TTS; muốn dùng file thì đặt MP3 vào deploy/media/audio/custom/ và ghi đường dẫn /media/audio/custom/<tên>.mp3.', 'Paste an exam set as JSON.')}</p>
  ${A.setForm == null ? `<div class="btnrow"><button class="btn btn-ghost btn-sm" data-act="adsetnew">${ic('pen')}${tr('Nhập bộ đề', 'Add a set')}</button></div>` : `
    <div class="fld"><textarea class="inp" id="ad_setjson" rows="14" spellcheck="false">${esc(A.setForm)}</textarea></div>
    <div class="btnrow"><button class="btn btn-sm" data-act="adsetsave">${ic('check')}${tr('Lưu bộ đề', 'Save set')}</button><button class="btn btn-ghost btn-sm" data-act="adsetcancel">${tr('Huỷ', 'Cancel')}</button></div>`}
  ${A.sets.length ? `<div class="ad-list">${A.sets.map(st => `<div class="ad-row ${st.enabled ? '' : 'off'}"><div class="ad-body"><b>${esc(st.title)}</b><span class="muted">HSK ${st.ver === '30' ? '3.0' : '2.0'} · ${tr('cấp', 'level')} ${st.lvl} · ${st.nsec} ${tr('phần', 'sections')}</span></div><div class="btnrow" style="margin:0"><button class="btn btn-ghost btn-sm danger" data-act="adsetdel" data-arg="${st.id}">${tr('Xoá', 'Delete')}</button></div></div>`).join('')}</div>` : ''}`;
}

/* ---------------------------------------------------------------- thư viện ảnh từ vựng (Pexels) */
async function loadImgWords() {
  A.imgWords = []; A.imgBusy = true; render({ keepScroll: true });
  try { const { data } = await API.call('/admin/images/words?lvl=' + A.imgLvl); A.imgWords = data.words; A.imgConfigured = data.configured; }
  catch (e) { toast(e.message); }
  A.imgBusy = false; render({ keepScroll: true });
}
async function searchPhotos(q) {
  A.imgQuery = q; A.imgPhotos = []; A.imgBusy = true; render({ keepScroll: true });
  try { const { data } = await API.call('/admin/images/search?q=' + encodeURIComponent(q)); A.imgPhotos = data.photos; }
  catch (e) { toast(e.message); }
  A.imgBusy = false; render({ keepScroll: true });
}
function imagesHtml() {
  const words = A.imgWords || [];
  const shown = words.filter(w => A.imgFilter === 'all' || (A.imgFilter === 'missing' ? !w.path : !!w.path));
  const cur = A.imgWord && words.find(w => w.word === A.imgWord);
  return `<h2 class="sec">${tr('Thư viện ảnh từ vựng', 'Word image library')}</h2>
  <p class="hint">${tr('Ảnh thật cho đề thi và thẻ nhớ, nguồn Pexels (giấy phép mở). Chọn từ, tìm theo từ khoá tiếng Anh, bấm ảnh để tải về máy chủ. Chưa có ảnh thì đề dùng emoji.', 'Real photos for exams and flashcards from Pexels.')}</p>
  ${!A.imgConfigured && A.imgWords ? `<p class="empty-note">${tr('Chưa cấu hình PEXELS_API_KEY trong .env. Đăng ký key miễn phí tại pexels.com/api rồi docker compose up -d.', 'PEXELS_API_KEY not configured.')}</p>` : ''}
  <div class="ls-controls">
    <div class="seggroup">${[1, 2, 3].map(n => `<button class="seg" data-act="adimglvl" data-arg="${n}" aria-pressed="${A.imgLvl === n}">HSK ${n}</button>`).join('')}</div>
    <div class="seggroup"><button class="seg" data-act="adimgfilter" data-arg="missing" aria-pressed="${A.imgFilter === 'missing'}">${tr('Chưa có ảnh', 'Missing')} (${words.filter(w => !w.path).length})</button><button class="seg" data-act="adimgfilter" data-arg="done" aria-pressed="${A.imgFilter === 'done'}">${tr('Đã có', 'Done')} (${words.filter(w => w.path).length})</button><button class="seg" data-act="adimgfilter" data-arg="all" aria-pressed="${A.imgFilter === 'all'}">${tr('Tất cả', 'All')}</button></div>
  </div>
  <div class="ad-imgs">
    <div class="ad-wordlist">${A.imgWords === null ? `<p class="loading">${tr('Đang tải…', 'Loading…')}</p>` : shown.map(w => `<button class="ad-word ${A.imgWord === w.word ? 'on' : ''} ${w.path ? 'has' : ''}" data-act="adimgpick" data-arg="${esc(w.word)}">${w.path ? `<img src="${esc(w.path)}" alt="">` : `<span class="ad-noimg">–</span>`}<span class="zh" lang="zh-CN">${esc(w.word)}</span><small>${esc(w.vi || '')}</small></button>`).join('') || `<p class="empty-note">${tr('Không có từ nào.', 'No words.')}</p>`}</div>
    <div class="ad-photos">
      ${cur ? `<div class="ad-photohead"><b class="zh" lang="zh-CN">${esc(cur.word)}</b> <span class="dpy">${esc(cur.py)}</span> · ${esc(cur.vi || '')}${cur.path ? ` · <button class="linkbtn danger" data-act="adimgdel" data-arg="${esc(cur.word)}">${tr('xoá ảnh', 'remove')}</button>` : ''}</div>
        <div class="dict-inputrow"><input class="inp" id="ad_imgq" value="${esc(A.imgQuery || cur.query)}" placeholder="${tr('từ khoá tiếng Anh', 'English keyword')}"><button class="btn btn-sm" data-act="adimgsearch">${ic('search')}${tr('Tìm', 'Search')}</button></div>
        ${A.imgBusy ? `<p class="loading">${tr('Đang tìm…', 'Searching…')}</p>` : `<div class="ad-photogrid">${A.imgPhotos.map(ph => `<button class="ad-photo" data-act="adimgsave" data-arg="${ph.id}" title="${esc(ph.photographer)} · ${esc(ph.alt || '')}"><img src="${esc(ph.thumb)}" alt="${esc(ph.alt || '')}"><small>${esc(ph.photographer)}</small></button>`).join('')}</div>`}`
      : `<p class="hint">${tr('Chọn một từ ở danh sách bên trái.', 'Pick a word on the left.')}</p>`}
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- đề thật: kiểm tra mốc băng */
function realHtml() {
  const real = A.sets.filter(x => x.kind === 'real');
  const rs = A.realSet;
  return `<h2 class="sec">${tr('Đề thật đã nhập', 'Imported past papers')} (${real.length})</h2>
  <p class="hint">${tr('Nhập bằng lệnh trên máy chủ: docker compose exec api node tools/import-exam.mjs /app/media/import/<đề>.pdf /app/media/import/<băng>.mp3 --level 2. Sau đó nghe kiểm tra từng câu ở đây; lệch thì sửa mốc rồi bấm Cắt lại.', 'Import via CLI, then verify timestamps here.')}</p>
  <div class="btnrow">${real.map(st => `<button class="btn btn-ghost btn-sm ${rs && rs.id === st.id ? 'on' : ''}" data-act="adreal" data-arg="${st.id}">${esc(st.title)}</button>`).join('')}</div>
  ${rs ? `<div class="ad-list">${rs.paper.sections.find(s => s.key === 'listening').parts.flatMap(p => p.items).map(it => `
    <div class="ad-row ad-audio" id="adr_${it.id}"><div class="ad-body"><b>${it.num}. ${it.lines.map(l => (l.who ? l.who + '：' : '') + l.zh).join(' / ')}${it.question ? ' 问：' + esc(it.question.zh) : ''}</b>
      <span class="muted">${tr('đáp án', 'answer')} ${esc(String(it.answer))}</span></div>
      <audio controls preload="none" src="${esc(it.audio || '')}" style="height:32px;width:220px"></audio>
      <input class="inp ad-t" type="number" step="0.1" value="${it.t0 ?? ''}" data-t0="${it.id}" title="t0"><input class="inp ad-t" type="number" step="0.1" value="${it.t1 ?? ''}" data-t1="${it.id}" title="t1">
      <button class="btn btn-ghost btn-sm" data-act="adrecut" data-arg="${it.id}">${tr('Cắt lại', 'Recut')}</button></div>`).join('')}</div>` : ''}`;
}

/* ---------------------------------------------------------------- nhập đề thật: tải PDF + MP3 lên, nhập ở nền */
async function loadImpFiles() { try { const { data } = await API.call('/admin/exam/files'); A.impFiles = data.files; } catch (e) { toast(e.message); A.impFiles = []; } render({ keepScroll: true }); }
function uploadOne(file) {
  return new Promise((ok, fail) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/exam/upload?name=' + encodeURIComponent(file.name));
    xhr.upload.onprogress = e => { A.impUp = { name: file.name, pct: e.lengthComputable ? Math.round(e.loaded / e.total * 100) : 0 }; const el = $('#impProg'); if (el) el.textContent = `${file.name}: ${A.impUp.pct}%`; };
    xhr.onload = () => (xhr.status < 300 ? ok() : fail(new Error(`${file.name}: ${xhr.status}`)));
    xhr.onerror = () => fail(new Error(file.name + ': lỗi mạng'));
    xhr.send(file);
  });
}
let jobT = null;
async function pollJob(base) {
  clearInterval(jobT);
  jobT = setInterval(async () => {
    try { const { data } = await API.call('/admin/exam/job?base=' + encodeURIComponent(base)); A.impLog = data.log; const el = $('#impLog'); if (el) { el.textContent = data.log; el.scrollTop = el.scrollHeight; }
      if (!data.running) { clearInterval(jobT); A.impJob = null; toast(data.code === 0 ? tr('Đã nhập xong ', 'Imported ') + base : tr('Nhập lỗi, xem log.', 'Import failed, see log.')); A.setsLoaded = false; loadImpFiles(); } }
    catch (e) { clearInterval(jobT); }
  }, 2000);
}
function importHtml() {
  const files = A.impFiles || [];
  return `<h2 class="sec">${tr('Nhập đề thật', 'Import past papers')}</h2>
  <p class="hint">${tr('Chọn file PDF đề và MP3 băng nghe (cùng tên, ví dụ H20901.pdf + H20901.mp3). Hệ thống tự nhận cấp từ PDF, cắt ảnh, tách câu, căn băng rồi đưa vào ngân hàng. Mỗi lần nhập mất khoảng 2–5 phút.', 'Upload PDF + MP3 with the same base name.')}</p>
  <div class="btnrow"><label class="btn btn-sm">${ic('pen')}${tr('Chọn file…', 'Choose files…')}<input type="file" id="impInput" multiple accept=".pdf,.mp3" hidden></label>
    <span class="hint" id="impProg">${A.impUp ? `${A.impUp.name}: ${A.impUp.pct}%` : ''}</span></div>
  ${files.length ? `<div class="ad-list">${files.map(f => `<div class="ad-row"><div class="ad-body"><b>${esc(f.base)}</b><span class="muted">${f.pdf ? 'PDF ✓' : 'PDF ✗'} · ${f.mp3 ? 'MP3 ✓' : 'MP3 ✗'}${f.imported ? ' · ' + tr('đã nhập', 'imported') : ''}${f.running ? ' · ' + tr('đang nhập…', 'importing…') : f.lastCode != null && f.lastCode !== 0 ? ' · ' + tr('lỗi lần trước', 'last run failed') : ''}</span></div>
      <div class="btnrow" style="margin:0">
        ${f.pdf && f.mp3 ? `<button class="btn btn-sm" data-act="adimport" data-arg="${esc(f.base)}" ${f.running ? 'disabled' : ''}>${ic('play')}${f.imported ? tr('Nhập lại', 'Re-import') : tr('Nhập', 'Import')}</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-act="adjoblog" data-arg="${esc(f.base)}">${tr('Log', 'Log')}</button>
        <button class="btn btn-ghost btn-sm danger" data-act="adimpdel" data-arg="${esc(f.base)}">${tr('Xoá file', 'Delete')}</button></div></div>`).join('')}</div>` : A.impFiles ? `<p class="empty-note">${tr('Chưa có file nào.', 'No files yet.')}</p>` : ''}
  ${A.impLog || A.impJob ? `<pre class="ad-log" id="impLog">${esc(A.impLog)}</pre>` : ''}`;
}

export function renderAdmin() {
  if (!S.user || !S.user.isAdmin) {
    view.innerHTML = `<div class="lhead"><h1>${tr('Quản trị', 'Admin')}</h1></div><p class="empty-note">${tr('Trang này chỉ dành cho quản trị viên. Cấp quyền bằng lệnh trên máy chủ: docker compose exec api node tools/admin.mjs grant <tên đăng nhập>, rồi đăng nhập lại.', 'Admins only.')}</p>`;
    return;
  }
  view.innerHTML = `
  <div class="lhead"><button class="icon-btn" data-act="back" aria-label="${tr('Quay lại', 'Back')}">${ic('back')}</button><h1>${tr('Quản trị', 'Admin')}</h1></div>
  <p class="lead">${tr('Thư viện clip YouTube cho Luyện nghe và Luyện phát âm. Chỉ thêm video công khai; người học xem qua trình phát YouTube nhúng.', 'YouTube clip library for listening and shadowing.')}</p>
  ${A.edit ? formHtml() : `<div class="btnrow"><button class="btn" data-act="adnew">${ic('pen')}${tr('Thêm clip', 'Add clip')}</button></div>`}
  <h2 class="sec">${tr('Clip hiện có', 'Clips')} (${A.clips.length})</h2>
  ${listHtml()}
  ${importHtml()}
  ${setsHtml()}
  ${realHtml()}
  ${imagesHtml()}`;
  if (A.impFiles === null) loadImpFiles();
  if (!A.loaded && !A.busy) load();
  if (!A.setsLoaded) loadSets();
  if (A.imgWords === null && !A.imgBusy) loadImgWords();
}

export const ADMIN_ACT = {
  async adimport(a) {
    try { await API.call('/admin/exam/import', { method: 'POST', body: { base: a } }); A.impJob = a; A.impLog = ''; toast(tr('Đang nhập ', 'Importing ') + a); loadImpFiles(); pollJob(a); }
    catch (e) { toast(e.message); }
  },
  async adjoblog(a) { try { const { data } = await API.call('/admin/exam/job?base=' + encodeURIComponent(a)); A.impLog = data.log || tr('(chưa có log)', '(no log)'); render({ keepScroll: true }); } catch (e) { toast(e.message); } },
  async adimpdel(a) {
    if (!confirm(tr(`Xoá file ${a}.pdf và ${a}.mp3 trong thư mục nhập? (Đề đã nhập vào ngân hàng không bị ảnh hưởng)`, 'Delete upload files?'))) return;
    try { await API.call('/admin/exam/file?name=' + encodeURIComponent(a + '.pdf'), { method: 'DELETE' }); await API.call('/admin/exam/file?name=' + encodeURIComponent(a + '.mp3'), { method: 'DELETE' }); loadImpFiles(); } catch (e) { toast(e.message); }
  },
  async adreal(a) { try { const { data } = await API.call('/exam/set?id=' + a); A.realSet = data.set; render({ keepScroll: true }); } catch (e) { toast(e.message); } },
  async adrecut(a) {
    const t0 = +$(`[data-t0="${a}"]`).value, t1 = +$(`[data-t1="${a}"]`).value;
    try { const { data } = await API.call('/exam/recut', { method: 'POST', body: { setId: A.realSet.id, itemId: a, t0, t1 } });
      const it = A.realSet.paper.sections.find(s => s.key === 'listening').parts.flatMap(p => p.items).find(x => x.id === a); it.t0 = t0; it.t1 = t1; it.audio = data.item.audio;
      toast(tr('Đã cắt lại câu ', 'Recut item ') + it.num); render({ keepScroll: true }); } catch (e) { toast(e.message); }
  },
  adimglvl(a) { A.imgLvl = +a; A.imgWord = null; A.imgPhotos = []; loadImgWords(); },
  adimgfilter(a) { A.imgFilter = a; render({ keepScroll: true }); },
  adimgpick(a) { A.imgWord = a; A.imgPhotos = []; const w = (A.imgWords || []).find(x => x.word === a); A.imgQuery = w ? w.query : ''; render({ keepScroll: true }); if (A.imgQuery && A.imgConfigured) searchPhotos(A.imgQuery); },
  adimgsearch() { const q = $('#ad_imgq') && $('#ad_imgq').value.trim(); if (q) searchPhotos(q); },
  async adimgsave(a) {
    if (!A.imgWord) return;
    A.imgBusy = true; render({ keepScroll: true });
    try { await API.call('/admin/images', { method: 'POST', body: { word: A.imgWord, photoId: +a, query: A.imgQuery } }); toast(tr('Đã lưu ảnh cho ', 'Saved image for ') + A.imgWord);
      const { data } = await API.call('/admin/images/words?lvl=' + A.imgLvl); A.imgWords = data.words;
      // chuyển sang từ chưa có ảnh kế tiếp để duyệt liên tục
      const next = A.imgWords.find(w => !w.path); A.imgWord = next ? next.word : null; A.imgQuery = next ? next.query : ''; A.imgPhotos = [];
      A.imgBusy = false; render({ keepScroll: true }); if (next && next.query) searchPhotos(next.query);
    } catch (e) { toast(e.message); A.imgBusy = false; render({ keepScroll: true }); }
  },
  async adimgdel(a) { try { await API.call('/admin/images?word=' + encodeURIComponent(a), { method: 'DELETE' }); loadImgWords(); } catch (e) { toast(e.message); } },
  adsetnew() { A.setForm = SET_EXAMPLE; render({ keepScroll: true }); },
  adsetcancel() { A.setForm = null; render({ keepScroll: true }); },
  async adsetsave() {
    let obj; try { obj = JSON.parse($('#ad_setjson').value); } catch (e) { toast(tr('JSON không hợp lệ: ', 'Invalid JSON: ') + e.message); return; }
    try { await API.call('/exam/sets', { method: 'POST', body: obj }); toast(tr('Đã lưu bộ đề.', 'Set saved.')); A.setForm = null; A.setsLoaded = false; render(); }
    catch (e) { toast(e.message); }
  },
  async adsetdel(a) { if (!confirm(tr('Xoá bộ đề này?', 'Delete this set?'))) return; try { await API.call('/exam/sets?id=' + a, { method: 'DELETE' }); A.setsLoaded = false; render(); } catch (e) { toast(e.message); } },
  adnew() { A.edit = blank(); A.preview = null; render(); },
  adedit(a) { const c = A.clips.find(x => x.id === +a); if (c) { A.edit = formFromClip(c); A.preview = null; render(); } },
  adcancel() { A.edit = null; A.preview = null; render(); },
  adpreview() { readForm(); A.preview = parseTranscript(A.edit.transcript); render({ keepScroll: true }); },
  adsave() { save(); },
  async adtoggle(a) {
    const c = A.clips.find(x => x.id === +a); if (!c) return;
    try { await API.call('/practice/clips', { method: 'POST', body: { youtubeId: c.youtube_id, title: c.title, topic: c.topic, lvl: c.lvl, kind: c.kind, tags: c.tags, description: c.description, segments: c.segments, enabled: !c.enabled } }); await load(); }
    catch (e) { toast(e.message); }
  },
  async addel(a) {
    if (!confirm(tr('Xoá clip này? Kết quả luyện của người học với clip này vẫn được giữ.', 'Delete this clip?'))) return;
    try { await API.call('/practice/clips?id=' + a, { method: 'DELETE' }); if (S.listen) S.listen.loadedKey = null; await load(); } catch (e) { toast(e.message); }
  }
};


/* Tải file lên ngay khi chọn: tuần tự từng file, hiện phần trăm; xong thì làm mới danh sách cặp đề. */
document.addEventListener('change', async e => {
  if (!e.target || e.target.id !== 'impInput') return;
  const files = [...e.target.files]; if (!files.length) return;
  try { for (const f of files) await uploadOne(f); toast(tr('Đã tải lên ', 'Uploaded ') + files.length + ' file'); }
  catch (err) { toast(err.message); }
  A.impUp = null; loadImpFiles();
});
