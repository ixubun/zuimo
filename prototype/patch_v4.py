#!/usr/bin/env python3
"""Zuimó v4: nhận diện thương hiệu. Chạy sau patch_v2.py và patch_v3.py."""
import pathlib

P = pathlib.Path(__file__).parent / "template.html"
s = P.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f"khớp {n} lần (cần {count}): {old[:90]!r}"
    s = s.replace(old, new)


LOGO = ('<img class="logo logo-l" src="__LOGO_LIGHT__" alt="Zuimó" width="__LOGO_W__" height="__LOGO_H__">'
        '<img class="logo logo-d" src="__LOGO_DARK__" alt="" aria-hidden="true" width="__LOGO_W__" height="__LOGO_H__">')

# ---------------------------------------------------------------- <head>
rep("""<title>ZUIMO – Học tiếng Trung theo HSK 3.0</title>""",
    """<title>Zuimó – Học tiếng Trung theo HSK 2.0 và HSK 3.0</title>
<meta name="description" content="Học tiếng Trung theo giáo trình HSK 2.0 và HSK 3.0: từ vựng có Hán Việt, ngữ pháp, hội thoại, tập viết chữ Hán, thẻ nhớ và luyện tập.">
<meta name="theme-color" content="#F4F8F6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0F171D" media="(prefers-color-scheme: dark)">
<link rel="icon" type="image/svg+xml" href="__FAVICON_SVG__">
<link rel="icon" type="image/png" sizes="32x32" href="__FAVICON_PNG__">
<link rel="apple-touch-icon" href="__APPLE_ICON__">
__HEAD_EXTRA__""")

# ---------------------------------------------------------------- màu thương hiệu
rep("""  --verm:#F25C3C;--verm-d:#C43F20;--verm-soft:#FDE8E2;--verm-ink:#8A2A13;""",
    """  --brand:#FD7047;                                   /* cam thương hiệu, chỉ dùng trang trí (tương phản 2,8:1) */
  --verm:#E85A34;--verm-d:#B8401F;--verm-strong:#C43F20;--verm-soft:#FFE9E1;--verm-ink:#8A2A13;""")
rep("""  --ink:#1B2430;--ink-2:#4B5664;--ink-3:#6F7A88;""", """  --ink:#1A1E26;--ink-2:#4B5664;--ink-3:#6F7A88;""")
# nút nền cam có chữ trắng: dùng biến thể đậm để đạt tương phản 5:1
rep(""".btn-verm{--c:var(--verm);--cd:var(--verm-d)}""", """.btn-verm{--c:var(--verm-strong);--cd:#8F2E16}""")
rep(""".checkbar.bad .btn{--c:var(--verm);--cd:var(--verm-d)}""", """.checkbar.bad .btn{--c:var(--verm-strong);--cd:#8F2E16}""")
rep(""".r-again{--c:var(--verm);--cd:var(--verm-d)}""", """.r-again{--c:var(--verm-strong);--cd:#8F2E16}""")
rep(""".chip.streak svg{color:var(--verm)}""", """.chip.streak svg{color:var(--brand)}""")

# ---------------------------------------------------------------- logo
rep("""<div class="brand"><span class="mark" aria-hidden="true">Z</span>ZUIMO</div>""",
    f"""<a class="brand" href="#" data-act="nav" data-arg="home" aria-label="Zuimó – trang chủ">{LOGO}</a>""")
rep("""<div class="brand brand-m"><span class="mark" aria-hidden="true">Z</span>ZUIMO</div>""",
    f"""<a class="brand brand-m" href="#" data-act="nav" data-arg="home" aria-label="Zuimó – trang chủ">{LOGO}</a>""")
rep("""<div class="brand big"><span class="mark" aria-hidden="true">Z</span>ZUIMO</div>""",
    f"""<div class="brand big">{LOGO}</div>""")
rep(""".toast{position:fixed;""", """.brand{text-decoration:none}
.logo{display:block;height:38px;width:auto}
.logo-d{display:none}
.brand-m .logo{height:30px}
.brand.big .logo{height:56px}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .logo-l{display:none}:root:not([data-theme="light"]) .logo-d{display:block}}
:root[data-theme="dark"] .logo-l{display:none}
:root[data-theme="dark"] .logo-d{display:block}
.toast{position:fixed;""")
# thẻ <a> điều hướng: chặn nhảy trang "#"
rep("""document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;""",
    """document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  if (b.tagName === 'A') e.preventDefault();""")

P.write_text(s, encoding="utf-8")
print("patched v4 OK")
