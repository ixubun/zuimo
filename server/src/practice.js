/**
 * API luyện tập (cần đăng nhập).
 *
 *   GET  /api/practice/listening/items?ver=20&lvl=1&n=10&len=short   câu để luyện nghe (có audio nếu đã sinh)
 *   POST /api/practice/attempt   { kind, itemRef, answer, target }   chấm điểm và lưu; trả về điểm + so khớp từng chữ
 *   GET  /api/practice/history?kind=listening&n=30                  lịch sử luyện
 *   GET  /api/practice/clips?kind=listening&lvl=                    clip YouTube đã bật
 *   POST /api/practice/clips   (admin) thêm/sửa clip: { youtubeId, title, lvl, kind, segments, enabled }
 *   DELETE /api/practice/clips?id=  (admin)
 *
 * Chấm nghe/viết: so chữ Hán, bỏ dấu câu và khoảng trắng. Điểm = 1 - khoảng cách Levenshtein / độ dài đáp án,
 * kèm dãy so khớp (đúng / sai / thiếu / thừa) để giao diện tô màu từng chữ.
 */
import { q } from './db.js';
import { HttpError, bad, json, readJson } from './http.js';
import { requireUser } from './auth.js';

const CJK = /[\u3400-\u9fff]/;
const normalize = s => [...String(s || '')].filter(c => CJK.test(c) || /[0-9A-Za-z]/.test(c)).join('');

/** So khớp hai chuỗi bằng quy hoạch động; trả về điểm phần trăm và dãy thao tác để tô màu. */
export function scoreText(target, answer) {
  const t = [...normalize(target)], a = [...normalize(answer)];
  const n = t.length, m = a.length;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (t[i - 1] === a[j - 1] ? 0 : 1));
  }
  // lần ngược để lấy dãy thao tác
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && t[i - 1] === a[j - 1] && d[i][j] === d[i - 1][j - 1]) { ops.push({ op: 'ok', c: t[i - 1] }); i--; j--; }
    else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) { ops.push({ op: 'sub', c: t[i - 1], got: a[j - 1] }); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ op: 'miss', c: t[i - 1] }); i--; }
    else { ops.push({ op: 'extra', got: a[j - 1] }); j--; }
  }
  ops.reverse();
  const score = n ? Math.max(0, Math.round((1 - d[n][m] / n) * 100)) : 0;
  return { score, ops, correct: ops.filter(o => o.op === 'ok').length, total: n };
}

/** XP theo điểm: đủ 60% mới có điểm, tối đa 10 XP một câu; thi thử tính riêng. */
const xpFor = (kind, score) => (kind === 'exam' ? 0 : score < 60 ? 0 : score >= 95 ? 10 : score >= 80 ? 7 : 4);

export function mountPractice(router) {
  router.get('/api/practice/listening/items', async (req, res, url) => {
    await requireUser(req, res);
    const ver = url.searchParams.get('ver') === '30' ? '30' : '20';
    const lvl = Math.min(7, Math.max(1, Number(url.searchParams.get('lvl')) || 1));
    const n = Math.min(30, Math.max(1, Number(url.searchParams.get('n')) || 10));
    const len = url.searchParams.get('len') || 'any';
    const lenWhere = len === 'short' ? 'AND nchar BETWEEN 3 AND 8' : len === 'long' ? 'AND nchar >= 9' : 'AND nchar >= 3';
    // câu của đúng phiên bản + ví dụ ngữ pháp chuẩn (ver NULL); ưu tiên câu đã có audio
    const { rows } = await q(
      `SELECT id, zh, py, vi, src, lvl, audio, nchar FROM dict_sentences
       WHERE lvl = $1 AND (ver = $2 OR ver IS NULL) ${lenWhere}
       ORDER BY (audio IS NULL), random() LIMIT $3`, [lvl, ver, n]);
    json(res, 200, { items: rows.map(r => ({ ref: `sent:${r.id}`, ...r })) });
  });

  /**
   * Đề luyện viết (gõ chữ Hán).
   *   mode=sentence: câu có bản dịch tiếng Việt (để làm đề Việt → Hán và Hán → gõ lại)
   *   mode=word:     từ vựng HSK của cấp đó có nghĩa Việt (dict_entries), ưu tiên từ 2–4 chữ
   */
  router.get('/api/practice/writing/items', async (req, res, url) => {
    await requireUser(req, res);
    const ver = url.searchParams.get('ver') === '30' ? '30' : '20';
    const lvl = Math.min(7, Math.max(1, Number(url.searchParams.get('lvl')) || 1));
    const n = Math.min(30, Math.max(1, Number(url.searchParams.get('n')) || 10));
    const mode = url.searchParams.get('mode') === 'word' ? 'word' : 'sentence';
    if (mode === 'word') {
      const col = ver === '30' ? 'hsk30' : 'hsk20';
      const { rows } = await q(
        `SELECT id, simp AS zh, pinyin_marks AS py, vi[1] AS vi, hv, nchar FROM dict_entries
         WHERE ${col} = $1 AND vi <> '{}' AND nchar BETWEEN 1 AND 4 AND simp !~ '[A-Za-z0-9]'
         ORDER BY (nchar = 1), random() LIMIT $2`, [lvl, n]);
      json(res, 200, { items: rows.map(r => ({ ref: `word:${r.id}`, zh: r.zh, py: r.py, vi: r.vi, hv: r.hv, nchar: r.nchar })) });
      return;
    }
    const { rows } = await q(
      `SELECT id, zh, py, vi, src, lvl, audio, nchar FROM dict_sentences
       WHERE lvl = $1 AND (ver = $2 OR ver IS NULL) AND vi IS NOT NULL AND vi <> '' AND nchar BETWEEN 3 AND 20
       ORDER BY random() LIMIT $3`, [lvl, ver, n]);
    json(res, 200, { items: rows.map(r => ({ ref: `sent:${r.id}`, ...r })) });
  });

  /** Gợi ý chữ cho bộ gõ pinyin trên trang: pinyin không dấu -> từ, ưu tiên từ HSK và từ ngắn. */
  router.get('/api/practice/ime', async (req, res, url) => {
    await requireUser(req, res);
    const plain = String(url.searchParams.get('q') || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 30);
    if (!plain) { json(res, 200, { cands: [] }); return; }
    const { rows } = await q(
      `SELECT DISTINCT ON (simp) simp, pinyin_marks AS py, vi[1] AS vi, hsk30, nchar, freq,
              CASE WHEN pinyin_plain = $1 THEN 0 ELSE 1 END AS rank
       FROM dict_entries WHERE pinyin_plain LIKE $2 AND simp !~ '[A-Za-z0-9]'
       ORDER BY simp, rank, (hsk30 IS NULL), hsk30, nchar`, [plain, plain + '%']);
    // từ HSK lên trước (người học cần), rồi mới tới khớp đúng và độ dài; chữ hiếm ngoài HSK xếp cuối
    rows.sort((a, b) => (a.hsk30 ? 0 : 1) - (b.hsk30 ? 0 : 1) || a.rank - b.rank || (a.hsk30 || 99) - (b.hsk30 || 99) || b.freq - a.freq || a.nchar - b.nchar);
    json(res, 200, { cands: rows.slice(0, 9).map(r => ({ s: r.simp, py: r.py, vi: r.vi })) }, { 'Cache-Control': 'public, max-age=3600' });
  });

  router.post('/api/practice/attempt', async (req, res) => {
    const s = await requireUser(req, res);
    const body = await readJson(req);
    const kind = ['listening', 'writing', 'speaking', 'exam'].includes(body.kind) ? body.kind : null;
    if (!kind) throw bad('bad_kind', 'kind không hợp lệ.');
    const itemRef = String(body.itemRef || '').slice(0, 80);
    if (!itemRef) throw bad('missing_ref', 'Thiếu itemRef.');
    let result;
    if (kind === 'listening' || kind === 'writing') {
      if (typeof body.target !== 'string' || typeof body.answer !== 'string') throw bad('missing_text', 'Thiếu target/answer.');
      result = scoreText(body.target.slice(0, 500), body.answer.slice(0, 500));
    } else {
      // speaking / exam: giao diện đã chấm, server chỉ kiểm tra khoảng điểm và lưu
      const sc = Number(body.score);
      if (!(sc >= 0 && sc <= 100)) throw bad('bad_score', 'score phải từ 0 đến 100.');
      result = { score: Math.round(sc), ops: [], correct: null, total: null };
    }
    const xp = xpFor(kind, result.score);
    const detail = { ...(body.detail && typeof body.detail === 'object' ? body.detail : {}), correct: result.correct, total: result.total, xp };
    await q('INSERT INTO practice_attempts (user_id, kind, item_ref, score, detail) VALUES ($1,$2,$3,$4,$5)', [s.user_id, kind, itemRef, result.score, detail]);
    json(res, 200, { ...result, xp });
  });

  router.get('/api/practice/history', async (req, res, url) => {
    const s = await requireUser(req, res);
    const kind = url.searchParams.get('kind');
    const n = Math.min(100, Math.max(1, Number(url.searchParams.get('n')) || 30));
    const where = kind ? 'user_id = $1 AND kind = $2' : 'user_id = $1';
    const base = kind ? [s.user_id, kind] : [s.user_id];
    const [{ rows }, { rows: [agg] }] = await Promise.all([
      q(`SELECT id, kind, item_ref, score, detail, created_at FROM practice_attempts WHERE ${where} ORDER BY created_at DESC LIMIT $${base.length + 1}`, [...base, n]),
      q(`SELECT count(*)::int AS attempts, coalesce(round(avg(score)), 0)::int AS avg_score,
                count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week
         FROM practice_attempts WHERE ${where}`, base)
    ]);
    json(res, 200, { attempts: rows, stats: agg });
  });

  /* ---------------- clip YouTube: thư viện theo chủ đề ---------------- */
  const CLIP_COLS = 'id, youtube_id, title, topic, tags, lvl, kind, duration, description, segments, enabled, created_at';
  const clipPublic = c => ({ ...c, thumb: `https://i.ytimg.com/vi/${c.youtube_id}/hqdefault.jpg`, nseg: c.segments.length });

  /** Danh sách chủ đề kèm số clip, cho trang thư viện. */
  router.get('/api/practice/topics', async (req, res, url) => {
    await requireUser(req, res);
    const kind = url.searchParams.get('kind');
    const params = kind ? [kind] : [];
    const { rows } = await q(
      `SELECT topic, count(*)::int AS n, min(lvl) AS min_lvl, max(lvl) AS max_lvl FROM media_clips
       WHERE enabled ${kind ? `AND (kind = $1 OR kind = 'both')` : ''} GROUP BY topic ORDER BY n DESC, topic`, params);
    json(res, 200, { topics: rows });
  });

  router.get('/api/practice/clips', async (req, res, url) => {
    const s = await requireUser(req, res);
    const kind = url.searchParams.get('kind'), topic = url.searchParams.get('topic');
    const lvl = Number(url.searchParams.get('lvl')) || null, id = Number(url.searchParams.get('id')) || null;
    const all = url.searchParams.get('all') === '1' && s.is_admin;      // admin xem cả clip đã tắt
    const params = []; const where = [all ? 'true' : 'enabled'];
    if (id) { params.push(id); where.push(`id = $${params.length}`); }
    if (kind) { params.push(kind); where.push(`(kind = $${params.length} OR kind = 'both')`); }
    if (topic) { params.push(topic); where.push(`topic = $${params.length}`); }
    if (lvl) { params.push(lvl); where.push(`(lvl IS NULL OR lvl = $${params.length})`); }
    const { rows } = await q(`SELECT ${CLIP_COLS} FROM media_clips WHERE ${where.join(' AND ')} ORDER BY topic, lvl NULLS LAST, id DESC LIMIT 200`, params);
    json(res, 200, { clips: rows.map(clipPublic) });
  });

  const requireAdmin = async (req, res) => {
    const s = await requireUser(req, res);
    if (!s.is_admin) throw new HttpError(403, 'admin_only', 'Chỉ quản trị viên mới thêm được clip.');
    return s;
  };
  const YT = /^[A-Za-z0-9_-]{11}$/;
  function checkSegments(segs) {
    if (!Array.isArray(segs) || !segs.length || segs.length > 300) throw bad('bad_segments', 'Cần 1–300 đoạn.');
    return segs.map((x, i) => {
      const start = Number(x.start), end = Number(x.end);
      if (!(start >= 0) || !(end > start)) throw bad('bad_segments', `Đoạn ${i + 1}: mốc thời gian không hợp lệ.`);
      if (!x.zh || !CJK.test(x.zh)) throw bad('bad_segments', `Đoạn ${i + 1}: thiếu chữ Hán.`);
      return { start, end, zh: String(x.zh).slice(0, 300), py: String(x.py || '').slice(0, 400), vi: String(x.vi || '').slice(0, 400) };
    });
  }
  router.post('/api/practice/clips', async (req, res) => {
    const s = await requireAdmin(req, res);
    const b = await readJson(req);
    const m = /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/.exec(String(b.youtubeId || ''));
    const id = m ? m[1] : String(b.youtubeId || '').trim();
    if (!YT.test(id)) throw bad('bad_youtube', 'Mã video YouTube không hợp lệ.');
    const segs = checkSegments(b.segments);
    const kind = ['listening', 'shadowing', 'both'].includes(b.kind) ? b.kind : 'both';
    const lvl = b.lvl ? Math.min(7, Math.max(1, Number(b.lvl))) : null;
    const topic = String(b.topic || 'general').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'general';
    const tags = Array.isArray(b.tags) ? b.tags.map(t => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 12) : [];
    const duration = b.duration ? Math.max(1, Math.round(Number(b.duration))) : Math.round(segs[segs.length - 1].end);
    const { rows } = await q(
      `INSERT INTO media_clips (youtube_id, title, topic, tags, lvl, kind, duration, description, segments, enabled, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (youtube_id) DO UPDATE SET title=$2, topic=$3, tags=$4, lvl=$5, kind=$6, duration=$7, description=$8, segments=$9, enabled=$10, updated_at=now()
       RETURNING ${CLIP_COLS}`,
      [id, String(b.title || '').trim().slice(0, 200) || id, topic, tags, lvl, kind, duration, String(b.description || '').slice(0, 1000) || null,
       JSON.stringify(segs), b.enabled !== false, s.user_id]);
    json(res, 200, { clip: clipPublic(rows[0]) });
  });
  router.del('/api/practice/clips', async (req, res, url) => {
    await requireAdmin(req, res);
    const id = Number(url.searchParams.get('id'));
    if (!id) throw bad('missing_id', 'Thiếu id.');
    await q('DELETE FROM media_clips WHERE id = $1', [id]);
    json(res, 200, { ok: true });
  });
}
