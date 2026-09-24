#!/usr/bin/env node
/**
 * import-dict.mjs – nạp từ điển vào PostgreSQL.
 *
 * Nguồn:
 *   CC-CEDICT   nghĩa Anh          CC BY-SA 4.0   (bản sao trên GitHub, cùng định dạng file gốc của MDBG)
 *   CVDICT      nghĩa Việt         CC BY-SA 4.0   (ph0ngp, dịch từ CC-CEDICT)
 *   Make Me a Hanzi  cấu tạo chữ, bộ thủ, nguồn gốc   (Arphic PL / LGPL)
 *   content/build   cấp HSK, loại từ, Hán Việt, số nét, câu ví dụ tự soạn của Zuimó
 *
 * Chạy:  DATABASE_URL=... node tools/import-dict.mjs [--data /đường/dẫn/thư/mục/tải/về]
 *        trên VPS: docker compose exec api node tools/import-dict.mjs
 * Không có --data thì tự tải về /tmp/zuimo-dict (cần mạng tới raw.githubusercontent.com).
 * Chạy lại an toàn: dùng UPSERT theo khoá (trad, simp, pinyin).
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const argi = process.argv.indexOf('--data');
const DATA = argi > 0 ? process.argv[argi + 1] : (process.env.DICT_DATA_DIR || '/tmp/zuimo-dict');   // /tmp: user node trong container ghi được
// content/build của repo (chạy trực tiếp) hoặc thư mục mount vào container (compose: ../content/build -> /app/content-build)
const CONTENT = process.env.CONTENT_DIR || (await access(join(ROOT, 'content/build')).then(() => join(ROOT, 'content/build')).catch(() => '/app/content-build'));
const SOURCES = {
  'cedict_ts.u8': 'https://raw.githubusercontent.com/krmanik/cedict-json/master/cedict_ts.u8',
  'CVDICT.u8': 'https://raw.githubusercontent.com/ph0ngp/CVDICT/main/CVDICT.u8',
  'mmah_dictionary.txt': 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt'
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function ensureFiles() {
  await mkdir(DATA, { recursive: true });
  for (const [name, url] of Object.entries(SOURCES)) {
    const p = join(DATA, name);
    try { await access(p); continue; } catch { /* chưa có */ }
    log('tải', name);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Không tải được ${url}: ${r.status}`);
    await writeFile(p, Buffer.from(await r.arrayBuffer()));
  }
}

/* ---------------------------------------------------------------- pinyin */
const TONES = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', v: 'ǖǘǚǜ', ü: 'ǖǘǚǜ' };
/** "ni3 hao3" -> "nǐ hǎo" theo quy tắc đặt dấu chuẩn (a/e trước; ou đặt ở o; còn lại nguyên âm cuối). */
function marks(numbered) {
  return numbered.split(' ').map(s => {
    const m = /^([a-zA-Zü:]+)([1-5])$/.exec(s);
    if (!m) return s;                              // dấu câu, chữ Latin không phải pinyin
    let syl = m[1].replace('u:', 'ü').replace('v', 'ü'), t = +m[2];
    if (t === 5) return syl;
    const lower = syl.toLowerCase();
    let idx = -1;
    if (lower.includes('a')) idx = lower.indexOf('a');
    else if (lower.includes('e')) idx = lower.indexOf('e');
    else if (lower.includes('ou')) idx = lower.indexOf('o');
    else { for (let i = lower.length - 1; i >= 0; i--) if ('iouü'.includes(lower[i])) { idx = i; break; } }
    if (idx < 0) return syl;
    const ch = syl[idx], base = ch.toLowerCase();
    const marked = TONES[base][t - 1];
    return syl.slice(0, idx) + (ch === base ? marked : marked.toUpperCase()) + syl.slice(idx + 1);
  }).join(' ');
}
const plain = numbered => numbered.toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v').replace(/[^a-z]/g, '');

/* ---------------------------------------------------------------- CEDICT / CVDICT */
const LINE = /^(\S+) (\S+) \[([^\]]+)\] \/(.+)\/$/;
async function readDict(file) {
  const out = new Map();
  const text = await readFile(join(DATA, file), 'utf8');
  for (const raw of text.split('\n')) {
    if (!raw || raw[0] === '#') continue;
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const [, trad, simp, py, defs] = m;
    out.set(`${trad}\t${simp}\t${py.toLowerCase()}`, { trad, simp, py: py.toLowerCase(), defs: defs.split('/').filter(Boolean) });
  }
  return out;
}

/** Tách lượng từ "CL:個|个[ge4]" và các ghi chú cách dùng ra khỏi danh sách nghĩa. */
const TAG_MAP = [
  [/\(coll\.\)|colloquial/i, 'khẩu ngữ'], [/\(literary\)|literary/i, 'văn viết'], [/\(dialect\)|dialect/i, 'phương ngữ'],
  [/\(old\)|\(archaic\)|archaic/i, 'cổ, ít dùng'], [/\(slang\)|slang/i, 'tiếng lóng'], [/\(vulgar\)|vulgar/i, 'thô tục'],
  [/\(loanword\)|loanword/i, 'từ mượn'], [/\(Tw\)|Taiwan pr\./, 'Đài Loan'], [/\(onom\.\)/, 'từ tượng thanh'],
  [/\(interj\.\)|\(interjection\)/i, 'thán từ'], [/\(idiom\)|\bidiom\b/i, 'thành ngữ'], [/\(polite\)|\(honorific\)/i, 'trang trọng'],
  [/\(humble\)/i, 'khiêm tốn'], [/\(derog\.\)|derogatory/i, 'miệt thị'], [/\(fig\.\)/, 'nghĩa bóng'], [/abbr\. for/i, 'viết tắt'],
  [/\(math\.\)|\(chem\.\)|\(physics\)|\(biology\)|\(medicine\)|\(law\)|\(computing\)|\(finance\)|\(music\)|\(linguistics\)/i, 'thuật ngữ chuyên ngành']
];
function splitDefs(defs) {
  const cls = [], tags = new Set(), keep = [];
  for (const d of defs) {
    const m = /^(?:CL|LT):(.+)$/.exec(d);   // CEDICT ghi CL:, CVDICT dịch thành LT: (lượng từ)
    if (m) {
      m[1].split(',').forEach(c => { const mm = /^(?:(\S+)\|)?(\S+?)\[([^\]]+)\]$/.exec(c.trim()); if (mm) cls.push(`${mm[2]} ${marks(mm[3].toLowerCase())}`); });
      continue;
    }
    for (const [re, tag] of TAG_MAP) if (re.test(d)) tags.add(tag);
    keep.push(d);
  }
  return { cls, tags: [...tags], defs: keep };
}

/* ---------------------------------------------------------------- chạy */
async function main() {
  await ensureFiles();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    log('đọc CC-CEDICT và CVDICT');
    const [ce, cv] = await Promise.all([readDict('cedict_ts.u8'), readDict('CVDICT.u8')]);
    log(`  CEDICT ${ce.size} | CVDICT ${cv.size}`);

    const words = JSON.parse(await readFile(join(CONTENT, 'words.json'), 'utf8'));
    const hsk = new Map(words.map(w => [w.s, w]));
    const hanzi = JSON.parse(await readFile(join(CONTENT, 'hanzi.json'), 'utf8'));
    const hz = new Map(hanzi.map(h => [h.c, h]));
    // Hán Việt cho mọi từ: ghép từ hanzi.json (chữ đơn) khi bộ HSK không có
    const hvOf = s => (hsk.get(s) && hsk.get(s).hv) || ([...s].every(ch => hz.get(ch) && hz.get(ch).hv) ? [...s].map(ch => hz.get(ch).hv).join(' ') : null);

    // ---- mục từ
    const keys = new Set([...ce.keys(), ...cv.keys()]);
    log(`  ghép: ${keys.size} mục`);
    await c.query('BEGIN');
    let n = 0;
    const batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const cols = 16;
      const values = batch.map((_, i) => `(${Array.from({ length: cols }, (__, j) => `$${i * cols + j + 1}`).join(',')})`).join(',');
      await c.query(
        `INSERT INTO dict_entries (trad, simp, pinyin, pinyin_marks, pinyin_plain, en, vi, hv, cls, tags, pos, hsk20, hsk30, nchar, vi_text, en_text)
         VALUES ${values}
         ON CONFLICT (trad, simp, pinyin) DO UPDATE SET en = EXCLUDED.en, vi = EXCLUDED.vi, hv = EXCLUDED.hv, cls = EXCLUDED.cls,
           tags = EXCLUDED.tags, pos = EXCLUDED.pos, hsk20 = EXCLUDED.hsk20, hsk30 = EXCLUDED.hsk30, vi_text = EXCLUDED.vi_text, en_text = EXCLUDED.en_text`,
        batch.flat());
      n += batch.length; batch.length = 0;
    };
    for (const k of keys) {
      const e = ce.get(k), v = cv.get(k);
      const base = e || v;
      const en = e ? splitDefs(e.defs) : { cls: [], tags: [], defs: [] };
      const vi = v ? splitDefs(v.defs) : { cls: [], tags: [], defs: [] };
      const h = hsk.get(base.simp);
      batch.push([base.trad, base.simp, base.py, marks(base.py), plain(base.py), en.defs, vi.defs, hvOf(base.simp),
        en.cls.length ? en.cls : vi.cls, [...new Set([...en.tags, ...vi.tags])], h ? (h.pos || []) : [],
        h ? (h.l20 || null) : null, h ? (h.l25 || null) : null, [...base.simp].length,
        vi.defs.join(' / ').toLowerCase(), en.defs.join(' / ').toLowerCase()]);
      if (batch.length >= 500) await flush();
    }
    await flush();
    log(`  đã ghi ${n} mục từ`);

    // ---- chữ
    const mmah = (await readFile(join(DATA, 'mmah_dictionary.txt'), 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l));
    let m = 0;
    for (const ch of mmah) {
      const et = ch.etymology || {};
      const h = hz.get(ch.character);
      await c.query(
        `INSERT INTO dict_chars (ch, definition, pinyin, decomposition, radical, etym_type, etym_hint, etym_semantic, etym_phonetic, strokes, hv)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (ch) DO UPDATE SET definition=$2, pinyin=$3, decomposition=$4, radical=$5, etym_type=$6, etym_hint=$7, etym_semantic=$8, etym_phonetic=$9, strokes=$10, hv=$11`,
        [ch.character, ch.definition || null, ch.pinyin || [], ch.decomposition || null, ch.radical || null,
         et.type || null, et.hint || null, et.semantic || null, et.phonetic || null, h ? h.sc : null, h ? h.hv : null]);
      m++;
    }
    log(`  đã ghi ${m} chữ`);

    // ---- câu ví dụ tự soạn
    const sentences = new Map();
    const nchar = zh => [...zh].filter(c => /[\u3400-\u9fff]/.test(c)).length;
    const add = (zh0, py, vi, src, lvl, ver) => {
      const zh = String(zh0 || '').replace(/^[甲乙丙丁]\s*[：:]\s*/, '').trim();   // bỏ tiền tố người nói trong ví dụ ngữ pháp
      if (zh && /[\u3400-\u9fff]/.test(zh) && !sentences.has(zh)) sentences.set(zh, { py, vi, src, lvl, ver, nchar: nchar(zh) });
    };
    const books = JSON.parse(await readFile(join(CONTENT, 'books.json'), 'utf8'));
    for (const b of Object.values(books)) for (const L of b.lessons) {
      for (const sc of L.dlg || []) for (const ln of sc.lines) add(ln.zh, ln.py, ln.vi, `book:${b.id}:${L.n}`, b.level, b.ver);
      for (const g of L.grammar) for (const ex of g.ex) add(ex.zh, ex.py, ex.vi, `book:${b.id}:${L.n}`, b.level, b.ver);
    }
    const grammar = JSON.parse(await readFile(join(CONTENT, 'grammar.json'), 'utf8'));
    for (const g of grammar) for (const ex of g.ex) if (ex.k !== 'h' && ex.zh) add(ex.zh, ex.py, ex.vi || null, `grammar:${g.code}`, g.l21 || null, null);
    let s = 0;
    for (const [zh, r] of sentences) {
      await c.query(`INSERT INTO dict_sentences (zh, py, vi, src, lvl, ver, nchar) VALUES ($1,$2,$3,$4,$5,$6,$7)
                     ON CONFLICT (zh) DO UPDATE SET py=$2, vi=$3, src=$4, lvl=$5, ver=$6, nchar=$7`, [zh, r.py || null, r.vi || null, r.src, r.lvl, r.ver, r.nchar]);
      s++;
    }
    log(`  đã ghi ${s} câu ví dụ`);
    // cặp hỏi-đáp: hai dòng liền nhau trong cùng cảnh hội thoại, dòng trước kết thúc bằng ？
    const idOf = new Map((await c.query('SELECT id, zh FROM dict_sentences')).rows.map(r => [r.zh, r.id]));
    await c.query('DELETE FROM dict_dialog_pairs');
    let pairs = 0;
    for (const b of Object.values(books)) for (const L of b.lessons) for (const sc of L.dlg || []) {
      for (let i = 0; i + 1 < sc.lines.length; i++) {
        const a = sc.lines[i], b2 = sc.lines[i + 1];
        if (!/[？?]\s*$/.test(a.zh) || !idOf.has(a.zh) || !idOf.has(b2.zh)) continue;
        await c.query('INSERT INTO dict_dialog_pairs (q_id, a_id, lvl, ver) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [idOf.get(a.zh), idOf.get(b2.zh), b.level, b.ver]);
        pairs++;
      }
    }
    log(`  đã ghi ${pairs} cặp hỏi-đáp`);
    // tần suất: đếm số câu ví dụ chứa từ (chỉ tính từ 1–2 chữ có trong HSK để nhanh); dùng cho bộ gõ pinyin
    await c.query(`UPDATE dict_entries e SET freq = sub.n FROM (
        SELECT e2.id, count(*)::int AS n FROM dict_entries e2 JOIN dict_sentences st ON st.zh LIKE '%' || e2.simp || '%'
        WHERE e2.nchar <= 2 AND (e2.hsk20 IS NOT NULL OR e2.hsk30 IS NOT NULL) GROUP BY e2.id) sub WHERE e.id = sub.id`);
    log('  đã tính tần suất từ HSK');
    await c.query('COMMIT');
    await c.query('ANALYZE dict_entries; ANALYZE dict_chars; ANALYZE dict_sentences;');
    log('xong');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release(); await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
