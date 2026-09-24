import { bookId, booksOfVer } from '../content/books.js';
import { $ } from '../core/dom.js';
import { S } from '../core/state.js';
import { L, tr } from '../core/util.js';
import { py } from '../features/pinyin.js';

/* ======================================================================
   Dữ liệu học – tải theo nhu cầu.
   Trang đầu chỉ cần mục lục (books/index.json) và bảng đếm; mỗi cấp độ, mỗi quyển,
   mỗi chữ nét được tải khi người dùng mở tới, rồi giữ trong bộ nhớ cho các lần sau.
   ====================================================================== */
const BASE = '/data';
const WORDS = [];            /* gom dần theo cấp đã tải */
const WMAP = {};
const HANZI = [];            /* toàn bộ 3.000 chữ, tải một lần khi mở Thư viện hoặc Tập viết */
const HMAP = {};
const GRAM = [];             /* gom dần theo cấp */
const BOOKS = {};            /* id -> quyển (mục lục lúc đầu, đầy đủ sau khi nạp) */
const STROKES = {};          /* chữ -> dữ liệu nét */
let COUNTS = {};             /* ver -> cấp -> {w,h,g} từ coverage.json */
let STROKE_SET = new Set();
const loaded = new Set();
const inflight = new Map();

async function getJson(path) {
  if (inflight.has(path)) return inflight.get(path);
  const p = fetch(BASE + path, { cache: 'force-cache' }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`); return r.json(); })
    .finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}
const once = (key, fn) => (loaded.has(key) ? Promise.resolve() : fn().then(() => { loaded.add(key); }));

function addWords(rows) {
  rows.forEach(r => {
    const w = { i: r[0], s: r[1], sy: r[2].split(' '), tn: [...r[3]].map(Number), l21: r[4], l25: r[5], en: r[6], vi: r[7], hv: r[8], l20: r[9] };
    if (!WMAP[w.s]) { WMAP[w.s] = w; WORDS.push(w); }
  });
  Object.keys(levelCache).forEach(k => delete levelCache[k]);
}
/** Mục lục sách, bảng đếm và danh sách chữ có nét: nhỏ, nạp lúc khởi động. */
export const loadIndex = () => once('index', async () => {
  const idx = await getJson('/index.json');
  COUNTS = idx.counts;
  STROKE_SET = new Set(idx.strokes);
  Object.entries(idx.books).forEach(([id, b]) => { if (!BOOKS[id] || !BOOKS[id].lessons[0].words) BOOKS[id] = b; });
  addWords(idx.sampleWords || []);
});
export const loadWords = (ver, n) => once(`w:${ver}:${n}`, async () => addWords(await getJson(`/words/${ver}-${n}.json`)));
export const loadHanzi = () => once('hanzi', async () => {
  (await getJson('/hanzi.json')).forEach(r => { const h = { c: r[0], l21: r[1], py: r[2], tn: r[3], sc: r[4], hv: r[5] }; HANZI.push(h); HMAP[h.c] = h; });
  Object.keys(hanziCache).forEach(k => delete hanziCache[k]);
});
export const loadGrammar = n => once(`g:${n}`, async () => { (await getJson(`/grammar/${n}.json`)).forEach(g => GRAM.push(g)); });
export const loadBook = id => once(`b:${id}`, async () => {
  const b = await getJson(`/books/${id}.json`);
  BOOKS[id] = b;
  /* từ riêng của sách (你好, tên riêng…) không nằm trong danh sách chuẩn: đưa vào bảng tra để thẻ nhớ hiển thị được */
  b.lessons.forEach(L => [...L.words, ...L.extra, ...L.proper].forEach(w => { if (!WMAP[w.s]) WMAP[w.s] = w; }));
});
export const loadStroke = c => (STROKES[c] ? Promise.resolve(STROKES[c])
  : !STROKE_SET.has(c) ? Promise.resolve(null)
  : getJson(`/strokes/${encodeURIComponent(c)}.json`).then(d => (STROKES[c] = d)));
export const hasStroke = c => STROKE_SET.has(c);
export const strokeCount = c => (STROKES[c] ? STROKES[c].strokes.length : (HMAP[c] && HMAP[c].sc) || 0);
export const levelCount = (kind, n, ver = S.ver) => ((COUNTS[ver] || {})[n] || {})[kind] || 0;

/** Trang nào cần dữ liệu gì; trả về promise khi còn thiếu, null khi đã đủ.
   Phải trả null khi đủ: render() gọi lại chính nó sau khi chờ, nếu lúc nào cũng có promise thì lặp vô hạn. */
export function needsFor(route) {
  const jobs = [];
  const want = (key, fn) => { if (!loaded.has(key)) jobs.push(fn()); };
  const ver = S.ver, lv = S.bookLv;
  const wantBook = (v, l) => want(`b:${bookId(v, l)}`, () => loadBook(bookId(v, l)));
  const wantWords = (v, n) => want(`w:${v}:${n}`, () => loadWords(v, n));
  if (route === 'library') {
    wantWords(ver, S.lib.lvl); want('hanzi', loadHanzi);
    if (ver === '20') { if (BOOKS[bookId('20', S.lib.lvl)]) wantBook('20', S.lib.lvl); }
    else want(`g:${S.lib.lvl}`, () => loadGrammar(S.lib.lvl));
  } else if (route === 'book') {
    wantBook(ver, lv); want('hanzi', loadHanzi);
  } else if (route === 'practice') {
    const src = S.pracSrc;
    if (src && src.book) booksOfVer(src.book).filter(x => x <= (src.lv || 1)).forEach(x => wantBook(src.book, x));
    else if (src && src.lvl) wantWords(src.ver || ver, src.lvl);
    else wantWords('20', 1);
  } else if (route === 'cards') {
    const d = S.deck || '';
    if (d.startsWith('B')) { const pre = d.slice(1).split('-')[0]; const v = pre.slice(0, 2), l = pre.includes('b') ? +pre.split('b')[1] : 1; wantBook(v, l); }
    else if (d.startsWith('L')) wantWords(ver, +d.slice(1));
    else if (d !== 'D') wantWords('20', 1);
  } else if (route === 'lesson' || route === 'home') {
    wantWords('20', 1);      /* bài mẫu và chữ 中 ở trang chủ dùng từ HSK 1 */
  }
  return jobs.length ? Promise.all(jobs) : null;
}

const lvsFor = (ver = S.ver) => (ver === '20' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7]);
const verName = (ver = S.ver) => (ver === '20' ? 'HSK 2.0' : 'HSK 3.0');
const lvName = n => (n === 7 ? '7–9' : String(n));
const wLevel = (w, ver = S.ver) => (ver === '20' ? w.l20 : w.l25);
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
  const B = typeof BOOKS !== 'undefined' && BOOKS[`hsk20_${n}`];
  if (!B) return [];
  return B.lessons.flatMap(L => L.grammar.map((g, i) => ({ code: `B${L.n}.${i + 1}`, l21: 1, cat: [tr(`Bài ${L.n}: ${L.zh}`, `Lesson ${L.n}: ${L.zh}`)], zh: g.zh, vi: g.vi, note: g.note, ex: g.ex })));
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

export { BASE, BOOKS, CAT_VI, COUNTS, GRAM, HANZI, HMAP, STROKES, STROKE_SET, WMAP, WORDS, addWords, catName, fold, getJson, hanziCache, inflight, levelCache, levelGram, levelHanzi, levelWords, loaded, lvName, lvsFor, meaning, once, pyPairs, searchIdx, shortEn, verName, wLevel, wordMatches };
