/**
 * Đồng bộ tiến độ học giữa các thiết bị.
 *
 * Tiến độ là một tài liệu JSON (XP, chuỗi ngày, trạng thái thẻ FSRS, bài đã xem…).
 * Dùng khoá phiên bản lạc quan: client gửi kèm version nó đang giữ; nếu server đã đổi,
 * server KHÔNG ghi đè mà trả về bản của mình để client hợp nhất rồi gửi lại.
 *
 * Riêng XP theo ngày và các chỉ số cộng dồn thì hợp nhất ngay trên server theo nguyên tắc "lấy giá trị lớn hơn",
 * để học trên hai thiết bị trong cùng một ngày không bị mất điểm.
 */
import { HttpError, bad, json, readJson } from './http.js';
import { q, tx } from './db.js';
import { requireUser } from './auth.js';

const MAX_DOC_BYTES = 256 * 1024;   // đủ cho hàng nghìn thẻ; chặn client gửi rác

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Hợp nhất hai tài liệu tiến độ: số cộng dồn lấy max, ngày học lấy max theo từng ngày, còn lại ưu tiên bản mới gửi lên. */
export function mergeDoc(server = {}, client = {}) {
  const out = { ...server, ...client };
  const sp = server.p || {}, cp = client.p || {};
  const days = { ...(sp.days || {}) };
  for (const [k, v] of Object.entries(cp.days || {})) days[k] = Math.max(days[k] || 0, Number(v) || 0);
  out.p = {
    ...sp, ...cp,
    days,
    xp: Math.max(Number(sp.xp) || 0, Number(cp.xp) || 0),
    streak: Math.max(Number(sp.streak) || 0, Number(cp.streak) || 0),
    answered: Math.max(Number(sp.answered) || 0, Number(cp.answered) || 0),
    correct: Math.max(Number(sp.correct) || 0, Number(cp.correct) || 0),
    lastDay: [sp.lastDay, cp.lastDay].filter(Boolean).sort().pop() || null,
    seen: { ...(sp.seen || {}), ...(cp.seen || {}) },
    bseen: { ...(sp.bseen || {}), ...(cp.bseen || {}) },
    bdone: { ...(sp.bdone || {}), ...(cp.bdone || {}) },
    charsDone: { ...(sp.charsDone || {}), ...(cp.charsDone || {}) }
  };
  // Thẻ ghi nhớ: giữ bản có lịch ôn mới hơn để không mất tiến trình FSRS
  const ss = server.srs || {}, cs = client.srs || {};
  const srs = { ...ss };
  for (const [k, v] of Object.entries(cs)) {
    const a = ss[k];
    srs[k] = !a ? v : (new Date(v.due || 0) >= new Date(a.due || 0) ? v : a);
  }
  out.srs = srs;
  return out;
}

export function mountProgress(router) {
  router.get('/api/progress', async (req, res) => {
    const s = await requireUser(req, res);
    // dòng progress được tạo lười ở lần lưu đầu tiên; chưa có thì coi như version 0 để client đồng bộ không bị báo xung đột
    const { rows } = await q('SELECT version, doc, updated_at FROM progress WHERE user_id = $1', [s.user_id]);
    const row = rows[0] || { version: 0, doc: {}, updated_at: null };
    json(res, 200, { version: row.version, doc: row.doc, updatedAt: row.updated_at });
  });

  router.put('/api/progress', async (req, res) => {
    const s = await requireUser(req, res);
    const body = await readJson(req);
    if (!isPlainObject(body.doc)) throw bad('invalid_doc', 'Thiếu trường doc.');
    if (Buffer.byteLength(JSON.stringify(body.doc)) > MAX_DOC_BYTES) throw new HttpError(413, 'doc_too_large', 'Tiến độ vượt quá dung lượng cho phép.');

    const result = await tx(async (t) => {
      // khoá dòng để hai thiết bị gửi cùng lúc không ghi đè nhau
      const cur = await t.query('SELECT version, doc FROM progress WHERE user_id = $1 FOR UPDATE', [s.user_id]);
      const row = cur.rows[0] || { version: 0, doc: {} };
      const base = Number(body.version ?? row.version);
      const merged = mergeDoc(row.doc, body.doc);
      if (base !== row.version) {
        // client dựa trên bản cũ: vẫn hợp nhất được, nhưng báo lại để client nạp bản chuẩn
        const saved = await t.query(
          `INSERT INTO progress (user_id, version, doc, updated_at) VALUES ($1, $2, $3, now())
           ON CONFLICT (user_id) DO UPDATE SET version = progress.version + 1, doc = $3, updated_at = now()
           RETURNING version, doc, updated_at`, [s.user_id, 1, merged]);
        return { conflict: true, ...saved.rows[0] };
      }
      const saved = await t.query(
        `INSERT INTO progress (user_id, version, doc, updated_at) VALUES ($1, 1, $2, now())
         ON CONFLICT (user_id) DO UPDATE SET version = progress.version + 1, doc = $2, updated_at = now()
         RETURNING version, doc, updated_at`, [s.user_id, merged]);
      return { conflict: false, ...saved.rows[0] };
    });

    // ghi XP theo ngày ra bảng riêng để thống kê không phải mở JSON
    const days = Object.entries((body.doc.p && body.doc.p.days) || {}).slice(0, 400);
    if (days.length) {
      const values = days.map((_, i) => `($1, $${i * 2 + 2}::date, $${i * 2 + 3}::int)`).join(',');
      const params = [s.user_id, ...days.flatMap(([d, xp]) => [d, Math.max(0, Number(xp) || 0)])];
      await q(`INSERT INTO activity_days (user_id, day, xp) VALUES ${values}
               ON CONFLICT (user_id, day) DO UPDATE SET xp = GREATEST(activity_days.xp, EXCLUDED.xp)`, params);
    }
    json(res, result.conflict ? 409 : 200, {
      version: result.version, doc: result.doc, updatedAt: result.updated_at, merged: result.conflict
    });
  });

  /** Thống kê nhanh cho trang Tiến độ: XP 90 ngày và chuỗi ngày tính ngay trong SQL. */
  router.get('/api/stats', async (req, res) => {
    const s = await requireUser(req, res);
    const { rows } = await q(
      `SELECT day, xp FROM activity_days WHERE user_id = $1 AND day > current_date - interval '90 days' ORDER BY day`,
      [s.user_id]);
    const total = rows.reduce((a, r) => a + r.xp, 0);
    json(res, 200, { days: rows, total, activeDays: rows.filter((r) => r.xp > 0).length });
  });
}
