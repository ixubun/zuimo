#!/usr/bin/env python3
"""
split_to_modules.py – chuyển prototype một file HTML thành dự án Vite nhiều module (web/).

Cách làm: cắt mã JS theo các mốc chức năng có sẵn, tự phát hiện khai báo cấp cao trong từng file
rồi sinh export/import tương ứng. Vài chỗ cần đổi tay (dữ liệu nhúng -> tải theo nhu cầu, nét chữ,
biến phiên P/C) được thực hiện bằng các phép thay thế có kiểm tra số lần khớp.

Chạy: python3 tools/split_to_modules.py   (từ thư mục web/)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
ROOT = WEB.parent
TEMPLATE = ROOT / "prototype/template.html"
SRC = WEB / "src"

html = TEMPLATE.read_text(encoding="utf-8")
css = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
app = re.findall(r"<script>(.*?)</script>", html, re.S)[-1]
body = app[app.index("(function () {") + len("(function () {"):app.rindex("})();")]
lines = body.split("\n")


def find_line(pattern: str, start: int = 0) -> int:
    for n in range(start, len(lines)):
        if re.search(pattern, lines[n]):
            return n
    raise SystemExit(f"không thấy mốc: {pattern}")


# ---------------------------------------------------------------- ranh giới file (theo mốc trong mã)
marks = {
    "store": find_line(r"^/\* ---------- Lưu trữ an toàn"),
    "sync": find_line(r"^/\* =+$", 30),
    "i18n": find_line(r"^const tr = "),
    "icons": find_line(r"^/\* ---------- Icon"),
    "sample": find_line(r"^/\* ---------- Nội dung mẫu"),
    "session": find_line(r"^/\* ---------- Phiên luyện tập: mỗi bài"),
    "pinyin": find_line(r"^/\* ---------- Pinyin"),
    "speech": find_line(r"^/\* ---------- Phát âm"),
    "xp": find_line(r"^/\* ---------- XP, chuỗi ngày"),
    "writer": find_line(r"^/\* ---------- Hanzi Writer"),
    "nav": find_line(r"^/\* ---------- Khung: nav"),
    "home": find_line(r"^/\* ---------- Views"),
    "practice": find_line(r"^/\* ---------- Luyện tập ----------"),
    "cards": find_line(r"^/\* ---------- Thẻ ghi nhớ"),
    "stats": find_line(r"^/\* ---------- Thống kê"),
    "data": find_line(r"^/\* =+$", find_line(r"^/\* ---------- Thống kê")),
    "library": find_line(r"^/\* ---------- Thư viện"),
    "level": find_line(r"^/\* ---------- Phiên luyện tập sinh tự động"),
    "auth": find_line(r"^/\* ---------- Hồ sơ người dùng"),
    "about": find_line(r"^/\* ---------- Nguồn dữ liệu"),
    "books": find_line(r"^/\* =+$", find_line(r"^/\* ---------- Nguồn dữ liệu")),
    "booklist": find_line(r"^/\* ---------- Danh sách bài"),
    "router": find_line(r"^/\* ---------- Router"),
    "actions": find_line(r"^/\* ---------- Event delegation"),
    "boot": find_line(r"^/\* ---------- Khởi động"),
}
order = list(marks)
ranges = {}
for i, k in enumerate(order):
    a = marks[k]
    b = marks[order[i + 1]] if i + 1 < len(order) else len(lines)
    ranges[k] = (a, b)
ranges["dom"] = (0, marks["store"])

FILES = {  # khoá -> đường dẫn module
    "dom": "core/dom.js", "store": "core/state.js", "sync": "core/sync.js", "i18n": "core/util.js", "icons": "core/icons.js",
    "sample": "content/sample.js", "session": "features/session.js", "pinyin": "features/pinyin.js",
    "speech": "features/speech.js", "xp": "features/xp.js", "writer": "features/writer.js",
    "nav": "ui/nav.js", "home": "views/home.js", "practice": "views/practice.js", "cards": "views/cards.js",
    "stats": "views/stats.js", "data": "content/data.js", "library": "views/library.js",
    "level": "features/level-session.js", "auth": "views/profile.js", "about": "views/about.js",
    "books": "content/books.js", "booklist": "views/book.js", "router": "app/router.js",
    "actions": "app/actions.js", "boot": "main.js",
}

chunks = {k: "\n".join(lines[a:b]) for k, (a, b) in ranges.items()}


def rep(key: str, old: str, new: str, count: int = 1) -> None:
    n = chunks[key].count(old)
    assert n == count, f"[{key}] khớp {n} lần (cần {count}): {old[:80]!r}"
    chunks[key] = chunks[key].replace(old, new)


# ---------------------------------------------------------------- các chỗ phải đổi tay
# 1. dữ liệu nhúng -> module content/data.js tải theo nhu cầu (viết riêng bên dưới)
rep("dom", "const CHAR_DATA = __CHAR_DATA__;\n", "")
rep("dom", "/* Dữ liệu nét chữ nhúng sẵn (Make Me a Hanzi / hanzi-writer-data, Arphic PL)\n   vì trang publish không được phép fetch ra ngoài. */\n", "")
rep("books", "const BOOKS = __BOOKS__;", "/* BOOKS: mục lục nạp lúc khởi động, từng quyển nạp khi mở (xem content/data.js) */")
# Đăng ký từ của sách vào bảng tra: trước làm lúc khởi tạo, giờ làm khi nạp quyển (data.js), tránh vòng lặp import
_reg = [l for l in chunks["books"].split("\n") if l.startswith("Object.values(BOOKS).forEach(")]
assert len(_reg) == 1, "không thấy câu lệnh đăng ký từ của sách"
chunks["books"] = chunks["books"].replace(_reg[0] + "\n", "")
chunks["books"] = chunks["books"].replace("/* từ riêng của sách (你好, 这个, tên riêng…) cần có trong bảng tra để thẻ nhớ hiển thị được */\n", "")
rep("books", "const coreWords = L => L.words.filter(w => w.k === 'core');",
    "const coreWords = L => (L.words || []).filter(w => w.k === 'core');\n"
    "/* Số từ mới: dùng con số trong mục lục khi quyển chưa nạp đầy đủ */\n"
    "const coreCount = L => (L.nCore != null ? L.nCore : coreWords(L).length);\n"
    "const extraCount = L => (L.extra ? L.extra.length : L.nExtra || 0);")
for k in ("booklist", "home", "nav", "auth"):
    chunks[k] = re.sub(r"\b(\w+)\.extra\.length", r"extraCount(\1)", chunks[k])
# không áp vào "books": ở đó có chính định nghĩa coreCount, thay vào sẽ thành hàm tự gọi mình
for k in ("nav", "home", "booklist", "auth"):
    chunks[k] = re.sub(r"coreWords\(([^()]+)\)\.length", r"coreCount(\1)", chunks[k])

# 2. nét chữ: CHAR_DATA[c] -> hasStroke(c) / strokeCount(c); loader lấy dữ liệu qua fetch
rep("writer", "const loader = (c, onLoad, onErr) => (CHAR_DATA[c] ? onLoad(CHAR_DATA[c]) : onErr(new Error('Thiếu dữ liệu nét cho ' + c)));",
    "/* hanzi-writer gọi loader khi cần: tải file nét của đúng chữ đó, có cache (content/data.js) */\n"
    "const loader = (c, onLoad, onErr) => loadStroke(c).then(d => (d ? onLoad(d) : onErr(new Error('Thiếu dữ liệu nét cho ' + c)))).catch(onErr);")
rep("writer", "if (S.lib.char && CHAR_DATA[S.lib.char])", "if (S.lib.char && hasStroke(S.lib.char))")
rep("home", "const strokes = CHAR_DATA[cur.c] ? CHAR_DATA[cur.c].strokes.length : '?';", "const strokes = strokeCount(cur.c) || '?';")
rep("library", "const has = !!CHAR_DATA[h.c];", "const has = hasStroke(h.c);")
rep("booklist", "const chars = L.chars.filter(c => CHAR_DATA[c]);", "const chars = (L.chars || []).filter(c => hasStroke(c));")
rep("booklist", "if (S.bchar && CHAR_DATA[S.bchar])", "if (S.bchar && hasStroke(S.bchar))")
rep("actions", "const c = S.writerChar, total = CHAR_DATA[c].strokes.length;", "const c = S.writerChar, total = strokeCount(c);")

# 3. biến phiên P (luyện tập) và C (thẻ nhớ) chỉ được gán trong module của chúng
rep("router", "if (r === 'practice') P = null;\n  if (r === 'cards') C = null;", "if (r === 'practice') resetPractice();\n  if (r === 'cards') resetCards();", 2)
rep("actions", "C = null; renderCards();", "resetCards(); renderCards();", 2)
chunks["practice"] += ("\n/** Bỏ phiên luyện tập hiện tại (router gọi khi mở lại trang luyện tập). */\nfunction resetPractice() { P = null; }\n"
                       "/** Phiên luyện tập hiện tại, cho module xử lý sự kiện (binding của let không import được). */\nfunction curP() { return P; }\n")
chunks["cards"] += ("\n/** Bỏ phiên thẻ nhớ hiện tại. */\nfunction resetCards() { C = null; }\n"
                    "/** Phiên thẻ nhớ hiện tại. */\nfunction curC() { return C; }\n")
# actions.js đọc P/C của module khác: chuyển sang gọi hàm truy cập
chunks["actions"] = re.sub(r"(?<![\w$.])P(?![\w$])", "curP()", chunks["actions"])
chunks["actions"] = re.sub(r"(?<![\w$.])C(?![\w$])", "curC()", chunks["actions"])

# 4. thư viện: số từ của từng cấp lấy từ bảng đếm, không cần nạp mọi cấp
rep("library", "${num(levelWords(k).length)} ${tr('từ', 'words')}", "${num(levelCount('w', k))} ${tr('từ', 'words')}")

# 5. khởi động: hanzi-writer là gói npm, dữ liệu nạp trước khi vẽ lần đầu
rep("boot", "if (!window.HanziWriter) console.error('Hanzi Writer chưa nạp được');\n", "")
rep("boot", "render();\ndetectApi();",
    "/* Mục lục sách và bảng đếm rất nhỏ nhưng menu và trang chủ cần chúng, nên nạp xong mới vẽ lần đầu */\n"
    "loadIndex().then(() => { render(); detectApi(); })\n"
    "  .catch(e => { view.innerHTML = '<p class=\"empty-note\">Không tải được dữ liệu học: ' + esc(e.message) + '</p>'; });")

# 6. logo/favicon: đường dẫn tĩnh thay cho data URI
chunks["nav"] = chunks["nav"].replace("__LOGO_LIGHT__", "/brand/logo-light.png").replace("__LOGO_DARK__", "/brand/logo-dark.png")
chunks["auth"] = chunks["auth"].replace("__LOGO_LIGHT__", "/brand/logo-light.png").replace("__LOGO_DARK__", "/brand/logo-dark.png")
for k in chunks:
    chunks[k] = chunks[k].replace("__LOGO_W__", "217").replace("__LOGO_H__", "87")

# 7. router: chờ dữ liệu của trang trước khi vẽ (tải theo nhu cầu)
rep("router", "function render(opts = {}) {",
    "function render(opts = {}) {\n"
    "  const need = needsFor(S.route);\n"
    "  if (need) {\n"
    "    view.innerHTML = `<p class=\"lead loading\">${tr('Đang tải…', 'Loading…')}</p>`;\n"
    "    need.then(() => render(opts)).catch(e => { view.innerHTML = `<p class=\"empty-note\">${tr('Không tải được dữ liệu.', 'Could not load data.')} ${esc(e.message || '')}</p>`; });\n"
    "    return;\n"
    "  }")

# ---------------------------------------------------------------- content/data.js viết tay, giữ các hàm tra cứu cũ
data_src = chunks["data"]
start = data_src.index("const lvsFor = ")
helpers = data_src[start:]
helpers = helpers.replace("const HMAP = Object.fromEntries(HANZI.map(h => [h.c, h]));\n", "")
chunks["data"] = '''/* ======================================================================
   Dữ liệu học – tải theo nhu cầu.
   Trang đầu chỉ cần mục lục (books/index.json) và bảng đếm; mỗi cấp độ, mỗi quyển,
   mỗi chữ nét được tải khi người dùng mở tới, rồi giữ trong bộ nhớ cho các lần sau.
   ====================================================================== */
const BASE = '/data';
const WORDS = [];            /* gom dần theo cấp đã tải */
const WMAP = {};
const HANZI = [];            /* toàn bộ 3.000 chữ, tải một lần khi mở Thư viện hoặc Tập viết */
const HMAP = {};
const GRAM = [];             /* gom dần theo cấp */
const BOOKS = {};            /* id -> quyển (mục lục lúc đầu, đầy đủ sau khi nạp) */
const STROKES = {};          /* chữ -> dữ liệu nét */
let COUNTS = {};             /* ver -> cấp -> {w,h,g} từ coverage.json */
let STROKE_SET = new Set();
const loaded = new Set();
const inflight = new Map();

async function getJson(path) {
  if (inflight.has(path)) return inflight.get(path);
  const p = fetch(BASE + path, { cache: 'force-cache' }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`); return r.json(); })
    .finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}
const once = (key, fn) => (loaded.has(key) ? Promise.resolve() : fn().then(() => { loaded.add(key); }));

function addWords(rows) {
  rows.forEach(r => {
    const w = { i: r[0], s: r[1], sy: r[2].split(' '), tn: [...r[3]].map(Number), l21: r[4], l25: r[5], en: r[6], vi: r[7], hv: r[8], l20: r[9] };
    if (!WMAP[w.s]) { WMAP[w.s] = w; WORDS.push(w); }
  });
  Object.keys(levelCache).forEach(k => delete levelCache[k]);
}
/** Mục lục sách, bảng đếm và danh sách chữ có nét: nhỏ, nạp lúc khởi động. */
export const loadIndex = () => once('index', async () => {
  const idx = await getJson('/index.json');
  COUNTS = idx.counts;
  STROKE_SET = new Set(idx.strokes);
  Object.entries(idx.books).forEach(([id, b]) => { if (!BOOKS[id] || !BOOKS[id].lessons[0].words) BOOKS[id] = b; });
  addWords(idx.sampleWords || []);
});
export const loadWords = (ver, n) => once(`w:${ver}:${n}`, async () => addWords(await getJson(`/words/${ver}-${n}.json`)));
export const loadHanzi = () => once('hanzi', async () => {
  (await getJson('/hanzi.json')).forEach(r => { const h = { c: r[0], l21: r[1], py: r[2], tn: r[3], sc: r[4], hv: r[5] }; HANZI.push(h); HMAP[h.c] = h; });
  Object.keys(hanziCache).forEach(k => delete hanziCache[k]);
});
export const loadGrammar = n => once(`g:${n}`, async () => { (await getJson(`/grammar/${n}.json`)).forEach(g => GRAM.push(g)); });
export const loadBook = id => once(`b:${id}`, async () => {
  const b = await getJson(`/books/${id}.json`);
  BOOKS[id] = b;
  /* từ riêng của sách (你好, tên riêng…) không nằm trong danh sách chuẩn: đưa vào bảng tra để thẻ nhớ hiển thị được */
  b.lessons.forEach(L => [...L.words, ...L.extra, ...L.proper].forEach(w => { if (!WMAP[w.s]) WMAP[w.s] = w; }));
});
export const loadStroke = c => (STROKES[c] ? Promise.resolve(STROKES[c])
  : !STROKE_SET.has(c) ? Promise.resolve(null)
  : getJson(`/strokes/${encodeURIComponent(c)}.json`).then(d => (STROKES[c] = d)));
export const hasStroke = c => STROKE_SET.has(c);
export const strokeCount = c => (STROKES[c] ? STROKES[c].strokes.length : (HMAP[c] && HMAP[c].sc) || 0);
export const levelCount = (kind, n, ver = S.ver) => ((COUNTS[ver] || {})[n] || {})[kind] || 0;

/** Trang nào cần dữ liệu gì; trả về promise khi còn thiếu, null khi đã đủ.
   Phải trả null khi đủ: render() gọi lại chính nó sau khi chờ, nếu lúc nào cũng có promise thì lặp vô hạn. */
export function needsFor(route) {
  const jobs = [];
  const want = (key, fn) => { if (!loaded.has(key)) jobs.push(fn()); };
  const ver = S.ver, lv = S.bookLv;
  const wantBook = (v, l) => want(`b:${bookId(v, l)}`, () => loadBook(bookId(v, l)));
  const wantWords = (v, n) => want(`w:${v}:${n}`, () => loadWords(v, n));
  if (route === 'library') {
    wantWords(ver, S.lib.lvl); want('hanzi', loadHanzi);
    if (ver === '20') { if (BOOKS[bookId('20', S.lib.lvl)]) wantBook('20', S.lib.lvl); }
    else want(`g:${S.lib.lvl}`, () => loadGrammar(S.lib.lvl));
  } else if (route === 'book') {
    wantBook(ver, lv); want('hanzi', loadHanzi);
  } else if (route === 'practice') {
    const src = S.pracSrc;
    if (src && src.book) booksOfVer(src.book).filter(x => x <= (src.lv || 1)).forEach(x => wantBook(src.book, x));
    else if (src && src.lvl) wantWords(src.ver || ver, src.lvl);
    else wantWords('20', 1);
  } else if (route === 'cards') {
    const d = S.deck || '';
    if (d.startsWith('B')) { const pre = d.slice(1).split('-')[0]; const v = pre.slice(0, 2), l = pre.includes('b') ? +pre.split('b')[1] : 1; wantBook(v, l); }
    else if (d.startsWith('L')) wantWords(ver, +d.slice(1));
    else wantWords('20', 1);
  } else if (route === 'lesson' || route === 'home') {
    wantWords('20', 1);      /* bài mẫu và chữ 中 ở trang chủ dùng từ HSK 1 */
  }
  return jobs.length ? Promise.all(jobs) : null;
}

''' + helpers

# ---------------------------------------------------------------- xuất/nhập tự động
decl_re = re.compile(r"^(?:export\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)", re.M)
declared = {k: set(decl_re.findall(v)) for k, v in chunks.items()}
declared["data"].update({"loadIndex", "loadWords", "loadHanzi", "loadGrammar", "loadBook", "loadStroke", "hasStroke", "strokeCount", "levelCount", "needsFor",
                         "WORDS", "WMAP", "HANZI", "HMAP", "GRAM", "BOOKS"})
for k in ("P", "C"):
    for f in declared:
        declared[f].discard(k)
owner = {}
for f, names in declared.items():
    for n in names:
        if n in owner and owner[n] != f:
            raise SystemExit(f"tên {n} khai báo ở cả {owner[n]} và {f}")
        owner[n] = f

def strip_code(text: str) -> str:
    """Bỏ comment để không nhập nhầm tên chỉ xuất hiện trong ghi chú."""
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    text = re.sub(r"(^|[^:\\])//[^\n]*", r"\1", text)
    # toán tử spread "...X" không phải truy cập thuộc tính ".X": thay bằng khoảng trắng để X vẫn được nhận diện
    return text.replace("...", " ")

def uses(text: str, name: str) -> bool:
    if name in ("$", "$$"):
        return bool(re.search(r"(?<![\w$])\$" + ("\\$" if name == "$$" else "") + r"(?![\w$])", text))
    return bool(re.search(r"(?<![\w$.])" + re.escape(name) + r"(?![\w$])", text))

def rel(from_key: str, to_key: str) -> str:
    a = Path(FILES[from_key]).parent
    b = Path(FILES[to_key])
    up = "../" * len(a.parts) if a.parts else ""
    return "./" + str(b) if not a.parts else up + str(b)

out_files = {}
for k, text in chunks.items():
    code = strip_code(text)
    imports = {}
    for name, own in owner.items():
        if own == k or name in declared[k]:
            continue
        if uses(code, name):
            imports.setdefault(own, []).append(name)
    header = []
    for own in sorted(imports, key=lambda o: FILES[o]):
        names = sorted(imports[own])
        header.append(f"import {{ {', '.join(names)} }} from '{rel(k, own)}';")
    if k == "writer":
        header.insert(0, "import HanziWriter from 'hanzi-writer';")
    if k == "boot":
        # actions.js chỉ có bộ lắng nghe sự kiện, không ai import nên phải nạp tường minh kẻo bundler bỏ qua
        header.insert(0, "import './styles/app.css';\nimport './app/actions.js';")
    exported = sorted(n for n in declared[k] if k != "data" or n not in ("loadIndex", "loadWords", "loadHanzi", "loadGrammar", "loadBook", "loadStroke", "hasStroke", "strokeCount", "levelCount", "needsFor"))
    footer = f"\nexport {{ {', '.join(exported)} }};\n" if exported and k != "boot" else "\n"
    out_files[FILES[k]] = ("\n".join(header) + ("\n\n" if header else "") + text.strip("\n") + "\n" + footer)

# ---------------------------------------------------------------- ghi file
for rel_path, content in out_files.items():
    p = SRC / rel_path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
(SRC / "styles").mkdir(exist_ok=True)
DARK = '--ink:#E6EDEF;--ink-2:#B3BEC7;--ink-3:#8795A1;--paper:#0F171D;--surface:#16212A;--surface-2:#1E2B35;--line:#2A3944;--line-2:#3B4E5C;--jade-soft:#0F3A2E;--jade-ink:#86E6C5;--jade-d:#08704F;--verm:#FD7047;--verm-strong:#C43F20;--verm-soft:#45211A;--verm-ink:#FFB8A6;--verm-d:#A3331A;--sun-soft:#3B3014;--sun-ink:#FFD980;--sun-d:#B98205;--blue-soft:#16294A;--t1:#79AAF6;--t2:#3DD3A3;--t3:#F4BA45;--t4:#FF8266;--t5:#8F9CA8;color-scheme:dark;'
(SRC / "styles/app.css").write_text(css.replace("__DARK__", DARK).strip() + "\n.loading{padding:40px 0;text-align:center}\n", encoding="utf-8")

head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
head = re.sub(r"<style>.*?</style>", "", head, flags=re.S)
head = head.replace("__FAVICON_SVG__", "/favicon.svg").replace("__FAVICON_PNG__", "/favicon-32.png").replace("__APPLE_ICON__", "/apple-touch-icon.png")
head = head.replace("__HEAD_EXTRA__", '<link rel="manifest" href="/manifest.webmanifest">')
shell = re.search(r"<body>(.*?)<script>", html, re.S).group(1)
shell = shell.replace("__LOGO_LIGHT__", "/brand/logo-light.png").replace("__LOGO_DARK__", "/brand/logo-dark.png").replace("__LOGO_W__", "217").replace("__LOGO_H__", "87")
(WEB / "index.html").write_text(f"<!doctype html>\n<html lang=\"vi\">\n<head>{head}</head>\n<body>{shell}<script type=\"module\" src=\"/src/main.js\"></script>\n</body>\n</html>\n", encoding="utf-8")

print("đã tách", len(out_files), "module")
for f in out_files:
    n = len(out_files[f].split("\n"))
    print(f"  {f:32s} {n:5d} dòng")
