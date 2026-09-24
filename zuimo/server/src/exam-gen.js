/**
 * Sinh đề thi HSK mô phỏng từ kho từ vựng, câu ví dụ và hội thoại của Zuimó.
 *
 * Cấu trúc bám đề chính thức HSK 2.0 (số phần, số câu, thời gian, thang điểm):
 *   HSK 1: Nghe 20 (4 phần, 15') + Đọc 20 (4 phần, 17')                     200 điểm, đỗ 120, nghe phát 2 lần
 *   HSK 2: Nghe 35 (4 phần, 25') + Đọc 25 (4 phần, 22')                     200 điểm, đỗ 120, nghe phát 2 lần
 *   HSK 3: Nghe 40 (4 phần, 35') + Đọc 30 (3 phần, 30') + Viết 10 (2 phần, 15')   300 điểm, đỗ 180, nghe phát 1 lần
 *   HSK 4: Nghe 45 (30') + Đọc 40 (40') + Viết 15 (25')                     300 điểm, đỗ 180
 *   HSK 5: Nghe 45 (30') + Đọc 45 (45') + Viết 10 (40')                     300 điểm, đỗ 180
 *   HSK 6: Nghe 50 (35') + Đọc 50 (50') + Viết 1 (45')                      300 điểm, đỗ 180
 * HSK 3.0 cấp 1–6 dùng cùng khung với kho từ 3.0; sẽ cập nhật khi CTI công bố định dạng chính thức (12/2026).
 *
 * Các dạng câu (kind) và cách chấm:
 *   tf_pic      nghe/đọc một từ hoặc câu, hình đúng hay sai                        ✓/✗
 *   pick_pic    nghe câu, chọn hình đúng trong 3                                    A–C
 *   dlg_pic     nghe hỏi-đáp, chọn hình đúng                                        A–C
 *   dlg_ans     nghe câu hỏi, chọn câu trả lời hợp lý                               A–C
 *   tf_stmt     nghe/đọc câu, phát biểu đưa ra đúng hay sai (đã đổi một từ)         ✓/✗
 *   match       ghép câu với hình / câu hỏi với câu đáp: kho chung A–F               chữ cái
 *   fill        điền từ vào chỗ trống, kho từ chung A–F                              chữ cái
 *   choice      đọc câu hỏi, chọn câu trả lời (3 lựa chọn)                           A–C
 *   order       sắp xếp các cụm thành câu                                            văn bản
 *   char        điền chữ theo pinyin cho sẵn                                        văn bản
 *   pic_sent    viết câu với hình và từ cho sẵn                                      văn bản (chấm tự động rút gọn)
 *   essay       viết đoạn ngắn với từ cho sẵn                                        văn bản (chấm tự động rút gọn)
 * Hình minh hoạ dùng emoji (data/emoji-map.json). Câu và từ có sẵn MP3 thì kèm đường dẫn, không thì giao diện đọc bằng TTS trình duyệt.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from './db.js';

const EMOJI = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'emoji-map.json'), 'utf8'));
delete EMOJI._note;
const CJK = /[\u3400-\u9fff]/;

/* ---------------------------------------------------------------- khung đề */
export const BLUEPRINTS = {
  1: { total: 200, pass: 120, plays: 2, sections: [
    { key: 'listening', minutes: 15, parts: [['tf_word', 5], ['pick_pic', 5], ['match_dlg_pic', 5], ['dlg_q', 5]] },
    { key: 'reading', minutes: 17, parts: [['rtf_word', 5], ['match_pic', 5], ['match_qa', 5], ['fill', 5]] }] },
  2: { total: 200, pass: 120, plays: 2, sections: [
    { key: 'listening', minutes: 25, parts: [['tf_pic', 10], ['match_dlg_pic', 10], ['dlg_q', 10], ['dlg_q_long', 5]] },
    { key: 'reading', minutes: 22, parts: [['match_pic', 5], ['fill', 5], ['rtf_stmt', 10], ['match_qa', 10]] }] },
  3: { total: 300, pass: 180, plays: 1, sections: [
    { key: 'listening', minutes: 35, parts: [['match_dlg_pic', 10], ['tf_stmt', 10], ['dlg_q', 10], ['dlg_q_long', 10]] },
    { key: 'reading', minutes: 30, parts: [['match_qa', 10], ['fill', 10], ['choice', 10]] },
    { key: 'writing', minutes: 15, parts: [['order', 5], ['char', 5]] }] },
  4: { total: 300, pass: 180, plays: 1, sections: [
    { key: 'listening', minutes: 30, parts: [['tf_stmt', 10], ['dlg_q', 15], ['dlg_q_long', 20]] },
    { key: 'reading', minutes: 40, parts: [['fill', 10], ['choice', 10], ['choice', 20]] },
    { key: 'writing', minutes: 25, parts: [['order', 10], ['pic_sent', 5]] }] },
  5: { total: 300, pass: 180, plays: 1, sections: [
    { key: 'listening', minutes: 30, parts: [['dlg_q', 20], ['dlg_q_long', 25]] },
    { key: 'reading', minutes: 45, parts: [['fill', 15], ['choice', 10], ['choice', 20]] },
    { key: 'writing', minutes: 40, parts: [['order', 8], ['essay', 2]] }] },
  6: { total: 300, pass: 180, plays: 1, sections: [
    { key: 'listening', minutes: 35, parts: [['dlg_q', 15], ['dlg_q_long', 15], ['dlg_q_long', 20]] },
    { key: 'reading', minutes: 50, parts: [['choice', 10], ['fill', 10], ['choice', 10], ['choice', 20]] },
    { key: 'writing', minutes: 45, parts: [['essay', 1]] }] }
};
const SECTION_TITLE = { listening: ['听力', 'Nghe'], reading: ['阅读', 'Đọc'], writing: ['书写', 'Viết'] };
const PART_INSTR = {
  tf_word: ['听录音，判断图片对错。', 'Nghe từ và xét hình đúng (✓) hay sai (✗).'],
  tf_pic: ['听录音，判断图片对错。', 'Nghe câu và xét hình đúng (✓) hay sai (✗).'],
  pick_pic: ['听录音，选出正确的图片。', 'Nghe câu và chọn hình đúng (A, B, C).'],
  match_dlg_pic: ['听对话，选出对应的图片。', 'Nghe hội thoại và chọn hình tương ứng trong kho A–F (mỗi hình dùng một lần).'],
  dlg_q: ['听对话和问题，选出正确答案。', 'Nghe hội thoại và câu hỏi, chọn đáp án đúng.'],
  dlg_q_long: ['听对话和问题，选出正确答案。', 'Nghe hội thoại và câu hỏi, chọn đáp án đúng.'],
  tf_stmt: ['听录音，判断下面的句子对错。', 'Nghe và xét câu ★ đúng hay sai.'],
  rtf_word: ['判断图片与词语是否一致。', 'Xét từ có đúng với hình không.'],
  rtf_stmt: ['判断第二句话对错。', 'Dựa vào câu thứ nhất, xét câu ★ đúng hay sai.'],
  match_pic: ['选出与句子相符的图片。', 'Chọn hình phù hợp với mỗi câu trong kho A–F.'],
  match_qa: ['选出相应的答语。', 'Chọn câu trả lời tương ứng trong kho A–F.'],
  fill: ['选词填空。', 'Chọn từ trong kho A–F điền vào chỗ trống.'],
  choice: ['选出正确答案。', 'Đọc và chọn đáp án đúng.'],
  order: ['完成句子。', 'Sắp xếp các từ cho sẵn thành câu.'],
  char: ['写汉字。', 'Viết chữ Hán theo pinyin.'],
  pic_sent: ['看图，用词造句。', 'Nhìn hình và dùng từ cho sẵn viết một câu.'],
  essay: ['写短文。', 'Dùng các từ cho sẵn viết một đoạn ngắn.']
};
/* ---------------------------------------------------------------- tiện ích */
const shuffle = a => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const take = (a, n) => shuffle(a).slice(0, n);
const strip = s => [...s].filter(c => CJK.test(c)).join('');
const LETTERS = 'ABCDEF';
let seq = 0;
const nid = () => `i${++seq}`;

/** Kho dữ liệu của một cấp: từ (có hình / có audio), câu, cặp hỏi-đáp. Lấy một lần cho mỗi đề. */
async function loadPool(ver, lvl) {
  const col = ver === '30' ? 'hsk30' : 'hsk20';
  const [w, s, d] = await Promise.all([
    // lấy toàn bộ từ HSK để tách câu không cắt giữa từ; từ dùng làm đề/nhiễu lọc theo cấp bên dưới
    q(`SELECT id, simp, pinyin_marks AS py, vi[1] AS vi, pos, audio, ${col} AS lv FROM dict_entries
       WHERE ${col} IS NOT NULL AND vi <> '{}' AND simp !~ '[A-Za-z0-9]' AND nchar BETWEEN 1 AND 4`, []),
    q(`SELECT id, zh, py, vi, audio, lvl, nchar FROM dict_sentences WHERE lvl <= $1 AND (ver = $2 OR ver IS NULL) AND nchar BETWEEN 3 AND 24`, [lvl, ver]),
    q(`SELECT p.id, qs.id AS q_id, qs.zh AS q_zh, qs.py AS q_py, qs.vi AS q_vi, qs.audio AS q_audio, a.id AS a_id, a.zh AS a_zh, a.py AS a_py, a.vi AS a_vi, a.audio AS a_audio
       FROM dict_dialog_pairs p JOIN dict_sentences qs ON qs.id = p.q_id JOIN dict_sentences a ON a.id = p.a_id WHERE p.lvl <= $1 AND p.ver = $2`, [lvl, ver])
  ]);
  const wordSet = new Map(w.rows.map(x => [x.simp, x]));          // mọi cấp: cho tách từ
  const words = w.rows.filter(x => x.lv <= lvl);                   // đúng cấp trở xuống: cho đề và phương án nhiễu
  const { rows: imgs } = await q('SELECT word, path FROM word_images');
  const IMG = Object.fromEntries(imgs.map(r => [r.word, r.path]));
  // hình của một từ: ảnh thật nếu admin đã chọn, không thì emoji; từ không có cả hai không dùng làm đề hình
  const picFor = wd => (IMG[wd] || EMOJI[wd] ? { img: IMG[wd] || null, emoji: EMOJI[wd] || null, word: wd } : null);
  const picWords = words.filter(x => picFor(x.simp) && !x.pos.includes('m') && !/^[一二三四五六七八九十百千万零两]+$/.test(x.simp));   // số từ không dùng làm hình
  // ưu tiên câu của đúng cấp; câu cấp thấp hơn làm dự phòng khi thiếu
  const sents = s.rows.sort((a, b) => (b.lvl === lvl) - (a.lvl === lvl));
  return { words, wordSet, picWords, sents, pairs: d.rows, lvl, picFor };
}

/** Tách câu thành các từ của kho (khớp dài nhất); phần không khớp là từng chữ. */
function segment(zh, wordSet) {
  const chars = [...zh]; const out = [];
  for (let i = 0; i < chars.length;) {
    if (!CJK.test(chars[i])) { out.push({ w: chars[i], word: null }); i++; continue; }
    let hit = null;
    for (let len = Math.min(4, chars.length - i); len >= 1; len--) { const s = chars.slice(i, i + len).join(''); if (wordSet.has(s)) { hit = s; break; } }
    if (hit) { out.push({ w: hit, word: wordSet.get(hit) }); i += [...hit].length; } else { out.push({ w: chars[i], word: null }); i++; }
  }
  return out;
}
/** Đổi một từ trong câu sang từ khác cùng loại từ để tạo phát biểu sai / phương án nhiễu. */
function mutate(zh, pool) {
  const segs = segment(zh, pool.wordSet);
  const cands = segs.filter(x => x.word && x.word.pos && x.word.pos.length && [...x.w].length >= 1 && !['u', 'p', 'c', 'd'].some(p => x.word.pos.includes(p)));
  if (!cands.length) return null;
  const target = cands[Math.floor(Math.random() * cands.length)];
  const same = pool.words.filter(w => w.simp !== target.w && w.pos.some(p => target.word.pos.includes(p)) && [...w.simp].length === [...target.w].length);
  if (!same.length) return null;
  const rep = same[Math.floor(Math.random() * same.length)];
  return { zh: segs.map(x => (x === target ? rep.simp : x.w)).join(''), from: target.w, to: rep.simp };
}
const picOf = (zh, pool) => { const s = segment(zh, pool.wordSet).find(x => x.word && pool.picFor(x.w)); return s ? { word: s.w, pic: pool.picFor(s.w) } : null; };
const samePic = (a, b) => a && b && a.word === b.word;
const nouns = pool => pool.words.filter(w => w.pos.includes('n'));
const audioOf = s => (s.audio ? s.audio : null);
const media = s => ({ zh: s.zh, py: s.py, audio: audioOf(s) });

/* ---------------------------------------------------------------- các bộ sinh */
const GEN = {
  /* HSK1 nghe P1 / đọc P1: MỘT TỪ + hình, đúng hay sai (đề mẫu dùng từ đơn, có pinyin) */
  tf_word(n, pool, used) {
    const ws = take(pool.picWords.filter(w => !used.has(w.simp)), n);
    return ws.map(w => {
      used.add(w.simp);
      const ok = Math.random() < 0.5;
      const other = ok ? null : take(pool.picWords.filter(x => x.simp !== w.simp), 1)[0];
      return { id: nid(), kind: 'tf_pic', audio: w.audio, text: w.simp, py: w.py, pic: ok ? pool.picFor(w.simp) : pool.picFor(other.simp), answer: ok ? '✓' : '✗', explain: `${w.simp} (${w.py}): ${w.vi}` };
    });
  },
  rtf_word(n, pool, used) { return GEN.tf_word(n, pool, used).map(x => ({ ...x, audio: null })); },
  /* HSK2 nghe P1: CÂU + hình */
  tf_pic(n, pool, used) {
    const cand = pool.sents.map(s => ({ s, p: picOf(s.zh, pool) })).filter(x => x.p && !used.has(x.s.zh));
    return take(cand, n).map(({ s, p }) => {
      used.add(s.zh);
      const ok = Math.random() < 0.5;
      const other = ok ? null : take(pool.picWords.filter(w => !samePic(pool.picFor(w.simp), p.pic)), 1)[0];
      return { id: nid(), kind: 'tf_pic', ...media(s), text: s.zh, pic: ok ? p.pic : pool.picFor(other.simp), answer: ok ? '✓' : '✗', explain: `${s.zh} · ${s.vi || ''}` };
    });
  },
  pick_pic(n, pool, used) {
    const cand = pool.sents.map(s => ({ s, p: picOf(s.zh, pool) })).filter(x => x.p && !used.has(x.s.zh));
    return take(cand, n).map(({ s, p }) => {
      used.add(s.zh);
      const distract = take(pool.picWords.filter(w => !samePic(pool.picFor(w.simp), p.pic)), 2).map(w => pool.picFor(w.simp));
      const opts = shuffle([p.pic, ...distract]);
      return { id: nid(), kind: 'pick_pic', ...media(s), options: opts, answer: LETTERS[opts.findIndex(o => samePic(o, p.pic))], explain: `${s.zh} · ${s.vi || ''}` };
    });
  },
  /* HSK1 nghe P3, HSK2 nghe P2, HSK3 nghe P1: 5 hội thoại ↔ kho 6 hình A–F (chia nhóm 5) */
  match_dlg_pic(n, pool, used) {
    const out = []; let left = n;
    while (left > 0) {
      const g = Math.min(5, left); left -= g;
      const cand = pool.pairs.map(p => ({ p, pic: picOf(p.a_zh, pool) || picOf(p.q_zh, pool) })).filter(x => x.pic && !used.has(x.p.q_zh));
      const chosen = [], seen = new Set();
      for (const c of shuffle(cand)) { if (chosen.length >= g) break; if (seen.has(c.pic.word)) continue; seen.add(c.pic.word); used.add(c.p.q_zh); chosen.push(c); }
      const extra = take(pool.picWords.filter(w => !seen.has(w.simp)), 1).map(w => pool.picFor(w.simp));
      const poolOpts = shuffle([...chosen.map(c => c.pic.pic), ...extra]);
      chosen.forEach(c => out.push({ id: nid(), kind: 'match', lines: [{ zh: c.p.q_zh, py: c.p.q_py, audio: c.p.q_audio }, { zh: c.p.a_zh, py: c.p.a_py, audio: c.p.a_audio }],
        pool: poolOpts, answer: LETTERS[poolOpts.findIndex(o => samePic(o, c.pic.pic))], explain: `${c.p.q_zh} / ${c.p.a_zh}` }));
    }
    return out;
  },
  /* nghe hội thoại + câu hỏi, chọn 1 trong 3 từ (như đề mẫu: đáp án là từ/cụm ngắn) */
  dlg_q(n, pool, used, long = false) {
    const cand = pool.pairs.filter(p => !used.has(p.q_zh) && (!long || [...p.q_zh].length + [...p.a_zh].length >= 14));
    const out = [];
    for (const p of shuffle(cand)) {
      if (out.length >= n) break;
      const segs = [...segment(p.a_zh, pool.wordSet), ...segment(p.q_zh, pool.wordSet)].filter(x => x.word && x.word.pos.includes('n') && [...x.w].length >= 1 && x.word.lv <= pool.lvl);
      if (!segs.length) continue;
      const t = segs[0];
      const distract = take(nouns(pool).filter(w => w.simp !== t.w && !p.q_zh.includes(w.simp) && !p.a_zh.includes(w.simp)), 2);
      if (distract.length < 2) continue;
      used.add(p.q_zh);
      const opts = shuffle([t.word, ...distract]);
      out.push({ id: nid(), kind: 'dlg_ans', lines: [{ zh: p.q_zh, py: p.q_py, audio: p.q_audio }, { zh: p.a_zh, py: p.a_py, audio: p.a_audio }],
        question: { zh: '问：对话里说到了什么？', audio: '/media/audio/p/q_word.mp3' },
        options: opts.map(w => w.simp), optionsPy: opts.map(w => w.py), answer: LETTERS[opts.indexOf(t.word)], explain: `${p.q_zh} / ${p.a_zh} → ${t.w} (${t.word.vi})` });
    }
    return out.length >= n ? out : out.concat(GEN.dlg_ans(n - out.length, pool, used));
  },
  dlg_q_long(n, pool, used) { return GEN.dlg_q(n, pool, used, true); },
  dlg_ans(n, pool, used) {
    const cand = pool.pairs.filter(p => !used.has(p.q_zh));
    return take(cand, n).map(p => {
      used.add(p.q_zh);
      const distract = take(pool.pairs.filter(x => x.a_zh !== p.a_zh), 2).map(x => x.a_zh);
      const opts = shuffle([p.a_zh, ...distract]);
      return { id: nid(), kind: 'dlg_ans', zh: p.q_zh, py: p.q_py, audio: p.q_audio, options: opts, answer: LETTERS[opts.indexOf(p.a_zh)], explain: `${p.q_zh} → ${p.a_zh} (${p.a_vi || ''})` };
    });
  },
  tf_stmt(n, pool, used) {
    const cand = pool.sents.filter(s => !used.has(s.zh) && s.nchar >= 4);
    const out = [];
    for (const s of shuffle(cand)) {
      if (out.length >= n) break;
      const ok = Math.random() < 0.5;
      const m = ok ? null : mutate(s.zh, pool);
      if (!ok && !m) continue;
      used.add(s.zh);
      out.push({ id: nid(), kind: 'tf_stmt', ...media(s), statement: ok ? s.zh : m.zh, answer: ok ? '✓' : '✗', explain: ok ? `${s.zh} · ${s.vi || ''}` : `Nghe: ${s.zh}. Câu cho sẵn đổi "${m.from}" thành "${m.to}".` });
    }
    return out;
  },
  rtf_stmt(n, pool, used) { return GEN.tf_stmt(n, pool, used).map(x => ({ ...x, kind: 'rtf_stmt', audio: null })); },
  match_pic(n, pool, used) {
    const cand = pool.sents.map(s => ({ s, p: picOf(s.zh, pool) })).filter(x => x.p && !used.has(x.s.zh));
    const chosen = [], pics = new Set();
    for (const c of shuffle(cand)) { if (chosen.length >= n) break; if (pics.has(c.p.word)) continue; pics.add(c.p.word); chosen.push(c); used.add(c.s.zh); }
    const extra = take(pool.picWords.filter(w => !pics.has(w.simp)), 1).map(w => pool.picFor(w.simp));
    const poolOpts = shuffle([...chosen.map(c => c.p.pic), ...extra]);
    return chosen.map(c => ({ id: nid(), kind: 'match', text: c.s.zh, py: c.s.py, pool: poolOpts, answer: LETTERS[poolOpts.findIndex(o => samePic(o, c.p.pic))], explain: `${c.s.zh} · ${c.s.vi || ''}` }));
  },
  match_qa(n, pool, used) {
    const chosen = take(pool.pairs.filter(p => !used.has(p.q_zh)), n);
    chosen.forEach(p => used.add(p.q_zh));
    const extra = take(pool.pairs.filter(p => !chosen.includes(p)), 1).map(p => p.a_zh);
    const poolOpts = shuffle([...chosen.map(p => p.a_zh), ...extra]);
    return chosen.map(p => ({ id: nid(), kind: 'match', text: p.q_zh, py: p.q_py, pool: poolOpts, answer: LETTERS[poolOpts.indexOf(p.a_zh)], explain: `${p.q_zh} → ${p.a_zh}` }));
  },
  fill(n, pool, used) {
    // mỗi phần tối đa 5 câu dùng chung một kho 6 từ (như đề thật); phần dài chia thành nhiều nhóm
    const groups = []; let left = n;
    while (left > 0) { groups.push(Math.min(5, left)); left -= Math.min(5, left); }
    const out = [];
    for (const g of groups) {
      const chosen = [];
      for (const s of shuffle(pool.sents.filter(x => !used.has(x.zh) && x.nchar >= 4))) {
        if (chosen.length >= g) break;
        const segs = segment(s.zh, pool.wordSet).filter(x => x.word && [...x.w].length >= 1 && x.word.pos.some(p => ['n', 'v', 'a', 'm', 'q', 'd', 'r'].includes(p)));
        if (!segs.length) continue;
        const t = segs[Math.floor(Math.random() * segs.length)];
        if (chosen.some(c => c.word === t.w)) continue;
        used.add(s.zh);
        chosen.push({ s, word: t.w, py: t.word.py, blank: s.zh.replace(t.w, '＿＿') });
      }
      const extra = take(pool.words.filter(w => !chosen.some(c => c.word === w.simp)), 1).map(w => w.simp);
      const poolOpts = shuffle([...chosen.map(c => c.word), ...extra]);
      chosen.forEach(c => out.push({ id: nid(), kind: 'fill', text: c.blank, pool: poolOpts, answer: LETTERS[poolOpts.indexOf(c.word)], explain: `${c.s.zh} · ${c.s.vi || ''}` }));
    }
    return out;
  },
  choice(n, pool, used) {
    return GEN.dlg_ans(n, pool, used).map(x => ({ ...x, kind: 'choice', audio: null }));
  },
  order(n, pool, used) {
    const out = [];
    for (const s of shuffle(pool.sents.filter(x => !used.has(x.zh) && x.nchar >= 5 && x.nchar <= 14))) {
      if (out.length >= n) break;
      const segs = segment(s.zh, pool.wordSet).map(x => x.w).filter(w => CJK.test(w));
      if (segs.length < 3) continue;
      // gộp thành 3–5 cụm để giống đề thật
      const k = Math.min(5, Math.max(3, Math.round(segs.length / 2)));
      const chunks = []; const per = Math.ceil(segs.length / k);
      for (let i = 0; i < segs.length; i += per) chunks.push(segs.slice(i, i + per).join(''));
      used.add(s.zh);
      out.push({ id: nid(), kind: 'order', chunks: shuffle(chunks), answer: strip(s.zh), explain: `${s.zh} · ${s.vi || ''}` });
    }
    return out;
  },
  char(n, pool, used) {
    const out = [];
    for (const s of shuffle(pool.sents.filter(x => !used.has(x.zh) && x.nchar >= 4))) {
      if (out.length >= n) break;
      const segs = segment(s.zh, pool.wordSet).filter(x => x.word && [...x.w].length === 1);
      if (!segs.length) continue;
      const t = segs[Math.floor(Math.random() * segs.length)];
      used.add(s.zh);
      out.push({ id: nid(), kind: 'char', text: s.zh.replace(t.w, '＿'), hint: t.word.py, answer: t.w, explain: `${s.zh} · ${s.vi || ''}` });
    }
    return out;
  },
  pic_sent(n, pool) {
    return take(pool.picWords.filter(w => w.pos.some(p => ['v', 'n', 'a'].includes(p))), n).map(w => ({ id: nid(), kind: 'pic_sent', pic: pool.picFor(w.simp), word: w.simp, py: w.py, answer: w.simp, explain: `Câu cần chứa "${w.simp}" (${w.vi}).` }));
  },
  essay(n, pool) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const ws = take(pool.words.filter(w => w.lv === pool.lvl && [...w.simp].length >= 2), 5);
      out.push({ id: nid(), kind: 'essay', words: ws.map(w => w.simp), answer: ws.map(w => w.simp), minChars: pool.lvl >= 6 ? 200 : 80, explain: `Dùng đủ 5 từ: ${ws.map(w => `${w.simp} (${w.vi})`).join(', ')}.` });
    }
    return out;
  }
};

/* ---------------------------------------------------------------- sinh cả đề */
export async function generatePaper(ver, lvl) {
  const bp = BLUEPRINTS[lvl];
  if (!bp) throw new Error('Chưa có khung đề cho cấp này.');
  const pool = await loadPool(ver, lvl);
  const used = new Set();
  seq = 0;
  let num = 0;
  const sections = bp.sections.map(sec => ({
    key: sec.key, title: SECTION_TITLE[sec.key], minutes: sec.minutes,
    parts: sec.parts.map(([kind, n], pi) => {
      const withExample = !['essay', 'pic_sent', 'order', 'char'].includes(kind);
      const all = GEN[kind](n + (withExample ? 1 : 0), pool, used);
      const example = withExample && all.length > n ? { ...all.shift(), example: true } : null;
      const items = all.map(it => ({ ...it, num: ++num }));
      return { key: kind, title: [`第${'一二三四五'[pi]}部分`, `Phần ${pi + 1}`], instr: PART_INSTR[kind], example, items, short: items.length < n };
    })
  }));
  return { ver, lvl, total: bp.total, pass: bp.pass, plays: bp.plays, sections, generated: true,
    note: lvl >= 4 ? 'Đề mô phỏng rút gọn: các bài đọc đoạn văn dài của HSK 4–6 được thay bằng câu hỏi theo câu và hội thoại từ kho của Zuimó.' : null };
}

/* ---------------------------------------------------------------- chấm */
const norm = s => strip(String(s || ''));
const tf = s => String(s).replace('√', '✓').replace('×', '✗').replace('X', '✗');   // đề nhập tay có thể ghi √/×
function gradeItem(it, ans) {
  if (ans == null || ans === '') return 0;
  switch (it.kind) {
    case 'order': return norm(ans) === norm(it.answer) ? 1 : 0;
    case 'char': return norm(ans) === it.answer ? 1 : 0;
    case 'pic_sent': { const a = norm(ans); return a.includes(it.word) && a.length >= 4 ? 1 : 0; }
    case 'essay': { const a = norm(ans); const usedW = it.answer.filter(w => a.includes(w)).length; return a.length >= it.minChars * 0.75 ? Math.min(1, usedW / it.answer.length) : Math.min(0.5, usedW / it.answer.length); }
    default: return tf(ans) === tf(it.answer) ? 1 : 0;
  }
}
/** Điểm chính thức: mỗi phần (nghe/đọc/viết) quy về thang 100 theo tỉ lệ câu đúng; tổng 200 hoặc 300; đỗ theo ngưỡng. */
export function gradePaper(paper, answers) {
  const sections = {};
  let total = 0;
  for (const sec of paper.sections) {
    let raw = 0, n = 0; const items = [];
    for (const part of sec.parts) for (const it of part.items) {
      const got = gradeItem(it, answers[it.id]);
      raw += got; n++;
      items.push({ id: it.id, num: it.num, got, answer: it.answer, given: answers[it.id] ?? null });
    }
    const scaled = n ? Math.round((raw / n) * 100) : 0;
    sections[sec.key] = { raw: Math.round(raw * 10) / 10, count: n, scaled, items };
    total += scaled;
  }
  return { sections, total, max: paper.total, pass: total >= paper.pass, threshold: paper.pass };
}

/** Bản gửi cho thí sinh: bỏ đáp án và lời giải. */
export function forCandidate(paper) {
  return { ...paper, sections: paper.sections.map(sec => ({ ...sec, parts: sec.parts.map(p => ({ ...p, items: p.items.map(({ answer, explain, ...rest }) => rest) })) })) };   // ví dụ mẫu (p.example) giữ đáp án như đề in
}
