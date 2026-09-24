#!/usr/bin/env python3
"""Zuimó v9: bỏ đăng nhập Zalo khỏi giao diện, chỉ giữ mật khẩu và Google.
Chạy sau patch_v2 → patch_v8."""
import pathlib

P = pathlib.Path(__file__).parent / "template.html"
s = P.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f"khớp {n} lần (cần {count}): {old[:90]!r}"
    s = s.replace(old, new)


# ---------------------------------------------------------------- nút đăng nhập: chỉ còn Google
rep("""const socialButtons = () => (S.api.on && !S.api.providers.google && !S.api.providers.zalo ? '' : `""",
    """/* Chỉ hiện khối này khi chạy chế độ tĩnh (giải thích cần backend) hoặc khi Google đã được cấu hình */
const socialButtons = () => (S.api.on && !S.api.providers.google ? '' : `""")
rep("""  <button class="btn btn-zalo btn-block" data-act="oauth" data-arg="zalo">
    <span class="zalo-ic" aria-hidden="true">Z</span>${tr('Tiếp tục với Zalo', 'Continue with Zalo')}
  </button>`);""",
    """`);""")

# ---------------------------------------------------------------- hành động oauth chỉ còn Google
rep("""  oauth(a) {
    /* Có backend và provider đã cấu hình thì chuyển hướng thật; còn lại giải thích phần còn thiếu */
    if (S.api.on && S.api.providers[a]) { location.href = '/api/auth/' + a; return; }
    const isG = a === 'google';
    toast(isG
      ? tr('Đăng nhập Google cần OAuth Client ID và callback https://zuimo.io.vn/api/auth/callback/google, sẽ bật khi có backend ở giai đoạn 1.', 'Google sign-in needs an OAuth client and callback URL; it goes live with the phase 1 backend.')
      : tr('Đăng nhập Zalo cần ứng dụng đã xác minh domain zuimo.io.vn và callback /api/auth/callback/zalo, sẽ bật cùng backend giai đoạn 1.', 'Zalo sign-in needs a verified domain and callback URL; it goes live with the phase 1 backend.'));
  },""",
    """  oauth(a) {
    /* Có backend và Google đã cấu hình thì chuyển hướng thật; bản tĩnh chỉ giải thích phần còn thiếu */
    if (S.api.on && S.api.providers[a]) { location.href = '/api/auth/' + a; return; }
    toast(tr('Đăng nhập Google cần backend đang chạy và OAuth Client ID đã cấu hình.', 'Google sign-in needs the backend running with an OAuth client configured.'));
  },""")

# ---------------------------------------------------------------- hồ sơ: bỏ nhãn Zalo
rep("""${({ zalo: tr('đăng nhập bằng Zalo', 'signed in with Zalo'), google: tr('đăng nhập bằng Google', 'signed in with Google') })[u.method] || tr('đăng nhập bằng mật khẩu', 'signed in with password')}""",
    """${u.method === 'google' ? tr('đăng nhập bằng Google', 'signed in with Google') : tr('đăng nhập bằng mật khẩu', 'signed in with password')}""")

# ---------------------------------------------------------------- CSS không còn dùng
rep(""".btn-zalo{--c:#0068FF;--cd:#0049B3}
.zalo-ic{display:grid;place-items:center;width:20px;height:20px;border-radius:5px;background:#fff;color:#0068FF;font-weight:900;font-size:14px}
""", "")

# ---------------------------------------------------------------- ghi chú cũ trong phần đăng nhập
rep("""   Bản chính thức: Better Auth trên server, mật khẩu băm scrypt/argon2, mã mời kiểm tra trong PostgreSQL,""",
    """   Bản chính thức: API Node + PostgreSQL, mật khẩu băm scrypt, đăng nhập Google qua OAuth,""")

P.write_text(s, encoding="utf-8")
print("patched v9 OK")
