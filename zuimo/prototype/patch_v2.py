#!/usr/bin/env python3
"""Nâng template prototype lên ZUIMO v2. Mỗi thay thế đều assert số lần khớp để không vá nhầm."""
import pathlib

P = pathlib.Path(__file__).parent / "template.html"
s = P.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f"khớp {n} lần (cần {count}): {old[:80]!r}"
    s = s.replace(old, new)


# ------------------------------------------------------------------ thương hiệu
rep("<title>HànLộ – Học tiếng Trung theo HSK 3.0</title>", "<title>ZUIMO – Học tiếng Trung theo HSK 3.0</title>")
rep('<span class="mark" aria-hidden="true">汉</span>HànLộ', '<span class="mark" aria-hidden="true">Z</span>ZUIMO', 2)
rep("font-family:var(--f-zh-d);font-size:24px;font-weight:700;box-shadow:0 3px 0 var(--jade-d)}",
    "font-family:var(--f-ui);font-size:22px;font-weight:800;box-shadow:0 3px 0 var(--jade-d)}")
rep("'hanlo:'", "'zuimo:'", 3)
rep("   HànLộ – Prototype giai đoạn 0", "   ZUIMO – Prototype (giai đoạn 0, bản mở rộng nội dung HSK 3.0)")
rep('<p class="side-foot" id="sideFoot"></p>',
    '<div class="side-foot"><p id="sideFoot"></p><button class="linkbtn" data-act="nav" data-arg="about" id="aboutLink"></button></div>')

# ------------------------------------------------------------------ CSS mới
rep(".toast{position:fixed;", """/* ---------- Thư viện HSK ---------- */
.linkbtn{background:none;border:0;padding:0;color:var(--jade-ink);font-weight:600;font-size:13px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.side-foot p{margin:0 0 6px}
.seggroup{display:inline-flex;padding:4px;border-radius:14px;background:var(--surface-2);gap:4px;margin-bottom:10px}
.seg{border:0;background:none;padding:8px 14px;border-radius:10px;font-weight:600;font-size:14px;color:var(--ink-2);cursor:pointer}
.seg[aria-pressed="true"]{background:var(--surface);color:var(--ink);box-shadow:0 2px 0 var(--line)}
.vernote{margin:0 0 16px;color:var(--ink-3);font-size:14px;max-width:70ch}
.lvlbar{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;margin-bottom:8px;scrollbar-width:thin}
.lchip{flex:none;display:flex;flex-direction:column;align-items:flex-start;padding:8px 14px;border-radius:14px;border:2px solid var(--line);background:var(--surface);cursor:pointer;color:var(--ink);box-shadow:0 3px 0 var(--line)}
.lchip b{font-size:16px}
.lchip span{font-size:12px;color:var(--ink-3)}
.lchip[aria-pressed="true"]{border-color:var(--jade);background:var(--jade-soft);box-shadow:0 3px 0 var(--jade-d)}
.lchip[aria-pressed="true"] b,.lchip[aria-pressed="true"] span{color:var(--jade-ink)}
.tab .cnt{font-weight:500;opacity:.75;margin-left:2px}
.libtools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.searchbox{position:relative;flex:1;min-width:220px}
.searchbox svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:20px;height:20px;color:var(--ink-3);pointer-events:none}
.searchbox .inp{min-height:46px;padding-left:44px;font-size:16px;font-weight:500}
.wlist{display:flex;flex-direction:column;border:2px solid var(--line);border-radius:18px;background:var(--surface);overflow:hidden}
.wrow{display:grid;grid-template-columns:40px minmax(72px,auto) minmax(96px,auto) minmax(0,1fr) auto;gap:4px 14px;align-items:center;padding:8px 14px;border-top:1px solid var(--line)}
.wrow:first-child{border-top:0}
.wz{font-family:var(--f-zh);font-size:26px;line-height:1.2}
.wp{font-size:16px}
.wm{min-width:0}
.wm small{display:block;color:var(--ink-3);font-size:12px}
.en-tag{display:inline-block;margin-left:6px;padding:0 6px;border-radius:6px;background:var(--surface-2);color:var(--ink-3);font-size:11px;font-weight:700;vertical-align:1px}
.wlv{font-size:12px;color:var(--ink-3);white-space:nowrap}
@media (max-width:640px){.wrow{grid-template-columns:40px auto minmax(0,1fr)}.wm{grid-column:2 / -1}.wlv{grid-column:2 / -1}}
.pager{display:flex;align-items:center;justify-content:center;gap:14px;margin:16px 0;font-weight:600;color:var(--ink-2)}
.empty-note{padding:28px;text-align:center;color:var(--ink-3)}
.hzpanel{display:grid;grid-template-columns:auto minmax(0,1fr);gap:22px;align-items:start;margin-bottom:16px}
.gbox.md{width:220px;height:220px}
.hzstatic{position:absolute;inset:0;display:grid;place-items:center;font-size:150px;line-height:1;color:var(--ink)}
.hzwords{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chipw{display:flex;flex-direction:column;align-items:flex-start;padding:6px 10px;border-radius:12px;border:2px solid var(--line);background:var(--surface);cursor:pointer;color:var(--ink);max-width:180px;text-align:left}
.chipw .zh{font-size:18px}
.chipw small{color:var(--ink-3);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:156px}
.hzgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px}
.hz{display:flex;flex-direction:column;align-items:center;padding:6px 2px;border-radius:12px;border:2px solid var(--line);background:var(--surface);cursor:pointer;color:var(--ink)}
.hz .zh{font-size:26px;line-height:1.3}
.hz small{font-size:12px;font-weight:600}
.hz.on{border-color:var(--verm);box-shadow:0 3px 0 var(--verm-d)}
@media (max-width:640px){.hzpanel{grid-template-columns:1fr}.gbox.md{margin:0 auto}}
.gcat{font-size:14px;color:var(--ink-3);margin:18px 0 8px;font-weight:700}
.gcat:first-child{margin-top:4px}
.gp{border:2px solid var(--line);border-radius:16px;background:var(--surface);margin-bottom:8px}
.gp summary{display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;list-style:none}
.gp summary::-webkit-details-marker{display:none}
.gcode{flex:none;font-family:var(--f-zh);font-size:13px;font-weight:700;padding:2px 8px;border-radius:8px;background:var(--verm-soft);color:var(--verm-ink)}
.gt{flex:1;min-width:0;display:flex;flex-direction:column}
.gt .zh{font-size:14px;color:var(--ink-3)}
.gchev{width:18px;height:18px;flex:none;color:var(--ink-3);transition:transform .2s}
.gp[open] .gchev{transform:rotate(90deg)}
.gbody{padding:0 16px 14px}
.gnote{margin:0;color:var(--ink-2)}
.gbody .exs{margin-top:10px;padding-top:10px}
.exh{font-weight:700;font-size:13px;color:var(--jade-ink);padding-top:4px}
.deckbar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
/* ---------- Đăng nhập ---------- */
.auth{display:flex;justify-content:center;padding:12px 0 40px}
.auth-card{width:100%;max-width:440px;padding:26px}
.brand.big{font-size:28px;justify-content:center;margin-bottom:6px}
.demo-flag{text-align:center;font-size:13px;color:var(--sun-ink);background:var(--sun-soft);border-radius:10px;padding:6px 10px;margin:8px 0 18px}
.auth .tabs{justify-content:center}
.fld{margin-bottom:12px}
.fld label{display:block;font-weight:600;font-size:14px;margin-bottom:4px}
.fld .inp{min-height:48px;font-size:16px;font-weight:500}
.fld .err{min-height:0;margin-top:4px}
.fld small.hint{display:block;margin-top:4px}
.btn-zalo{--c:#0068FF;--cd:#0049B3}
.orline{display:flex;align-items:center;gap:10px;color:var(--ink-3);font-size:13px;margin:16px 0}
.orline::before,.orline::after{content:"";flex:1;height:2px;background:var(--line)}
.auth-foot{text-align:center;margin-top:14px;font-size:14px}
.profile{display:flex;align-items:center;gap:16px;margin-bottom:18px}
.av-lg{width:64px;height:64px;border-radius:50%;background:var(--jade);color:#fff;display:grid;place-items:center;font-size:28px;font-weight:800}
.av-sm{width:28px;height:28px;border-radius:50%;background:var(--jade);color:#fff;display:grid;place-items:center;font-size:14px;font-weight:800}
.credits{display:flex;flex-direction:column;gap:10px}
.credits .card{padding:14px 18px}
.credits a{color:var(--jade-ink);font-weight:700}
.lic{display:inline-block;margin-left:8px;font-size:12px;font-weight:700;padding:1px 8px;border-radius:999px;background:var(--surface-2);color:var(--ink-2)}
.prac-src{display:block;font-size:13px;color:var(--ink-3);margin-top:8px}
.toast{position:fixed;""")

# ------------------------------------------------------------------ icon & trạng thái
rep("  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6'",
    "  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',\n"
    "  library: 'M4 4h4v16H4zM10 4h4v16h-4zM15.5 5.2l3.4-.9 3.1 14.8-3.4.9z',\n"
    "  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 1 0 0 8M4 21a8 8 0 0 1 16 0',\n"
    "  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14M20 20l-4.2-4.2'")
rep("  heroW: null, writer: null\n};",
    "  heroW: null, writer: null, writerChar: null,\n"
    "  ver: store.get('ver', '21'),                 /* '21' = chuẩn GF0025-2021, '25' = đề thi mới 2026 */\n"
    "  lib: Object.assign({ lvl: 1, tab: 'words', q: '', page: 0, char: null }, store.get('lib', {}), { q: '', page: 0 }),\n"
    "  deck: store.get('deck', 'lesson'),\n"
    "  pracSrc: null,                               /* 'lesson' hoặc { lvl, ver } */\n"
    "  user: store.get('user', null), authTab: 'login'\n};")

# ------------------------------------------------------------------ nav + top bar
rep("""    ['home', 'home', tr('Trang chủ', 'Home')], ['lessons', 'book', tr('Bài học', 'Lessons')],""",
    """    ['home', 'home', tr('Trang chủ', 'Home')], ['library', 'library', tr('Thư viện', 'Library')], ['lessons', 'book', tr('Bài học', 'Lessons')],""")
rep("""  const html = items.map(([r, i, l]) => `<button class="navbtn" data-act="nav" data-arg="${r}" ${active === r ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span></button>`).join('');
  $('#sideNav').innerHTML = html;
  $('#bottomNav').innerHTML = html;""",
"""  const btn = ([r, i, l]) => `<button class="navbtn" data-act="nav" data-arg="${r}" ${active === r ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span></button>`;
  $('#sideNav').innerHTML = items.map(btn).join('');
  /* thanh dưới trên điện thoại chỉ đủ chỗ 5 mục; Thống kê mở từ thẻ chuỗi ngày ở trang chủ */
  $('#bottomNav').innerHTML = items.filter(x => x[0] !== 'stats').map(btn).join('');
  $('#aboutLink').textContent = tr('Nguồn dữ liệu và giấy phép', 'Data sources and licences');""")
rep("""    <button class="icon-btn" data-act="theme" aria-label""",
    """    <button class="icon-btn" data-act="nav" data-arg="login" aria-label="${S.user ? tr('Tài khoản', 'Account') : tr('Đăng nhập', 'Sign in')}">${S.user ? `<span class="av-sm">${esc(S.user.name.charAt(0).toUpperCase())}</span>` : ic('user')}</button>
    <button class="icon-btn" data-act="theme" aria-label""")

# ------------------------------------------------------------------ trang chủ
rep("""<p class="hello">${tr('Chào bạn, hôm nay học gì nào?', 'Hi there, what shall we learn today?')}</p>""",
    """<p class="hello">${S.user ? tr(`Chào ${esc(S.user.name)}, hôm nay học gì nào?`, `Hi ${esc(S.user.name)}, what shall we learn today?`) : tr('Chào bạn, hôm nay học gì nào?', 'Hi there, what shall we learn today?')}</p>""")
rep("""<button class="btn btn-ghost" data-act="nav" data-arg="practice">${tr('Luyện tập nhanh', 'Quick practice')}</button>""",
    """<button class="btn btn-ghost" data-act="nav" data-arg="library">${ic('library')}${tr('Mở thư viện HSK', 'Open HSK library')}</button>""")
rep("""    <div class="card stat">
      <div class="badge-ic bi-verm">${ic('flame')}</div>
      <div><div class="big">${st}</div>""",
    """    <div class="card stat" role="button" tabindex="0" data-act="nav" data-arg="stats" style="cursor:pointer">
      <div class="badge-ic bi-verm">${ic('flame')}</div>
      <div><div class="big">${st}</div>""")
rep("""    <h2 class="sec">${tr('Lộ trình HSK 3.0', 'HSK 3.0 path')}</h2>
    <div class="levels">
      ${LEVELS.map((l, i) => i === 0
        ? `<button class="lvl on" data-act="nav" data-arg="lessons"><span class="tag">${tr('Đang học', 'Current')}</span><div class="n">HSK ${l.n}</div><div class="m">${num(l.words)} ${tr('từ mới', 'new words')}<br>${num(l.chars)} ${tr('chữ Hán', 'characters')}</div></button>`
        : `<div class="lvl off"><span class="tag">${ic('lock')}${tr('Sắp có', 'Soon')}</span><div class="n">HSK ${l.n}</div><div class="m">${num(l.words)} ${tr('từ mới', 'new words')}<br>${num(l.chars)} ${tr('chữ Hán', 'characters')}</div></div>`).join('')}
    </div>""",
    """    <h2 class="sec">${tr('Lộ trình HSK 3.0', 'HSK 3.0 path')} <span class="muted" style="font-size:14px;font-weight:600">${S.ver === '21' ? tr('chuẩn 2021', '2021 standard') : tr('đề thi 2026', '2026 exam')}</span></h2>
    <div class="levels">
      ${LVS.map(k => `<button class="lvl ${k === S.lib.lvl ? 'on' : ''}" data-act="golvl" data-arg="${k}">${k === S.lib.lvl ? `<span class="tag">${tr('Đang học', 'Current')}</span>` : ''}<div class="n">HSK ${lvName(k)}</div><div class="m">${num(levelWords(k).length)} ${tr('từ', 'words')}<br>${num(levelGram(k).length)} ${tr('điểm ngữ pháp', 'grammar points')}</div></button>`).join('')}
    </div>""")
rep(""".lvl.off{cursor:default}""", """.lvl{cursor:pointer}
.lvl:hover{border-color:var(--line-2)}
.lvl.off{cursor:default}""")

# ------------------------------------------------------------------ bài học: nút luyện tập riêng cho bài 1
rep("""<button class="btn" data-act="nav" data-arg="practice">${tr('Luyện tập bài này', 'Practice this lesson')}</button>""",
    """<button class="btn" data-act="lessonprac">${tr('Luyện tập bài này', 'Practice this lesson')}</button>""")
rep("""    { type: 'rewrite', prompt: { vi: 'Viết lại thành câu hỏi có/không', en: 'Rewrite as a yes/no question' }, quote: '你是学生。',""",
    """    { type: 'rewrite', prompt: { vi: 'Viết lại thành câu hỏi có/không', en: 'Rewrite as a yes/no question' }, quote: '你是学生。', quoteZh: true,""")
rep("""<span class="quote ${typeof it.quote === 'string' ? 'zh' : ''}">""", """<span class="quote ${it.quoteZh ? 'zh' : ''}">""")

# ------------------------------------------------------------------ luyện tập: nguồn câu hỏi theo cấp
rep("""function startPractice() {
  P = { items: buildSession(), i: 0, right: 0, xp: 0, t0: Date.now(), finished: null };
  initStep();
}""",
"""function startPractice() {
  const src = S.pracSrc;
  const byLevel = src && src !== 'lesson';
  const items = byLevel ? buildLevelSession(src.lvl, src.ver) : buildSession();
  const label = byLevel
    ? `HSK ${lvName(src.lvl)}, ${src.ver === '25' ? tr('đề thi 2026', '2026 exam') : tr('chuẩn 2021', '2021 standard')}`
    : tr('Bài 1: 你好', 'Lesson 1: 你好');
  P = { items, label, i: 0, right: 0, xp: 0, t0: Date.now(), finished: null };
  initStep();
}""")
rep("""      <span class="kind">${esc(L(KIND[it.type]))}</span>""",
    """      <span class="prac-src">${esc(P.label)}</span>
      <span class="kind">${esc(L(KIND[it.type]))}</span>""")
rep("""    S.p.answered += n; S.p.correct += P.right; S.p.practiced = true;""",
    """    S.p.answered += n; S.p.correct += P.right;
    if (S.pracSrc === 'lesson') S.p.practiced = true;""")
rep("""      <button class="btn btn-ghost" data-act="nav" data-arg="practice">${ic('refresh')}${tr('Luyện lại', 'Practice again')}</button>""",
    """      <button class="btn btn-ghost" data-act="again">${ic('refresh')}${tr('Luyện lại', 'Practice again')}</button>""")

# ------------------------------------------------------------------ writer dùng chung cho bài học và thư viện
rep("""function mountWriter() {
  const box = $('#writeW');
  if (!box || !window.HanziWriter) return;
  box.innerHTML = '';
  const size = box.offsetWidth || 300;
  S.writer = HanziWriter.create(box, S.wchar, {""",
"""function mountWriter() { createWriter($('#writeW'), S.wchar, 300); }
function mountLibWriter() { if (S.lib.char && CHAR_DATA[S.lib.char]) createWriter($('#libW'), S.lib.char, 220); }
function createWriter(box, ch, fallback) {
  if (!box || !window.HanziWriter) return;
  box.innerHTML = '';
  const size = box.offsetWidth || fallback;
  S.writerChar = ch;
  S.writer = HanziWriter.create(box, ch, {""")
rep("""    const c = S.wchar, total = CHAR_DATA[c].strokes.length;""",
    """    const c = S.writerChar, total = CHAR_DATA[c].strokes.length;""")

# ------------------------------------------------------------------ thẻ ghi nhớ theo bộ
rep("""const VMAP = Object.fromEntries(VOCAB.map(v => [v.h, v]));
function startCards() { C = { queue: VOCAB.filter(v => isDue(v.h)).map(v => v.h), flipped: false, reviewed: 0 }; }""",
"""/* Bộ thẻ: 'lesson' = từ vựng bài 1; 'L1'...'L7' = cấp HSK theo phiên bản đang chọn.
   Mỗi lượt = thẻ đến hạn + tối đa NEW_PER_SESSION từ mới để không bị ngợp. */
const NEW_PER_SESSION = 15;
function deckWords(deck) {
  if (deck === 'lesson') return VOCAB.map(v => WMAP[v.h]).filter(Boolean);
  return levelWords(+deck.slice(1));
}
function startCards() {
  const ws = deckWords(S.deck), now = Date.now();
  const due = ws.filter(w => S.srs[w.s] && S.srs[w.s].due <= now).map(w => w.s);
  const fresh = ws.filter(w => !S.srs[w.s]).slice(0, S.deck === 'lesson' ? 50 : NEW_PER_SESSION).map(w => w.s);
  C = { queue: [...shuffle(due), ...fresh], flipped: false, reviewed: 0, total: ws.length };
}""")
rep("""  const head = `<div class="lhead"><h1>${tr('Thẻ ghi nhớ', 'Flashcards')}</h1></div>
  <p class="lead">${tr('Nhìn chữ, tự nhớ cách đọc và nghĩa rồi lật thẻ. Mức bạn chọn quyết định khi nào thẻ quay lại.', 'Look at the word, recall the reading and meaning, then flip. Your rating decides when the card comes back.')}</p>`;""",
"""  const decks = [['lesson', tr('Bài 1', 'Lesson 1')], ...LVS.map(k => ['L' + k, 'HSK ' + lvName(k)])];
  const head = `<div class="lhead"><h1>${tr('Thẻ ghi nhớ', 'Flashcards')}</h1></div>
  <p class="lead">${tr('Nhìn chữ, tự nhớ cách đọc và nghĩa rồi lật thẻ. Mức bạn chọn quyết định khi nào thẻ quay lại.', 'Look at the word, recall the reading and meaning, then flip. Your rating decides when the card comes back.')}</p>
  <div class="deckbar" role="group" aria-label="${tr('Chọn bộ thẻ', 'Choose a deck')}">${decks.map(([k, l]) => `<button class="pill" data-act="deck" data-arg="${k}" aria-pressed="${S.deck === k}">${l}</button>`).join('')}</div>
  ${S.deck !== 'lesson' ? `<p class="hint" style="margin:0 0 8px">${tr(`Mỗi lượt gồm các thẻ đến hạn và tối đa ${NEW_PER_SESSION} từ mới. Bộ này có ${num(C.total)} từ (${S.ver === '21' ? 'chuẩn 2021' : 'đề thi 2026'}).`, `Each session has due cards plus up to ${NEW_PER_SESSION} new words. This deck has ${num(C.total)} words.`)}</p>` : ''}`;""")
rep("""    const next = Math.min(...VOCAB.map(v => (S.srs[v.h] ? S.srs[v.h].due : Infinity)));""",
    """    const next = Math.min(...deckWords(S.deck).map(v => (S.srs[v.s] ? S.srs[v.s].due : Infinity)));""")
rep("""  const v = VMAP[C.queue[0]];""", """  const v = WMAP[C.queue[0]];""")
rep("""<div class="face back"><span class="h" lang="zh-CN">${v.h}</span>${py(v.py)}<span class="m">${esc(L(v))}</span>${S.lang === 'vi' ? `<span class="hv">${esc(v.hv)}</span>` : ''}</div>""",
    """<div class="face back"><span class="h" lang="zh-CN">${v.s}</span>${py(pyPairs(v))}<span class="m">${esc(meaning(v))}</span>${S.lang === 'vi' && v.hv ? `<span class="hv">${esc(v.hv)}</span>` : ''}</div>""")
rep("""<div class="face"><span class="h" lang="zh-CN">${v.h}</span>""", """<div class="face"><span class="h" lang="zh-CN">${v.s}</span>""")
rep("""  cardsall() { Object.values(S.srs).forEach(s => { s.due = 0; }); store.set('srs', S.srs); C = null; renderCards(); },""",
    """  cardsall() { deckWords(S.deck).forEach(w => { if (S.srs[w.s]) S.srs[w.s].due = 0; }); store.set('srs', S.srs); C = null; renderCards(); },
  deck(a) { S.deck = a; store.set('deck', a); C = null; renderCards(); },""")
rep("""const dueCount = () => VOCAB.filter(v => isDue(v.h)).length;""",
    """const dueCount = () => Object.values(S.srs).filter(x => x.due <= Date.now()).length + VOCAB.filter(v => !S.srs[v.h]).length;""")
rep("""    ${stat('cards', 'bi-jade', `${learned}/${VOCAB.length}`, tr('từ đã nhớ', 'words remembered'))}""",
    """    ${stat('cards', 'bi-jade', num(learned), tr('từ đã ôn qua thẻ', 'words reviewed'))}""")

# ------------------------------------------------------------------ khối chức năng mới (chèn trước router)
NEW_BLOCK = pathlib.Path(__file__).with_name("v2_block.js").read_text(encoding="utf-8")
rep("/* ---------- Router ---------- */", NEW_BLOCK + "\n/* ---------- Router ---------- */")
rep("const VIEWS = { home: renderHome, lessons: renderLessons, lesson: renderLesson, practice: renderPractice, cards: renderCards, stats: renderStats };",
    "const VIEWS = { home: renderHome, library: renderLibrary, lessons: renderLessons, lesson: renderLesson, practice: renderPractice, cards: renderCards, stats: renderStats, login: renderLogin, about: renderAbout };")

# ------------------------------------------------------------------ actions
rep("""const ACT = {
  nav: go,""",
"""const ACT = {
  nav(a) { if (a === 'practice') S.pracSrc = { lvl: S.lib.lvl, ver: S.ver }; go(a); },
  again() { go('practice'); },
  lessonprac() { S.pracSrc = 'lesson'; go('practice'); },
  ...LIB_ACT,
  ...AUTH_ACT,""")
rep("""document.addEventListener('input', e => { if (e.target.id === 'pyInput') { const er = $('#pyErr'); if (er) er.textContent = ''; } });""",
"""let libT = null;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'pyInput') { const er = $('#pyErr'); if (er) er.textContent = ''; }
  if (t.id === 'libQ') { clearTimeout(libT); libT = setTimeout(() => { S.lib.q = t.value; S.lib.page = 0; renderLibResults(); }, 160); }
  const f = t.closest && t.closest('.fld'); if (f) { const er = f.querySelector('.err'); if (er) er.textContent = ''; }
});""")
rep("""document.addEventListener('keydown', e => {
  if (S.route !== 'practice' || !P || P.finished) return;""",
"""document.addEventListener('keydown', e => {
  /* Enter trong form đăng nhập/đăng ký = bấm nút chính (không dùng thẻ <form>) */
  if (S.route === 'login' && e.key === 'Enter' && e.target.matches && e.target.matches('.auth input')) {
    e.preventDefault(); const b = $('#authSubmit'); if (b) b.click(); return;
  }
  /* thẻ div có role=button cần kích hoạt được bằng bàn phím */
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); return; }
  if (S.route !== 'practice' || !P || P.finished) return;""")

P.write_text(s, encoding="utf-8")
print("patched OK")
