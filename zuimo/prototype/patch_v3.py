#!/usr/bin/env python3
"""ZUIMO v3: tách lộ trình giáo trình HSK 2.0 / HSK 3.0 và đồng bộ thư viện theo phiên bản giáo trình.
Chạy sau patch_v2.py. Mỗi thay thế đều assert số lần khớp."""
import pathlib

P = pathlib.Path(__file__).parent / "template.html"
s = P.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f"khớp {n} lần (cần {count}): {old[:90]!r}"
    s = s.replace(old, new)


# ---------------------------------------------------------------- trạng thái (kèm chuyển đổi giá trị cũ)
rep("""  ver: store.get('ver', '21'),                 /* '21' = chuẩn GF0025-2021, '25' = đề thi mới 2026 */""",
    """  ver: ({ '21': '20', '25': '30' })[store.get('ver', '20')] || store.get('ver', '20'),  /* '20' = HSK 2.0, '30' = HSK 3.0 */
  bl: store.get('bl', 1), btab: 'words', bchar: null,""")
rep("""  deck: store.get('deck', 'lesson'),""",
    """  deck: (d => (d === 'lesson' || !d ? 'B20-1' : d))(store.get('deck', null)),""")

# ---------------------------------------------------------------- CSS
rep(".toast{position:fixed;", """.zhb.num{font-family:var(--f-ui);font-size:24px;font-weight:800;background:var(--jade-soft);color:var(--jade-ink)}
.unit .ut.zh{font-size:19px}
.toplist{list-style:none;padding:0;margin:0 0 16px;display:flex;flex-direction:column;gap:8px}
.toplist li{padding:12px 16px;border-radius:14px;border:2px solid var(--line);background:var(--surface)}
.toplist li b{display:block}
.toplist .zh{font-size:13px}
.bnav2{display:flex;justify-content:space-between;margin-top:14px}
.sel{min-height:42px;padding:0 12px;border-radius:12px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font-family:var(--f-ui);font-size:15px;font-weight:600;max-width:100%}
.deckrow{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px}
.deckrow .lbl{font-size:13px;font-weight:700;color:var(--ink-3)}
.lhead .muted{line-height:1.4}
.toast{position:fixed;""")

# ---------------------------------------------------------------- engine: nhãn loại câu và đáp án tuỳ biến
rep("""      <span class="kind">${esc(L(KIND[it.type]))}</span>""",
    """      <span class="kind">${esc(L(it.kindLabel || KIND[it.type]))}</span>""")
rep("""    ans = it.answer.join('') + (it.type === 'rewrite' ? '？' : '。');""",
    """    ans = it.ansText || (it.answer.join('') + (it.type === 'rewrite' ? '？' : '。'));""")
rep(""".zhb.num{""", """.overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:0 0 16px;padding:14px 18px;border-radius:16px;background:var(--sun-soft);color:var(--sun-ink)}
.overview ul{margin:6px 0 0;padding-left:18px}
.overview p{margin:6px 0 0}
.scene{margin-bottom:22px}
.scene-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;color:var(--ink-2);font-weight:600;flex-wrap:wrap}
.spk-name{display:block;font-size:12px;font-weight:700;color:var(--ink-3)}
.zhb.num{""")

# ---------------------------------------------------------------- nav
rep("""  const active = S.route === 'lesson' ? 'lessons' : S.route;""",
    """  const active = (S.route === 'lesson' || S.route === 'book') ? 'lessons' : S.route;""")

# ---------------------------------------------------------------- trang chủ
rep("""<button class="btn" data-act="nav" data-arg="lesson">${ic('play')}${S.p.seen && Object.keys(S.p.seen).length ? tr('Học tiếp bài 1', 'Continue lesson 1') : tr('Bắt đầu bài 1', 'Start lesson 1')}</button>""",
    """<button class="btn" data-act="bopen" data-arg="${S.bl}">${ic('play')}${Object.keys(S.p.bseen || {}).length ? tr(`Học tiếp bài ${S.bl} (${verName()})`, `Continue lesson ${S.bl}`) : tr(`Bắt đầu bài 1 (${verName()})`, 'Start lesson 1')}</button>""")
rep("""<h2 class="sec">${tr('Lộ trình HSK 3.0', 'HSK 3.0 path')} <span class="muted" style="font-size:14px;font-weight:600">${S.ver === '21' ? tr('chuẩn 2021', '2021 standard') : tr('đề thi 2026', '2026 exam')}</span></h2>""",
    """<h2 class="sec">${tr(`Lộ trình ${verName()}`, `${verName()} path`)}</h2>""")
rep("""      ${LVS.map(k => `<button class="lvl""", """      ${lvsFor().map(k => `<button class="lvl""")
rep("""<br>${num(levelGram(k).length)} ${tr('điểm ngữ pháp', 'grammar points')}</div>""",
    """${levelGram(k).length ? `<br>${num(levelGram(k).length)} ${tr('điểm ngữ pháp', 'grammar points')}` : ''}</div>""")

# ---------------------------------------------------------------- luyện tập
rep("""  const byLevel = src && src !== 'lesson';
  const items = byLevel ? buildLevelSession(src.lvl, src.ver) : buildSession();
  const label = byLevel
    ? `HSK ${lvName(src.lvl)}, ${src.ver === '25' ? tr('đề thi 2026', '2026 exam') : tr('chuẩn 2021', '2021 standard')}`
    : tr('Bài 1: 你好', 'Lesson 1: 你好');""",
    """  const byBook = src && src.book;
  const byLevel = src && src !== 'lesson' && !byBook;
  const items = byBook ? buildBookSession(src.book, src.n) : byLevel ? buildLevelSession(src.lvl, src.ver) : buildSession();
  const label = byBook
    ? `${verName(src.book)}, ${tr('bài', 'lesson')} ${src.n}: ${(BOOKS[src.book === '20' ? 'hsk20_1' : 'hsk30_1'].lessons.find(x => x.n === src.n) || {}).zh || ''}`
    : byLevel ? `${verName(src.ver)}, ${tr('cấp', 'level')} ${lvName(src.lvl)}` : tr('Nhập môn: 你好', 'Starter: 你好');""")
rep("""    if (S.pracSrc === 'lesson') S.p.practiced = true;""",
    """    if (S.pracSrc === 'lesson') S.p.practiced = true;
    if (S.pracSrc && S.pracSrc.book) { S.p.bdone = S.p.bdone || {}; S.p.bdone[`${S.pracSrc.book}-${S.pracSrc.n}`] = 1; }""")

# ---------------------------------------------------------------- thẻ nhớ theo bài của giáo trình
rep("""function deckWords(deck) {
  if (deck === 'lesson') return VOCAB.map(v => WMAP[v.h]).filter(Boolean);""",
    """function deckWords(deck) {
  if (deck === 'lesson') return VOCAB.map(v => WMAP[v.h]).filter(Boolean);
  if (deck.startsWith('B')) {   /* B20-3 = giáo trình 2.0, bài 3; chỉ từ mới chính, không gồm từ mở rộng */
    const [ver, n] = deck.slice(1).split('-');
    const L = BOOKS[ver === '20' ? 'hsk20_1' : 'hsk30_1'].lessons.find(x => x.n === +n);
    return L ? coreWords(L) : [];
  }""")
rep("""  C = { queue: [...shuffle(due), ...fresh], flipped: false, reviewed: 0, total: ws.length };""",
    """  C = { queue: [...shuffle(due), ...fresh], flipped: false, reviewed: 0, total: ws.length, map: Object.fromEntries(ws.map(w => [w.s, w])) };""")
rep("""  const v = WMAP[C.queue[0]];""", """  const v = C.map[C.queue[0]] || WMAP[C.queue[0]];""")
rep("""  const decks = [['lesson', tr('Bài 1', 'Lesson 1')], ...LVS.map(k => ['L' + k, 'HSK ' + lvName(k)])];""",
    """  const decks = lvsFor().map(k => ['L' + k, 'HSK ' + lvName(k)]);
  const B = bookOf();
  const deckSel = `<select class="sel" id="deckSel" aria-label="${tr('Chọn bài', 'Choose a lesson')}">
    ${S.deck.startsWith('B') ? '' : `<option value="">${tr('Chọn bài…', 'Choose a lesson…')}</option>`}
    ${B.lessons.map(L => `<option value="B${S.ver}-${L.n}" ${S.deck === `B${S.ver}-${L.n}` ? 'selected' : ''}>${tr('Bài', 'Lesson')} ${L.n}: ${esc(L.zh)}</option>`).join('')}</select>`;""")
rep("""  <div class="deckbar" role="group" aria-label="${tr('Chọn bộ thẻ', 'Choose a deck')}">${decks.map(([k, l]) => `<button class="pill" data-act="deck" data-arg="${k}" aria-pressed="${S.deck === k}">${l}</button>`).join('')}</div>
  ${S.deck !== 'lesson' ? `<p class="hint" style="margin:0 0 8px">${tr(`Mỗi lượt gồm các thẻ đến hạn và tối đa ${NEW_PER_SESSION} từ mới. Bộ này có ${num(C.total)} từ (${S.ver === '21' ? 'chuẩn 2021' : 'đề thi 2026'}).`, `Each session has due cards plus up to ${NEW_PER_SESSION} new words. This deck has ${num(C.total)} words.`)}</p>` : ''}`;""",
    """  ${verSeg()}
  <div class="deckrow"><span class="lbl">${tr('Theo bài', 'By lesson')}</span>${deckSel}</div>
  <div class="deckrow" role="group" aria-label="${tr('Theo cấp', 'By level')}"><span class="lbl">${tr('Theo cấp', 'By level')}</span>${decks.map(([k, l]) => `<button class="pill" data-act="deck" data-arg="${k}" aria-pressed="${S.deck === k}">${l}</button>`).join('')}</div>
  <p class="hint" style="margin:0 0 8px">${S.deck.startsWith('B')
    ? tr(`Từ mới của bài (${num(C.total)} từ, không gồm từ mở rộng).`, `This lesson's words (${num(C.total)}).`)
    : tr(`Mỗi lượt gồm các thẻ đến hạn và tối đa ${NEW_PER_SESSION} từ mới. Bộ này có ${num(C.total)} từ (${verName()}).`, `Due cards plus up to ${NEW_PER_SESSION} new words. ${num(C.total)} words.`)}</p>`;""")
rep("""  deck(a) { S.deck = a; store.set('deck', a); C = null; renderCards(); },""",
    """  deck(a) { if (!a) return; S.deck = a; store.set('deck', a); C = null; renderCards(); },""")

# ---------------------------------------------------------------- khối lộ trình giáo trình + router
V3 = pathlib.Path(__file__).with_name("v3_block.js").read_text(encoding="utf-8")
rep("/* ---------- Router ---------- */", V3 + "\n/* ---------- Router ---------- */")
rep("const VIEWS = { home: renderHome, library: renderLibrary, lessons: renderLessons,",
    "const VIEWS = { home: renderHome, library: renderLibrary, lessons: renderBookList, book: renderBook,")
rep("""  ...LIB_ACT,""", """  ...LIB_ACT,
  ...BOOK_ACT,""")
rep("""let libT = null;""", """let libT = null;
document.addEventListener('change', e => { if (e.target.id === 'deckSel') ACT.deck(e.target.value); });""")

P.write_text(s, encoding="utf-8")
print("patched v3 OK")
