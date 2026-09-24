/**
 * API từ điển. Dùng được không cần đăng nhập, giới hạn tần suất theo IP.
 *
 *   GET /api/dict/search?q=...        tìm theo chữ Hán (giản/phồn), pinyin (có/không dấu), tiếng Việt, tiếng Anh
 *   GET /api/dict/entry?w=...          chi tiết một từ: nghĩa, chữ & bộ thủ, từ ghép, ví dụ, dễ nhầm, mẹo nhớ
 *   GET /api/dict/char?c=...           chi tiết một chữ
 *   GET /api/dict/segment?text=...     tách từ trong câu (khớp dài nhất) để tra từng từ
 */
import { q } from './db.js';
import { HttpError, bad, clientIp, json, rateLimit } from './http.js';

const CJK = /[\u3400-\u9fff]/;
const VI_DIACRITIC = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
const IDS = /[\u2ff0-\u2fff]/g;                 // ký hiệu mô tả cấu tạo chữ: ⿰ ⿱ ⿲ …

const COLS = `id, trad, simp, pinyin_marks AS py, pinyin, hv, en, vi, cls, tags, pos, hsk20, hsk30, nchar`;
const brief = r => ({ id: r.id, trad: r.trad, simp: r.simp, py: r.py, hv: r.hv, vi: r.vi, en: r.en, cls: r.cls, tags: r.tags, pos: r.pos, hsk20: r.hsk20, hsk30: r.hsk30 });

const normPinyin = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ü/g, 'v').replace(/u:/g, 'v').replace(/[^a-z]/g, '');

/* ---------------------------------------------------------------- tìm kiếm */
async function search(query, limit) {
  const qs = query.trim();
  if (!qs) return [];
  if (CJK.test(qs)) {
    // chữ Hán: khớp đúng > bắt đầu bằng > có chứa; từ HSK lên trước, từ ngắn lên trước
    const { rows } = await q(
      `SELECT ${COLS},
              CASE WHEN simp = $1 OR trad = $1 THEN 0 WHEN simp LIKE $2 OR trad LIKE $2 THEN 1 ELSE 2 END AS rank
       FROM dict_entries
       WHERE simp LIKE $3 OR trad LIKE $3
       ORDER BY rank, (hsk30 IS NULL), hsk30, nchar, id
       LIMIT $4`, [qs, qs + '%', '%' + qs + '%', limit]);
    return rows.map(brief);
  }
  if (VI_DIACRITIC.test(qs) || !/^[a-z0-9\s:'-]+$/i.test(qs)) {
    // Có dấu: thường là tiếng Việt, nhưng "yuàn" cũng có dấu huyền. Nếu bỏ dấu ra toàn chữ a-z
    // thì thử thêm khớp pinyin chính xác và xếp lên trước.
    const plain = normPinyin(qs);
    const looksPinyin = plain && /^[a-z]+$/.test(plain) && !/[đơưâêô]/i.test(qs);
    const [py, tx] = await Promise.all([
      looksPinyin ? q(`SELECT ${COLS}, 0 AS rank FROM dict_entries WHERE pinyin_plain = $1 ORDER BY (hsk30 IS NULL), hsk30, id LIMIT $2`, [plain, limit]) : { rows: [] },
      searchText(qs.toLowerCase(), 'vi', limit)
    ]);
    const seen = new Set(); const out = [];
    for (const r of [...py.rows.map(brief), ...tx]) { if (!seen.has(r.id)) { seen.add(r.id); out.push(r); } }
    return out.slice(0, limit);
  }
  // Chữ Latin không dấu: có thể là pinyin (nihao, ni3hao3) hoặc tiếng Anh/Việt không dấu -> gộp cả hai, pinyin lên trước
  const plain = normPinyin(qs);
  const [py, tx] = await Promise.all([
    plain ? q(
      `SELECT ${COLS}, CASE WHEN pinyin_plain = $1 THEN 0 ELSE 1 END AS rank
       FROM dict_entries WHERE pinyin_plain LIKE $2
       ORDER BY rank, (hsk30 IS NULL), hsk30, nchar, id LIMIT $3`, [plain, plain + '%', limit]) : { rows: [] },
    searchText(qs.toLowerCase(), 'both', Math.max(5, limit - 10))
  ]);
  const seen = new Set(); const out = [];
  for (const r of [...py.rows.map(brief), ...tx]) { if (!seen.has(r.id)) { seen.add(r.id); out.push(r); } }
  return out.slice(0, limit);
}

/** Tìm theo nghĩa: khớp trọn một nghĩa > nghĩa bắt đầu bằng > nghĩa chứa cụm; dùng chỉ mục trigram trên vi_text/en_text. */
async function searchText(t, lang, limit) {
  const cols = lang === 'vi' ? ['vi_text'] : ['vi_text', 'en_text'];
  const where = cols.map((c, i) => `${c} LIKE $${i + 2}`).join(' OR ');
  const rank = cols.map(c =>
    `CASE WHEN ${c} = $1 OR ${c} LIKE $1 || ' / %' OR ${c} LIKE '% / ' || $1 OR ${c} LIKE '% / ' || $1 || ' / %' THEN 0
          WHEN ${c} LIKE $1 || '%' OR ${c} LIKE '% / ' || $1 || '%' THEN 1 ELSE 2 END`).join(' + ');
  const params = [t, ...cols.map(() => '%' + t + '%'), limit];
  const { rows } = await q(
    `SELECT ${COLS}, LEAST(${rank}) AS rank FROM dict_entries WHERE ${where}
     ORDER BY rank, (hsk30 IS NULL), hsk30, nchar, id LIMIT $${params.length}`, params);
  return rows.map(brief);
}

/* ---------------------------------------------------------------- chữ đơn */
const compsOf = decomposition => [...(decomposition || '').replace(IDS, '')].filter(ch => ch !== '？' && CJK.test(ch));

/** Thông tin một chữ: bộ thủ, cấu tạo, nghĩa của từng bộ phận, nguồn gốc, số nét, Hán Việt. */
async function charInfo(ch) {
  const [{ rows: [c] }, { rows: ents }] = await Promise.all([
    q('SELECT * FROM dict_chars WHERE ch = $1', [ch]),
    q(`SELECT ${COLS} FROM dict_entries WHERE simp = $1 OR trad = $1 ORDER BY (hsk30 IS NULL), id LIMIT 4`, [ch])
  ]);
  const comps = c ? compsOf(c.decomposition) : [];
  const compRows = comps.length
    ? (await q(`SELECT DISTINCT ON (simp) simp, vi, en, hv FROM dict_entries WHERE simp = ANY($1) AND nchar = 1 ORDER BY simp, (hsk30 IS NULL), id`, [comps])).rows
    : [];
  const compMeta = comps.length ? (await q('SELECT ch, definition, radical, strokes, hv FROM dict_chars WHERE ch = ANY($1)', [comps])).rows : [];
  const trim = v => v.replace(/\s*\([^)]*\)/g, '').split(/;/)[0].trim().slice(0, 60);   // bộ thủ hay có định nghĩa dài kèm ngoặc
  const meaning = ch2 => {
    const r = compRows.find(x => x.simp === ch2), m = compMeta.find(x => x.ch === ch2);
    return { ch: ch2, vi: r ? r.vi.slice(0, 2).map(trim) : [], en: r ? r.en.slice(0, 2) : (m && m.definition ? [m.definition] : []), hv: (r && r.hv) || (m && m.hv) || null, strokes: m ? m.strokes : null };
  };
  const radical = c && c.radical ? meaning(c.radical) : null;
  const components = comps.map(meaning);
  return {
    ch, exists: !!c,
    hv: (c && c.hv) || (ents[0] && ents[0].hv) || null,
    strokes: c ? c.strokes : null,
    pinyin: c ? c.pinyin : [],
    definition: c ? c.definition : null,
    radical, decomposition: c ? c.decomposition : null, components,
    etymology: c && c.etym_type ? { type: c.etym_type, hint: c.etym_hint, semantic: c.etym_semantic, phonetic: c.etym_phonetic } : null,
    entries: ents.map(brief),
    mnemonic: mnemonicFor(ch, c, components, ents[0])
  };
}

/**
 * Mẹo nhớ sinh theo quy tắc từ cấu tạo chữ. Không thay được mẹo do người viết,
 * nhưng cho người học một điểm bám: chữ này gồm những bộ phận nào, mỗi bộ phận nghĩa gì.
 */
function mnemonicFor(ch, c, components, entry) {
  if (!c) return null;
  const meaningVi = entry && entry.vi[0] ? entry.vi[0].split(/[;,]/)[0].trim() : null;
  const short = v => (v || '').replace(/\([^)]*\)/g, '').split(/[;,]/)[0].trim().slice(0, 40);
  const parts = components.filter(x => x.vi.length || x.hv).map(x => {
    const m = short(x.vi[0]);
    return `${x.ch}${x.hv ? ` (${x.hv}${m ? ': ' + m : ''})` : m ? ` (${m})` : ''}`;
  });
  const lines = [];
  if (parts.length >= 2) lines.push(`Chữ ${ch} ghép từ ${parts.join(' + ')}.`);
  else if (parts.length === 1) lines.push(`Chữ ${ch} có bộ phận ${parts[0]}.`);
  if (c.etym_type === 'pictophonetic') {
    const sem = components.find(x => x.ch === c.etym_semantic), pho = components.find(x => x.ch === c.etym_phonetic);
    if (sem || pho) lines.push(`Đây là chữ hình thanh: ${sem ? `${sem.ch} gợi nghĩa` : ''}${sem && pho ? ', ' : ''}${pho ? `${pho.ch} gợi âm đọc` : ''}.`);
  } else if (c.etym_type === 'pictographic') lines.push('Đây là chữ tượng hình, vẽ theo hình dáng sự vật.');
  else if (c.etym_type === 'ideographic') lines.push('Đây là chữ hội ý: ghép nghĩa các bộ phận thành nghĩa mới.');
  if (meaningVi && parts.length >= 2) lines.push(`Gợi ý: hình dung ${parts.map(p => p.split(' ')[0]).join(' và ')} đi cùng nhau để nhớ nghĩa "${meaningVi}".`);
  return lines.length ? lines.join(' ') : null;
}

/* ---------------------------------------------------------------- chi tiết từ */
async function entryDetail(w) {
  const { rows: main } = await q(`SELECT ${COLS} FROM dict_entries WHERE simp = $1 OR trad = $1 ORDER BY (hsk30 IS NULL), (simp = $1) DESC, id`, [w]);
  if (!main.length) throw new HttpError(404, 'not_found', 'Không có từ này trong từ điển.');
  const simp = main[0].simp;
  const chars = [...simp].filter(ch => CJK.test(ch));
  const n = chars.length;

  // từ ghép chứa từ này (ưu tiên từ HSK), ví dụ, đồng âm, dễ nhầm, gần nghĩa: chạy song song
  const likeShare = n > 1 ? chars.map((_, i) => chars.map((c, j) => (i === j ? '_' : c)).join('')) : [];
  const [comp, ex, homo, similar, syn, charInfos] = await Promise.all([
    q(`SELECT ${COLS} FROM dict_entries WHERE simp LIKE $1 AND simp <> $2 AND nchar <= 4
        ORDER BY (hsk30 IS NULL), hsk30, nchar, id LIMIT 36`, ['%' + simp + '%', simp]),
    q(`SELECT zh, py, vi, src FROM dict_sentences WHERE zh LIKE $1 ORDER BY length(zh) LIMIT 12`, ['%' + simp + '%']),
    q(`SELECT ${COLS} FROM dict_entries WHERE pinyin_plain = $1 AND simp <> $2 AND nchar = $3
        ORDER BY (pinyin <> $4), (hsk30 IS NULL), hsk30, id LIMIT 12`, [main[0].pinyin.toLowerCase().replace(/u:/g, 'v').replace(/[^a-z]/g, ''), simp, n, main[0].pinyin]),
    n > 1
      ? q(`SELECT ${COLS} FROM dict_entries WHERE nchar = $1 AND simp <> $2 AND (${likeShare.map((_, i) => `simp LIKE $${i + 3}`).join(' OR ')})
            ORDER BY (hsk30 IS NULL), hsk30, id LIMIT 16`, [n, simp, ...likeShare])
      : similarChars(simp),
    main[0].vi.length
      ? q(`SELECT ${COLS} FROM dict_entries WHERE simp <> $1 AND vi && $2::text[] ORDER BY (hsk30 IS NULL), hsk30, nchar, id LIMIT 12`, [simp, main[0].vi.slice(0, 3)])
      : { rows: [] },
    Promise.all(chars.map(charInfo))
  ]);
  return {
    entries: main.map(brief),
    chars: charInfos,
    compounds: comp.rows.map(brief),
    examples: ex.rows,
    homophones: homo.rows.map(brief),
    similar: similar.rows.map(brief),
    synonyms: syn.rows.map(brief),
    usage: usageNotes(main[0])
  };
}

/** Chữ dễ nhầm với một chữ đơn: cùng bộ thủ và số nét chênh tối đa 1, hoặc chung bộ phận cấu tạo
    (bỏ qua các nét/bộ phận quá phổ biến như 一 丨 人 口, nếu không sẽ khớp hàng nghìn chữ) và số nét chênh tối đa 2. */
const COMMON_COMPONENTS = new Set([...'一丨丿丶乙亅二人口日月木土十又大小女子王言心手目田', '？']);
async function similarChars(ch) {
  const { rows: [c] } = await q('SELECT radical, strokes, decomposition FROM dict_chars WHERE ch = $1', [ch]);
  if (!c) return { rows: [] };
  const comps = compsOf(c.decomposition).filter(x => !COMMON_COMPONENTS.has(x));
  const { rows } = await q(
    `SELECT DISTINCT ON (e.simp) ${COLS.replace(/(^|, )(\w+)/g, '$1e.$2')},
            ((d.radical = $2)::int * 2 + (e.hsk30 IS NOT NULL)::int) AS score
     FROM dict_chars d JOIN dict_entries e ON e.simp = d.ch AND e.nchar = 1
     WHERE d.ch <> $1 AND d.strokes IS NOT NULL AND (
       (d.radical = $2 AND abs(d.strokes - $3) <= 1)
       OR ($4::text[] <> '{}' AND abs(d.strokes - $3) <= 2 AND d.decomposition ~ ('[' || array_to_string($4::text[], '') || ']'))
     )
     ORDER BY e.simp, (e.hsk30 IS NULL), e.hsk30`, [ch, c.radical, c.strokes || 0, comps]);
  rows.sort((a, b) => b.score - a.score || (a.hsk30 || 99) - (b.hsk30 || 99));
  return { rows: rows.slice(0, 14) };
}

const POS_VI = { n: 'danh từ', v: 'động từ', a: 'tính từ', adj: 'tính từ', d: 'phó từ', adv: 'phó từ', r: 'đại từ', pron: 'đại từ', m: 'số từ', num: 'số từ',
  q: 'lượng từ', p: 'giới từ', prep: 'giới từ', c: 'liên từ', conj: 'liên từ', u: 'trợ từ', part: 'trợ từ', e: 'thán từ', int: 'thán từ',
  o: 'từ tượng thanh', onom: 'từ tượng thanh', f: 'từ phương vị', t: 'từ chỉ thời gian', s: 'từ chỉ nơi chốn', h: 'tiền tố', k: 'hậu tố', mod: 'động từ năng nguyện', x: 'thành phần khác' };

/** Ghi chú cách dùng: loại từ (tiếng Việt), lượng từ, nhãn ngữ vực, cấp HSK. */
function usageNotes(e) {
  return {
    pos: (e.pos || []).map(p => POS_VI[p] || p),
    classifiers: e.cls || [],
    tags: e.tags || [],
    hsk: { v20: e.hsk20, v30: e.hsk30 }
  };
}

/* ---------------------------------------------------------------- tách từ trong câu */
async function segment(text) {
  const t = text.slice(0, 500);
  const subs = new Set();
  for (let i = 0; i < t.length; i++) {
    if (!CJK.test(t[i])) continue;
    for (let len = 1; len <= 8 && i + len <= t.length; len++) {
      const s = t.slice(i, i + len);
      if (!CJK.test(s[s.length - 1])) break;
      subs.add(s);
    }
  }
  const { rows } = await q(
    `SELECT DISTINCT ON (simp) ${COLS} FROM dict_entries WHERE simp = ANY($1) ORDER BY simp, (hsk30 IS NULL), id`, [[...subs]]);
  const known = new Map(rows.map(r => [r.simp, brief(r)]));
  const out = [];
  let i = 0;
  while (i < t.length) {
    if (!CJK.test(t[i])) { out.push({ text: t[i] }); i++; continue; }
    let best = null;
    for (let len = Math.min(8, t.length - i); len >= 1; len--) {
      const s = t.slice(i, i + len);
      if (known.has(s)) { best = s; break; }
    }
    if (!best) { out.push({ text: t[i] }); i++; continue; }
    out.push({ text: best, entry: known.get(best) });
    i += best.length;
  }
  return out;
}

/* ---------------------------------------------------------------- routes */
export function mountDict(router) {
  const limit = req => rateLimit(`dict:${clientIp(req)}`, 120, 60 * 1000);   // 120 lượt/phút mỗi IP
  const cache = { 'Cache-Control': 'public, max-age=600' };

  router.get('/api/dict/search', async (req, res, url) => {
    limit(req);
    const qs = (url.searchParams.get('q') || '').slice(0, 60);
    const n = Math.min(60, Math.max(1, Number(url.searchParams.get('limit')) || 30));
    json(res, 200, { q: qs, results: await search(qs, n) }, cache);
  });
  router.get('/api/dict/entry', async (req, res, url) => {
    limit(req);
    const w = (url.searchParams.get('w') || '').trim().slice(0, 30);
    if (!w) throw bad('missing_word', 'Thiếu tham số w.');
    json(res, 200, await entryDetail(w), cache);
  });
  router.get('/api/dict/char', async (req, res, url) => {
    limit(req);
    const c = [...(url.searchParams.get('c') || '')][0];
    if (!c || !CJK.test(c)) throw bad('missing_char', 'Thiếu tham số c.');
    json(res, 200, await charInfo(c), cache);
  });
  router.get('/api/dict/segment', async (req, res, url) => {
    limit(req);
    const text = (url.searchParams.get('text') || '').trim();
    if (!text) throw bad('missing_text', 'Thiếu tham số text.');
    json(res, 200, { tokens: await segment(text) }, cache);
  });
}
