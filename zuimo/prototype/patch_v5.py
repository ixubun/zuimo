#!/usr/bin/env python3
"""Zuimó v5: hỗ trợ nhiều quyển giáo trình cho mỗi phiên bản và tách lộ trình trang chủ theo HSK 2.0 / HSK 3.0.
Chạy sau patch_v2.py, patch_v3.py, patch_v4.py. Mỗi thay thế đều assert số lần khớp."""
import pathlib

P = pathlib.Path(__file__).parent / "template.html"
s = P.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f"khớp {n} lần (cần {count}): {old[:100]!r}"
    s = s.replace(old, new)


# ---------------------------------------------------------------- trạng thái: quyển đang học
rep("""  bl: store.get('bl', 1), btab: 'words', bchar: null,""",
    """  bl: store.get('bl', 1), btab: 'words', bchar: null,
  bookLv: store.get('bookLv', 1),              /* quyển đang học trong phiên bản hiện tại */""")

# ---------------------------------------------------------------- tra cứu sách theo (phiên bản, quyển)
rep("""const bookOf = (ver = S.ver) => BOOKS[ver === '20' ? 'hsk20_1' : 'hsk30_1'];""",
    """/* Mỗi phiên bản có nhiều quyển: hsk20_1, hsk20_2, hsk30_1, hsk30_2… */
const bookId = (ver, lv) => `hsk${ver}_${lv}`;
const booksOfVer = (ver = S.ver) => [1, 2, 3, 4, 5, 6].filter(l => BOOKS[bookId(ver, l)]);
const bookOf = (ver = S.ver, lv = S.bookLv) => BOOKS[bookId(ver, lv)] || BOOKS[bookId(ver, 1)];
/* Khoá tiến độ/thẻ: quyển 1 giữ dạng cũ "20-5" để người dùng không mất tiến độ đã có; quyển sau là "20b2-5" */
const bPre = (ver, lv) => (lv === 1 ? ver : `${ver}b${lv}`);""")
rep("""const bKey = (n, ver = S.ver) => `${ver}-${n}`;""",
    """const bKey = (n, ver = S.ver, lv = S.bookLv) => `${bPre(ver, lv)}-${n}`;""")

# ---------------------------------------------------------------- danh sách bài: chọn quyển
rep("""  <p class="vernote">${ver === '20'
    ? tr('Giáo trình chuẩn HSK 1 (HSK标准教程), theo đề cương HSK 2.0: 15 bài, học kỹ phát âm và chữ Hán trong từng bài.', 'HSK Standard Course 1 (HSK 2.0): 15 lessons with pronunciation and character work in every lesson.')
    : tr('新HSK教程 1, theo đề cương HSK 3.0 áp dụng từ 2026: 15 bài, khoảng 300 từ mới.', '新HSK教程 1 (HSK 3.0, from 2026): 15 lessons, about 300 new words.')}""",
    """  ${booksOfVer().length > 1 ? `<div class="seggroup" role="group" aria-label="${tr('Chọn quyển', 'Choose a book')}">${booksOfVer().map(l => `<button class="seg" data-act="booklv" data-arg="${l}" aria-pressed="${S.bookLv === l}">${tr('Quyển', 'Book')} ${l}</button>`).join('')}</div>` : ''}
  <p class="vernote">${esc(B.title)}: ${B.lessons.length} ${tr('bài', 'lessons')}, ${num(B.lessons.reduce((a, L) => a + coreWords(L).length, 0))} ${tr('từ mới', 'new words')}. ${ver === '20'
    ? tr('Theo đề cương HSK 2.0, học kỹ phát âm và chữ Hán trong từng bài.', 'HSK 2.0 syllabus, with pronunciation and character work in every lesson.')
    : tr('Theo đề cương HSK 3.0 áp dụng từ 07/2026.', 'HSK 3.0 syllabus, effective July 2026.')}""")
rep("""    <button class="unit on" data-act="nav" data-arg="lesson"><span class="zhb">入门</span>""",
    """    ${S.bookLv === 1 ? `<button class="unit on" data-act="nav" data-arg="lesson"><span class="zhb">入门</span>""")
rep("""<span class="us" style="display:block">${tr('Bài mẫu ZUIMO, dùng được cho cả hai giáo trình', 'ZUIMO sample lesson for both textbooks')}</span></span><span class="end">${ic('chev')}</span></button>""",
    """<span class="us" style="display:block">${tr('Bài mẫu ZUIMO, dùng được cho cả hai giáo trình', 'ZUIMO sample lesson for both textbooks')}</span></span><span class="end">${ic('chev')}</span></button>` : ''}""")
rep("""<div class="muted" style="font-size:13px;font-weight:700">${verName()}, ${tr('bài', 'lesson')} ${L.n}</div>""",
    """<div class="muted" style="font-size:13px;font-weight:700">${verName()}, ${tr('quyển', 'book')} ${S.bookLv}, ${tr('bài', 'lesson')} ${L.n}</div>""")

# ---------------------------------------------------------------- luyện tập theo bài: phương án nhiễu gồm cả các quyển trước
rep("""function buildBookSession(ver, n) {
  const B = BOOKS[ver === '20' ? 'hsk20_1' : 'hsk30_1'];
  const L = B.lessons.find(x => x.n === n);
  const pool = B.lessons.filter(x => x.n <= Math.max(n, 3)).flatMap(coreWords);""",
    """function buildBookSession(ver, lv, n) {
  const B = bookOf(ver, lv);
  const L = B.lessons.find(x => x.n === n);
  const earlier = booksOfVer(ver).filter(l => l < lv).flatMap(l => BOOKS[bookId(ver, l)].lessons.flatMap(coreWords));
  const pool = earlier.concat(B.lessons.filter(x => x.n <= Math.max(n, 3)).flatMap(coreWords));""")
rep("""  bprac(a) { S.pracSrc = { book: S.ver, n: +a }; go('practice'); },
  bcards(a) { S.deck = `B${S.ver}-${a}`; store.set('deck', S.deck); go('cards'); }""",
    """  bprac(a) { S.pracSrc = { book: S.ver, lv: S.bookLv, n: +a }; go('practice'); },
  bcards(a) { S.deck = `B${bPre(S.ver, S.bookLv)}-${a}`; store.set('deck', S.deck); go('cards'); },
  booklv(a) { S.bookLv = +a; store.set('bookLv', S.bookLv); S.bl = 1; store.set('bl', 1); render({ keepScroll: true }); },
  /* từ lộ trình trang chủ: mở đúng phiên bản + quyển, hoặc thư viện nếu cấp đó chưa có giáo trình */
  gobook(a) {
    const [ver, lv] = a.split('-');
    S.ver = ver; store.set('ver', ver);
    S.bookLv = +lv; store.set('bookLv', S.bookLv);
    S.bl = 1; store.set('bl', 1);
    go('lessons');
  },
  golib(a) {
    const [ver, lv] = a.split('-');
    S.ver = ver; store.set('ver', ver);
    Object.assign(S.lib, { lvl: +lv, tab: 'words', q: '', page: 0, char: null });
    store.set('lib', { lvl: +lv, tab: 'words' });
    go('library');
  }""")
rep("""  const items = byBook ? buildBookSession(src.book, src.n) : byLevel ? buildLevelSession(src.lvl, src.ver) : buildSession();""",
    """  const items = byBook ? buildBookSession(src.book, src.lv || 1, src.n) : byLevel ? buildLevelSession(src.lvl, src.ver) : buildSession();""")
rep("""    ? `${verName(src.book)}, ${tr('bài', 'lesson')} ${src.n}: ${(BOOKS[src.book === '20' ? 'hsk20_1' : 'hsk30_1'].lessons.find(x => x.n === src.n) || {}).zh || ''}`""",
    """    ? `${verName(src.book)}, ${tr('quyển', 'book')} ${src.lv || 1}, ${tr('bài', 'lesson')} ${src.n}: ${(bookOf(src.book, src.lv || 1).lessons.find(x => x.n === src.n) || {}).zh || ''}`""")
rep("""S.p.bdone[`${S.pracSrc.book}-${S.pracSrc.n}`] = 1;""",
    """S.p.bdone[bKey(S.pracSrc.n, S.pracSrc.book, S.pracSrc.lv || 1)] = 1;""")

# ---------------------------------------------------------------- thẻ nhớ: bộ thẻ theo quyển
rep("""    const [ver, n] = deck.slice(1).split('-');
    const L = BOOKS[ver === '20' ? 'hsk20_1' : 'hsk30_1'].lessons.find(x => x.n === +n);""",
    """    const [pre, n] = deck.slice(1).split('-');
    const [ver, lv] = pre.includes('b') ? [pre.split('b')[0], +pre.split('b')[1]] : [pre, 1];
    const B = BOOKS[bookId(ver, lv)];
    const L = B && B.lessons.find(x => x.n === +n);""")
rep("""    ${B.lessons.map(L => `<option value="B${S.ver}-${L.n}" ${S.deck === `B${S.ver}-${L.n}` ? 'selected' : ''}>${tr('Bài', 'Lesson')} ${L.n}: ${esc(L.zh)}</option>`).join('')}</select>`;""",
    """    ${booksOfVer().map(lv => `<optgroup label="${tr('Quyển', 'Book')} ${lv}">${BOOKS[bookId(S.ver, lv)].lessons.map(L => {
      const v = `B${bPre(S.ver, lv)}-${L.n}`;
      return `<option value="${v}" ${S.deck === v ? 'selected' : ''}>${tr('Bài', 'Lesson')} ${L.n}: ${esc(L.zh)}</option>`;
    }).join('')}</optgroup>`).join('')}</select>`;""")
rep("""    if (S.deck && S.deck.startsWith('B')) S.deck = `B${a}-1`;""",
    """    if (!BOOKS[bookId(a, S.bookLv)]) { S.bookLv = 1; store.set('bookLv', 1); }
    S.bl = 1;
    if (S.deck && S.deck.startsWith('B')) S.deck = `B${bPre(a, S.bookLv)}-1`;""")

# ---------------------------------------------------------------- thư viện: ngữ pháp HSK 2.0 theo quyển tương ứng với cấp
rep("""  if (n !== 1 || typeof BOOKS === 'undefined') return [];
  return BOOKS.hsk20_1.lessons.flatMap(""",
    """  const B = typeof BOOKS !== 'undefined' && BOOKS[`hsk20_${n}`];
  if (!B) return [];
  return B.lessons.flatMap(""")

# ---------------------------------------------------------------- trang chủ: hai lộ trình tách biệt
start = s.index("""  <section>
    <h2 class="sec">${tr(`Lộ trình ${verName()}`, `${verName()} path`)}</h2>""")
end = s.index("""  </section>`;
  mountHero();""") + len("""  </section>`;""")
s = s[:start] + """  ${['20', '30'].map(ver => `<section class="path" aria-labelledby="path${ver}">
    <div class="path-head">
      <h2 class="sec" id="path${ver}">${tr('Lộ trình', 'Path')} ${verName(ver)}</h2>
      ${S.ver === ver
        ? `<span class="pill-on">${ic('check')}${tr('Đang theo lộ trình này', 'Your current path')}</span>`
        : `<button class="btn btn-ghost btn-sm" data-act="ver" data-arg="${ver}">${tr('Chuyển sang', 'Switch to')} ${verName(ver)}</button>`}
    </div>
    <p class="vernote">${ver === '20'
      ? tr('Đề cương cũ gồm 6 cấp, học theo bộ Giáo trình chuẩn HSK (HSK标准教程).', 'Former 6-level syllabus, with the HSK Standard Course.')
      : tr('Đề cương mới áp dụng từ 07/2026, học theo bộ 新HSK教程; cấp 7–9 thi chung một bài.', 'New syllabus from July 2026, with 新HSK教程; levels 7–9 share one exam.')}</p>
    <div class="levels">${lvsFor(ver).map(k => {
      const B = BOOKS[bookId(ver, k)];
      const cur = S.ver === ver && S.bookLv === k && B;
      const tag = cur ? `<span class="tag">${tr('Đang học', 'Current')}</span>`
        : B ? `<span class="tag book">${ic('book')}${tr('Có giáo trình', 'Textbook')}</span>`
        : `<span class="tag">${tr('Tra từ vựng', 'Vocabulary')}</span>`;
      const meta = B
        ? `${B.lessons.length} ${tr('bài', 'lessons')}, ${num(B.lessons.reduce((a, L) => a + coreWords(L).length, 0))} ${tr('từ mới', 'new words')}<br>${B.lessons.reduce((a, L) => a + L.grammar.length, 0)} ${tr('điểm ngữ pháp', 'grammar points')}`
        : `${num(levelWords(k, ver).length)} ${tr('từ trong đề cương', 'syllabus words')}<br>${tr('Giáo trình: sắp có', 'Textbook: coming')}`;
      return `<button class="lvl ${B ? 'has' : 'nobook'} ${cur ? 'on' : ''}" data-act="${B ? 'gobook' : 'golib'}" data-arg="${ver}-${k}" aria-label="${verName(ver)} HSK ${lvName(k)}">${tag}<div class="n">HSK ${lvName(k)}</div><div class="m">${meta}</div></button>`;
    }).join('')}</div>
  </section>`).join('')}`;""" + s[end:]

rep(""".toast{position:fixed;""", """.path{margin-bottom:28px}
.path-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:4px}
.path-head .sec{margin:0}
.pill-on{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:var(--jade-soft);color:var(--jade-ink);font-weight:700;font-size:13px}
.pill-on svg{width:14px;height:14px}
.lvl.has{border-color:var(--jade);border-style:solid}
.lvl.nobook{border-style:dashed}
.lvl .tag.book{background:var(--jade-soft);color:var(--jade-ink)}
.lvl.on .tag{background:var(--jade);color:#fff}
.toast{position:fixed;""")

P.write_text(s, encoding="utf-8")
print("patched v5 OK")
