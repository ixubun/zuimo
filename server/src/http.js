/** Lớp HTTP tối giản: định tuyến, đọc JSON, cookie, giới hạn tần suất, ghi log. */
import { randomUUID } from 'node:crypto';
import { cfg } from './config.js';

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}
export const bad = (code, msg, extra) => new HttpError(400, code, msg, extra);

export function json(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(data);
}

/** Đọc body JSON có giới hạn kích thước; body rỗng trả về {} */
export function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    let over = false;
    req.on('data', (c) => {
      if (over) return;
      size += c.length;
      if (size > cfg.maxBodyBytes) {
        over = true;
        // Ngừng đọc nhưng KHÔNG đóng socket ngay: phải kịp gửi phản hồi 413,
        // nếu destroy luôn thì client chỉ thấy "connection reset" và không biết vì sao.
        req.pause();
        reject(new HttpError(413, 'body_too_large', 'Dữ liệu gửi lên quá lớn.'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(bad('invalid_json', 'Body không phải JSON hợp lệ.')); }
    });
    req.on('error', reject);
  });
}

export const parseCookies = (req) => Object.fromEntries(
  (req.headers.cookie || '').split(';').map((p) => p.trim()).filter(Boolean)
    .map((p) => { const i = p.indexOf('='); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; })
);

export function setCookie(res, name, value, { maxAge, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (cfg.cookieSecure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, parts.join('; ')) : parts.join('; '));
}
export const clearCookie = (res, name) => setCookie(res, name, '', { maxAge: 0 });

/** IP thật khi đứng sau Caddy; chỉ tin X-Forwarded-For nếu TRUST_PROXY=1 */
export const clientIp = (req) => {
  if (cfg.trustProxy) {
    const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
};

/** Giới hạn tần suất trong bộ nhớ: đủ cho một tiến trình; nhiều bản sao thì chuyển sang Redis. */
const buckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.start > b.windowMs * 2) buckets.delete(k);
}, 60_000).unref();

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start >= windowMs) { b = { start: now, n: 0, windowMs }; buckets.set(key, b); }
  b.n += 1;
  if (b.n > limit) {
    const retry = Math.ceil((b.start + windowMs - now) / 1000);
    throw new HttpError(429, 'rate_limited', 'Bạn thao tác quá nhanh, vui lòng thử lại sau.', { retryAfter: retry });
  }
}

/**
 * Chống CSRF cho cookie SameSite=Lax: mọi request thay đổi dữ liệu phải có Origin trùng site.
 * Cookie Lax vẫn được gửi kèm điều hướng GET từ site khác, nên riêng GET không cần kiểm tra.
 */
export function assertSameOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.origin;
  if (!origin) return; // client không phải trình duyệt (curl, app di động) – đã có cookie HttpOnly bảo vệ
  if (origin.replace(/\/$/, '') !== cfg.publicUrl) {
    throw new HttpError(403, 'bad_origin', 'Yêu cầu đến từ nguồn không hợp lệ.');
  }
}

/** Bộ định tuyến đơn giản: khớp phương thức + đường dẫn cố định. */
export function createRouter() {
  const routes = [];
  const add = (method, path, handler) => routes.push({ method, path, handler });
  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    put: (p, h) => add('PUT', p, h),
    del: (p, h) => add('DELETE', p, h),
    async handle(req, res) {
      const started = Date.now();
      const rid = randomUUID().slice(0, 8);
      const url = new URL(req.url, cfg.publicUrl);
      const route = routes.find((r) => r.method === req.method && r.path === url.pathname);
      try {
        if (!route) throw new HttpError(404, 'not_found', 'Không có endpoint này.');
        assertSameOrigin(req);
        await route.handler(req, res, url);
      } catch (e) {
        const known = e instanceof HttpError;
        const he = known ? e : new HttpError(500, 'server_error', 'Lỗi máy chủ.');
        // chỉ lỗi ngoài dự kiến mới kèm stack; lỗi có chủ đích (503, 429…) ghi mức cảnh báo cho gọn log
        if (!known) console.error(JSON.stringify({ lvl: 'error', rid, msg: e.message, stack: e.stack }));
        else if (he.status >= 500) console.warn(JSON.stringify({ lvl: 'warn', rid, code: he.code, msg: he.message }));
        const headers = he.extra.retryAfter ? { 'Retry-After': String(he.extra.retryAfter) } : {};
        if (he.status === 413) {
          // client có thể vẫn đang gửi phần còn lại: báo đóng kết nối rồi huỷ sau khi đã gửi xong phản hồi
          headers.Connection = 'close';
          res.once('finish', () => req.destroy());
        }
        if (!res.headersSent) json(res, he.status, { error: he.code, message: he.message, ...he.extra }, headers);
      } finally {
        console.log(JSON.stringify({
          lvl: 'info', rid, m: req.method, p: url.pathname, s: res.statusCode,
          ms: Date.now() - started, ip: clientIp(req)
        }));
      }
    }
  };
}
