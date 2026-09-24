/** Mật khẩu, phiên đăng nhập và các endpoint tài khoản. */
import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cfg } from './config.js';
import { q, tx } from './db.js';
import { HttpError, bad, clearCookie, clientIp, json, parseCookies, rateLimit, readJson, setCookie } from './http.js';

const scrypt = promisify(_scrypt);
/**
 * Tham số scrypt: bộ nhớ cần = 128 * N * r = 16 MB mỗi lần băm (~45 ms trên vCPU thường).
 * Node giới hạn maxmem mặc định 32 MB nên phải khai báo tường minh; N cao hơn sẽ vượt hạn mức
 * và còn khiến nhiều request đăng nhập cùng lúc ngốn hết RAM của container.
 */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, N, r, p, salt, key] = stored.split('$');
  const expect = Buffer.from(key, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), expect.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(expect, got);   // so sánh theo thời gian cố định, tránh lộ thông tin qua độ trễ
}

const sha256 = (s) => createHash('sha256').update(s).digest();

/** Tạo phiên: token ngẫu nhiên trả cho trình duyệt, DB chỉ giữ bản băm. */
export async function createSession(userId, req, res) {
  const token = randomBytes(32).toString('base64url');
  const maxAge = cfg.sessionDays * 86400;
  await q(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' seconds')::interval)`,
    [userId, sha256(token), (req.headers['user-agent'] || '').slice(0, 300), clientIp(req) || null, String(maxAge)]
  );
  setCookie(res, cfg.cookieName, token, { maxAge });
  return token;
}

/** Đọc phiên từ cookie; tự gia hạn khi phiên đã dùng quá nửa thời hạn (sliding session). */
export async function getSession(req, res) {
  const token = parseCookies(req)[cfg.cookieName];
  if (!token) return null;
  const { rows } = await q(
    `SELECT s.id, s.user_id, s.expires_at, u.name, u.username, u.email, u.avatar_url, u.is_admin, u.disabled_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)]
  );
  const s = rows[0];
  if (!s) { if (res) clearCookie(res, cfg.cookieName); return null; }
  if (s.disabled_at) throw new HttpError(403, 'account_disabled', 'Tài khoản đã bị khoá.');
  const halfLife = Date.now() + (cfg.sessionDays * 86400 * 1000) / 2;
  if (new Date(s.expires_at).getTime() < halfLife) {
    await q(`UPDATE sessions SET expires_at = now() + ($2 || ' seconds')::interval, last_seen_at = now() WHERE id = $1`,
      [s.id, String(cfg.sessionDays * 86400)]);
    if (res) setCookie(res, cfg.cookieName, token, { maxAge: cfg.sessionDays * 86400 });
  } else {
    await q('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [s.id]);
  }
  return s;
}

export async function requireUser(req, res) {
  const s = await getSession(req, res);
  if (!s) throw new HttpError(401, 'unauthenticated', 'Bạn cần đăng nhập.');
  return s;
}

export const publicUser = (u) => ({
  id: u.user_id || u.id, name: u.name, username: u.username, email: u.email,
  avatarUrl: u.avatar_url || null, isAdmin: !!u.is_admin
});

export const audit = (userId, action, detail, req) =>
  q('INSERT INTO audit_log (user_id, action, detail, ip) VALUES ($1,$2,$3,$4)',
    [userId, action, detail, clientIp(req) || null]).catch(() => {});

/* ------------------------------------------------------------------ kiểm tra dữ liệu vào */
const RE_USER = /^[a-z0-9._]{3,24}$/;
const RE_MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function checkRegister({ name, username, email, password }) {
  const errs = {};
  if (!name || !String(name).trim() || String(name).trim().length > 60) errs.name = 'Tên hiển thị từ 1 đến 60 ký tự.';
  if (!RE_USER.test(String(username || '').toLowerCase())) errs.username = 'Tên đăng nhập gồm 3–24 ký tự: chữ thường, số, dấu chấm hoặc gạch dưới.';
  if (email && !RE_MAIL.test(String(email))) errs.email = 'Email chưa đúng định dạng.';
  if (!password || String(password).length < 8) errs.password = 'Mật khẩu cần tối thiểu 8 ký tự.';
  if (String(password || '').length > 200) errs.password = 'Mật khẩu quá dài.';
  if (Object.keys(errs).length) throw new HttpError(422, 'validation_failed', 'Dữ liệu chưa hợp lệ.', { fields: errs });
}

/* ------------------------------------------------------------------ endpoints */
export function mountAuth(router) {
  router.post('/api/auth/register', async (req, res) => {
    rateLimit(`reg:${clientIp(req)}`, 5, 60 * 60 * 1000);   // 5 tài khoản mỗi giờ cho mỗi IP
    const body = await readJson(req);
    checkRegister(body);
    const name = String(body.name).trim();
    const username = String(body.username).toLowerCase();
    const email = body.email ? String(body.email).trim() : null;
    const hash = await hashPassword(String(body.password));
    const user = await tx(async (t) => {
      const dup = await t.query('SELECT 1 FROM users WHERE username = $1 OR (email IS NOT NULL AND lower(email) = lower($2))',
        [username, email]);
      if (dup.rowCount) throw new HttpError(409, 'already_exists', 'Tên đăng nhập hoặc email đã được dùng.');
      const { rows } = await t.query('INSERT INTO users (name, username, email) VALUES ($1,$2,$3) RETURNING *', [name, username, email]);
      await t.query('INSERT INTO accounts (user_id, provider, password_hash, last_login_at) VALUES ($1,$2,$3, now())',
        [rows[0].id, 'password', hash]);
      return rows[0];
    });
    await createSession(user.id, req, res);
    audit(user.id, 'register', { method: 'password' }, req);
    json(res, 201, { user: publicUser(user) });
  });

  router.post('/api/auth/login', async (req, res) => {
    const ip = clientIp(req);
    rateLimit(`login:${ip}`, 10, 10 * 60 * 1000);           // 10 lần thử mỗi 10 phút cho mỗi IP
    const { id, password } = await readJson(req);
    const key = String(id || '').trim().toLowerCase();
    if (!key || !password) throw bad('missing_fields', 'Nhập tên đăng nhập và mật khẩu.');
    rateLimit(`login:acct:${key}`, 10, 10 * 60 * 1000);     // và 10 lần cho mỗi tài khoản, chặn dò từ nhiều IP
    const { rows } = await q(
      `SELECT u.*, a.password_hash FROM users u
       JOIN accounts a ON a.user_id = u.id AND a.provider = 'password'
       WHERE u.username = $1 OR lower(u.email) = $1`, [key]);
    const u = rows[0];
    const ok = u && await verifyPassword(String(password), u.password_hash);
    if (!ok) {
      audit(u ? u.id : null, 'login_failed', { key }, req);
      // thông báo chung: không tiết lộ tài khoản nào có thật
      throw new HttpError(401, 'invalid_credentials', 'Thông tin đăng nhập không đúng.');
    }
    if (u.disabled_at) throw new HttpError(403, 'account_disabled', 'Tài khoản đã bị khoá.');
    await q(`UPDATE accounts SET last_login_at = now() WHERE user_id = $1 AND provider = 'password'`, [u.id]);
    await createSession(u.id, req, res);
    audit(u.id, 'login', { method: 'password' }, req);
    json(res, 200, { user: publicUser(u) });
  });

  router.post('/api/auth/logout', async (req, res) => {
    const token = parseCookies(req)[cfg.cookieName];
    if (token) await q('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    clearCookie(res, cfg.cookieName);
    json(res, 200, { ok: true });
  });

  router.get('/api/auth/me', async (req, res) => {
    const s = await getSession(req, res);
    if (!s) return json(res, 200, { user: null });
    const { rows } = await q('SELECT provider FROM accounts WHERE user_id = $1 ORDER BY provider', [s.user_id]);
    json(res, 200, { user: publicUser(s), providers: rows.map((r) => r.provider) });
  });

  /** Đổi mật khẩu: bắt buộc nhập mật khẩu cũ, và huỷ mọi phiên khác để đá thiết bị lạ ra. */
  router.post('/api/account/password', async (req, res) => {
    const s = await requireUser(req, res);
    const { current, next } = await readJson(req);
    if (!next || String(next).length < 8) throw new HttpError(422, 'validation_failed', 'Mật khẩu mới cần tối thiểu 8 ký tự.', { fields: { next: 'Tối thiểu 8 ký tự.' } });
    const { rows } = await q(`SELECT password_hash FROM accounts WHERE user_id = $1 AND provider = 'password'`, [s.user_id]);
    if (rows[0]) {
      if (!await verifyPassword(String(current || ''), rows[0].password_hash)) throw new HttpError(403, 'wrong_password', 'Mật khẩu hiện tại không đúng.');
      await q(`UPDATE accounts SET password_hash = $2 WHERE user_id = $1 AND provider = 'password'`, [s.user_id, await hashPassword(String(next))]);
    } else {
      // tài khoản đăng nhập bằng Google/Zalo muốn đặt thêm mật khẩu
      await q(`INSERT INTO accounts (user_id, provider, password_hash) VALUES ($1,'password',$2)`, [s.user_id, await hashPassword(String(next))]);
    }
    const token = parseCookies(req)[cfg.cookieName];
    await q('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [s.user_id, sha256(token)]);
    audit(s.user_id, 'password_changed', {}, req);
    json(res, 200, { ok: true });
  });

  /** Xuất toàn bộ dữ liệu của người dùng (yêu cầu thường gặp về quyền riêng tư). */
  router.get('/api/account/export', async (req, res) => {
    const s = await requireUser(req, res);
    const [u, p, d] = await Promise.all([
      q('SELECT id, name, username, email, created_at FROM users WHERE id = $1', [s.user_id]),
      q('SELECT version, doc, updated_at FROM progress WHERE user_id = $1', [s.user_id]),
      q('SELECT day, xp FROM activity_days WHERE user_id = $1 ORDER BY day', [s.user_id])
    ]);
    json(res, 200, { user: u.rows[0], progress: p.rows[0] || null, days: d.rows });
  });

  /** Xoá tài khoản: ON DELETE CASCADE dọn sạch phiên, tiến độ và lịch sử học. */
  router.del('/api/account', async (req, res) => {
    const s = await requireUser(req, res);
    await q('DELETE FROM users WHERE id = $1', [s.user_id]);
    clearCookie(res, cfg.cookieName);
    json(res, 200, { ok: true });
  });
}
