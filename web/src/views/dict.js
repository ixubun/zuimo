/* ======================================================================
   Công cụ → Từ điển.
   Tra theo chữ Hán (giản/phồn), pinyin, tiếng Việt, tiếng Anh, hoặc vẽ chữ.
   Dán cả câu: tách từ và tra từng từ. Chi tiết mục từ gồm nghĩa và cách dùng,
   chữ và bộ thủ, bản đồ liên kết, từ ghép và ví dụ, từ dễ nhầm và liên quan.
   Toàn bộ dữ liệu lấy từ API /api/dict (CC-CEDICT + CVDICT + Make Me a Hanzi + câu ví dụ Zuimó).
   ====================================================================== */
import { $, esc, view } from '../core/dom.js';
import { S, store, saveP } from '../core/state.js';
import { tr, num } from '../core/util.js';
import { ic } from '../core/icons.js';
import { API } from '../core/sync.js';
import { speak, toast } from '../features/speech.js';
import { createWriter, releaseWriters } from '../features/writer.js';
import { go, render } from '../app/router.js';

S.dict = S.dict || { q: '', results: null, entry: null, tab: 'meaning', mode: 'search', busy: false, error: null, tokens: null, draw: false, cands: [], hist: store.get('dictHist', []) };
const D = S.dict;
const CJK = /[\u3400-\u9fff]/;

/* ---------------------------------------------------------------- pinyin có màu thanh điệu */
const TONE_MARKS = { 1: 'āēīōūǖĀĒĪŌŪǕ', 2: 'áéíóúǘÁÉÍÓÚǗ', 3: 'ǎěǐǒǔǚǍĚǏǑǓǙ', 4: 'àèìòùǜÀÈÌÒÙǛ' };
const toneOf = syl => { for (const [t, chars] of Object.entries(TONE_MARKS)) if ([...syl].some(c => chars.includes(c))) return +t; return 5; };
const pyHtml = py => (py || '').split(' ').map(s => `<span class="t${toneOf(s)}">${esc(s)}</span>`).join(' ');

/* ---------------------------------------------------------------- gọi API */
const dictApi = path => API.call('/dict' + path).then(r => r.data);

async function runSearch(q) {
  clearTimeout(sugT); sugSeq++; hideSuggest();
  D.q = q; D.entry = null; D.tokens = null; D.error = null; D.results = null;
  if (!q.trim()) { D.mode = 'search'; render(); return; }
  D.busy = true; render();
  try {
    const cjkCount = [...q].filter(c => CJK.test(c)).length;
    if (cjkCount >= 6 || (cjkCount && /[，。！？；：、,.!?]/.test(q))) {
      D.mode = 'sentence';
      D.tokens = (await dictApi('/segment?text=' + encodeURIComponent(q))).tokens;
    } else {
      D.mode = 'search';
      const r = await dictApi('/search?q=' + encodeURIComponent(q));
      D.results = r.results;
      // một kết quả khớp đúng chữ đã gõ thì mở luôn chi tiết
      if (D.results.length && CJK.test(q) && (D.results[0].simp === q.trim() || D.results[0].trad === q.trim())) await openEntry(D.results[0].simp, false);
    }
  } catch (e) { D.error = e.message; }
  D.busy = false; render();
}

async function openEntry(w, pushHist = true) {
  clearTimeout(sugT); sugSeq++; hideSuggest();
  D.busy = true; D.error = null; D.tab = D.tab || 'meaning'; render();
  try {
    D.entry = await dictApi('/entry?w=' + encodeURIComponent(w));
    if (pushHist) {
      D.hist = [w, ...D.hist.filter(x => x !== w)].slice(0, 30);
      store.set('dictHist', D.hist);
    }
    if (S.route === 'dict') history.replaceState({ r: 'dict' }, '', '#dict/' + encodeURIComponent(w));
  } catch (e) { D.error = e.message; D.entry = null; }
  D.busy = false; render();
}

/** Mở trang từ điển với một từ: dùng từ bảng liên kết, từ ghép, hay từ trang khác. */
export function dictLookup(w) {
  D.q = w; D.results = null; D.tokens = null;
  if (S.route !== 'dict') go('dict');
  openEntry(w);
}

/* ---------------------------------------------------------------- vẽ chữ để tra (HanziLookupJS, GPL-3, nạp riêng khi cần) */
let hlReady = null, strokes = [], cur = null;
function loadHanziLookup() {
  if (hlReady) return hlReady;
  hlReady = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = '/vendor/hanzilookup.min.js';
    s.onload = () => window.HanziLookup.init('mmah', '/vendor/mmah.json', success => (success ? ok() : fail(new Error('Không tải được dữ liệu nhận dạng.'))));
    s.onerror = () => fail(new Error('Không tải được bộ nhận dạng chữ viết.'));
    document.head.appendChild(s);
  });
  return hlReady;
}
function bindCanvas() {
  const cv = $('#dictCanvas'); if (!cv) return;
  const ctx = cv.getContext('2d');
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  const redraw = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#ccc';
    ctx.lineWidth = 1; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(cv.width / 2, 0); ctx.lineTo(cv.width / 2, cv.height); ctx.moveTo(0, cv.height / 2); ctx.lineTo(cv.width, cv.height / 2); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#000';
    for (const st of strokes) { ctx.beginPath(); st.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
  };
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); cur = [pos(e)]; strokes.push(cur); };
  cv.onpointermove = e => { if (!cur) return; cur.push(pos(e)); redraw(); };
  cv.onpointerup = cv.onpointercancel = async () => {
    cur = null; redraw();
    try {
      await loadHanziLookup();
      const HL = window.HanziLookup;
      const ac = new HL.AnalyzedCharacter(strokes.map(st => st.map(([x, y]) => [Math.round(x), Math.round(y)])));
      new HL.Matcher('mmah').match(ac, 8, matches => { D.cands = matches.map(m => m.character); renderCands(); });
    } catch (e) { toast(e.message); }
  };
  redraw();
}
function renderCands() {
  const box = $('#dictCands'); if (!box) return;
  box.innerHTML = D.cands.length
    ? D.cands.map(c => `<button class="cand zh" lang="zh-CN" data-act="dictcand" data-arg="${esc(c)}">${esc(c)}</button>`).join('')
    : `<span class="hint">${tr('Vẽ một chữ vào ô bên trái.', 'Draw a character in the box.')}</span>`;
}

/* ---------------------------------------------------------------- lưu vào thẻ nhớ */
function wordFromEntry(e) {
  return { s: e.simp, sy: (e.py || '').split(' '), tn: (e.py || '').split(' ').map(toneOf), vi: (e.vi || []).slice(0, 2).join('; '), en: (e.en || []).slice(0, 2).join('; '), hv: e.hv || '', k: 'dict' };
}
function saveToDeck(e) {
  S.p.dictSaved = S.p.dictSaved || {};
  if (S.p.dictSaved[e.simp]) { toast(tr('Từ này đã có trong bộ thẻ Từ điển.', 'Already in your dictionary deck.')); return; }
  S.p.dictSaved[e.simp] = wordFromEntry(e);
  saveP();
  toast(tr(`Đã thêm ${e.simp} vào bộ thẻ "Từ đã lưu".`, `Added ${e.simp} to your saved deck.`));
  render();
}

/* ---------------------------------------------------------------- khối hiển thị */
const hskChips = e => [e.hsk20 ? `<span class="hchip">HSK 2.0 · ${e.hsk20}</span>` : '', e.hsk30 ? `<span class="hchip">HSK 3.0 · ${e.hsk30 >= 7 ? '7–9' : e.hsk30}</span>` : ''].join('');
const rowHtml = (e, act = 'dictgo') => `
  <button class="drow" data-act="${act}" data-arg="${esc(e.simp)}">
    <span class="dzh zh" lang="zh-CN">${esc(e.simp)}${e.trad && e.trad !== e.simp ? `<small>${esc(e.trad)}</small>` : ''}</span>
    <span class="dbody">
      <span class="dpy">${pyHtml(e.py)}${e.hv ? ` <span class="dhv">${esc(e.hv)}</span>` : ''}</span>
      <span class="dvi">${esc((e.vi || []).slice(0, 2).join('; ') || (e.en || []).slice(0, 2).join('; '))}</span>
    </span>
    <span class="dchips">${hskChips(e)}</span>
  </button>`;

function searchBox() {
  return `
  <div class="dict-search">
    <div class="dict-inputrow">
      <input class="inp" id="dictQ" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(D.q)}"
        placeholder="${tr('Gõ chữ Hán, pinyin, tiếng Việt hoặc dán cả câu…', 'Type Chinese, pinyin, Vietnamese or paste a sentence…')}" aria-label="${tr('Tra từ', 'Look up')}">
      <button class="btn" data-act="dictsearch">${ic('search')}${tr('Tra', 'Look up')}</button>
      <button class="icon-btn ${D.draw ? 'on' : ''}" data-act="dictdraw" aria-pressed="${D.draw}" aria-label="${tr('Vẽ chữ để tra', 'Draw a character')}" title="${tr('Vẽ chữ để tra', 'Draw a character')}">${ic('pen')}</button>
    </div>
    <div class="dsuggest" id="dictSuggest" role="listbox" hidden></div>
    ${D.draw ? `
    <div class="dict-draw">
      <canvas id="dictCanvas" width="280" height="280" aria-label="${tr('Ô vẽ chữ', 'Drawing box')}"></canvas>
      <div class="dict-drawside">
        <div class="cands" id="dictCands"></div>
        <div class="btnrow" style="margin:0">
          <button class="btn btn-ghost btn-sm" data-act="dictundo">${tr('Xoá nét cuối', 'Undo stroke')}</button>
          <button class="btn btn-ghost btn-sm" data-act="dictclear">${tr('Xoá hết', 'Clear')}</button>
        </div>
        <p class="hint">${tr('Vẽ đúng thứ tự nét sẽ nhận dạng chính xác hơn. Bấm vào chữ gợi ý để đưa vào ô tra.', 'Stroke order helps recognition. Tap a candidate to insert it.')}</p>
      </div>
    </div>` : ''}
  </div>`;
}

function meaningTab(d) {
  const e = d.entries[0], u = d.usage;
  return `
    ${d.entries.map((x, i) => `<div class="dsense">
      ${d.entries.length > 1 ? `<div class="dpy big">${pyHtml(x.py)} <button class="icon-btn sm" data-act="dictsay" data-arg="${esc(x.simp)}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button></div>` : ''}
      ${x.vi.length ? `<ol class="dlist">${x.vi.map(v => `<li>${esc(v)}</li>`).join('')}</ol>` : ''}
      ${x.en.length ? `<ol class="dlist en">${x.en.map(v => `<li>${esc(v)}</li>`).join('')}</ol>` : ''}
    </div>`).join('')}
    <div class="dusage">
      <h3>${tr('Loại từ và cách dùng', 'Part of speech and usage')}</h3>
      <dl>
        ${u.pos.length ? `<dt>${tr('Loại từ', 'Part of speech')}</dt><dd>${u.pos.map(p => `<span class="tagchip">${esc(p)}</span>`).join('')}</dd>` : ''}
        ${u.classifiers.length ? `<dt>${tr('Lượng từ', 'Measure words')}</dt><dd>${u.classifiers.map(c => `<span class="tagchip zh" lang="zh-CN">${esc(c)}</span>`).join('')}</dd>` : ''}
        ${u.tags.length ? `<dt>${tr('Ngữ vực', 'Register')}</dt><dd>${u.tags.map(t => `<span class="tagchip warm">${esc(t)}</span>`).join('')}</dd>` : ''}
        ${e.hv ? `<dt>${tr('Hán Việt', 'Sino-Vietnamese')}</dt><dd>${esc(e.hv)}</dd>` : ''}
        ${e.trad !== e.simp ? `<dt>${tr('Phồn thể', 'Traditional')}</dt><dd class="zh" lang="zh-TW">${esc(e.trad)}</dd>` : ''}
        ${(u.hsk.v20 || u.hsk.v30) ? `<dt>HSK</dt><dd>${hskChips(e)}</dd>` : `<dt>HSK</dt><dd class="muted">${tr('Ngoài đề cương HSK', 'Not in the HSK syllabus')}</dd>`}
        ${!u.pos.length && !u.classifiers.length && !u.tags.length ? `<dt class="muted">${tr('Ghi chú', 'Note')}</dt><dd class="muted">${tr('Từ này chưa có nhãn loại từ trong dữ liệu mở; hãy tham khảo ví dụ ở tab "Từ ghép và ví dụ".', 'No part-of-speech data for this entry; see examples.')}</dd>` : ''}
      </dl>
    </div>`;
}

function charsTab(d) {
  return d.chars.map((c, i) => `
    <div class="dchar">
      <div class="dchar-head">
        <div class="dchar-writer" id="dictW${i}" aria-label="${tr('Nét chữ', 'Strokes')} ${esc(c.ch)}"></div>
        <div class="dchar-info">
          <div class="dchar-title"><span class="zh" lang="zh-CN">${esc(c.ch)}</span> ${c.hv ? `<span class="dhv">${esc(c.hv)}</span>` : ''} <button class="icon-btn sm" data-act="dictsay" data-arg="${esc(c.ch)}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button></div>
          <dl>
            ${c.radical ? `<dt>${tr('Bộ thủ', 'Radical')}</dt><dd><button class="linkbtn zh" lang="zh-CN" data-act="dictgo" data-arg="${esc(c.radical.ch)}">${esc(c.radical.ch)}</button> ${c.radical.hv ? esc(c.radical.hv) : ''}${c.radical.vi[0] ? `: ${esc(c.radical.vi[0])}` : ''}</dd>` : ''}
            ${c.strokes ? `<dt>${tr('Số nét', 'Strokes')}</dt><dd>${c.strokes}</dd>` : ''}
            ${c.components.length ? `<dt>${tr('Thành phần', 'Components')}</dt><dd>${c.decomposition ? `<span class="muted">${esc(c.decomposition)}</span> ` : ''}${c.components.map(p => `<button class="linkbtn" data-act="dictgo" data-arg="${esc(p.ch)}"><span class="zh" lang="zh-CN">${esc(p.ch)}</span> ${p.hv ? esc(p.hv) : ''}${p.vi[0] ? `: ${esc(p.vi[0].split(/[;,]/)[0])}` : ''}</button>`).join(', ')}</dd>` : ''}
            ${c.etymology ? `<dt>${tr('Nguồn gốc', 'Etymology')}</dt><dd>${esc({ pictographic: tr('Tượng hình', 'Pictographic'), ideographic: tr('Hội ý', 'Ideographic'), pictophonetic: tr('Hình thanh', 'Pictophonetic') }[c.etymology.type] || c.etymology.type)}${c.etymology.hint ? ` — <span class="muted">${esc(c.etymology.hint)}</span>` : ''}${c.etymology.semantic ? `<br>${tr('Phần nghĩa', 'Semantic')}: <span class="zh" lang="zh-CN">${esc(c.etymology.semantic)}</span>` : ''}${c.etymology.phonetic ? ` · ${tr('Phần âm', 'Phonetic')}: <span class="zh" lang="zh-CN">${esc(c.etymology.phonetic)}</span>` : ''}</dd>` : ''}
            ${c.definition ? `<dt>${tr('Nghĩa gốc', 'Core meaning')}</dt><dd class="muted">${esc(c.definition)}</dd>` : ''}
          </dl>
          ${c.mnemonic ? `<div class="dmnemo">${ic('bolt')}<div><b>${tr('Mẹo nhớ', 'Mnemonic')}</b><p>${esc(c.mnemonic)}</p></div></div>` : ''}
          <div class="btnrow" style="margin:8px 0 0"><button class="btn btn-ghost btn-sm" data-act="dictanim" data-arg="${i}">${ic('play')}${tr('Xem thứ tự nét', 'Animate strokes')}</button></div>
        </div>
      </div>
    </div>`).join('');
}

/** Bản đồ liên kết: SVG hình quạt, mỗi nhóm một cung; bấm vào nút là tra từ đó. */
function linkMap(d) {
  const e = d.entries[0];
  const groups = [
    { key: 'comp', label: tr('Thành phần', 'Components'), cls: 'g-comp', items: [...new Map(d.chars.flatMap(c => c.components).map(p => [p.ch, p.ch])).keys()].filter(x => x !== e.simp).slice(0, 6) },
    { key: 'cmp', label: tr('Từ ghép', 'Compounds'), cls: 'g-cmp', items: d.compounds.slice(0, 8).map(x => x.simp) },
    { key: 'homo', label: tr('Đồng âm', 'Homophones'), cls: 'g-homo', items: d.homophones.slice(0, 5).map(x => x.simp) },
    { key: 'sim', label: tr('Dễ nhầm', 'Look-alikes'), cls: 'g-sim', items: d.similar.slice(0, 6).map(x => x.simp) },
    { key: 'syn', label: tr('Gần nghĩa', 'Related'), cls: 'g-syn', items: d.synonyms.slice(0, 5).map(x => x.simp) }
  ].filter(g => g.items.length);
  if (!groups.length) return `<p class="empty-note">${tr('Chưa có từ liên kết.', 'No links yet.')}</p>`;
  const W = 720, H = 520, cx = W / 2, cy = H / 2, R = 200;
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  let angle = -Math.PI / 2;
  const nodes = [], labels = [];
  groups.forEach(g => {
    const span = (g.items.length / total) * Math.PI * 2;
    const mid = angle + span / 2;
    labels.push({ x: cx + Math.cos(mid) * (R + 70), y: cy + Math.sin(mid) * (R + 70), text: g.label, cls: g.cls });
    g.items.forEach((w, i) => {
      const a = angle + (span * (i + 0.5)) / g.items.length;
      nodes.push({ w, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, cls: g.cls });
    });
    angle += span;
  });
  return `
  <div class="dmap-wrap"><svg class="dmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr('Bản đồ liên kết của', 'Link map of')} ${esc(e.simp)}">
    ${nodes.map(n => `<line x1="${cx}" y1="${cy}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" class="${n.cls}"/>`).join('')}
    ${nodes.map(n => { const w = Math.max(44, 18 * [...n.w].length + 22); return `<g class="dnode ${n.cls}" data-act="dictgo" data-arg="${esc(n.w)}" tabindex="0" role="button">
      <rect x="${(n.x - w / 2).toFixed(1)}" y="${(n.y - 20).toFixed(1)}" width="${w}" height="40" rx="12"/>
      <text x="${n.x.toFixed(1)}" y="${(n.y + 6).toFixed(1)}" text-anchor="middle" lang="zh-CN">${esc(n.w)}</text></g>`; }).join('')}
    ${labels.map(l => `<text class="dlabel ${l.cls}" x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="middle">${esc(l.text)}</text>`).join('')}
    <g class="dcenter"><rect x="${cx - 60}" y="${cy - 30}" width="120" height="60" rx="16"/><text x="${cx}" y="${cy + 9}" text-anchor="middle" lang="zh-CN">${esc(e.simp)}</text></g>
  </svg></div>
  <p class="hint">${tr('Bấm vào một từ trong bản đồ để tra từ đó.', 'Click any word in the map to look it up.')}</p>`;
}

function examplesTab(d) {
  const e = d.entries[0];
  const hl = zh => esc(zh).split(esc(e.simp)).join(`<mark>${esc(e.simp)}</mark>`);
  return `
    <h3>${tr('Từ ghép và từ chứa', 'Compounds')} (${d.compounds.length})</h3>
    ${d.compounds.length ? `<div class="dgrid">${d.compounds.map(x => rowHtml(x)).join('')}</div>` : `<p class="empty-note">${tr('Không có từ ghép trong từ điển.', 'No compounds found.')}</p>`}
    <h3>${tr('Ví dụ', 'Examples')} (${d.examples.length})</h3>
    ${d.examples.length ? `<div class="dexs">${d.examples.map(x => `<div class="dex">
        <div class="zh" lang="zh-CN">${hl(x.zh)} <button class="icon-btn sm" data-act="dictsay" data-arg="${esc(x.zh)}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button></div>
        ${x.py ? `<div class="dpy">${esc(x.py)}</div>` : ''}${x.vi ? `<div class="dvi">${esc(x.vi)}</div>` : ''}
        <div class="dsrc muted">${x.src.startsWith('book:') ? tr('Giáo trình', 'Textbook') + ' ' + (x.src.includes('hsk20') ? 'HSK 2.0' : 'HSK 3.0') + ', ' + tr('bài', 'lesson') + ' ' + x.src.split(':')[2] : tr('Ví dụ ngữ pháp', 'Grammar example')}</div>
      </div>`).join('')}</div>`
    : `<p class="empty-note">${tr('Chưa có câu ví dụ do Zuimó biên soạn cho từ này.', 'No Zuimó example sentences for this word yet.')}</p>`}`;
}

function relatedTab(d) {
  const block = (title, items, note) => `<h3>${title}</h3>${note ? `<p class="hint">${note}</p>` : ''}${items.length ? `<div class="dgrid">${items.map(x => rowHtml(x)).join('')}</div>` : `<p class="empty-note">${tr('Không có.', 'None.')}</p>`}`;
  return block(tr('Dễ nhầm', 'Easily confused'), d.similar, d.entries[0].simp.length > 1
      ? tr('Từ cùng độ dài, chỉ khác một chữ.', 'Same length, differ by one character.')
      : tr('Chữ cùng bộ thủ hoặc chung bộ phận, số nét gần bằng.', 'Same radical or shared component, similar stroke count.'))
    + block(tr('Đồng âm', 'Homophones'), d.homophones, tr('Cùng pinyin (cùng thanh điệu xếp trước).', 'Same pinyin, same tones first.'))
    + block(tr('Gần nghĩa', 'Similar meaning'), d.synonyms, tr('Có chung một nghĩa tiếng Việt.', 'Share a Vietnamese gloss.'));
}

function entryHtml(d) {
  const e = d.entries[0];
  const saved = !!(S.p.dictSaved && S.p.dictSaved[e.simp]);
  const tabs = [['meaning', tr('Nghĩa & cách dùng', 'Meaning')], ['chars', tr('Chữ & bộ thủ', 'Characters')], ['map', tr('Bản đồ liên kết', 'Link map')], ['examples', tr('Từ ghép & ví dụ', 'Compounds & examples')], ['related', tr('Dễ nhầm & liên quan', 'Related')]];
  return `
  <article class="dentry">
    <header class="dentry-head">
      <div class="dentry-word zh" lang="zh-CN">${esc(e.simp)}${e.trad !== e.simp ? `<small lang="zh-TW">${esc(e.trad)}</small>` : ''}</div>
      <div class="dentry-meta">
        <div class="dpy big">${pyHtml(e.py)} <button class="icon-btn sm" data-act="dictsay" data-arg="${esc(e.simp)}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button>${e.hv ? ` <span class="dhv">${esc(e.hv)}</span>` : ''}</div>
        <div class="dvi lead">${esc((e.vi[0] || e.en[0] || ''))}</div>
        <div class="dchips">${hskChips(e)}</div>
      </div>
      <div class="dentry-actions">
        <button class="btn btn-sm ${saved ? 'btn-ghost' : ''}" data-act="dictsave" ${saved ? 'disabled' : ''}>${ic('cards')}${saved ? tr('Đã lưu vào thẻ', 'Saved') : tr('Thêm vào thẻ nhớ', 'Add to flashcards')}</button>
      </div>
    </header>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" data-act="dicttab" data-arg="${k}" aria-selected="${D.tab === k}">${l}</button>`).join('')}</div>
    <div class="dtab">${({ meaning: meaningTab, chars: charsTab, map: linkMap, examples: examplesTab, related: relatedTab })[D.tab](d)}</div>
    <p class="dsource muted">${tr('Nguồn: CC-CEDICT và CVDICT (CC BY-SA 4.0), Make Me a Hanzi; ví dụ do Zuimó biên soạn.', 'Sources: CC-CEDICT and CVDICT (CC BY-SA 4.0), Make Me a Hanzi; examples by Zuimó.')}</p>
  </article>`;
}

function sentenceHtml() {
  return `<div class="dsent">
    <p class="hint">${tr('Bấm vào từng từ để xem nghĩa. Từ không có trong từ điển hiện màu xám.', 'Tap a word to see its meaning.')}</p>
    <div class="dtokens zh" lang="zh-CN">${D.tokens.map(t => t.entry
      ? `<button class="dtok" data-act="dictgo" data-arg="${esc(t.entry.simp)}" title="${esc((t.entry.vi[0] || t.entry.en[0] || ''))}"><span>${esc(t.text)}</span><small>${esc(t.entry.py)}</small></button>`
      : `<span class="dtok plain">${esc(t.text)}</span>`).join('')}</div>
    <div class="dgloss">${D.tokens.filter(t => t.entry).map(t => `<div class="dgl"><b class="zh" lang="zh-CN">${esc(t.text)}</b> <span class="dpy">${pyHtml(t.entry.py)}</span> <span>${esc(t.entry.vi[0] || t.entry.en[0] || '')}</span></div>`).join('')}</div>
  </div>`;
}

export function renderDict() {
  const body = D.busy ? `<p class="lead loading">${tr('Đang tra…', 'Looking up…')}</p>`
    : D.error ? `<p class="empty-note">${esc(D.error)}</p>`
    : D.entry ? entryHtml(D.entry)
    : D.mode === 'sentence' && D.tokens ? sentenceHtml()
    : D.results ? (D.results.length
        ? `<div class="dresults">${D.results.map(x => rowHtml(x)).join('')}</div>`
        : `<p class="empty-note">${tr('Không tìm thấy. Thử pinyin không dấu, hoặc dán nghĩa tiếng Việt.', 'No results. Try plain pinyin or a Vietnamese gloss.')}</p>`)
    : `<div class="dhome">
        <p class="lead">${tr('Từ điển Trung–Việt–Anh với hơn 120.000 mục từ: bộ thủ, thành phần, nguồn gốc chữ, từ ghép, ví dụ và các từ dễ nhầm.', 'Chinese–Vietnamese–English dictionary with 120,000+ entries.')}</p>
        ${D.hist.length ? `<h3>${tr('Tra gần đây', 'Recent')}</h3><div class="dhist">${D.hist.map(w => `<button class="cand zh" lang="zh-CN" data-act="dictgo" data-arg="${esc(w)}">${esc(w)}</button>`).join('')}<button class="btn btn-ghost btn-sm" data-act="dicthistclear">${tr('Xoá lịch sử', 'Clear')}</button></div>` : ''}
        <h3>${tr('Thử tra', 'Try')}</h3><div class="dhist">${['你好', '医院', '学习', 'zhongguo', 'bệnh viện', '我明天去医院看医生。'].map(w => `<button class="cand" data-act="dictquick" data-arg="${esc(w)}">${esc(w)}</button>`).join('')}</div>
      </div>`;
  view.innerHTML = `
  <div class="lhead"><h1>${tr('Từ điển', 'Dictionary')}</h1></div>
  ${searchBox()}
  ${D.entry && !D.busy ? `<div class="btnrow" style="margin:0 0 10px"><button class="btn btn-ghost btn-sm" data-act="dictback">${ic('back')}${D.results ? tr('Về kết quả tìm', 'Back to results') : tr('Tra từ khác', 'New search')}</button></div>` : ''}
  ${body}`;
  if (D.draw) { bindCanvas(); renderCands(); }
  if (D.entry && D.tab === 'chars') {
    releaseWriters && releaseWriters();
    D.entry.chars.forEach((c, i) => { const box = $('#dictW' + i); if (box) createWriter(box, c.ch, 120); });
  }
  const inp = $('#dictQ');
  if (inp && !D.entry) inp.focus();
}

/* ---------------------------------------------------------------- hành động */
export const DICT_ACT = {
  dictsearch() { runSearch(($('#dictQ') && $('#dictQ').value) || ''); },
  dictquick(a) { runSearch(a); },
  dictgo(a) { openEntry(a); },
  dicttab(a) { D.tab = a; render({ keepScroll: true }); },
  dictback() { D.entry = null; if (!D.results && !D.tokens) D.q = ''; history.replaceState({ r: 'dict' }, '', '#dict'); render({ keepScroll: true }); },
  dictsay(a) { speak(a); },
  dictsave() { if (D.entry) saveToDeck(D.entry.entries[0]); },
  dictdraw() { D.draw = !D.draw; if (!D.draw) { strokes = []; D.cands = []; } render({ keepScroll: true }); },
  dictundo() { strokes.pop(); D.cands = []; bindCanvas(); renderCands(); },
  dictclear() { strokes = []; D.cands = []; bindCanvas(); renderCands(); },
  dictcand(a) { const inp = $('#dictQ'); if (inp) { inp.value += a; inp.focus(); } strokes = []; D.cands = []; bindCanvas(); renderCands(); },
  dicthistclear() { D.hist = []; store.set('dictHist', []); render({ keepScroll: true }); },
  dictanim(a) { const c = D.entry && D.entry.chars[+a]; const box = $('#dictW' + a); if (c && box) { createWriter(box, c.ch, 120); setTimeout(() => S.writer && S.writer.animateCharacter(), 150); } }
};

/* ---------------------------------------------------------------- gợi ý khi gõ
   Chờ 250 ms sau phím cuối rồi gọi API với limit nhỏ; mỗi yêu cầu mang số thứ tự để phản hồi
   đến muộn của từ khoá cũ không đè lên kết quả mới. Chỉ vẽ lại khối gợi ý, không vẽ lại cả trang
   để ô nhập không mất focus. Câu dài thì không gợi ý (đã có chế độ tách từ khi bấm Tra). */
let sugT = null, sugSeq = 0, sugItems = [], sugActive = -1;
function hideSuggest() { const b = $('#dictSuggest'); if (b) { b.hidden = true; b.innerHTML = ''; } sugItems = []; sugActive = -1; }
function drawSuggest() {
  const b = $('#dictSuggest'); if (!b) return;
  if (!sugItems.length) { hideSuggest(); return; }
  b.hidden = false;
  b.innerHTML = sugItems.map((e, i) => `
    <button class="dsug ${i === sugActive ? 'active' : ''}" role="option" aria-selected="${i === sugActive}" data-act="dictgo" data-arg="${esc(e.simp)}" tabindex="-1">
      <span class="zh" lang="zh-CN">${esc(e.simp)}</span>
      <span class="dpy">${pyHtml(e.py)}</span>
      <span class="dvi">${esc((e.vi[0] || e.en[0] || ''))}</span>
      <span class="dchips">${hskChips(e)}</span>
    </button>`).join('');
}
async function suggest(q) {
  const t = q.trim();
  const cjkCount = [...t].filter(c => CJK.test(c)).length;
  if (t.length < 1 || cjkCount >= 6 || /[，。！？；：、,.!?]/.test(t)) { hideSuggest(); return; }
  const seq = ++sugSeq;
  try {
    const r = await dictApi('/search?q=' + encodeURIComponent(t) + '&limit=8');
    if (seq !== sugSeq) return;           // đã có từ khoá mới hơn
    sugItems = r.results; sugActive = -1; drawSuggest();
  } catch (e) { /* mất mạng: im lặng, Enter vẫn tra được */ }
}
document.addEventListener('input', e => {
  if (!e.target || e.target.id !== 'dictQ') return;
  clearTimeout(sugT);
  const v = e.target.value;
  sugT = setTimeout(() => suggest(v), 250);
});
document.addEventListener('keydown', e => {
  if (!e.target || e.target.id !== 'dictQ') return;
  if (e.key === 'ArrowDown' && sugItems.length) { e.preventDefault(); sugActive = (sugActive + 1) % sugItems.length; drawSuggest(); return; }
  if (e.key === 'ArrowUp' && sugItems.length) { e.preventDefault(); sugActive = (sugActive - 1 + sugItems.length) % sugItems.length; drawSuggest(); return; }
  if (e.key === 'Escape') { hideSuggest(); return; }
  if (e.key === 'Enter') {
    e.preventDefault(); clearTimeout(sugT);
    if (sugActive >= 0 && sugItems[sugActive]) { const w = sugItems[sugActive].simp; hideSuggest(); D.q = w; openEntry(w); return; }
    hideSuggest(); runSearch(e.target.value);
  }
});
/* rời ô nhập thì ẩn gợi ý; trì hoãn một nhịp để click vào gợi ý kịp được xử lý */
document.addEventListener('focusout', e => { if (e.target && e.target.id === 'dictQ') setTimeout(hideSuggest, 180); });
document.addEventListener('focusin', e => { if (e.target && e.target.id === 'dictQ' && e.target.value.trim()) suggest(e.target.value); });
export function dictFromHash() {
  const m = /^#dict\/(.+)$/.exec(location.hash);
  if (m) { const w = decodeURIComponent(m[1]); if (w && !D.entry) openEntry(w); }
}

