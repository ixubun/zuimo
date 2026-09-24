# Đăng nhập Zuimó: mật khẩu và Google

Hệ thống hỗ trợ hai cách đăng nhập: **tài khoản mật khẩu** và **Google**.
Đăng nhập Zalo đã được gỡ khỏi cả backend lẫn giao diện (xem mục 6).

## 1. Đường dẫn callback

| Nhà cung cấp | Redirect URI đăng ký |
|---|---|
| Google | `https://zuimo.io.vn/api/auth/callback/google` |

Phải khớp từng ký tự, không thừa dấu `/` ở cuối, nếu không sẽ gặp lỗi `redirect_uri_mismatch`.

## 2. Đăng ký ứng dụng Google

1. `console.cloud.google.com` → tạo project.
2. **APIs & Services → Google Auth Platform → Get started**: App name Zuimó, Audience **External**.
   (Google đã đổi tên mục này từ "OAuth consent screen" nên hướng dẫn cũ trên mạng hay sai đường dẫn menu.)
3. **Branding**: home page `https://zuimo.io.vn`, privacy `https://zuimo.io.vn/chinh-sach-rieng-tu.html`,
   terms `https://zuimo.io.vn/dieu-khoan.html`, authorized domain `zuimo.io.vn`.
   Domain phải được xác minh trước trong Google Search Console bằng cùng tài khoản, nếu không sẽ báo
   "home page URL is not registered to you".
4. **Clients → Create client** → Web application:
   - JavaScript origins: `https://zuimo.io.vn`
   - Redirect URI: `https://zuimo.io.vn/api/auth/callback/google`
5. **Data Access**: `openid`, `email`, `profile` (nhóm không nhạy cảm, không phải qua thẩm định).
6. **Audience**: ở chế độ Testing chỉ test user đăng nhập được (tối đa 100); bấm Publish app để mở cho mọi người.

## 3. Biến môi trường

```env
AUTH_URL / PUBLIC_URL=https://zuimo.io.vn
AUTH_SECRET=<openssl rand -base64 32>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Điền vào `deploy/.env` rồi `docker compose up -d`. Kiểm tra:

```bash
curl -s https://zuimo.io.vn/api/auth/providers    # {"password":true,"google":true}
curl -si https://zuimo.io.vn/api/auth/google | head -3   # 302 tới accounts.google.com
```

Để trống hai khoá Google thì `/api/auth/google` trả 503 và giao diện tự ẩn nút, nên hệ thống vẫn chạy bình thường
với đăng nhập bằng mật khẩu.

## 4. Ghép nhiều cách đăng nhập vào một tài khoản

```
user(id, name, username, email, created_at)
account(id, user_id, provider, provider_account_id, password_hash, created_at)
   provider: 'password' | 'google'
```

Nếu email Google trùng email của tài khoản đã có **và Google xác nhận email đã xác minh**, hệ thống gắn thêm
account Google vào user cũ thay vì tạo user mới. Điều kiện email đã xác minh là cố ý, tránh người khác
chiếm tài khoản bằng email chưa xác minh.

## 5. Bảo mật đã áp dụng

- `state` ký HMAC, hạn 10 phút, lưu trong cookie ngắn hạn.
- PKCE S256 cho luồng Google.
- Mật khẩu băm scrypt (N=16384, r=8) kèm salt, so sánh theo thời gian cố định.
- Phiên đăng nhập: token 32 byte, cookie HttpOnly + Secure + SameSite=Lax, database chỉ lưu bản băm.

## 6. Về việc gỡ Zalo

Đã gỡ: route `/api/auth/zalo`, callback, cấu hình `ZALO_APP_ID` / `ZALO_APP_SECRET`, nút trên giao diện và CSS liên quan.
Hai endpoint cũ nay trả 404.

Lược đồ cơ sở dữ liệu **vẫn chấp nhận** giá trị `provider = 'zalo'` trong bảng `accounts`, để dữ liệu cũ (nếu từng có)
không bị lỗi ràng buộc. Muốn khôi phục tính năng sau này thì thêm lại nhánh trong `providerEnabled` (`server/src/config.js`)
và một cặp route trong `server/src/oauth.js`.
