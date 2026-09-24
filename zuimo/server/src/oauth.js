/**
 * Đăng nhập Google (OIDC + PKCE).
 *
 * Luồng: /api/auth/google tạo state + code_verifier, ký HMAC rồi đặt vào cookie ngắn hạn,
 * chuyển hướng sang Google; /api/auth/callback/google kiểm tra state, đổi code lấy token,
 * lấy hồ sơ, rồi ghép vào user có sẵn hoặc tạo user mới.
 *
 * Lược đồ cơ sở dữ liệu vẫn chấp nhận provider 'zalo' để dữ liệu cũ (nếu có) không bị hỏng,
 * nhưng hệ thống không còn cung cấp luồng đăng nhập Zalo.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cfg, providerEnabled } from './config.js';
import { q, tx } from './db.js';
import { HttpError, clearCookie, parseCookies, setCookie } from './http.js';
import { audit, createSession } from './auth.js';

const STATE_COOKIE = 'zoauth';
const STATE_TTL = 10 * 60; // 10 phút là quá đủ cho một lần đăng nhập

const b64url = (b) => Buffer.from(b).toString('base64url');
const sign = (payload) => createHmac('sha256', cfg.authSecret).update(payload).digest('base64url');

function packState(data) {
  const payload = b64url(JSON.stringify({ ...data, exp: Date.now() + STATE_TTL * 1000 }));
  return `${payload}.${sign(payload)}`;
}
function unpackState(raw) {
  const [payload, sig] = String(raw || '').split('.');
  if (!payload || !sig) throw new HttpError(400, 'bad_state', 'Phiên đăng nhập không hợp lệ, hãy thử lại.');
  const expect = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) throw new HttpError(400, 'bad_state', 'Chữ ký state không khớp.');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (data.exp < Date.now()) throw new HttpError(400, 'state_expired', 'Phiên đăng nhập đã hết hạn, hãy thử lại.');
  return data;
}

const redirectUri = (p) => `${cfg.publicUrl}/api/auth/callback/${p}`;

/**
 * Tải ảnh đại diện từ nhà cung cấp về và đổi thành data URL.
 *
 * Lý do không lưu thẳng URL của Google: trang web đặt CSP `img-src 'self' data:`, ảnh ở
 * lh3.googleusercontent.com sẽ bị chặn. Nới CSP cho host ngoài cũng đồng nghĩa mỗi lần xem hồ sơ là
 * trình duyệt người dùng lại gọi sang Google (lộ IP, và ảnh hỏng nếu Google đổi URL).
 * Tải một lần lúc đăng nhập thì hồ sơ tự chủ, đồng nhất với ảnh người dùng tự tải lên.
 */
async function fetchAvatar(url, max = 200 * 1024) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    const r = await fetch(u, { signal: AbortSignal.timeout(5000), redirect: 'follow' });
    if (!r.ok) return null;
    const type = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > max) return null;   // ảnh quá lớn thì bỏ qua, người dùng vẫn tự tải lên được
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;                                        // lỗi mạng không được phép làm hỏng luồng đăng nhập
  }
}

/** Chuyển hướng về web kèm thông báo lỗi, thay vì trả JSON giữa luồng đăng nhập của trình duyệt. */
function backToApp(res, ok, err) {
  const url = ok ? `${cfg.publicUrl}/?login=ok` : `${cfg.publicUrl}/?login=error&reason=${encodeURIComponent(err || 'unknown')}`;
  res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' });
  res.end();
}

async function fetchJson(url, init, what) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* nhà cung cấp trả về không phải JSON */ }
  if (!r.ok) throw new HttpError(502, 'provider_error', `${what} thất bại (${r.status}).`, { detail: text.slice(0, 200) });
  return data;
}

/**
 * Ghép hồ sơ từ nhà cung cấp vào cơ sở dữ liệu:
 *  1. Đã có account đúng provider + uid  -> đăng nhập luôn.
 *  2. Có email trùng user sẵn có         -> gắn thêm account vào user đó (chỉ áp dụng khi email đã xác minh).
 *  3. Còn lại                            -> tạo user mới, sinh username không trùng.
 */
async function upsertUser({ provider, uid, name, email, avatar, emailVerified }) {
  return tx(async (t) => {
    const found = await t.query(
      `SELECT u.* FROM accounts a JOIN users u ON u.id = a.user_id WHERE a.provider = $1 AND a.provider_uid = $2`,
      [provider, uid]);
    if (found.rowCount) {
      await t.query(`UPDATE accounts SET last_login_at = now() WHERE provider = $1 AND provider_uid = $2`, [provider, uid]);
      return { user: found.rows[0], created: false };
    }
    if (email && emailVerified) {
      const byMail = await t.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
      if (byMail.rowCount) {
        await t.query(`INSERT INTO accounts (user_id, provider, provider_uid, last_login_at) VALUES ($1,$2,$3, now())
                       ON CONFLICT (user_id, provider) DO UPDATE SET last_login_at = now()`, [byMail.rows[0].id, provider, uid]);
        return { user: byMail.rows[0], created: false };
      }
    }
    // sinh username từ email hoặc tên, thêm hậu tố khi trùng
    const base = (email ? email.split('@')[0] : name || provider).toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20) || provider;
    let username = base.length >= 3 ? base : `${base}user`;
    for (let i = 0; i < 20; i++) {
      const dup = await t.query('SELECT 1 FROM users WHERE username = $1', [username]);
      if (!dup.rowCount) break;
      username = `${base.slice(0, 18)}${Math.floor(Math.random() * 900 + 100)}`;
    }
    const { rows } = await t.query(
      'INSERT INTO users (name, username, email, email_verified, avatar_url) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name || username, username, email || null, !!emailVerified, avatar || null]);
    await t.query('INSERT INTO accounts (user_id, provider, provider_uid, last_login_at) VALUES ($1,$2,$3, now())',
      [rows[0].id, provider, uid]);
    return { user: rows[0], created: true };
  });
}

export function mountOAuth(router) {
  /* ---------------- bắt đầu luồng ---------------- */
  {
    const provider = 'google';
    router.get(`/api/auth/${provider}`, async (req, res) => {
      if (!providerEnabled(provider)) throw new HttpError(503, 'provider_disabled', `Chưa cấu hình đăng nhập ${provider}.`);
      const state = randomBytes(16).toString('base64url');
      const verifier = randomBytes(32).toString('base64url');           // PKCE: Zalo bắt buộc, Google cũng nên dùng
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      setCookie(res, STATE_COOKIE, packState({ provider, state, verifier }), { maxAge: STATE_TTL, sameSite: 'Lax' });

      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: cfg.google.id, redirect_uri: redirectUri('google'), response_type: 'code',
        scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256',
        prompt: 'select_account'
      });
      res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' });
      res.end();
    });
  }

  /* ---------------- Google trả về ---------------- */
  router.get('/api/auth/callback/google', async (req, res, url) => {
    try {
      const st = unpackState(parseCookies(req)[STATE_COOKIE]);
      clearCookie(res, STATE_COOKIE);
      if (url.searchParams.get('error')) return backToApp(res, false, url.searchParams.get('error'));
      if (st.provider !== 'google' || url.searchParams.get('state') !== st.state) return backToApp(res, false, 'state_mismatch');
      const code = url.searchParams.get('code');
      if (!code) return backToApp(res, false, 'missing_code');

      const tok = await fetchJson('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: cfg.google.id, client_secret: cfg.google.secret,
          redirect_uri: redirectUri('google'), grant_type: 'authorization_code', code_verifier: st.verifier
        })
      }, 'Đổi code Google');

      const me = await fetchJson('https://openidconnect.googleapis.com/v1/userinfo',
        { headers: { Authorization: `Bearer ${tok.access_token}` } }, 'Lấy hồ sơ Google');

      // Google trả URL có tham số kích thước; xin bản 256px cho vừa khung hồ sơ
      const picture = me.picture ? me.picture.replace(/=s\d+(-c)?$/, '=s256-c') : null;
      const { user, created } = await upsertUser({
        provider: 'google', uid: me.sub, name: me.name, email: me.email,
        avatar: await fetchAvatar(picture), emailVerified: me.email_verified === true
      });
      await createSession(user.id, req, res);
      audit(user.id, created ? 'register' : 'login', { method: 'google' }, req);
      backToApp(res, true);
    } catch (e) {
      backToApp(res, false, e.code || 'google_failed');
    }
  });

  /** Cho giao diện biết nút nào nên hiện: chỉ hiện provider đã cấu hình đủ khoá. */
  router.get('/api/auth/providers', async (req, res) => {
    const { json } = await import('./http.js');
    json(res, 200, { password: true, google: providerEnabled('google') });
  });
}
