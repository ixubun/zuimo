/**
 * API luyện thi HSK (cần đăng nhập).
 *   GET  /api/exam/blueprints                 khung đề các cấp (số câu, phút, ngưỡng đỗ)
 *   GET  /api/exam/sets?ver&lvl               bộ đề admin đã nhập cho cấp đó
 *   POST /api/exam/start { ver, lvl, setId? } sinh (hoặc lấy) đề, trả bản thí sinh (không có đáp án)
 *   POST /api/exam/answer { id, answers }     lưu dần câu trả lời (tự động, chống mất khi tắt trình duyệt)
 *   POST /api/exam/submit { id, answers }     chấm, lưu kết quả, trả kết quả + đề đầy đủ để xem lại
 *   GET  /api/exam/paper?id                   xem lại đề đã nộp (kèm đáp án) hoặc tiếp tục đề dở
 *   GET  /api/exam/history                    danh sách đề đã làm và điểm
 *   POST/DELETE /api/exam/sets  (admin)       nhập / xoá bộ đề riêng
 */
import { q } from './db.js';
import { HttpError, bad, json, readJson } from './http.js';
import { requireUser } from './auth.js';
import { BLUEPRINTS, generatePaper, gradePaper, forCandidate } from './exam-gen.js';

const okVer = v => (v === '30' ? '30' : '20');
const okLvl = l => Math.min(6, Math.max(1, Number(l) || 1));

export function mountExam(router) {
  router.get('/api/exam/blueprints', async (req, res) => {
    await requireUser(req, res);
    json(res, 200, { blueprints: BLUEPRINTS }, { 'Cache-Control': 'public, max-age=3600' });
  });

  router.get('/api/exam/sets', async (req, res, url) => {
    const s = await requireUser(req, res);
    const ver = okVer(url.searchParams.get('ver')), lvl = okLvl(url.searchParams.get('lvl'));
    const all = url.searchParams.get('all') === '1' && s.is_admin;
    const { rows } = await q(`SELECT id, ver, lvl, title, kind, seq, enabled, created_at, (SELECT count(*) FROM jsonb_array_elements(paper->'sections')) AS nsec
                              FROM exam_sets WHERE ${all ? 'true' : 'enabled'} ${all ? '' : 'AND ver = $1 AND lvl = $2'} ORDER BY kind, seq NULLS LAST, id DESC`, all ? [] : [ver, lvl]);
    const { rows: counts } = await q(`SELECT ver, lvl, count(*)::int AS n FROM exam_sets WHERE enabled AND kind = 'bank' GROUP BY ver, lvl`);
    json(res, 200, { sets: rows, bank: counts });
  });

  router.post('/api/exam/start', async (req, res) => {
    const s = await requireUser(req, res);
    const b = await readJson(req);
    const ver = okVer(b.ver), lvl = okLvl(b.lvl);
    const mode = b.mode === 'practice' ? 'practice' : 'exam';
    let paper, source = 'generated', title = null;
    if (b.setId) {
      const { rows } = await q('SELECT paper, title FROM exam_sets WHERE id = $1 AND enabled', [Number(b.setId)]);
      if (!rows.length) throw new HttpError(404, 'set_not_found', 'Không có bộ đề này.');
      paper = rows[0].paper; source = `set:${b.setId}`; title = rows[0].title;
    } else {
      // mặc định: chọn ngẫu nhiên một đề trong ngân hàng của cấp; ngân hàng trống thì sinh mới
      const { rows } = await q(`SELECT id, paper, title FROM exam_sets WHERE enabled AND kind = 'bank' AND ver = $1 AND lvl = $2 ORDER BY random() LIMIT 1`, [ver, lvl]);
      if (rows.length) { paper = rows[0].paper; source = `set:${rows[0].id}`; title = rows[0].title; }
      else paper = await generatePaper(ver, lvl);
    }
    const { rows } = await q('INSERT INTO exam_papers (user_id, ver, lvl, source, mode, paper, started_at) VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING id, started_at',
      [s.user_id, ver, lvl, source, mode, JSON.stringify(paper)]);
    // luyện tập: gửi cả đáp án và lời giải để xem ngay sau mỗi câu; thi thử: bỏ đáp án
    json(res, 200, { id: rows[0].id, startedAt: rows[0].started_at, mode, title, paper: mode === 'practice' ? paper : forCandidate(paper) });
  });

  async function own(userId, id) {
    const { rows } = await q('SELECT * FROM exam_papers WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!rows.length) throw new HttpError(404, 'paper_not_found', 'Không có đề này.');
    return rows[0];
  }

  router.post('/api/exam/answer', async (req, res) => {
    const s = await requireUser(req, res);
    const b = await readJson(req);
    const p = await own(s.user_id, String(b.id || ''));
    if (p.finished_at) throw bad('finished', 'Đề đã nộp.');
    const answers = b.answers && typeof b.answers === 'object' ? b.answers : {};
    await q('UPDATE exam_papers SET answers = answers || $2::jsonb WHERE id = $1', [p.id, JSON.stringify(answers)]);
    json(res, 200, { ok: true });
  });

  router.post('/api/exam/submit', async (req, res) => {
    const s = await requireUser(req, res);
    const b = await readJson(req);
    const p = await own(s.user_id, String(b.id || ''));
    if (p.finished_at) { json(res, 200, { result: p.result, paper: p.paper, answers: p.answers }); return; }
    const answers = { ...p.answers, ...(b.answers && typeof b.answers === 'object' ? b.answers : {}) };
    const result = gradePaper(p.paper, answers);
    await q('UPDATE exam_papers SET answers = $2, result = $3, finished_at = now() WHERE id = $1', [p.id, JSON.stringify(answers), JSON.stringify(result)]);
    // ghi vào lịch sử luyện chung: điểm quy về 100 để so với các kỹ năng khác; XP theo kết quả
    const pct = Math.round((result.total / result.max) * 100);
    const xp = result.pass ? 50 : pct >= 40 ? 20 : 10;
    await q('INSERT INTO practice_attempts (user_id, kind, item_ref, score, detail) VALUES ($1,$2,$3,$4,$5)',
      [s.user_id, 'exam', `exam:${p.ver}-${p.lvl}:${p.id}`, pct, { total: result.total, max: result.max, pass: result.pass, xp }]);
    json(res, 200, { result, paper: p.paper, answers, xp });
  });

  router.get('/api/exam/paper', async (req, res, url) => {
    const s = await requireUser(req, res);
    const p = await own(s.user_id, url.searchParams.get('id') || '');
    json(res, 200, p.finished_at
      ? { id: p.id, finished: true, paper: p.paper, answers: p.answers, result: p.result, startedAt: p.started_at, finishedAt: p.finished_at }
      : { id: p.id, finished: false, mode: p.mode, paper: p.mode === 'practice' ? p.paper : forCandidate(p.paper), answers: p.answers, startedAt: p.started_at });
  });

  router.get('/api/exam/history', async (req, res) => {
    const s = await requireUser(req, res);
    const { rows } = await q(`SELECT p.id, p.ver, p.lvl, p.source, p.mode, p.started_at, p.finished_at, p.result->>'total' AS total, p.result->>'max' AS max, (p.result->>'pass')::boolean AS pass,
                                     (SELECT title FROM exam_sets es WHERE p.source = 'set:' || es.id) AS title
                              FROM exam_papers p WHERE p.user_id = $1 ORDER BY p.created_at DESC LIMIT 50`, [s.user_id]);
    json(res, 200, { papers: rows });
  });

  /* ---------------- bộ đề admin ---------------- */
  const requireAdmin = async (req, res) => { const s = await requireUser(req, res); if (!s.is_admin) throw new HttpError(403, 'admin_only', 'Chỉ quản trị viên.'); return s; };
  function checkPaper(p) {
    if (!p || !Array.isArray(p.sections) || !p.sections.length) throw bad('bad_paper', 'paper.sections phải là mảng.');
    let n = 0;
    for (const sec of p.sections) {
      if (!['listening', 'reading', 'writing'].includes(sec.key)) throw bad('bad_paper', `sections[].key phải là listening/reading/writing (nhận ${sec.key}).`);
      if (!Array.isArray(sec.parts)) throw bad('bad_paper', 'Mỗi section cần parts[].');
      for (const part of sec.parts) for (const it of part.items || []) {
        if (!it.kind || it.answer === undefined) throw bad('bad_paper', `Câu ${it.id || n + 1}: thiếu kind hoặc answer.`);
        it.id = it.id || `i${n + 1}`; it.num = ++n;
      }
    }
    p.total = p.total || (p.sections.length === 2 ? 200 : 300); p.pass = p.pass || (p.total === 200 ? 120 : 180); p.plays = p.plays || 1;
    return p;
  }
  router.post('/api/exam/sets', async (req, res) => {
    const s = await requireAdmin(req, res);
    const b = await readJson(req);
    const paper = checkPaper(b.paper);
    const { rows } = await q('INSERT INTO exam_sets (ver, lvl, title, paper, enabled, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, title',
      [okVer(b.ver), okLvl(b.lvl), String(b.title || '').slice(0, 200) || 'Bộ đề', JSON.stringify(paper), b.enabled !== false, s.user_id]);
    json(res, 200, { set: rows[0] });
  });
  /** Admin: chỉnh mốc thời gian một câu nghe của đề thật rồi cắt lại clip bằng ffmpeg trong container. */
  router.post('/api/exam/recut', async (req, res) => {
    await requireAdmin(req, res);
    const b = await readJson(req);
    const setId = Number(b.setId), itemId = String(b.itemId || ''), t0 = Number(b.t0), t1 = Number(b.t1);
    if (!setId || !itemId || !(t0 >= 0) || !(t1 > t0)) throw bad('bad_input', 'Cần setId, itemId, t0 < t1.');
    const { rows } = await q('SELECT paper FROM exam_sets WHERE id = $1', [setId]);
    if (!rows.length) throw new HttpError(404, 'set_not_found', 'Không có bộ đề.');
    const paper = rows[0].paper;
    const it = paper.sections.flatMap(s => s.parts.flatMap(p => p.items)).find(x => x.id === itemId);
    if (!it || !paper.audio) throw bad('no_audio', 'Câu này không có băng.');
    const { spawnSync } = await import('node:child_process');
    const media = process.env.MEDIA_DIR || '/app/media';
    const src = media + paper.audio.replace('/media', ''), out = media + it.audio.replace('/media', '');
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.max(0, t0 - 0.2)), '-to', String(t1 + 0.4), '-i', src, '-c:a', 'libmp3lame', '-q:a', '5', out]);
    if (r.status !== 0) throw new HttpError(500, 'ffmpeg_failed', 'Cắt băng thất bại: ' + String(r.stderr).slice(0, 200));
    it.t0 = t0; it.t1 = t1;
    await q('UPDATE exam_sets SET paper = $2 WHERE id = $1', [setId, JSON.stringify(paper)]);
    json(res, 200, { ok: true, item: { id: it.id, t0, t1, audio: it.audio + '?v=' + Date.now() } });
  });
  /** Admin: đề đầy đủ (kèm đáp án, mốc băng) để kiểm tra. */
  router.get('/api/exam/set', async (req, res, url) => {
    await requireAdmin(req, res);
    const { rows } = await q('SELECT id, title, ver, lvl, kind, paper FROM exam_sets WHERE id = $1', [Number(url.searchParams.get('id'))]);
    if (!rows.length) throw new HttpError(404, 'set_not_found', 'Không có bộ đề.');
    json(res, 200, { set: rows[0] });
  });

  router.del('/api/exam/sets', async (req, res, url) => {
    await requireAdmin(req, res);
    await q('DELETE FROM exam_sets WHERE id = $1', [Number(url.searchParams.get('id'))]);
    json(res, 200, { ok: true });
  });
}
