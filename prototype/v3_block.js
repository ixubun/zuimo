/* =====================================================================
   Lộ trình giáo trình (sinh bởi content-pipeline/build_books.py)
   BOOKS.hsk20_1: Giáo trình chuẩn HSK 1 (HSK标准教程, đề cương 2.0)
   BOOKS.hsk30_1: 新HSK教程 1 (đề cương 3.0)
   Mỗi bài: words (k: core | again), extra (vượt cấp, không bắt buộc), proper, grammar,
            pinyin/hanzi (chỉ 2.0), chars (chữ để tập viết)
   ===================================================================== */
const BOOKS = __BOOKS__;
const bookOf = (ver = S.ver) => BOOKS[ver === '20' ? 'hsk20_1' : 'hsk30_1'];
/* từ riêng của sách (你好, 这个, tên riêng…) cần có trong bảng tra để thẻ nhớ hiển thị được */
Object.values(BOOKS).forEach(b => b.lessons.forEach(L => [...L.words, ...L.extra, ...L.proper].forEach(w => { if (!WMAP[w.s]) WMAP[w.s] = w; })));
const bKey = (n, ver = S.ver) => `${ver}-${n}`;
const bookTabs = (ver = S.ver) => [
  ['words', tr('Từ mới', 'Vocabulary')],
  ['dialogue', tr('Hội thoại', 'Dialogue')],
  ['grammar', tr('Ngữ pháp', 'Grammar')],
  ...(ver === '20' ? [['sounds', tr('Phát âm và chữ Hán', 'Sounds and characters')]] : []),
  ['writing', tr('Tập viết', 'Writing')]
];
function bookPct(n, ver = S.ver) {
  const seen = ((S.p.bseen || {})[bKey(n, ver)]) || {};
  return Math.round(Object.keys(seen).length / bookTabs(ver).length * 60 + (((S.p.bdone || {})[bKey(n, ver)]) ? 40 : 0));
}
const verSeg = () => `<div class="seggroup" role="group" aria-label="${tr('Giáo trình', 'Textbook')}">
  <button class="seg" data-act="ver" data-arg="20" aria-pressed="${S.ver === '20'}">HSK 2.0</button>
  <button class="seg" data-act="ver" data-arg="30" aria-pressed="${S.ver === '30'}">HSK 3.0</button></div>`;
const coreWords = L => L.words.filter(w => w.k === 'core');

/* pinyin theo cách ghi của sách, giữ khoảng trắng và dấu cách âm, tô màu theo từng âm tiết */
function bookPy(w) {
  const bp = w.bp || '';
  if (!w.sy || bp.includes('/') || bp.includes('…')) return `<span class="py">${esc(bp || (w.sy || []).join(''))}</span>`;
  let i = 0;
  const parts = w.sy.map((s, k) => {
    i += s.length;
    let sp = '';
    while (i < bp.length && /[\s'’]/.test(bp[i])) { sp += bp[i]; i++; }
    return [s + sp, w.tn[k]];
  });
  return py(parts);
}
function wordRows(list) {
  return `<div class="wlist">${list.map(w => {
    const tag = w.from ? `${tr('ghép từ', 'from')} ${esc(w.from)}` : w.lvl ? esc(w.lvl) : w.k === 'again' ? `${tr('học ở bài', 'first in lesson')} ${w.ls[0]}` : '';
    return `<div class="wrow">
    <button class="icon-btn spk-b" data-act="speak" data-arg="${esc(w.s)}" aria-label="${tr('Nghe', 'Listen to')} ${esc(w.s)}">${ic('volume')}</button>
    <span class="wz" lang="zh-CN">${esc(w.s)}</span>
    <span class="wp">${bookPy(w)}</span>
    <span class="wm">${esc(meaning(w))}${S.lang === 'vi' && !w.vi ? '<span class="en-tag">EN</span>' : ''}${S.lang === 'vi' && w.hv ? `<small>${esc(w.hv)}</small>` : ''}</span>
    <span class="wlv">${tag}</span></div>`;
  }).join('')}</div>`;
}
const exLi = e => `<li><button class="icon-btn spk-b" data-act="speak" data-arg="${esc(e.zh)}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button><div><span class="zh" lang="zh-CN">${esc(e.zh)}</span><span class="p">${esc(e.py || '')}</span>${S.lang === 'vi' && e.vi ? `<span class="tr">${esc(e.vi)}</span>` : ''}</div></li>`;

/* ---------- Danh sách bài ---------- */
function renderBookList() {
  const B = bookOf(), ver = S.ver;
  const supp = ver === '20' && B.supplement ? `<details class="gp" style="margin-top:14px"><summary><span class="gt"><b>${tr('Từ bổ sung của giáo trình', 'Supplementary words')}</b><span>${tr('Mở rộng, không bắt buộc', 'Optional')}: ${B.supplement.length} ${tr('từ ghép từ chữ đã học', 'words built from known characters')}</span></span>${ic('chev', 'gchev')}</summary><div class="gbody">${wordRows(B.supplement)}</div></details>` : '';
  view.innerHTML = `
  <div class="lhead"><h1>${tr('Bài học theo giáo trình', 'Textbook lessons')}</h1></div>
  ${verSeg()}
  <p class="vernote">${ver === '20'
    ? tr('Giáo trình chuẩn HSK 1 (HSK标准教程), theo đề cương HSK 2.0: 15 bài, học kỹ phát âm và chữ Hán trong từng bài.', 'HSK Standard Course 1 (HSK 2.0): 15 lessons with pronunciation and character work in every lesson.')
    : tr('新HSK教程 1, theo đề cương HSK 3.0 áp dụng từ 2026: 15 bài, khoảng 300 từ mới.', '新HSK教程 1 (HSK 3.0, from 2026): 15 lessons, about 300 new words.')}
    ${tr('Hội thoại và bài tập trên ZUIMO do ZUIMO tự biên soạn theo từ mới và ngữ pháp của từng bài.', 'Dialogues and exercises are written by ZUIMO for each lesson.')}</p>
  <div class="units">
    <button class="unit on" data-act="nav" data-arg="lesson"><span class="zhb">入门</span><span class="grow"><span class="ut">${tr('Nhập môn: thanh điệu, bộ thủ và tập viết', 'Starter: tones, radicals and writing')}</span><span class="us" style="display:block">${tr('Bài mẫu ZUIMO, dùng được cho cả hai giáo trình', 'ZUIMO sample lesson for both textbooks')}</span></span><span class="end">${ic('chev')}</span></button>
    ${B.lessons.map(L => {
      const pct = bookPct(L.n), core = coreWords(L).length;
      return `<button class="unit on" data-act="bopen" data-arg="${L.n}"><span class="zhb num">${L.n}</span><span class="grow">
        <span class="ut zh" lang="zh-CN">${esc(L.zh)}</span>
        <span class="us" style="display:block">${esc(S.lang === 'vi' ? L.vi : L.en)}</span>
        <span class="us" style="display:block">${core} ${tr('từ mới', 'new words')}${L.extra.length ? `, ${L.extra.length} ${tr('từ mở rộng', 'optional')}` : ''}, ${L.grammar.length} ${tr('điểm ngữ pháp', 'grammar points')}</span>
        <span class="pbar" style="display:block"><span style="width:${pct}%"></span></span></span><span class="end">${ic('chev')}</span></button>`;
    }).join('')}
  </div>${supp}`;
}

/* ---------- Trang bài học ---------- */
function renderBook() {
  const B = bookOf();
  const L = B.lessons.find(x => x.n === S.bl) || B.lessons[0];
  S.bl = L.n; store.set('bl', L.n);
  if (!bookTabs().some(t => t[0] === S.btab)) S.btab = 'words';
  const k = bKey(L.n);
  S.p.bseen = S.p.bseen || {};
  (S.p.bseen[k] = S.p.bseen[k] || {})[S.btab] = 1;
  saveP();
  const body = { words: bWords, dialogue: bDialogue, grammar: bGrammar, sounds: bSounds, writing: bWriting }[S.btab](L);
  const overview = (L.goals && L.goals.length) || L.culture_vi ? `<div class="overview">
    ${L.goals && L.goals.length ? `<div><b>${tr('Mục tiêu của bài', 'Lesson goals')}</b><ul>${L.goals.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
    ${L.culture_vi ? `<div><b>${tr('Văn hóa', 'Culture')}</b><p>${esc(L.culture_vi)}</p></div>` : ''}</div>` : '';
  const prev = B.lessons.find(x => x.n === L.n - 1), next = B.lessons.find(x => x.n === L.n + 1);
  view.innerHTML = `
  <div class="lhead">
    <button class="icon-btn" data-act="nav" data-arg="lessons" aria-label="${tr('Về danh sách bài', 'Back to lessons')}">${ic('back')}</button>
    <div><div class="muted" style="font-size:13px;font-weight:700">${verName()}, ${tr('bài', 'lesson')} ${L.n}</div>
      <h1><span class="zh-d" lang="zh-CN">${esc(L.zh)}</span></h1>
      <div class="muted">${esc(S.lang === 'vi' ? L.vi : L.en)}</div></div>
  </div>
  ${S.lang === 'vi' ? overview : ''}
  <div class="tabs" role="tablist">${bookTabs().map(([t, l]) => `<button class="tab" role="tab" data-act="btab" data-arg="${t}" aria-selected="${S.btab === t}">${l}</button>`).join('')}</div>
  <div role="tabpanel">${body}</div>
  <div class="cta-end"><p>${tr('Học xong bài này? Ôn thẻ và luyện tập với đúng từ mới của bài.', 'Done? Review and practise this lesson’s words.')}</p>
    <button class="btn btn-ghost" data-act="bcards" data-arg="${L.n}">${ic('cards')}${tr('Ôn thẻ', 'Flashcards')}</button>
    <button class="btn" data-act="bprac" data-arg="${L.n}">${ic('target')}${tr('Luyện tập', 'Practice')}</button></div>
  <div class="bnav2">
    ${prev ? `<button class="btn btn-ghost btn-sm" data-act="bopen" data-arg="${prev.n}">${ic('back')}${tr('Bài', 'Lesson')} ${prev.n}</button>` : '<span></span>'}
    ${next ? `<button class="btn btn-ghost btn-sm" data-act="bopen" data-arg="${next.n}">${tr('Bài', 'Lesson')} ${next.n}${ic('chev')}</button>` : '<span></span>'}
  </div>`;
  if (S.btab === 'writing') mountBookWriter();
}
function bWords(L) {
  const core = coreWords(L), again = L.words.filter(w => w.k === 'again');
  let h = `<p class="lead">${tr(`Bài có ${core.length} từ mới. Pinyin ghi theo cách viết của giáo trình; chạm vào loa để nghe.`, `${core.length} new words; pinyin follows the textbook.`)}</p>${wordRows(core)}`;
  if (again.length) h += `<h3 class="gcat">${tr('Từ đã học, gặp lại với cách dùng mới', 'Seen before, used in a new way')}</h3>${wordRows(again)}`;
  if (L.proper.length) h += `<h3 class="gcat">${tr('Tên riêng', 'Proper nouns')}</h3>${wordRows(L.proper)}`;
  if (L.extra.length) {
    h += `<details class="gp" style="margin-top:14px"><summary><span class="gt"><b>${tr('Mở rộng, không bắt buộc', 'Optional extension')} (${L.extra.length})</b>
      <span>${tr('Từ vượt cấp độ HSK 1. Không tính vào thẻ nhớ và luyện tập.', 'Beyond HSK 1; not included in flashcards or practice.')}</span></span>${ic('chev', 'gchev')}</summary>
      <div class="gbody">${wordRows(L.extra)}</div></details>`;
  }
  return h;
}
/* Hội thoại do ZUIMO biên soạn, chỉ dùng từ đã học tới bài này */
function bDialogue(L) {
  if (!L.dlg || !L.dlg.length) return `<p class="empty-note">${tr('Hội thoại của bài này đang được biên soạn.', 'Dialogue coming soon.')}</p>`;
  return `<p class="lead">${tr('Hội thoại do ZUIMO biên soạn, chỉ dùng từ mới của bài này và các bài trước. Chạm vào từng câu để nghe.', 'Original dialogues using only words learned so far. Tap a line to listen.')}</p>
  <div class="dtools">
    <button class="pill" data-act="togglepy" aria-pressed="${S.showPy}">${ic('eye')}Pinyin</button>
    <button class="pill" data-act="toggletr" aria-pressed="${S.showTr}">${ic('eye')}${tr('Bản dịch', 'Translation')}</button>
  </div>
  <div id="dlg" class="${S.showPy ? '' : 'hide-py'} ${S.showTr ? '' : 'hide-tr'}">
  ${L.dlg.map((sc, si) => {
    const order = [];
    sc.lines.forEach(l => { if (!order.includes(l.sp)) order.push(l.sp); });
    return `<section class="scene" id="scene${si}">
      <div class="scene-head"><span>${esc(S.lang === 'vi' ? sc.desc : tr('', 'Scene') + ' ' + (si + 1))}</span>
        <button class="btn btn-sm" data-act="bplay" data-arg="${si}">${ic('play')}${tr('Phát đoạn này', 'Play')}</button></div>
      <div class="dlg">${sc.lines.map((l, li) => {
        const side = order.indexOf(l.sp) % 2 === 0 ? 'a' : 'b';
        const av = /[\u3400-\u9fff]/.test(l.sp) ? l.sp.slice(-1) : l.sp;
        return `<div class="line ${side}"><span class="av" title="${esc(l.sp)}" lang="zh-CN">${esc(av)}</span>
          <button class="bubble" data-act="bline" data-arg="${si}-${li}"><span class="spk-name">${esc(l.sp)}</span><span class="zh" lang="zh-CN">${esc(l.zh)}</span><span class="p">${esc(l.py)}</span>${S.lang === 'vi' ? `<span class="tr">${esc(l.vi)}</span>` : ''}</button></div>`;
      }).join('')}</div></section>`;
  }).join('')}</div>`;
}
function curBookLesson() { return bookOf().lessons.find(x => x.n === S.bl); }
/* chuyển bài tập tự biên soạn thành câu hỏi của engine luyện tập */
function authoredItems(L) {
  const mk = (opts, zh) => shuffle(opts.map((o, i) => ({ o, ok: i === 0 }))).map(x => x);
  const isZh = t => /[\u3400-\u9fff]/.test(t);
  return (L.exr || []).map(e => {
    if (e.t === 'fill') return { type: 'mcq', kindLabel: { vi: 'Điền từ', en: 'Fill in the blank' }, prompt: { vi: 'Chọn từ đúng điền vào chỗ trống', en: 'Choose the word for the blank' }, quote: e.main, quoteZh: true, options: mk(e.opts), optZh: true, ansZh: true, explain: e.vi };
    if (e.t === 'order') return { type: 'order', kindLabel: { vi: 'Sắp xếp câu', en: 'Word order' }, prompt: { vi: 'Sắp xếp thành câu đúng', en: 'Build the sentence' }, quote: e.vi, tiles: e.answer.concat(e.extra), answer: e.answer, ansText: e.answer.join(''), ansZh: true, explain: `${e.answer.join('')}: ${e.vi}` };
    if (e.t === 'trans') return { type: 'mcq', kindLabel: { vi: 'Dịch câu', en: 'Translation' }, prompt: { vi: 'Chọn câu tiếng Trung đúng nghĩa', en: 'Pick the correct Chinese sentence' }, quote: e.main, options: mk(e.opts), optZh: true, ansZh: true, explain: '' };
    return { type: 'mcq', kindLabel: { vi: 'Đọc hiểu hội thoại', en: 'Dialogue check' }, prompt: { vi: 'Dựa vào hội thoại của bài, chọn đáp án đúng', en: 'Answer from the lesson dialogue' }, quote: e.main, options: mk(e.opts), optZh: e.opts.every(isZh), ansZh: e.opts.every(isZh), explain: '' };
  });
}
function bGrammar(L) {
  if (!L.grammar.length) {
    return `<p class="empty-note">${tr('Bài này tập trung vào chào hỏi và làm quen phát âm, chưa có điểm ngữ pháp riêng.', 'This lesson focuses on greetings and sounds; no grammar points yet.')}</p>`;
  }
  return L.grammar.map((g, i) => `<article class="gblock">
    <h3><span class="gcode">${L.n}.${i + 1}</span> ${esc(S.lang === 'vi' && g.vi ? g.vi : g.zh)}</h3>
    <p class="zh muted" style="margin:0 0 6px" lang="zh-CN">${esc(g.zh)}</p>
    ${S.lang === 'vi' && g.note ? `<p class="desc">${esc(g.note)}</p>` : ''}
    <ul class="exs">${g.ex.map(exLi).join('')}</ul>
  </article>`).join('');
}
function bSounds(L) {
  let h = `<h3 class="gcat">${tr('Phát âm', 'Pronunciation')}</h3>
  <ul class="toplist">${L.pinyin.map(t => `<li><b>${esc(S.lang === 'vi' && t.vi ? t.vi : t.zh)}</b><span class="zh muted" lang="zh-CN">${esc(t.zh)}</span></li>`).join('')}</ul>`;
  if (L.n === 1) h += tabPinyin();
  h += `<h3 class="gcat">${tr('Chữ Hán', 'Characters')}</h3>
  <ul class="toplist">${L.hanzi.map(t => `<li><b>${esc(S.lang === 'vi' && t.vi ? t.vi : t.zh)}</b><span class="zh muted" lang="zh-CN">${esc(t.zh)}</span>
    ${t.rad ? `<div class="vgrid" style="margin-top:10px">${t.rad.map(r => `<div class="vcard"><div class="rad" lang="zh-CN">${r.r}</div>
      <div class="m zh" lang="zh-CN">${esc(r.name)}</div><div class="hv">${esc(r.vi)}</div>
      <div class="rex">${r.ex.split(' ').map(c => `<span lang="zh-CN">${c}</span>`).join('')}</div></div>`).join('')}</div>` : ''}</li>`).join('')}</ul>`;
  if (L.chars.length) h += `<button class="btn btn-sm" data-act="btab" data-arg="writing">${ic('pen')}${tr(L.chars_from_words ? 'Tập viết chữ của bài' : 'Tập viết chữ độc thể của bài', 'Practise writing')}</button>`;
  return h;
}
function bWriting(L) {
  const chars = L.chars.filter(c => CHAR_DATA[c]);
  if (!chars.length) return `<p class="empty-note">${tr('Bài này chưa có chữ để tập viết.', 'No characters to practise.')}</p>`;
  if (!chars.includes(S.bchar)) S.bchar = chars[0];
  const h = HMAP[S.bchar] || {};
  return `<p class="lead">${S.ver === '20' && !L.chars_from_words ? tr('Các chữ độc thể giáo trình giới thiệu trong bài. Xem thứ tự nét rồi tự viết.', 'The single-component characters of this lesson.') : tr('Các chữ Hán xuất hiện đầu tiên trong từ mới của bài. Xem thứ tự nét rồi tự viết.', 'First characters from this lesson’s words.')}</p>
  <div class="wchars" role="group">${chars.map(c => `<button class="wchar" data-act="bchar" data-arg="${c}" aria-pressed="${c === S.bchar}" lang="zh-CN">${c}${S.p.charsDone[c] ? `<span class="dot">${ic('check')}</span>` : ''}</button>`).join('')}</div>
  <div class="wstage">
    <div class="gbox lg">${gridSvg()}<div class="writer" id="bookW"></div></div>
    <div class="winfo">
      <div class="big-py">${h.py ? py([[h.py, h.tn]]) : ''}</div>
      ${S.lang === 'vi' && h.hv ? `<div class="m">${tr('Hán Việt', 'Sino-Vietnamese')}: ${esc(h.hv)}</div>` : ''}
      <div class="meta">${h.sc ? `${h.sc} ${tr('nét', 'strokes')}. ` : ''}${tr('Phần tô đỏ là bộ thủ.', 'The red part is the radical.')}</div>
      <div class="wbtns">
        <button class="btn btn-ghost btn-sm" data-act="wanim">${ic('play')}${tr('Xem cách viết', 'Show strokes')}</button>
        <button class="btn btn-sm" data-act="wquiz">${ic('pen')}${tr('Tự viết', 'Write it')}</button>
        <button class="icon-btn spk-b" data-act="speak" data-arg="${S.bchar}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button>
      </div>
      <div class="wstatus" id="wStatus" aria-live="polite"></div>
    </div>
  </div>`;
}
function mountBookWriter() { if (S.bchar && CHAR_DATA[S.bchar]) createWriter($('#bookW'), S.bchar, 300); }

/* Luyện tập theo bài: hỏi đúng từ mới của bài, phương án nhiễu lấy từ bài này và các bài trước */
function buildBookSession(ver, n) {
  const B = BOOKS[ver === '20' ? 'hsk20_1' : 'hsk30_1'];
  const L = B.lessons.find(x => x.n === n);
  const pool = B.lessons.filter(x => x.n <= Math.max(n, 3)).flatMap(coreWords);
  const auto = buildWordSession(coreWords(L), pool).slice(0, 6);
  const own = S.lang === 'vi' ? shuffle(authoredItems(L)) : [];
  /* xen kẽ: câu tự biên soạn và câu tự sinh từ từ vựng */
  const out = [];
  while (own.length || auto.length) { if (auto.length) out.push(auto.shift()); if (own.length) out.push(own.shift()); }
  return out;
}
const BOOK_ACT = {
  bopen(a) { S.bl = +a; S.btab = 'words'; go('book'); },
  btab(a) { S.btab = a; render({ keepScroll: true }); },
  bchar(a) { S.bchar = a; render({ keepScroll: true }); },
  bline(a) { const [si, li] = a.split('-').map(Number); const L = curBookLesson(); if (L && L.dlg) speak(L.dlg[si].lines[li].zh); },
  bplay(a) {
    const L = curBookLesson(); if (!L || !L.dlg || !voiceCheck()) return;
    const sc = L.dlg[+a], box = $('#scene' + a);
    const bubbles = box ? $$('.bubble', box) : [];
    const order = []; sc.lines.forEach(l => { if (!order.includes(l.sp)) order.push(l.sp); });
    speechSynthesis.cancel();
    sc.lines.forEach((l, i) => {
      const u = utter(l.zh, order.indexOf(l.sp) % 2 === 0 ? 1.2 : 0.85);
      u.onstart = () => bubbles.forEach((b, j) => b.classList.toggle('playing', i === j));
      if (i === sc.lines.length - 1) u.onend = () => bubbles.forEach(b => b.classList.remove('playing'));
      speechSynthesis.speak(u);
    });
  },
  bprac(a) { S.pracSrc = { book: S.ver, n: +a }; go('practice'); },
  bcards(a) { S.deck = `B${S.ver}-${a}`; store.set('deck', S.deck); go('cards'); }
};
