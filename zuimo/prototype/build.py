#!/usr/bin/env python3
"""Đóng gói prototype ZUIMO thành 1 file HTML: nhúng Hanzi Writer, dữ liệu nét chữ HSK 1
và bộ nội dung HSK 3.0 (dạng mảng gọn để giảm dung lượng)."""
import json
import pathlib

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
SRC = pathlib.Path("/home/claude/data")
BUILD = ROOT / "content/build"
OUT = pathlib.Path("/mnt/user-data/outputs/zuimo-prototype.html")
DEPLOY_SITE = ROOT / "deploy/site"
BRAND = ROOT / "brand/out"
SITE_URL = "https://zuimo.io.vn"
import base64, shutil
from PIL import Image as _Img


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()

DARK = ("--ink:#E6EDEF;--ink-2:#B3BEC7;--ink-3:#8795A1;"
        "--paper:#0F171D;--surface:#16212A;--surface-2:#1E2B35;--line:#2A3944;--line-2:#3B4E5C;"
        "--jade-soft:#0F3A2E;--jade-ink:#86E6C5;--jade-d:#08704F;"
        "--verm:#FD7047;--verm-strong:#C43F20;--verm-soft:#45211A;--verm-ink:#FFB8A6;--verm-d:#A3331A;"
        "--sun-soft:#3B3014;--sun-ink:#FFD980;--sun-d:#B98205;--blue-soft:#16294A;"
        "--t1:#79AAF6;--t2:#3DD3A3;--t3:#F4BA45;--t4:#FF8266;--t5:#8F9CA8;color-scheme:dark;")

words = json.loads((BUILD / "words.json").read_text(encoding="utf-8"))
hanzi = json.loads((BUILD / "hanzi.json").read_text(encoding="utf-8"))
grammar = json.loads((BUILD / "grammar.json").read_text(encoding="utf-8"))
books = json.loads((BUILD / "books.json").read_text(encoding="utf-8"))

# Mảng gọn: [chữ, pinyin (âm tiết cách nhau bởi dấu cách), chuỗi thanh, cấp 2021, cấp 2025, EN, VI, Hán Việt]
db_w = [[w["s"], " ".join(w["py"]), "".join(map(str, w["tn"])), w.get("l21") or 0, w.get("l25") or 0,
         "; ".join(w.get("en", "").split("; ")[:2])[:80], w.get("vi", ""), w.get("hv", ""), w.get("l20") or 0] for w in words]
db_h = [[h["c"], h["l21"], h["py"], h["tn"], h.get("sc", 0), h.get("hv", "")] for h in hanzi]
db = {"w": db_w, "h": db_h, "g": grammar}

# Nét chữ: toàn bộ chữ xuất hiện trong từ vựng HSK 1 (cả hai phiên bản) + chữ HSK 1 chính thức
chars = {h["c"] for h in hanzi if h["l21"] == 1}
for w in words:
    if w.get("l21") == 1 or w.get("l25") == 1 or w.get("l20") == 1:
        chars.update(c for c in w["s"] if "\u3400" <= c <= "\u9fff")
for b in books.values():   # mọi chữ trong hai giáo trình + chữ độc thể + chữ ví dụ bộ thủ
    for L in b["lessons"]:
        for w in L["words"] + L["extra"] + L["proper"]:
            chars.update(c for c in w["s"] if "\u3400" <= c <= "\u9fff")
        chars.update(L.get("chars", []))
        for h in L.get("hanzi", []):
            for r in h.get("rad", []):
                chars.update(r["ex"].split())
strokes = {}
for c in sorted(chars):
    f = SRC / f"hanzi-writer-data/package/{c}.json"
    if f.exists():
        strokes[c] = json.loads(f.read_text(encoding="utf-8"))

hw = (SRC / "hanzi-writer-data/../hanzi-writer-3.7.3/package/dist/hanzi-writer.min.js")
hw = pathlib.Path("/home/claude/proto/hanzi-writer-3.7.3/package/dist/hanzi-writer.min.js").read_text(encoding="utf-8")
tpl = (HERE / "template.html").read_text(encoding="utf-8")
out = (tpl.replace("__DARK__", DARK)
          .replace("__HANZI_WRITER__", hw)
          .replace("__CHAR_DATA__", json.dumps(strokes, ensure_ascii=False, separators=(",", ":")))
          .replace("__DB__", json.dumps(db, ensure_ascii=False, separators=(",", ":")))
          .replace("__BOOKS__", json.dumps(books, ensure_ascii=False, separators=(",", ":"))))
lw, lh = _Img.open(BRAND / "logo-light.png").size
out = (out.replace("__LOGO_LIGHT__", data_uri(BRAND / "logo-light.png", "image/png"))
          .replace("__LOGO_DARK__", data_uri(BRAND / "logo-dark.png", "image/png"))
          .replace("__LOGO_W__", str(lw)).replace("__LOGO_H__", str(lh))
          .replace("__FAVICON_SVG__", data_uri(BRAND / "favicon.svg", "image/svg+xml"))
          .replace("__FAVICON_PNG__", data_uri(BRAND / "favicon-32.png", "image/png"))
          .replace("__APPLE_ICON__", data_uri(BRAND / "apple-touch-icon.png", "image/png"))
          .replace("ZUIMO", "Zuimó"))   # tên hiển thị theo logo; khoá lưu trữ 'zuimo:' viết thường không đổi
for ph in ("__DARK__", "__HANZI_WRITER__", "__CHAR_DATA__", "__DB__", "__BOOKS__", "__LOGO_", "__FAVICON_", "__APPLE_ICON__"):
    assert ph not in out, ph

# Bản demo (một file, không có manifest vì không có file đi kèm)
OUT.write_text(out.replace("__HEAD_EXTRA__", ""), encoding="utf-8")

# Bản triển khai: manifest PWA, Open Graph, canonical + icon dạng file tĩnh (trình duyệt cache được)
head = f"""<link rel="manifest" href="/manifest.webmanifest">
<link rel="canonical" href="{SITE_URL}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Zuimó">
<meta property="og:locale" content="vi_VN">
<meta property="og:url" content="{SITE_URL}/">
<meta property="og:title" content="Zuimó – Học tiếng Trung theo HSK 2.0 và HSK 3.0">
<meta property="og:description" content="Từ vựng có Hán Việt, ngữ pháp, hội thoại, tập viết chữ Hán, thẻ nhớ và luyện tập theo từng bài.">
<meta property="og:image" content="{SITE_URL}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">"""
dep = (out.replace("__HEAD_EXTRA__", head)
          .replace(data_uri(BRAND / "favicon.svg", "image/svg+xml"), "/favicon.svg")
          .replace(data_uri(BRAND / "favicon-32.png", "image/png"), "/favicon-32.png")
          .replace(data_uri(BRAND / "apple-touch-icon.png", "image/png"), "/apple-touch-icon.png"))
DEPLOY_SITE.mkdir(parents=True, exist_ok=True)
(DEPLOY_SITE / "index.html").write_text(dep, encoding="utf-8")
for f in ("favicon.svg", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png",
          "icon-maskable-512.png", "og-image.png", "manifest.webmanifest"):
    shutil.copy2(BRAND / f, DEPLOY_SITE / f)
(DEPLOY_SITE / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n", encoding="utf-8")
(DEPLOY_SITE / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    f'<url><loc>{SITE_URL}/</loc></url></urlset>\n', encoding="utf-8")
print(f"{DEPLOY_SITE / 'index.html'}  {len(dep.encode()) / 1e6:.2f} MB + {len(list(DEPLOY_SITE.iterdir())) - 1} file tĩnh")
print(f"{OUT}  {len(out.encode()) / 1e6:.2f} MB  (nét chữ: {len(strokes)} chữ)")
