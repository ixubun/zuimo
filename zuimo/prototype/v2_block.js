/* =====================================================================
   Kho dữ liệu HSK 3.0 (sinh bởi content-pipeline/build_content.py)
   DB.w: [chữ, pinyin theo âm tiết, chuỗi thanh, cấp 2021, cấp 2025, EN, VI, Hán Việt]
   DB.h: [chữ, cấp 2021, pinyin, thanh, số nét, Hán Việt]
   DB.g: điểm ngữ pháp { code, l21, cat[], zh, vi?, note?, ex[{zh, py, vi?, k?}] }
   ===================================================================== */
const DB = __DB__;
const WORDS = DB.w.map((r, i) => ({ i, s: r[0], sy: r[1].split(' '), tn: [...r[2]].map(Number), l21: r[3], l25: r[4], en: r[5], vi: r[6], hv: r[7], l20: r[8] }));
const WMAP = {};
WORDS.forEach(w => { if (!WMAP[w.s]) WMAP[w.s] = w; });
/* Cụm từ riêng của bài học (ví dụ 你好) không nằm trong danh sách chuẩn: thêm vào bảng tra để bộ thẻ Bài 1 đủ từ */
VOCAB.forEach(v => {
  if (!WMAP[v.h]) WMAP[v.h] = { i: -1, s: v.h, sy: v.py.map(x => x[0].trim()), tn: v.py.map(x => x[1]), vi: v.vi, en: v.en, hv: v.hv, l21: 0, l25: 0, l20: 0 };
});
const HANZI = DB.h.map(r => ({ c: r[0], l21: r[1], py: r[2], tn: r[3], sc: r[4], hv: r[5] }));
const GRAM = DB.g;
/* Hai phiên bản đồng bộ với hai giáo trình: '20' = đề cương HSK 2.0 (6 cấp), '30' = đề cương HSK 3.0 áp dụng 2026 (cấp 7–9 gộp) */
const lvsFor = (ver = S.ver) => (ver === '20' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7]);
const verName = (ver = S.ver) => (ver === '20' ? 'HSK 2.0' : 'HSK 3.0');
const lvName = n => (n === 7 ? '7–9' : String(n));
const wLevel = (w, ver = S.ver) => (ver === '20' ? w.l20 : w.l25);
const HMAP = Object.fromEntries(HANZI.map(h => [h.c, h]));
const pyPairs = w => w.sy.map((s, k) => [s, w.tn[k]]);
const shortEn = en => (en || '').split(';').slice(0, 2).join(';').trim();
const meaning = w => (S.lang === 'vi' && w.vi ? w.vi : shortEn(w.en));
/* bỏ dấu để tìm kiếm: "xin chao", "nihao", "pengyou" đều khớp */
const fold = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();

const levelCache = {};
function levelWords(n, ver = S.ver) {
  const k = ver + ':' + n;
  return levelCache[k] || (levelCache[k] = WORDS.filter(w => wLevel(w, ver) === n));
}
/* Chữ Hán theo cấp: HSK 3.0 dùng bảng chữ chuẩn 2021; HSK 2.0 không có bảng chữ riêng nên tách từ từ vựng từng cấp */
const hanziCache = {};
function levelHanzi(n, ver = S.ver) {
  if (ver !== '20') return HANZI.filter(h => h.l21 === n);
  if (hanziCache[n]) return hanziCache[n];
  const seen = new Set(), out = [];
  for (let k = 1; k < n; k++) levelWords(k, '20').forEach(w => [...w.s].forEach(c => seen.add(c)));
  levelWords(n, '20').forEach(w => [...w.s].forEach(c => {
    if (/[\u3400-\u9fff]/.test(c) && !seen.has(c)) { seen.add(c); out.push(HMAP[c] || { c, py: '', tn: 5, sc: 0, hv: '' }); }
  }));
  return (hanziCache[n] = out);
}
/* Ngữ pháp theo cấp: HSK 3.0 tham chiếu 572 điểm chuẩn 2021; HSK 2.0 cấp 1 lấy từ giáo trình, các cấp khác chờ giáo trình */
function levelGram(n, ver = S.ver) {
  if (ver !== '20') return GRAM.filter(g => g.l21 === n);
  if (n !== 1 || typeof BOOKS === 'undefined') return [];
  return BOOKS.hsk20_1.lessons.flatMap(L => L.grammar.map((g, i) => ({ code: `B${L.n}.${i + 1}`, l21: 1, cat: [tr(`Bài ${L.n}: ${L.zh}`, `Lesson ${L.n}: ${L.zh}`)], zh: g.zh, vi: g.vi, note: g.note, ex: g.ex })));
}

let searchIdx = null; /* dựng lười ở lần tìm đầu tiên để trang mở nhanh */
function wordMatches(list, q) {
  if (!q || !q.trim()) return list;
  if (!searchIdx) searchIdx = WORDS.map(w => `${w.s}|${fold(w.sy.join(''))}|${fold(w.sy.join(' '))}|${fold(w.vi)}|${(w.en || '').toLowerCase()}|${fold(w.hv)}`);
  const a = fold(q.trim()), b = a.replace(/\s+/g, '');
  return list.filter(w => { const t = searchIdx[w.i]; return t.includes(a) || (b.length > 1 && t.includes(b)); });
}

const CAT_VI = {
  '主语': 'Chủ ngữ', '介词': 'Giới từ', '代词': 'Đại từ', '假设复句': 'Câu phức giả thiết', '关联副词': 'Phó từ liên kết',
  '其他': 'Khác', '前缀': 'Tiền tố', '副词': 'Phó từ', '功能类型': 'Theo chức năng', '动作的态': 'Trạng thái của hành động',
  '动词': 'Động từ', '助词': 'Trợ từ', '单句': 'Câu đơn', '口语格式': 'Cấu trúc khẩu ngữ', '句型': 'Mẫu câu',
  '句子成分': 'Thành phần câu', '句子的类型': 'Các loại câu', '句类': 'Kiểu câu theo mục đích', '句群': 'Nhóm câu',
  '叹词': 'Thán từ', '名词': 'Danh từ', '后缀': 'Hậu tố', '否定副词': 'Phó từ phủ định', '四字格': 'Cụm bốn chữ',
  '因果复句': 'Câu phức nhân quả', '固定格式': 'Cấu trúc cố định', '固定短语': 'Cụm từ cố định', '复句': 'Câu phức',
  '多重复句': 'Câu phức nhiều tầng', '定语': 'Định ngữ', '宾语': 'Tân ngữ', '并列复句': 'Câu phức đẳng lập',
  '引出凭借、依据': 'Dẫn ra căn cứ', '引出对象': 'Dẫn ra đối tượng', '引出方向、路径': 'Dẫn ra hướng, đường đi',
  '引出施事、受事': 'Dẫn ra chủ thể, đối tượng chịu tác động', '引出时间': 'Dẫn ra thời gian',
  '引出时间、处所': 'Dẫn ra thời gian, nơi chốn', '引出目的、原因': 'Dẫn ra mục đích, nguyên nhân',
  '强调的方法': 'Cách nhấn mạnh', '形容词': 'Tính từ', '情态副词': 'Phó từ tình thái', '承接复句': 'Câu phức nối tiếp',
  '拟声词': 'Từ tượng thanh', '按形式分类': 'Theo hình thức', '按意义分类': 'Theo ý nghĩa', '提问的方法': 'Cách đặt câu hỏi',
  '数的表示法': 'Cách biểu thị số', '数词': 'Số từ', '方式副词': 'Phó từ cách thức', '时间副词': 'Phó từ thời gian',
  '时间表示法': 'Cách biểu thị thời gian', '条件复句': 'Câu phức điều kiện', '特殊句型': 'Mẫu câu đặc biệt',
  '特殊句式': 'Kiểu câu đặc biệt', '特殊表达法': 'Cách diễn đạt đặc biệt', '状语': 'Trạng ngữ', '目的复句': 'Câu phức mục đích',
  '短语': 'Cụm từ', '程度副词': 'Phó từ mức độ', '类前缀': 'Gần tiền tố', '类后缀': 'Gần hậu tố', '紧缩复句': 'Câu phức rút gọn',
  '结构助词': 'Trợ từ kết cấu', '结构类型': 'Theo cấu trúc', '范围、协同副词': 'Phó từ phạm vi, cùng nhau', '补语': 'Bổ ngữ',
  '表示排除': 'Biểu thị loại trừ', '解说复句': 'Câu phức giải thích', '让步复句': 'Câu phức nhượng bộ', '词类': 'Từ loại',
  '语气副词': 'Phó từ ngữ khí', '语气助词': 'Trợ từ ngữ khí', '语素': 'Hình vị', '谓语': 'Vị ngữ', '转折复句': 'Câu phức chuyển ý',
  '连词': 'Liên từ', '选择复句': 'Câu phức lựa chọn', '递进复句': 'Câu phức tăng tiến', '量词': 'Lượng từ',
  '频率、重复副词': 'Phó từ tần suất, lặp lại'
};
const catName = cat => cat.map(c => (S.lang === 'vi' && CAT_VI[c]) || c).join(' / ');

/* ---------- Thư viện ---------- */
const PAGE = 60;
function renderLibrary() {
  const lb = S.lib, n = lb.lvl;
  const tabs = [
    ['words', tr('Từ vựng', 'Vocabulary'), levelWords(n).length],
    ['hanzi', tr('Chữ Hán', 'Characters'), levelHanzi(n).length],
    ['grammar', tr('Ngữ pháp', 'Grammar'), levelGram(n).length]
  ];
  view.innerHTML = `
  <div class="lhead"><h1>${tr('Thư viện HSK', 'HSK library')}</h1></div>
  ${verSeg()}
  <p class="vernote">${S.ver === '20'
    ? tr('Đề cương HSK 2.0 (6 cấp: 150, 150, 300, 600, 1.300, 2.500 từ), khớp với bộ Giáo trình chuẩn HSK. Ngữ pháp cấp 1 lấy theo từng bài của giáo trình.', 'HSK 2.0 syllabus (6 levels), matching the HSK Standard Course. Level 1 grammar follows the textbook lessons.')
    : tr('Đề cương HSK 3.0 áp dụng từ 07/2026 (HSK 1 khoảng 300 từ), khớp với bộ 新HSK教程. Chữ Hán và ngữ pháp tham chiếu chuẩn GF0025-2021, nền tảng của HSK 3.0.', 'HSK 3.0 syllabus effective July 2026, matching 新HSK教程. Characters and grammar reference the GF0025-2021 standard.')}</p>
  <div class="lvlbar" role="group" aria-label="${tr('Cấp độ', 'Level')}">
    ${lvsFor().map(k => `<button class="lchip" data-act="lvl" data-arg="${k}" aria-pressed="${k === n}"><b>HSK ${lvName(k)}</b><span>${num(levelWords(k).length)} ${tr('từ', 'words')}</span></button>`).join('')}
  </div>
  <div class="tabs" role="tablist">
    ${tabs.map(([k, l, c]) => `<button class="tab" role="tab" data-act="libtab" data-arg="${k}" aria-selected="${lb.tab === k}">${l}<span class="cnt">${num(c)}</span></button>`).join('')}
  </div>
  <div class="libtools">
    <div class="searchbox">${ic('search')}
      <label class="sr" for="libQ">${tr('Tìm kiếm', 'Search')}</label>
      <input class="inp" id="libQ" type="search" autocomplete="off" value="${esc(lb.q)}" placeholder="${lb.tab === 'grammar' ? tr('Tìm điểm ngữ pháp, ví dụ 比 hoặc so sánh', 'Search grammar, e.g. 比') : tr('Tìm chữ Hán, pinyin hoặc nghĩa', 'Search characters, pinyin or meaning')}">
    </div>
    ${lb.tab === 'words' ? `<button class="btn btn-sm" data-act="lvlprac" data-arg="${n}">${ic('target')}${tr('Luyện tập', 'Practice')}</button>
    <button class="btn btn-ghost btn-sm" data-act="lvlcards" data-arg="${n}">${ic('cards')}${tr('Ôn thẻ', 'Flashcards')}</button>` : ''}
  </div>
  <div id="libRes"></div>`;
  renderLibResults();
}
function renderLibResults() {
  const box = $('#libRes');
  if (!box) return;
  releaseWriters();
  const n = S.lib.lvl;
  if (S.lib.tab === 'words') box.innerHTML = libWords(n);
  else if (S.lib.tab === 'hanzi') { box.innerHTML = libHanzi(n); mountLibWriter(); }
  else box.innerHTML = libGrammar(n);
}
function libWords(n) {
  const all = wordMatches(levelWords(n), S.lib.q);
  if (!all.length) return `<p class="empty-note">${tr('Không có từ nào khớp. Thử gõ pinyin không dấu, ví dụ "pengyou", hoặc nghĩa tiếng Việt không dấu.', 'No matching words. Try pinyin without tones, e.g. "pengyou".')}</p>`;
  const pages = Math.ceil(all.length / PAGE);
  const pg = Math.min(Math.max(S.lib.page, 0), pages - 1);
  S.lib.page = pg;
  const other = S.ver === '20' ? 'l25' : 'l20';
  const otherName = S.ver === '20' ? 'HSK 3.0' : 'HSK 2.0';
  const rows = all.slice(pg * PAGE, (pg + 1) * PAGE);
  return `<p class="hint">${num(all.length)} ${tr('từ', 'words')}${pages > 1 ? `, ${tr('trang', 'page')} ${pg + 1}/${pages}` : ''}</p>
  <div class="wlist">${rows.map(w => `<div class="wrow">
    <button class="icon-btn spk-b" data-act="speak" data-arg="${w.s}" aria-label="${tr('Nghe', 'Listen to')} ${w.s}">${ic('volume')}</button>
    <span class="wz" lang="zh-CN">${w.s}</span>
    <span class="wp">${py(pyPairs(w))}</span>
    <span class="wm">${esc(meaning(w))}${S.lang === 'vi' && !w.vi ? `<span class="en-tag" title="${tr('Nghĩa tiếng Việt đang được biên soạn', '')}">EN</span>` : ''}${S.lang === 'vi' && w.hv ? `<small>${esc(w.hv)}</small>` : ''}</span>
    <span class="wlv">${w[other] ? `${otherName}: HSK ${lvName(w[other])}` : ''}</span>
  </div>`).join('')}</div>
  ${pages > 1 ? `<div class="pager">
    <button class="btn btn-ghost btn-sm" data-act="page" data-arg="-1" ${pg === 0 ? 'disabled' : ''}>${ic('back')}${tr('Trước', 'Prev')}</button>
    <span>${pg + 1} / ${pages}</span>
    <button class="btn btn-ghost btn-sm" data-act="page" data-arg="1" ${pg >= pages - 1 ? 'disabled' : ''}>${tr('Sau', 'Next')}${ic('chev')}</button>
  </div>` : ''}`;
}
function libHanzi(n) {
  const q = S.lib.q.trim(), fq = fold(q);
  const list = levelHanzi(n).filter(h => !q || q.includes(h.c) || fold(h.py).startsWith(fq) || fold(h.hv) === fq);
  if (!list.length) return `<p class="empty-note">${tr('Không có chữ nào khớp.', 'No matching characters.')}</p>`;
  if (!list.some(h => h.c === S.lib.char)) S.lib.char = list[0].c;
  const h = list.find(x => x.c === S.lib.char);
  const has = !!CHAR_DATA[h.c];
  const related = WORDS.filter(w => w.s.length > 1 && w.s.includes(h.c) && wLevel(w) && wLevel(w) <= n).slice(0, 8);
  return `<p class="hint">${S.ver === '20' ? tr('HSK 2.0 không có bảng chữ riêng: đây là các chữ xuất hiện lần đầu trong từ vựng của cấp này.', 'Characters appearing for the first time in this level’s vocabulary.') : tr('Danh sách chữ theo chuẩn 2021 (đề cương 2026 chưa tách chữ theo cấp).', 'Character list of the 2021 standard.')}</p>
  <div class="card hzpanel">
    <div class="gbox md">${gridSvg()}${has ? '<div class="writer" id="libW"></div>' : `<div class="hzstatic" lang="zh-CN">${h.c}</div>`}</div>
    <div class="winfo">
      <div class="big-py">${py([[h.py, h.tn]])}</div>
      ${S.lang === 'vi' && h.hv ? `<div class="m">${tr('Hán Việt', 'Sino-Vietnamese')}: ${esc(h.hv)}</div>` : ''}
      <div class="meta">${h.sc ? `${h.sc} ${tr('nét', 'strokes')}. ` : ''}${has ? tr('Phần tô đỏ là bộ thủ.', 'The red part is the radical.') : ''}</div>
      ${has ? `<div class="wbtns">
          <button class="btn btn-ghost btn-sm" data-act="wanim">${ic('play')}${tr('Xem cách viết', 'Show strokes')}</button>
          <button class="btn btn-sm" data-act="wquiz">${ic('pen')}${tr('Tự viết', 'Write it')}</button>
          <button class="icon-btn spk-b" data-act="speak" data-arg="${h.c}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button>
        </div><div class="wstatus" id="wStatus" aria-live="polite"></div>`
      : `<p class="hint">${tr('Bản chính thức tải dữ liệu nét của mọi chữ theo nhu cầu. Bản demo chỉ nhúng sẵn các chữ HSK 1.', 'The full version loads stroke data on demand; this demo bundles HSK 1 characters only.')}</p>
         <button class="icon-btn spk-b" data-act="speak" data-arg="${h.c}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button>`}
      ${related.length ? `<div class="hzwords">${related.map(w => `<button class="chipw" data-act="speak" data-arg="${w.s}"><span class="zh" lang="zh-CN">${w.s}</span><small>${esc(meaning(w))}</small></button>`).join('')}</div>` : ''}
    </div>
  </div>
  <div class="hzgrid">${list.map(x => `<button class="hz ${x.c === h.c ? 'on' : ''}" data-act="hz" data-arg="${x.c}" aria-pressed="${x.c === h.c}"><span class="zh" lang="zh-CN">${x.c}</span><small class="t${x.tn}">${esc(x.py)}</small></button>`).join('')}</div>`;
}
function libGrammar(n) {
  const raw = S.lib.q.trim(), q = fold(raw);
  const list = levelGram(n).filter(g => !q || fold(g.zh).includes(q) || fold(g.vi).includes(q) || fold(g.note).includes(q) || g.code.includes(raw) || g.ex.some(e => e.zh.includes(raw)));
  if (!levelGram(n).length) return `<p class="empty-note">${tr(`Ngữ pháp HSK 2.0 cấp ${n} sẽ được bổ sung khi có giáo trình tương ứng.`, 'Grammar for this level will be added with its textbook.')}</p>`;
  if (!list.length) return `<p class="empty-note">${tr('Không có điểm ngữ pháp nào khớp.', 'No matching grammar points.')}</p>`;
  const noVi = S.lang === 'vi' && !list.some(g => g.vi);
  const refNote = S.ver === '30' ? `<p class="hint">${tr('Đây là ngữ pháp tham chiếu theo cấp. Ngữ pháp theo từng bài của giáo trình 新HSK教程 nằm trong mục Bài học.', 'Reference grammar by level; per-lesson grammar is in Lessons.')}</p>` : '';
  let last = '';
  return `${refNote}${noVi ? `<div class="note" style="margin:0 0 12px"><p>${tr('Giải thích tiếng Việt cho cấp này đang được biên soạn. Hiện đã có tên điểm ngữ pháp gốc, pinyin và toàn bộ câu ví dụ theo chuẩn.', '')}</p></div>` : ''}
  <div>${list.map(g => {
    const cat = g.cat.join('/');
    const head = cat !== last ? `<h3 class="gcat">${esc(catName(g.cat))}</h3>` : '';
    last = cat;
    const title = S.lang === 'vi' && g.vi ? `<b>${esc(g.vi)}</b><span class="zh">${esc(g.zh)}</span>` : `<b class="zh">${esc(g.zh)}</b>`;
    return head + `<details class="gp"><summary><span class="gcode" title="${esc(g.code)}">#${esc(g.code.replace(/^\D+/, ''))}</span><span class="gt">${title}</span>${ic('chev', 'gchev')}</summary>
      <div class="gbody">
        ${S.lang === 'vi' && g.note ? `<p class="gnote">${esc(g.note)}</p>` : ''}
        <ul class="exs">${g.ex.map(e => e.k === 'h'
          ? `<li class="exh" lang="zh-CN">${esc(e.zh)}</li>`
          : `<li><button class="icon-btn spk-b" data-act="speak" data-arg="${esc(e.zh)}" aria-label="${tr('Nghe', 'Listen')}">${ic('volume')}</button><div><span class="zh" lang="zh-CN">${esc(e.zh)}</span><span class="p">${esc(e.py || '')}</span>${S.lang === 'vi' && e.vi ? `<span class="tr">${esc(e.vi)}</span>` : ''}</div></li>`).join('')}</ul>
      </div></details>`;
  }).join('')}</div>`;
}

const LIB_ACT = {
  ver(a) {
    S.ver = a; store.set('ver', a); S.lib.page = 0; S.lib.char = null;
    if (!lvsFor().includes(S.lib.lvl)) S.lib.lvl = lvsFor().slice(-1)[0];
    if (S.deck && S.deck.startsWith('B')) S.deck = `B${a}-1`;
    render({ keepScroll: true });
  },
  lvl(a) { Object.assign(S.lib, { lvl: +a, page: 0, char: null }); store.set('lib', { lvl: S.lib.lvl, tab: S.lib.tab }); render({ keepScroll: true }); },
  libtab(a) { Object.assign(S.lib, { tab: a, q: '', page: 0 }); store.set('lib', { lvl: S.lib.lvl, tab: a }); render({ keepScroll: true }); },
  golvl(a) { Object.assign(S.lib, { lvl: +a, tab: 'words', q: '', page: 0, char: null }); store.set('lib', { lvl: +a, tab: 'words' }); go('library'); },
  page(a) {
    S.lib.page += +a;
    renderLibResults();
    const top = $('#libRes').getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  },
  hz(a) {
    S.lib.char = a;
    renderLibResults();
    const top = $('#libRes').getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  },
  lvlprac(a) { S.pracSrc = { lvl: +a, ver: S.ver }; go('practice'); },
  lvlcards(a) { S.deck = 'L' + a; store.set('deck', S.deck); go('cards'); }
};

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
   Bản chính thức: Better Auth trên server, mật khẩu băm scrypt/argon2, mã mời kiểm tra trong PostgreSQL,
   Zalo OAuth v4 + PKCE. Ở đây chỉ mô phỏng luồng để duyệt trải nghiệm. */
const INVITES = ['ZUIMO-DEMO-2026'];
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
const validInvite = code => INVITES.includes(code.trim().toUpperCase());

function renderLogin() {
  if (S.user) {
    const u = S.user;
    view.innerHTML = `<div class="auth"><div class="card auth-card">
      <div class="profile"><span class="av-lg">${esc(u.name.charAt(0).toUpperCase())}</span>
        <div><div class="stat"><div><div class="big" style="font-size:22px">${esc(u.name)}</div><div class="sub">${u.username ? '@' + esc(u.username) : ''} ${u.method === 'zalo' ? tr('đăng nhập bằng Zalo', 'signed in with Zalo') : tr('đăng nhập bằng mật khẩu', 'signed in with password')}</div></div></div></div>
      </div>
      <p class="hint">${tr('Tiến độ học hiện vẫn lưu trên trình duyệt. Ở giai đoạn 1, tiến độ sẽ đồng bộ theo tài khoản trên server.', 'Progress is still stored in this browser. From phase 1 it syncs to your account.')}</p>
      <button class="btn btn-ghost btn-block" data-act="logout">${tr('Đăng xuất', 'Sign out')}</button>
    </div></div>`;
    return;
  }
  const isReg = S.authTab === 'register';
  view.innerHTML = `<div class="auth"><div class="card auth-card">
    <div class="brand big"><span class="mark" aria-hidden="true">Z</span>ZUIMO</div>
    <p class="demo-flag">${tr('Bản demo giao diện. Tài khoản chỉ lưu trên trình duyệt này.', 'Interface demo. Accounts are stored in this browser only.')}</p>
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-act="authtab" data-arg="login" aria-selected="${!isReg}">${tr('Đăng nhập', 'Sign in')}</button>
      <button class="tab" role="tab" data-act="authtab" data-arg="register" aria-selected="${isReg}">${tr('Đăng ký', 'Sign up')}</button>
    </div>
    ${isReg ? `
      ${field('aCode', tr('Mã mời', 'Invite code'), 'text', 'off', tr('ZUIMO đang mở giới hạn, cần mã mời để tạo tài khoản. Mã dùng thử: ZUIMO-DEMO-2026', 'ZUIMO is invite-only. Demo code: ZUIMO-DEMO-2026'))}
      <button class="btn btn-zalo btn-block" data-act="zalo" data-arg="register">${tr('Đăng ký bằng Zalo', 'Sign up with Zalo')}</button>
      <div class="orline">${tr('hoặc tạo tài khoản bằng mật khẩu', 'or create a password account')}</div>
      ${field('aName', tr('Tên hiển thị', 'Display name'), 'text', 'name')}
      ${field('aUser', tr('Tên đăng nhập', 'Username'), 'text', 'username', tr('3–24 ký tự: chữ thường, số, dấu chấm hoặc gạch dưới.', '3–24 characters: lowercase letters, digits, dot or underscore.'))}
      ${field('aPass', tr('Mật khẩu', 'Password'), 'password', 'new-password', tr('Tối thiểu 8 ký tự.', 'At least 8 characters.'))}
      ${field('aPass2', tr('Nhập lại mật khẩu', 'Confirm password'), 'password', 'new-password')}
      <button class="btn btn-block" id="authSubmit" data-act="register">${tr('Tạo tài khoản', 'Create account')}</button>`
    : `
      <button class="btn btn-zalo btn-block" data-act="zalo" data-arg="login">${tr('Đăng nhập bằng Zalo', 'Sign in with Zalo')}</button>
      <div class="orline">${tr('hoặc', 'or')}</div>
      ${field('aUser', tr('Tên đăng nhập', 'Username'), 'text', 'username')}
      ${field('aPass', tr('Mật khẩu', 'Password'), 'password', 'current-password')}
      <button class="btn btn-block" id="authSubmit" data-act="login">${tr('Đăng nhập', 'Sign in')}</button>
      <p class="auth-foot"><button class="linkbtn" data-act="forgot">${tr('Quên mật khẩu?', 'Forgot password?')}</button></p>`}
  </div></div>`;
}
function signIn(u) {
  S.user = u; S.authTab = 'login'; store.set('user', u);
  toast(tr(`Chào ${u.name}!`, `Welcome, ${u.name}!`));
  go('home');
}
const AUTH_ACT = {
  authtab(a) { S.authTab = a; render({ keepScroll: true }); },
  zalo(a) {
    if (a === 'register' && !validInvite(val('aCode'))) {
      setErr('aCode', val('aCode').trim() ? tr('Mã mời không hợp lệ hoặc đã hết lượt dùng.', 'Invalid or used-up invite code.') : tr('Nhập mã mời trước khi đăng ký bằng Zalo.', 'Enter an invite code first.'));
      $('#aCode').focus();
      return;
    }
    toast(tr('Đăng nhập Zalo cần domain đã xác minh trên Zalo for Developers, nên sẽ chạy thật khi triển khai giai đoạn 1.', 'Zalo login needs a verified domain, so it goes live with the phase 1 deployment.'));
  },
  async login() {
    const u = val('aUser').trim().toLowerCase(), p = val('aPass');
    let bad = false;
    if (!u) { setErr('aUser', tr('Nhập tên đăng nhập.', 'Enter your username.')); bad = true; }
    if (!p) { setErr('aPass', tr('Nhập mật khẩu.', 'Enter your password.')); bad = true; }
    if (bad) return;
    const rec = store.get('users', {})[u];
    if (!rec || rec.hash !== await hashPw(p, rec.salt)) { setErr('aPass', tr('Tên đăng nhập hoặc mật khẩu không đúng.', 'Wrong username or password.')); return; }
    signIn({ name: rec.name, username: u, method: 'password' });
  },
  async register() {
    const code = val('aCode'), name = val('aName').trim(), u = val('aUser').trim().toLowerCase(), p = val('aPass'), p2 = val('aPass2');
    const users = store.get('users', {});
    const errs = {};
    if (!validInvite(code)) errs.aCode = code.trim() ? tr('Mã mời không hợp lệ hoặc đã hết lượt dùng.', 'Invalid or used-up invite code.') : tr('Nhập mã mời.', 'Enter an invite code.');
    if (!name) errs.aName = tr('Nhập tên hiển thị.', 'Enter a display name.');
    if (!/^[a-z0-9._]{3,24}$/.test(u)) errs.aUser = tr('Tên đăng nhập gồm 3–24 ký tự: chữ thường, số, dấu chấm hoặc gạch dưới.', 'Use 3–24 lowercase letters, digits, dots or underscores.');
    else if (users[u]) errs.aUser = tr('Tên đăng nhập này đã có người dùng.', 'That username is taken.');
    if (p.length < 8) errs.aPass = tr('Mật khẩu cần tối thiểu 8 ký tự.', 'Password needs at least 8 characters.');
    if (p2 !== p) errs.aPass2 = tr('Hai mật khẩu chưa khớp nhau.', 'Passwords do not match.');
    Object.entries(errs).forEach(([k, m]) => setErr(k, m));
    if (Object.keys(errs).length) { $('#' + Object.keys(errs)[0]).focus(); return; }
    const salt = Math.random().toString(36).slice(2);
    users[u] = { name, salt, hash: await hashPw(p, salt), created: Date.now(), invite: code.trim().toUpperCase() };
    store.set('users', users);
    signIn({ name, username: u, method: 'password' });
  },
  forgot() {
    toast(tr('Chưa có mail server nên quản trị viên sẽ tạo link đặt lại mật khẩu dùng một lần trong trang quản trị và gửi cho bạn.', 'Without a mail server, an admin creates a one-time reset link for you.'));
  },
  logout() { S.user = null; S.authTab = 'login'; store.del('user'); toast(tr('Đã đăng xuất.', 'Signed out.')); render(); }
};

/* ---------- Nguồn dữ liệu và giấy phép ---------- */
function renderAbout() {
  const src = [
    ['complete-hsk-vocabulary', 'MIT', tr('Từ vựng HSK 3.0 (cả hai phiên bản), pinyin, bộ thủ, từ loại', 'HSK 3.0 vocabulary, pinyin, radicals, parts of speech'), 'https://github.com/drkameleon/complete-hsk-vocabulary'],
    ['CC-CEDICT', 'CC BY-SA 4.0', tr('Nghĩa tiếng Anh, qua complete-hsk-vocabulary', 'English meanings, via complete-hsk-vocabulary'), 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict'],
    ['krmanik/HSK-3.0', tr('Theo từng nguồn gốc', 'Per upstream source'), tr('Danh sách từ, chữ Hán và 572 điểm ngữ pháp theo chuẩn GF0025-2021', 'Word, character and grammar lists of GF0025-2021'), 'https://github.com/krmanik/HSK-3.0'],
    ['hanviet-pinyin-words', 'MIT', tr('Âm Hán Việt theo từng cách đọc', 'Sino-Vietnamese readings'), 'https://github.com/ph0ngp/hanviet-pinyin-words'],
    ['Hanzi Writer', 'MIT', tr('Hoạt ảnh và chấm thứ tự nét', 'Stroke animation and quizzes'), 'https://github.com/chanind/hanzi-writer'],
    ['Make Me a Hanzi', 'Arphic Public License', tr('Dữ liệu nét chữ', 'Stroke data'), 'https://github.com/skishore/makemeahanzi'],
    ['pypinyin, jieba', 'MIT', tr('Sinh pinyin cho câu ví dụ', 'Pinyin for example sentences'), 'https://github.com/mozillazg/python-pinyin']
  ];
  view.innerHTML = `<div class="lhead"><h1>${tr('Nguồn dữ liệu và giấy phép', 'Data sources and licences')}</h1></div>
  <p class="lead">${tr('Nghĩa tiếng Việt, giải thích ngữ pháp, bản dịch ví dụ và bài học do ZUIMO tự biên soạn. Dữ liệu dưới đây đến từ các dự án mở; phần có nguồn gốc CC BY-SA được chia sẻ lại theo cùng giấy phép.', 'Vietnamese meanings, grammar notes, translations and lessons are written by ZUIMO. The data below comes from open projects; CC BY-SA derived parts are shared under the same licence.')}</p>
  <div class="credits">${src.map(([n, l, d, u]) => `<div class="card"><a href="${u}" target="_blank" rel="noopener noreferrer">${esc(n)}</a><span class="lic">${esc(l)}</span><div class="hint">${esc(d)}</div></div>`).join('')}</div>`;
}
