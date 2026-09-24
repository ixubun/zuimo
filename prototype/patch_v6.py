#!/usr/bin/env python3
"""Zuimó v6: menu dọc có submenu (lộ trình 6 cấp / 9 cấp) và trang chủ dạng bảng tổng hợp.
Chạy sau patch_v2 → patch_v5."""
import pathlib

P = pathlib.Path(__file__).parent / "template.html"
s = P.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f"khớp {n} lần (cần {count}): {old[:90]!r}"
    s = s.replace(old, new)


def cut(start_mark: str, end_mark: str, new: str):
    """Thay nguyên một khối mã, xác định bằng mốc đầu và mốc cuối (mốc cuối được giữ lại)."""
    global s
    a = s.index(start_mark)
    b = s.index(end_mark, a)
    s = s[:a] + new + s[b:]


# ---------------------------------------------------------------- trạng thái menu
rep("""  bookLv: store.get('bookLv', 1),              /* quyển đang học trong phiên bản hiện tại */""",
    """  bookLv: store.get('bookLv', 1),              /* quyển đang học trong phiên bản hiện tại */
  navOpen: store.get('navOpen', { lessons: true }),   /* nhóm menu đang mở */""")

# ---------------------------------------------------------------- điều hướng có submenu
cut("function renderNav() {", "function renderTopRight() {", r"""/* Menu dọc: mục có submenu mở ra danh sách cấp độ của từng lộ trình.
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
    { id: 'practice', icon: 'target', label: tr('Luyện tập', 'Practice') },
    { id: 'cards', icon: 'cards', label: tr('Thẻ nhớ', 'Flashcards') },
    { id: 'stats', icon: 'chart', label: tr('Thống kê', 'Progress') }
  ];
}
function renderNav() {
  const tree = navTree();
  const active = (S.route === 'lesson' || S.route === 'book') ? 'lessons' : S.route;
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
  $('#bottomNav').innerHTML = tree.filter(x => x.id !== 'stats').map(plain).join('');
  $('#aboutLink').textContent = tr('Nguồn dữ liệu và giấy phép', 'Data sources and licences');
  $('#sideFoot').textContent = tr('Bản thử nghiệm giai đoạn 0. Tiến độ chỉ lưu trên trình duyệt này.', 'Phase 0 prototype. Progress is saved in this browser only.');
}
""")

# ---------------------------------------------------------------- trang chủ dạng bảng tổng hợp
cut("function renderHome() {", "\nfunction renderLessons() {", r"""/* Cấp người học: 150 XP một cấp */
const userLevel = xp => { const lv = Math.floor(xp / 150) + 1; return { lv, into: xp - (lv - 1) * 150, need: 150 }; };

/* Bài học nổi bật: chọn theo ngày nên mỗi ngày một bộ khác nhau, nhưng trong ngày thì ổn định */
function featuredLessons(n) {
  const all = [];
  ['20', '30'].forEach(ver => booksOfVer(ver).forEach(lv => BOOKS[bookId(ver, lv)].lessons.forEach(L => all.push({ ver, lv, L }))));
  const seed = Math.floor(Date.now() / 864e5), out = [], used = new Set();
  for (let i = 0; out.length < n && i < all.length * 2; i++) {
    const j = (seed * 7 + i * 13) % all.length;
    if (used.has(j)) continue;
    used.add(j); out.push(all[j]);
  }
  return out;
}

/* Lịch nhiệt 90 ngày: mỗi ô là một ngày, đậm dần theo XP */
function heatCells() {
  const cells = [];
  const first = new Date(Date.now() - 89 * 864e5);
  for (let i = 0; i < (first.getDay() + 6) % 7; i++) cells.push(null);   /* chừa ô trống để cột bắt đầu từ thứ Hai */
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5), k = dayKey(d);
    cells.push({ k, xp: S.p.days[k] || 0, today: i === 0, d });
  }
  return cells;
}
function bestStreak() {
  const ks = Object.keys(S.p.days).filter(k => S.p.days[k] > 0).sort();
  let best = 0, run = 0, prev = null;
  ks.forEach(k => {
    const d = new Date(k + 'T00:00:00');
    run = prev && (d - prev) === 864e5 ? run + 1 : 1;
    best = Math.max(best, run); prev = d;
  });
  return best;
}

function renderHome() {
  const today = S.p.days[dayKey()] || 0, goal = 30;
  const C = 2 * Math.PI * 26, off = C * (1 - Math.min(1, today / goal));
  const due = dueCount(), st = liveStreak(), U = userLevel(S.p.xp);
  const B = bookOf(), L = B.lessons.find(x => x.n === S.bl) || B.lessons[0];
  const cells = heatCells(), active90 = cells.filter(c => c && c.xp > 0).length;
  const xp90 = cells.reduce((a, c) => a + (c ? c.xp : 0), 0);
  const heatLv = xp => (xp === 0 ? 0 : xp < 15 ? 1 : xp < 40 ? 2 : xp < 80 ? 3 : 4);
  const miles = [3, 7, 14, 30];
  view.innerHTML = `
  <section class="dash-head">
    <div>
      <h1>${S.user ? tr(`Chào mừng trở lại, ${esc(S.user.name)}`, `Welcome back, ${esc(S.user.name)}`) : tr('Chào mừng trở lại', 'Welcome back')}</h1>
      <p class="lead" style="margin:4px 0 0">${tr('Giữ chuỗi ngày học và ôn đúng lúc để nhớ lâu.', 'Keep your streak and review on time.')}</p>
    </div>
    <figure class="hero-char mini">
      <div class="gbox" aria-hidden="true">${gridSvg()}<div class="writer" id="heroW"></div></div>
      <figcaption><span class="zh" style="font-size:18px">中</span><span class="py t1">zhōng</span><span>${tr('ở giữa', 'middle')}</span></figcaption>
    </figure>
  </section>

  <section class="row3">
    <div class="card stat">
      <svg class="ring" viewBox="0 0 60 60" aria-hidden="true"><circle class="bg" cx="30" cy="30" r="26"/><circle class="fg" cx="30" cy="30" r="26" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>
      <div><div class="big">${today}<span class="muted" style="font-size:16px;font-weight:600">/${goal} XP</span></div><div class="sub">${tr('Mục tiêu hôm nay', "Today's goal")}</div></div>
    </div>
    <div class="card stat" role="button" tabindex="0" data-act="nav" data-arg="stats" style="cursor:pointer">
      <div class="badge-ic bi-verm">${ic('flame')}</div>
      <div><div class="big">${st}</div><div class="sub">${st ? tr('ngày học liên tiếp', 'day streak') : tr('Học một bài để bắt đầu chuỗi', 'Finish a session to start a streak')}</div></div>
    </div>
    <div class="card stat lvcard">
      <div class="badge-ic bi-jade">${ic('bolt')}</div>
      <div style="flex:1">
        <div class="big">${tr('Cấp', 'Level')} ${U.lv}</div>
        <div class="pbar"><span style="width:${Math.round(U.into / U.need * 100)}%"></span></div>
        <div class="sub">${tr(`Còn ${U.need - U.into} XP đến cấp ${U.lv + 1}`, `${U.need - U.into} XP to level ${U.lv + 1}`)}</div>
      </div>
    </div>
  </section>

  <h2 class="sec">${tr('Ôn tập nhanh', 'Quick review')}</h2>
  <div class="qrow">
    <button class="qbtn q1" data-act="nav" data-arg="cards">${ic('cards')}<span><span class="t">${tr('Học thẻ từ vựng', 'Vocabulary cards')}</span><span class="s">${due ? tr(`${due} thẻ cần ôn hôm nay`, `${due} cards due today`) : tr('Bạn đã ôn xong hết', 'All caught up')}</span></span></button>
    <button class="qbtn q2" data-act="bprac" data-arg="${L.n}">${ic('target')}<span><span class="t">${tr('Luyện tập bài đang học', 'Practise this lesson')}</span><span class="s">${verName()}, ${tr('quyển', 'book')} ${S.bookLv}, ${tr('bài', 'lesson')} ${L.n}</span></span></button>
    <button class="qbtn q3" data-act="golibtab" data-arg="grammar">${ic('library')}<span><span class="t">${tr('Xem ngữ pháp', 'Grammar')}</span><span class="s">${tr('Tra theo cấp độ', 'Browse by level')}</span></span></button>
  </div>

  <h2 class="sec">${tr('Học tiếp', 'Continue learning')}</h2>
  <button class="contcard" data-act="bopen" data-arg="${L.n}">
    <span class="zhb num">${L.n}</span>
    <span class="grow">
      <span class="ut zh" lang="zh-CN">${esc(L.zh)}</span>
      <span class="us" style="display:block">${esc(S.lang === 'vi' ? L.vi : L.en)}</span>
      <span class="us" style="display:block">${verName()}, ${tr('quyển', 'book')} ${S.bookLv} · ${coreWords(L).length} ${tr('từ mới', 'new words')}, ${L.grammar.length} ${tr('điểm ngữ pháp', 'grammar points')}</span>
      <span class="pbar" style="display:block"><span style="width:${bookPct(L.n)}%"></span></span>
    </span>
    <span class="end">${ic('chev')}</span>
  </button>

  <h2 class="sec">${tr('Bài học gợi ý hôm nay', "Today's picks")}</h2>
  <div class="feat">${featuredLessons(8).map(({ ver, lv, L: F }) => `
    <button class="fcard" data-act="goles" data-arg="${ver}-${lv}-${F.n}">
      <span class="bd">HSK ${verName(ver).slice(4)} · ${tr('Q', 'B')}${lv}</span>
      <span class="ft zh" lang="zh-CN">${esc(F.zh)}</span>
      <span class="fs">${esc(S.lang === 'vi' ? F.vi : F.en)}</span>
      <span class="fm">${tr('Bài', 'Lesson')} ${F.n} · ${coreWords(F).length} ${tr('từ', 'words')}</span>
    </button>`).join('')}</div>

  <div class="two">
    <section class="card pad">
      <h2 class="sec" style="margin-top:0">${tr('90 ngày gần nhất', 'Last 90 days')}</h2>
      <p class="hint">${tr('Ô càng đậm nghĩa là ngày đó học càng nhiều.', 'Darker cells mean more study that day.')}</p>
      <div class="hm">${cells.map(c => c
        ? `<i class="h${heatLv(c.xp)} ${c.today ? 'now' : ''}" title="${c.k}: ${c.xp} XP"></i>`
        : '<i class="pad"></i>').join('')}</div>
      <div class="hmleg"><span>${tr('Ít', 'Less')}</span><i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i><span>${tr('Nhiều', 'More')}</span></div>
      <div class="hmsum">
        <div><b>${active90}/90</b><span>${tr('ngày có học', 'active days')}</span></div>
        <div><b>${num(xp90)}</b><span>${tr('XP trong 90 ngày', 'XP in 90 days')}</span></div>
        <div><b>${bestStreak()}</b><span>${tr('chuỗi dài nhất', 'best streak')}</span></div>
      </div>
    </section>
    <section class="card pad">
      <h2 class="sec" style="margin-top:0">${tr('Mốc chuỗi ngày', 'Streak milestones')}</h2>
      <p class="hint">${tr('Học ít nhất một phiên mỗi ngày để giữ chuỗi.', 'Study at least once a day to keep the streak.')}</p>
      <div class="mile">${miles.map(m => {
        const done = st >= m;
        return `<div class="mcard ${done ? 'done' : ''}">
          <div class="badge-ic ${done ? 'bi-jade' : 'bi-mut'}">${ic(done ? 'check' : 'flame')}</div>
          <div><b>${tr(`Mốc ${m} ngày`, `${m}-day streak`)}</b>
            <span class="sub">${done ? tr('Đã đạt', 'Unlocked') : tr(`Còn ${m - st} ngày`, `${m - st} days to go`)}</span></div>
        </div>`;
      }).join('')}</div>
    </section>
  </div>`;
  mountHero();
}
""")

# ---------------------------------------------------------------- hành động mới
rep("""  booklv(a) { S.bookLv = +a; store.set('bookLv', S.bookLv); S.bl = 1; store.set('bl', 1); render({ keepScroll: true }); },""",
    """  booklv(a) { S.bookLv = +a; store.set('bookLv', S.bookLv); S.bl = 1; store.set('bl', 1); render({ keepScroll: true }); },
  navtoggle(a) {
    const open = !S.navOpen[a];
    S.navOpen = open ? { [a]: true } : {};   /* chỉ mở một nhóm để menu không dài quá màn hình */
    store.set('navOpen', S.navOpen); renderNav();
  },
  golibtab(a) { S.lib.tab = a; S.lib.q = ''; S.lib.page = 0; S.lib.char = null; go('library'); },
  /* mở đúng bài của gợi ý hôm nay: "30-2-7" = HSK 3.0, quyển 2, bài 7 */
  goles(a) {
    const [ver, lv, n] = a.split('-');
    S.ver = ver; store.set('ver', ver);
    S.bookLv = +lv; store.set('bookLv', S.bookLv);
    S.bl = +n; store.set('bl', S.bl);
    S.btab = 'words';
    go('book');
  },""")

# ---------------------------------------------------------------- CSS
# thanh bên phải cuộn được: mở submenu làm menu dài hơn màn hình
rep(""".side{position:sticky;top:0;height:100vh;padding:24px 16px;""",
    """.side{position:sticky;top:0;height:100vh;overflow-y:auto;overscroll-behavior:contain;padding:24px 16px;""")
rep(""".navlist{display:flex;flex-direction:column;gap:6px}""",
    """.navlist{flex:none;display:flex;flex-direction:column;gap:6px}""")

rep(""".path{margin-bottom:28px}""", r""".navgroup .submenu{max-height:0;overflow:hidden;transition:max-height .28s ease}
.navgroup.open .submenu{max-height:1200px}
.navbtn .nchev{margin-left:auto;width:16px;height:16px;transition:transform .2s ease;opacity:.6}
.navgroup.open .navbtn .nchev{transform:rotate(90deg)}
.subgrp{padding:2px 0 6px}
.subttl{padding:8px 12px 4px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3)}
.subbtn{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:8px 12px 8px 30px;border:0;border-radius:12px;background:none;color:var(--ink-2);font:inherit;font-size:14px;font-weight:600;text-align:left;cursor:pointer}
.subbtn:hover{background:var(--jade-soft);color:var(--jade-ink)}
.subbtn.on{background:var(--jade-soft);color:var(--jade-ink);font-weight:800}
.subbtn.dim{color:var(--ink-3)}
.subbtn .sn{font-size:11px;font-weight:600;color:var(--ink-3);white-space:nowrap}
.dash-head{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:18px;flex-wrap:wrap}
.dash-head h1{margin:0;font-size:28px}
.hero-char.mini .gbox{width:96px;height:96px}
.lvcard .pbar{margin:6px 0 4px}
.qrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-bottom:8px}
.qbtn{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;text-align:left;cursor:pointer;transition:transform .12s ease,border-color .12s ease}
.qbtn:hover{transform:translateY(-2px);border-color:var(--jade)}
.qbtn svg{width:22px;height:22px;flex:none}
.qbtn .t{display:block;font-weight:800}
.qbtn .s{display:block;font-size:12px;color:var(--ink-3)}
.qbtn.q1 svg{color:var(--brand)}.qbtn.q2 svg{color:var(--jade)}.qbtn.q3 svg{color:var(--sun-ink)}
.contcard{display:flex;align-items:center;gap:14px;width:100%;padding:16px;border-radius:18px;border:2px solid var(--jade);background:var(--surface);color:var(--ink);font:inherit;text-align:left;cursor:pointer}
.contcard:hover{background:var(--jade-soft)}
.feat{display:flex;gap:12px;overflow-x:auto;padding:2px 2px 10px;scroll-snap-type:x mandatory}
.fcard{min-width:215px;max-width:215px;scroll-snap-align:start;display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:16px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;text-align:left;cursor:pointer;transition:transform .12s ease,border-color .12s ease}
.fcard:hover{transform:translateY(-2px);border-color:var(--jade)}
.fcard .bd{align-self:flex-start;font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;background:var(--jade-soft);color:var(--jade-ink)}
.fcard .ft{font-size:17px;font-weight:700}
.fcard .fs{font-size:13px;color:var(--ink-2)}
.fcard .fm{font-size:12px;color:var(--ink-3)}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:8px}
.card.pad{padding:18px}
.hm{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,13px);gap:3px;overflow-x:auto;padding-bottom:6px}
.hm i{width:13px;height:13px;border-radius:3px;display:block}
.hm i.pad{background:none}
.hm i.h0,.hmleg i.h0{background:var(--line)}
.hm i.h1,.hmleg i.h1{background:#BFE6D3}
.hm i.h2,.hmleg i.h2{background:#7FD3B0}
.hm i.h3,.hmleg i.h3{background:#3CBE91}
.hm i.h4,.hmleg i.h4{background:var(--jade)}
.hm i.now{outline:2px solid var(--brand);outline-offset:1px}
.hmleg{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--ink-3);margin:6px 0 12px}
.hmleg i{width:13px;height:13px;border-radius:3px;display:block}
.hmsum{display:flex;gap:18px;flex-wrap:wrap;border-top:2px solid var(--line);padding-top:12px}
.hmsum b{display:block;font-size:20px;font-weight:800}
.hmsum span{font-size:12px;color:var(--ink-3)}
.mile{display:grid;gap:10px}
.mcard{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;border:2px solid var(--line)}
.mcard.done{border-color:var(--jade);background:var(--jade-soft)}
.mcard b{display:block}
.mcard .sub{font-size:12px;color:var(--ink-3)}
.bi-mut{background:var(--line);color:var(--ink-3)}
.path{margin-bottom:28px}""")

P.write_text(s, encoding="utf-8")
print("patched v6 OK")
