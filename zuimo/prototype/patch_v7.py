#!/usr/bin/env python3
"""Zuimó v7: đăng nhập Google và Zalo, bỏ mã mời, thêm nút hiện/ẩn mật khẩu.
Chạy sau patch_v2 → patch_v6."""
import pathlib

P = pathlib.Path(__file__).parent / "template.html"
s = P.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f"khớp {n} lần (cần {count}): {old[:90]!r}"
    s = s.replace(old, new)


LOGO = s[s.index('<div class="brand big">') + len('<div class="brand big">'):s.index('</div>', s.index('<div class="brand big">'))]


def cut(start_mark, end_mark, new):
    global s
    a = s.index(start_mark)
    b = s.index(end_mark, a)
    s = s[:a] + new + s[b:]


# ---------------------------------------------------------------- bỏ mã mời, thêm tiện ích cho ô mật khẩu
rep("""const INVITES = ['ZUIMO-DEMO-2026'];""",
    r"""/* Ô mật khẩu có nút con mắt: người dùng xem lại đúng/sai trước khi gửi.
   Dùng type=password mặc định để trình duyệt vẫn lưu và tự điền được. */
const pwField = (id, label, auto, hint = '') => `<div class="fld">
  <label for="${id}">${label}</label>
  <div class="pwwrap">
    <input class="inp" id="${id}" type="password" autocomplete="${auto}" autocapitalize="off" spellcheck="false">
    <button type="button" class="pweye" data-act="pwtoggle" data-arg="${id}" aria-label="${tr('Hiện mật khẩu', 'Show password')}" aria-pressed="false">${ic('eye')}</button>
  </div>
  ${hint ? `<small class="hint">${hint}</small>` : ''}
  <div class="err" id="${id}Err" aria-live="polite"></div>
</div>`;
/* Đăng nhập mạng xã hội: nút dùng chung cho cả tab đăng nhập và đăng ký */
const socialButtons = () => `
  <button class="btn btn-google btn-block" data-act="oauth" data-arg="google">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 21.4 7.6 24 12 24z"/><path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.6 0 3.7 2.6 1.8 6.1l3.8 3C6.5 6.7 9 4.8 12 4.8z"/></svg>
    ${tr('Tiếp tục với Google', 'Continue with Google')}
  </button>
  <button class="btn btn-zalo btn-block" data-act="oauth" data-arg="zalo">
    <span class="zalo-ic" aria-hidden="true">Z</span>${tr('Tiếp tục với Zalo', 'Continue with Zalo')}
  </button>`;""")
rep("""const validInvite = code => INVITES.includes(code.trim().toUpperCase());""", "")

# ---------------------------------------------------------------- biểu mẫu đăng nhập / đăng ký
cut("""  const isReg = S.authTab === 'register';""", "function signIn(u) {", r"""  const isReg = S.authTab === 'register';
  view.innerHTML = `<div class="auth"><div class="card auth-card">
    <div class="brand big">${LOGO_HTML}</div>
    <p class="demo-flag">${tr('Bản demo giao diện. Tài khoản chỉ lưu trên trình duyệt này.', 'Interface demo. Accounts are stored in this browser only.')}</p>
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-act="authtab" data-arg="login" aria-selected="${!isReg}">${tr('Đăng nhập', 'Sign in')}</button>
      <button class="tab" role="tab" data-act="authtab" data-arg="register" aria-selected="${isReg}">${tr('Đăng ký', 'Sign up')}</button>
    </div>
    ${socialButtons()}
    <div class="orline">${isReg ? tr('hoặc tạo tài khoản bằng mật khẩu', 'or create a password account') : tr('hoặc đăng nhập bằng mật khẩu', 'or sign in with a password')}</div>
    ${isReg ? `
      ${field('aName', tr('Tên hiển thị', 'Display name'), 'text', 'name')}
      ${field('aUser', tr('Tên đăng nhập', 'Username'), 'text', 'username', tr('3–24 ký tự: chữ thường, số, dấu chấm hoặc gạch dưới.', '3–24 characters: lowercase letters, digits, dot or underscore.'))}
      ${field('aMail', tr('Email (không bắt buộc)', 'Email (optional)'), 'email', 'email', tr('Dùng để đặt lại mật khẩu khi có máy chủ thư ở giai đoạn sau.', 'Used for password resets once mail is set up.'))}
      ${pwField('aPass', tr('Mật khẩu', 'Password'), 'new-password', tr('Tối thiểu 8 ký tự. Bấm vào con mắt để xem lại mật khẩu vừa nhập.', 'At least 8 characters. Tap the eye to check what you typed.'))}
      ${pwField('aPass2', tr('Nhập lại mật khẩu', 'Confirm password'), 'new-password')}
      <button class="btn btn-block" id="authSubmit" data-act="register">${tr('Tạo tài khoản', 'Create account')}</button>
      <p class="auth-foot">${tr('Tạo tài khoản nghĩa là bạn đồng ý với điều khoản sử dụng của Zuimó.', 'By creating an account you accept the Zuimó terms.')}</p>`
    : `
      ${field('aUser', tr('Tên đăng nhập hoặc email', 'Username or email'), 'text', 'username')}
      ${pwField('aPass', tr('Mật khẩu', 'Password'), 'current-password')}
      <button class="btn btn-block" id="authSubmit" data-act="login">${tr('Đăng nhập', 'Sign in')}</button>
      <p class="auth-foot"><button class="linkbtn" data-act="forgot">${tr('Quên mật khẩu?', 'Forgot password?')}</button></p>`}
  </div></div>`;
}
""")

# ---------------------------------------------------------------- hành động
cut("""const AUTH_ACT = {""", """  async login() {""", r"""const AUTH_ACT = {
  authtab(a) { S.authTab = a; render({ keepScroll: true }); },
  /* Hiện/ẩn mật khẩu: giữ nguyên con trỏ để người dùng gõ tiếp được ngay */
  pwtoggle(a) {
    const inp = $('#' + a), btn = $(`[data-act="pwtoggle"][data-arg="${a}"]`);
    if (!inp) return;
    const show = inp.type === 'password';
    const pos = inp.selectionStart;
    inp.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? tr('Ẩn mật khẩu', 'Hide password') : tr('Hiện mật khẩu', 'Show password'));
    btn.classList.toggle('on', show);
    inp.focus();
    try { inp.setSelectionRange(pos, pos); } catch (e) { /* một số trình duyệt không cho với type=email */ }
  },
  /* Google và Zalo đều cần backend + domain đã xác minh, nên bản demo tĩnh chỉ giải thích các bước còn thiếu */
  oauth(a) {
    const isG = a === 'google';
    toast(isG
      ? tr('Đăng nhập Google cần OAuth Client ID và callback https://zuimo.io.vn/api/auth/callback/google, sẽ bật khi có backend ở giai đoạn 1.', 'Google sign-in needs an OAuth client and callback URL; it goes live with the phase 1 backend.')
      : tr('Đăng nhập Zalo cần ứng dụng đã xác minh domain zuimo.io.vn và callback /api/auth/callback/zalo, sẽ bật cùng backend giai đoạn 1.', 'Zalo sign-in needs a verified domain and callback URL; it goes live with the phase 1 backend.'));
  },
""")
rep("""    const u = val('aUser').trim().toLowerCase(), p = val('aPass');
    let bad = false;
    if (!u) { setErr('aUser', tr('Nhập tên đăng nhập.', 'Enter your username.')); bad = true; }
    if (!p) { setErr('aPass', tr('Nhập mật khẩu.', 'Enter your password.')); bad = true; }
    if (bad) return;
    const rec = store.get('users', {})[u];
    if (!rec || rec.hash !== await hashPw(p, rec.salt)) { setErr('aPass', tr('Tên đăng nhập hoặc mật khẩu không đúng.', 'Wrong username or password.')); return; }
    signIn({ name: rec.name, username: u, method: 'password' });""",
    """    const id = val('aUser').trim().toLowerCase(), p = val('aPass');
    let bad = false;
    if (!id) { setErr('aUser', tr('Nhập tên đăng nhập hoặc email.', 'Enter your username or email.')); bad = true; }
    if (!p) { setErr('aPass', tr('Nhập mật khẩu.', 'Enter your password.')); bad = true; }
    if (bad) return;
    const users = store.get('users', {});
    /* cho phép đăng nhập bằng email đã đăng ký, không chỉ tên đăng nhập */
    const u = users[id] ? id : Object.keys(users).find(k => (users[k].email || '').toLowerCase() === id);
    const rec = u && users[u];
    if (!rec || rec.hash !== await hashPw(p, rec.salt)) { setErr('aPass', tr('Thông tin đăng nhập không đúng.', 'Those details do not match an account.')); return; }
    signIn({ name: rec.name, username: u, method: 'password' });""")
rep("""    const code = val('aCode'), name = val('aName').trim(), u = val('aUser').trim().toLowerCase(), p = val('aPass'), p2 = val('aPass2');""",
    """    const name = val('aName').trim(), u = val('aUser').trim().toLowerCase(), mail = val('aMail').trim(), p = val('aPass'), p2 = val('aPass2');""")
rep("""    if (!validInvite(code)) errs.aCode = code.trim() ? tr('Mã mời không hợp lệ hoặc đã hết lượt dùng.', 'Invalid or used-up invite code.') : tr('Nhập mã mời.', 'Enter an invite code.');
    if (!name)""", """    if (!name)""")
rep("""    else if (users[u]) errs.aUser = tr('Tên đăng nhập này đã có người dùng.', 'That username is taken.');""",
    """    else if (users[u]) errs.aUser = tr('Tên đăng nhập này đã có người dùng.', 'That username is taken.');
    if (mail && !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(mail)) errs.aMail = tr('Email chưa đúng định dạng.', 'That email does not look valid.');
    else if (mail && Object.values(users).some(r => (r.email || '').toLowerCase() === mail.toLowerCase())) errs.aMail = tr('Email này đã được dùng.', 'That email is already in use.');""")
rep("""    users[u] = { name, salt, hash: await hashPw(p, salt), created: Date.now(), invite: code.trim().toUpperCase() };""",
    """    users[u] = { name, salt, hash: await hashPw(p, salt), created: Date.now(), email: mail };""")

# ---------------------------------------------------------------- hồ sơ: ghi rõ cách đăng nhập
rep("""${u.method === 'zalo' ? tr('đăng nhập bằng Zalo', 'signed in with Zalo') : tr('đăng nhập bằng mật khẩu', 'signed in with password')}""",
    """${({ zalo: tr('đăng nhập bằng Zalo', 'signed in with Zalo'), google: tr('đăng nhập bằng Google', 'signed in with Google') })[u.method] || tr('đăng nhập bằng mật khẩu', 'signed in with password')}""")

# ---------------------------------------------------------------- CSS
rep(""".btn-zalo{--c:#0068FF;--cd:#0049B3}""",
    """.btn-zalo{--c:#0068FF;--cd:#0049B3}
.zalo-ic{display:grid;place-items:center;width:20px;height:20px;border-radius:5px;background:#fff;color:#0068FF;font-weight:900;font-size:14px}
.btn-google{--c:var(--surface);--cd:var(--line);color:var(--ink);border:2px solid var(--line)}
.btn-google:hover{background:var(--surface-2,var(--paper))}
.auth-card .btn-block+.btn-block{margin-top:10px}
.pwwrap{position:relative;display:flex;align-items:center}
.pwwrap .inp{width:100%;padding-right:46px}
.pweye{position:absolute;right:6px;display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:10px;background:none;color:var(--ink-3);cursor:pointer}
.pweye:hover{background:var(--jade-soft);color:var(--jade-ink)}
.pweye.on{color:var(--jade-ink)}
.pweye svg{width:20px;height:20px}""")

s = s.replace("${LOGO_HTML}", LOGO)
P.write_text(s, encoding="utf-8")
print("patched v7 OK")
