#!/usr/bin/env python3
"""Zuimó v11: điều hướng ghi vào lịch sử trình duyệt (nút Back hoạt động, có link sâu dạng #stats)
và nút Quay lại trên các trang phụ. Chạy sau patch_v2 → patch_v10."""
import pathlib

P = pathlib.Path(__file__).parent / "template.html"
s = P.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f"khớp {n} lần (cần {count}): {old[:90]!r}"
    s = s.replace(old, new)


# ---------------------------------------------------------------- go(): ghi lịch sử
rep("""function go(r) {
  stopSpeech();
  if (r === 'practice') P = null;
  if (r === 'cards') C = null;
  S.route = r;
  render();
}""",
    r"""/* Mỗi lần đổi trang là một mục trong lịch sử trình duyệt, nên nút Back của trình duyệt,
   cử chỉ vuốt trên điện thoại và nút Quay lại trong app đều đưa về đúng trang trước.
   URL dùng dạng #route để chia sẻ được link sâu mà vẫn là một file tĩnh. */
S.hist = [];
function go(r, { replace = false } = {}) {
  stopSpeech();
  if (r === 'practice') P = null;
  if (r === 'cards') C = null;
  if (r !== S.route) {
    if (replace) history.replaceState({ r }, '', '#' + r);
    else { S.hist.push(S.route); if (S.hist.length > 30) S.hist.shift(); history.pushState({ r }, '', '#' + r); }
  }
  S.route = r;
  render();
}
/* Trình duyệt Back/Forward: chỉ đổi trang, không đẩy thêm mục lịch sử */
window.addEventListener('popstate', e => {
  const r = (e.state && e.state.r) || location.hash.slice(1) || 'home';
  if (!VIEWS[r]) return;
  stopSpeech();
  if (r === 'practice') P = null;
  if (r === 'cards') C = null;
  S.hist.pop();
  S.route = r;
  render();
});
/** Quay lại: có lịch sử trong app thì lùi một bước, không thì về trang chủ. */
function goBack() {
  if (S.hist.length) history.back();
  else go('home', { replace: true });
}
const backBtn = () => `<button class="icon-btn" data-act="back" aria-label="${tr('Quay lại', 'Back')}">${ic('back')}</button>`;""")

# ---------------------------------------------------------------- hành động back + nút trên các trang phụ
rep("""  proftab(a) { S.prof.tab = a; render({ keepScroll: true }); },""",
    """  proftab(a) { S.prof.tab = a; render({ keepScroll: true }); },
  back() { goBack(); },""")
rep("""  <div class="lhead"><h1>${tr('Thống kê học tập', 'Your progress')}</h1></div>""",
    """  <div class="lhead">${backBtn()}<h1>${tr('Thống kê học tập', 'Your progress')}</h1></div>""")
rep("""  view.innerHTML = `
  <div class="prof-grid">""",
    """  view.innerHTML = `
  <div class="lhead">${backBtn()}<h1>${tr('Hồ sơ của bạn', 'Your profile')}</h1></div>
  <div class="prof-grid">""")
rep("""  view.innerHTML = `<div class="auth"><div class="card auth-card">""",
    """  view.innerHTML = `<div class="auth">${S.hist.length ? `<div class="lhead">${backBtn()}<h1 class="muted" style="font-size:16px">${tr('Quay lại', 'Back')}</h1></div>` : ''}<div class="card auth-card">""")

# ---------------------------------------------------------------- mở đúng trang khi tải lại hoặc mở link sâu
rep("""render();
detectApi();""",
    """(function openFromHash() {
  const r = location.hash.slice(1);
  if (r && VIEWS[r] && r !== 'practice') S.route = r;   /* practice cần chọn nguồn trước nên không mở thẳng */
  history.replaceState({ r: S.route }, '', S.route === 'home' ? location.pathname : '#' + S.route);
})();
render();
detectApi();""")

P.write_text(s, encoding="utf-8")
print("patched v11 OK")
