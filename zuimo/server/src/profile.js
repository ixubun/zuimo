/**
 * Quản lý hồ sơ: đổi tên hiển thị, đổi ảnh đại diện, và trang tổng hợp thống kê + cấp độ.
 *
 * Ảnh đại diện lưu thẳng vào cột users.avatar_url dưới dạng data URL đã được client thu nhỏ
 * (tối đa 256x256, WebP/PNG/JPEG, <= 200 KB). Cách này đổi lại chút dung lượng DB để không phải
 * dựng thêm volume lưu file, không phải cấu hình route tĩnh và sao lưu vẫn chỉ một file dump.
 * Khi số người dùng lớn, chuyển sang object storage và chỉ lưu URL là đủ, phần còn lại không đổi.
 */
import { HttpError, bad, json, readJson } from './http.js';
import { q } from './db.js';
import { audit, publicUser, requireUser } from './auth.js';
import { levelFromXp } from './level.js';

const MAX_AVATAR_BYTES = 200 * 1024;
const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;

/** Kiểm tra data URL: đúng định dạng, đúng dung lượng, và phần base64 phải giải mã được. */
function checkAvatar(dataUrl) {
  const m = AVATAR_RE.exec(String(dataUrl));
  if (!m) throw bad('bad_avatar', 'Ảnh phải ở định dạng PNG, JPEG hoặc WebP.');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw bad('bad_avatar', 'Dữ liệu ảnh rỗng.');
  if (buf.length > MAX_AVATAR_BYTES) {
    throw new HttpError(413, 'avatar_too_large', 'Ảnh vượt quá 200 KB sau khi thu nhỏ.');
  }
  // đối chiếu chữ ký file với kiểu khai báo, tránh việc đổi đuôi để nhét nội dung khác
  const sig = buf.subarray(0, 12);
  const isPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47;
  const isJpg = sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff;
  const isWebp = sig.subarray(0, 4).toString('ascii') === 'RIFF' && sig.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!(isPng || isJpg || isWebp)) throw bad('bad_avatar', 'Nội dung tệp không phải ảnh hợp lệ.');
  return String(dataUrl);
}

export function mountProfile(router) {
  /** Trang hồ sơ: thông tin tài khoản + cấp độ + thống kê học tập, tính ngay trong SQL. */
  router.get('/api/profile', async (req, res) => {
    const s = await requireUser(req, res);
    const [u, prov, days, prog] = await Promise.all([
      q('SELECT id, name, username, email, avatar_url, created_at FROM users WHERE id = $1', [s.user_id]),
      q('SELECT provider, last_login_at FROM accounts WHERE user_id = $1 ORDER BY provider', [s.user_id]),
      q(`SELECT day, xp FROM activity_days WHERE user_id = $1 ORDER BY day`, [s.user_id]),
      q('SELECT doc, updated_at FROM progress WHERE user_id = $1', [s.user_id])
    ]);
    const doc = (prog.rows[0] && prog.rows[0].doc) || {};
    const p = doc.p || {};
    const totalXp = Math.max(Number(p.xp) || 0, days.rows.reduce((a, r) => a + r.xp, 0));

    // chuỗi ngày dài nhất tính từ bảng activity_days để không phụ thuộc số liệu client gửi lên
    let best = 0, run = 0, prev = null;
    for (const r of days.rows) {
      if (r.xp <= 0) continue;
      const d = new Date(r.day + 'T00:00:00Z');
      run = prev && d - prev === 86400000 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }

    json(res, 200, {
      user: { ...publicUser(u.rows[0]), createdAt: u.rows[0].created_at },
      providers: prov.rows.map((r) => ({ provider: r.provider, lastLoginAt: r.last_login_at })),
      level: levelFromXp(totalXp),
      stats: {
        totalXp,
        activeDays: days.rows.filter((r) => r.xp > 0).length,
        bestStreak: best,
        currentStreak: Number(p.streak) || 0,
        answered: Number(p.answered) || 0,
        correct: Number(p.correct) || 0,
        lessonsDone: Object.keys(p.bdone || {}).length,
        lessonsStarted: Object.keys(p.bseen || {}).length,
        charsWritten: Object.keys(p.charsDone || {}).length,
        cards: Object.keys(doc.srs || {}).length,
        lastSyncAt: (prog.rows[0] && prog.rows[0].updated_at) || null
      },
      days: days.rows
    });
  });

  /** Đổi tên hiển thị và/hoặc ảnh đại diện. Gửi avatar = null để xoá ảnh. */
  router.post('/api/account/profile', async (req, res) => {
    const s = await requireUser(req, res);
    const body = await readJson(req);
    const sets = [], vals = [s.user_id];
    const errs = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name || name.length > 60) errs.name = 'Tên hiển thị từ 1 đến 60 ký tự.';
      else { vals.push(name); sets.push(`name = $${vals.length}`); }
    }
    if (body.avatar !== undefined) {
      if (body.avatar === null || body.avatar === '') { vals.push(null); sets.push(`avatar_url = $${vals.length}`); }
      else {
        try { const a = checkAvatar(body.avatar); vals.push(a); sets.push(`avatar_url = $${vals.length}`); }
        catch (e) { errs.avatar = e.message; }
      }
    }
    if (Object.keys(errs).length) throw new HttpError(422, 'validation_failed', 'Dữ liệu chưa hợp lệ.', { fields: errs });
    if (!sets.length) throw bad('nothing_to_update', 'Không có thông tin nào để cập nhật.');

    const { rows } = await q(
      `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1
       RETURNING id, name, username, email, avatar_url, is_admin`, vals);
    audit(s.user_id, 'profile_updated', { fields: Object.keys(body) }, req);
    json(res, 200, { user: publicUser(rows[0]) });
  });
}
