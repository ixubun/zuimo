/**
 * Cấu hình lấy từ biến môi trường. Thiếu biến bắt buộc thì dừng ngay khi khởi động
 * thay vì để lỗi xuất hiện lúc người dùng đang thao tác.
 */
const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Thiếu biến môi trường bắt buộc: ${k}`);
  return v;
};
const opt = (k, d = '') => process.env[k] || d;

export const cfg = {
  env: opt('NODE_ENV', 'production'),
  port: Number(opt('PORT', '3000')),
  /** Địa chỉ công khai của web, dùng để dựng callback URL và kiểm tra Origin (chống CSRF) */
  publicUrl: opt('PUBLIC_URL', 'http://localhost:8080').replace(/\/$/, ''),
  databaseUrl: need('DATABASE_URL'),
  /** Khoá HMAC cho state của OAuth; đổi khoá là vô hiệu mọi luồng đăng nhập đang dở */
  authSecret: need('AUTH_SECRET'),
  sessionDays: Number(opt('SESSION_DAYS', '30')),
  cookieName: opt('COOKIE_NAME', 'zs'),
  /** Chỉ bật cờ Secure khi chạy HTTPS; để dev qua http://localhost vẫn đăng nhập được */
  get cookieSecure() { return this.publicUrl.startsWith('https://'); },
  google: { id: opt('GOOGLE_CLIENT_ID'), secret: opt('GOOGLE_CLIENT_SECRET') },
  /** Giới hạn kích thước body để một request lỗi không ngốn hết RAM */
  maxBodyBytes: Number(opt('MAX_BODY_BYTES', String(2 * 1024 * 1024))),   // 2 MB: đủ cho ghi âm 25 giây WAV 16 kHz dạng base64
  trustProxy: opt('TRUST_PROXY', '1') === '1'
};

/* Hiện chỉ hỗ trợ Google. Muốn thêm nhà cung cấp khác thì bổ sung nhánh ở đây và một cặp route trong oauth.js. */
export const providerEnabled = (p) => (p === 'google' ? !!(cfg.google.id && cfg.google.secret) : false);
