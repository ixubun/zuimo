import { bookId } from '../content/books.js';
import { BOOKS, lvName, lvsFor, verName } from '../content/data.js';
import { $ } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { S } from '../core/state.js';
import { tr } from '../core/util.js';
import { liveStreak } from '../features/xp.js';
import { avatarHtml } from '../views/profile.js';

/* ---------- Khung: nav + thanh trên ---------- */
function isDark() {
  const a = document.documentElement.dataset.theme;
  if (a) return a === 'dark';
  return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
}
/* Menu dọc: mục có submenu mở ra danh sách cấp độ của từng lộ trình.
   Thêm giáo trình mới chỉ cần thêm sách vào BOOKS, submenu tự cập nhật. */
function navLevels(ver) {
  return lvsFor(ver).map(k => {
    const B = BOOKS[bookId(ver, k)];
    return {
      act: B ? 'gobook' : 'golib', arg: `${ver}-${k}`,
      label: `HSK ${lvName(k)}`,
      note: B ? `${B.lessons.length} ${tr('bài', 'lessons')}` : tr('Tra từ vựng', 'Vocabulary'),
      dim: !B,
      on: (S.route === 'lessons' || S.route === 'book') && S.ver === ver && S.bookLv === k && !!B
    };
  });
}
function navTree() {
  return [
    { id: 'home', icon: 'home', label: tr('Trang chủ', 'Home') },
    { id: 'lessons', icon: 'book', label: tr('Bài học', 'Lessons'), groups: [
      { title: `HSK 2.0 · ${tr('6 cấp độ', '6 levels')}`, items: navLevels('20') },
      { title: `HSK 3.0 · ${tr('9 cấp độ', '9 levels')}`, items: navLevels('30') },
      { title: tr('Khác', 'More'), items: [
        { act: 'nav', arg: 'lesson', label: tr('Nhập môn: thanh điệu, bộ thủ', 'Starter: tones and radicals'), note: tr('Bài mẫu', 'Sample'), on: S.route === 'lesson' }] }
    ] },
    { id: 'library', icon: 'library', label: tr('Thư viện', 'Library'), groups: [
      { title: verName(), items: [
        { act: 'golibtab', arg: 'words', label: tr('Từ vựng', 'Vocabulary'), on: S.route === 'library' && S.lib.tab === 'words' },
        { act: 'golibtab', arg: 'hanzi', label: tr('Chữ Hán', 'Characters'), on: S.route === 'library' && S.lib.tab === 'hanzi' },
        { act: 'golibtab', arg: 'grammar', label: tr('Ngữ pháp', 'Grammar'), on: S.route === 'library' && S.lib.tab === 'grammar' }] },
      { title: tr('Đổi lộ trình', 'Switch path'), items: ['20', '30'].map(v => ({ act: 'ver', arg: v, label: verName(v), note: v === '20' ? tr('6 cấp', '6 levels') : tr('9 cấp', '9 levels'), on: S.ver === v })) }
    ] },
    { id: 'tools', icon: 'search', label: tr('Công cụ', 'Tools'), groups: [
      { title: tr('Tra cứu', 'Reference'), items: [
        { act: 'nav', arg: 'dict', label: tr('Từ điển', 'Dictionary'), note: tr('Trung–Việt–Anh', 'ZH–VI–EN'), on: S.route === 'dict' }] },
      ...(S.user && S.user.isAdmin ? [{ title: tr('Quản trị viên', 'Admin'), items: [
        { act: 'nav', arg: 'admin', label: tr('Quản trị', 'Admin'), note: tr('Clip, nội dung', 'Clips, content'), on: S.route === 'admin' }] }] : [])
    ] },
    { id: 'practice', icon: 'target', label: tr('Luyện tập', 'Practice'), groups: [
      { title: tr('Kỹ năng', 'Skills'), items: [
        { act: 'nav', arg: 'practice', label: tr('Từ vựng', 'Vocabulary'), note: tr('Theo bài, theo cấp', 'By lesson or level'), on: S.route === 'practice' },
        { act: 'gated', arg: 'listen', label: tr('Luyện nghe', 'Listening'), note: tr('Nghe – chép', 'Dictation'), on: S.route === 'listen' },
        { act: 'gated', arg: 'speak', label: tr('Luyện phát âm', 'Pronunciation'), note: tr('Shadowing', 'Shadowing'), on: S.route === 'speak' },
        { act: 'gated', arg: 'write', label: tr('Luyện viết', 'Writing'), note: tr('Gõ chữ Hán', 'Type Chinese'), on: S.route === 'write' },
        { act: 'gated', arg: 'exam', label: tr('Luyện thi HSK', 'HSK mock exams'), note: tr('Đề mô phỏng', 'Mock exams'), on: S.route === 'exam' }] }
    ] },
    { id: 'cards', icon: 'cards', label: tr('Thẻ nhớ', 'Flashcards') },
    { id: 'stats', icon: 'chart', label: tr('Thống kê', 'Progress') }
  ];
}
function renderNav() {
  const tree = navTree();
  const active = (S.route === 'lesson' || S.route === 'book') ? 'lessons' : (S.route === 'dict' || S.route === 'admin') ? 'tools' : ['listen', 'speak', 'write', 'exam'].includes(S.route) ? 'practice' : S.route;
  const plain = it => `<button class="navbtn" data-act="nav" data-arg="${it.id}" ${active === it.id ? 'aria-current="page"' : ''}>${ic(it.icon)}<span>${it.label}</span></button>`;
  $('#sideNav').innerHTML = tree.map(it => {
    if (!it.groups) return plain(it);
    const open = !!S.navOpen[it.id];
    return `<div class="navgroup ${open ? 'open' : ''}">
      <button class="navbtn" data-act="navtoggle" data-arg="${it.id}" aria-expanded="${open}" ${active === it.id ? 'aria-current="page"' : ''}>
        ${ic(it.icon)}<span>${it.label}</span>${ic('chev', 'nchev')}</button>
      <div class="submenu">${it.groups.map(g => `<div class="subgrp">
        <div class="subttl">${g.title}</div>
        ${g.items.map(x => `<button class="subbtn ${x.on ? 'on' : ''} ${x.dim ? 'dim' : ''}" data-act="${x.act}" data-arg="${x.arg}">
          <span>${x.label}</span>${x.note ? `<span class="sn">${x.note}</span>` : ''}</button>`).join('')}
      </div>`).join('')}</div>
    </div>`;
  }).join('');
  /* thanh dưới trên điện thoại chỉ đủ chỗ 5 mục; Thống kê mở từ thẻ chuỗi ngày ở trang chủ */
  $('#bottomNav').innerHTML = tree.filter(x => x.id !== 'stats' && x.id !== 'tools').map(plain).join('');   /* Công cụ mở từ nút tìm kiếm ở thanh trên */
  $('#aboutLink').textContent = tr('Nguồn dữ liệu và giấy phép', 'Data sources and licences');
  $('#sideFoot').textContent = tr('Bản thử nghiệm giai đoạn 0. Tiến độ chỉ lưu trên trình duyệt này.', 'Phase 0 prototype. Progress is saved in this browser only.');
}
function renderTopRight() {
  const st = liveStreak();
  $('#topRight').innerHTML = `
    <span class="chip streak" title="${tr('Chuỗi ngày học', 'Day streak')}">${ic('flame')}<span>${st}</span><span class="lbl">${tr('ngày', 'days')}</span></span>
    <span class="chip xp" title="XP">${ic('bolt')}<span>${S.p.xp}</span><span class="lbl">XP</span></span>
    <button class="icon-btn" data-act="lang" aria-label="${tr('Chuyển sang tiếng Anh', 'Switch to Vietnamese')}">${S.lang === 'vi' ? 'EN' : 'VI'}</button>
    <button class="icon-btn" data-act="nav" data-arg="dict" aria-label="${tr('Từ điển', 'Dictionary')}" title="${tr('Từ điển', 'Dictionary')}">${ic('search')}</button>
  <button class="icon-btn" data-act="nav" data-arg="${S.user ? 'profile' : 'login'}" aria-label="${S.user ? tr('Tài khoản', 'Account') : tr('Đăng nhập', 'Sign in')}">${S.user ? avatarHtml(S.user, 'av-sm') : ic('user')}</button>
    <button class="icon-btn" data-act="theme" aria-label="${isDark() ? tr('Bật giao diện sáng', 'Use light theme') : tr('Bật giao diện tối', 'Use dark theme')}">${ic(isDark() ? 'sun' : 'moon')}</button>`;
}

export { isDark, navLevels, navTree, renderNav, renderTopRight };
