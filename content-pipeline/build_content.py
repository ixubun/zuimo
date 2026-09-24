#!/usr/bin/env python3
"""
ZUIMO content pipeline
======================
Gộp các nguồn dữ liệu mở thành bộ nội dung HSK 3.0 thống nhất (JSON), là đầu vào
cho bước seed PostgreSQL ở giai đoạn 2 và cho bản prototype.

Nguồn (xem CREDITS.md):
  - drkameleon/complete-hsk-vocabulary (MIT): pinyin, bộ thủ, từ loại, nghĩa EN (gốc CC-CEDICT, CC BY-SA 4.0),
    nhãn cấp độ `new-*` (chuẩn GF0025-2021) và `newest-*` (đề cương thi mới áp dụng 07/2026).
  - krmanik/HSK-3.0: danh sách từ/chữ/ngữ pháp chính thức theo chuẩn 2021 (số hoá từ văn bản của Bộ Giáo dục TQ).
  - ph0ngp/hanviet-pinyin-words (MIT): âm Hán Việt theo từng cách đọc.
  - hanzi-writer-data (Arphic Public License): dữ liệu nét chữ.
  - pypinyin + jieba (MIT): sinh pinyin cho câu ví dụ ngữ pháp.
  - content/vi/*.tsv: nghĩa tiếng Việt và giải thích ngữ pháp do ZUIMO tự biên soạn.

Thiết kế:
  - Cấp độ chuẩn 2021 lấy từ danh sách chính thức (lần xuất hiện đầu tiên) vì một từ có thể xuất hiện
    ở nhiều cấp với nghĩa khác nhau (会, 小, 叫...). Chi tiết (pinyin, nghĩa) lấy từ drkameleon.
  - Mỗi từ mang cả `l21` và `l25` để web chuyển qua lại giữa hai phiên bản mà không nhân đôi dữ liệu.
  - Script idempotent, chỉ đọc nguồn và ghi ra thư mục output; chạy lại bao nhiêu lần cũng cho cùng kết quả.

Chạy:  python3 build_content.py --src /path/to/sources --out ../content
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

import jieba
from pypinyin import Style, lazy_pinyin

jieba.setLogLevel(60)  # tắt log khởi tạo của jieba

LEVELS = ["1", "2", "3", "4", "5", "6", "7-9"]          # tên file trong nguồn chính thức
LEVEL_NUM = {name: i for i, name in enumerate(LEVELS, 1)}  # "7-9" -> 7
CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "高": 7}

# Đính chính lỗi OCR đã kiểm chứng bằng câu ví dụ đi kèm trong chính nguồn
GRAMMAR_FIXES = {
    "一14": ("另、不、没、没有", "别、不、没、没有"),
}
WORD_FIXES = {"恰然自得": "怡然自得"}
# Đính chính thủ công (nguồn sai hoặc mâu thuẫn), đã kiểm tra với từ điển chuẩn:
#   từ: (pinyin viết liền có dấu, nghĩa EN thay thế hoặc None)
PY_OVERRIDE = {
    "便宜": ("piányi", "cheap; inexpensive"),
    "车上": (None, "in the car; on the bus/train"),
    "所长": ("suǒzhǎng", "head of an institute, office, station etc."),
    "拾": ("shí", "to pick up; to collect; ten (banker's anti-fraud numeral)"),
    "掺": ("chān", "to mix; to blend"),
    "嚼": ("jiáo", "to chew"),
    "谜": ("mí", "riddle; mystery"),
    "拽": ("zhuài", "to drag; to pull"),
    "下调": ("xiàtiáo", "to adjust downward; to lower"),
}

TONE_MARKS = {c: (b, i + 1) for b, s in [("a", "āáǎà"), ("e", "ēéěè"), ("i", "īíǐì"),
                                         ("o", "ōóǒò"), ("u", "ūúǔù"), ("ü", "ǖǘǚǜ")] for i, c in enumerate(s)}
SENT_END = re.compile(r"[。！？!?…]$")
def norm_code_line(line: str) -> str:
    """Chuẩn hoá phần mã 【...】 bị OCR sai: ー – － — thành '-', chữ O thành số 0."""
    m = re.match(r"^(【[^】］\]]{1,12}[】］\]])(.*)$", line)
    if not m:
        return line
    code = re.sub(r"[ー–－—]", "-", m.group(1))
    code = re.sub(r"(?<=[\d九])O|O(?=\d)", "0", code)
    return code + m.group(2)


RE_SUBHEAD = re.compile(r"(表示|问句|关联词语|[⋯…+＋：]|[A-Z甲乙]\s*[+＋比没]|^用)")
RE_POINT = re.compile(r"^【\s*(七\s*[—\-－]\s*九|[一二三四五六])\s*(\d+)\s*[】］\]]\s*(.+)$")


# --------------------------------------------------------------------------- helpers
def read_lines(p: Path) -> list[str]:
    return [unicodedata.normalize("NFC", ln.strip()) for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()]


def tone_of(syl: str) -> int:
    """Trả về số thanh (1-4, 5 = thanh nhẹ) của một âm tiết có dấu."""
    for ch in unicodedata.normalize("NFC", syl):
        if ch in TONE_MARKS:
            return TONE_MARKS[ch][1]
    return 5


def load_hanviet(p: Path) -> dict:
    raw = p.read_text(encoding="utf-8")
    raw = raw[raw.index("{"): raw.rindex("}") + 1]  # bỏ `export const hanvietData = ` và `;`
    return json.loads(raw)


def hanviet_for(trad: str, numeric: list[str], hv: dict) -> str | None:
    """Port rút gọn của getHanviet(): lấy âm Hán Việt đầu tiên cho từng chữ theo cách đọc.
    - ü: drkameleon/pypinyin dùng `nü3`/`nv3`, dữ liệu Hán Việt dùng `nu:3` -> chuẩn hoá.
    - 儿 hoá (`r5`) không đọc thành âm riêng nên bỏ qua chữ 兒 tương ứng."""
    if len(trad) != len(numeric):
        return None
    out, found = [], 0
    for ch, syl in zip(trad, numeric):
        s = syl.lower().replace("ü", "u:").replace("v", "u:")
        if s == "r5":
            continue
        entry = hv.get(ch)
        reading = None
        if entry:
            if entry.get("*"):
                reading = entry["*"][0]
            elif entry.get(s):
                reading = entry[s][0]
            elif s.endswith("5"):  # thanh nhẹ: thử các thanh gốc
                reading = next((entry[s[:-1] + t][0] for t in "1234" if entry.get(s[:-1] + t)), None)
            if reading is None:  # cách đọc lệch dữ liệu: lấy âm đầu tiên có được
                reading = next((v[0] for v in entry.values() if v), None)
        if reading:
            found += 1
        out.append(reading or "_")
    return " ".join(out) if found else None


JUNK_MEANING = re.compile(r"^(surname|old variant|variant of|used in|abbr\. for|\(archaic\)|archaic|Japanese variant|erhua variant of \S+$)", re.I)


def norm_py(x: str) -> str:
    """So khớp pinyin: bỏ khoảng trắng, nháy, viết thường, chuẩn NFC."""
    return re.sub(r"[\s'’·]", "", unicodedata.normalize("NFC", x)).lower()


def strip_tones(x: str) -> str:
    return "".join(TONE_MARKS[c][0] if c in TONE_MARKS else c for c in unicodedata.normalize("NFC", x))


def align_official(form_syls: list[str], official: str) -> list[str] | None:
    """Tách pinyin chính thức (viết liền, có thể dùng thanh nhẹ) theo ranh giới âm tiết của form.
    'báitian' + ['bái','tiān'] -> ['bái','tian']. Trả None nếu chữ cái không khớp."""
    off = re.sub(r"[\s'’·\d]", "", unicodedata.normalize("NFC", official))
    bare = [strip_tones(x) for x in form_syls]
    if strip_tones(off).lower() != "".join(bare).lower():
        return None
    out, i = [], 0
    for b in bare:
        out.append(off[i:i + len(b)])
        i += len(b)
    return out


def pick_form(entry: dict, official_py: str | None, word: str) -> dict:
    """Chọn cách đọc đúng cho từ đa âm.
    Thứ tự ưu tiên: khớp pinyin chính thức > khớp pypinyin (cách đọc phổ biến) > mục không phải
    họ/dị thể/chữ cổ và không viết hoa > mục đầu tiên."""
    forms = entry["forms"]
    good = [f for f in forms if not all(JUNK_MEANING.match(m) for m in f["meanings"])]
    pool = good or forms
    if official_py:
        want = norm_py(official_py)
        hit = [f for f in pool if norm_py(f["transcriptions"]["pinyin"]) == want]
        if not hit:  # chỉ khác thanh nhẹ: so khớp khi đã bỏ dấu thanh
            hit = [f for f in pool if strip_tones(norm_py(f["transcriptions"]["pinyin"])) == strip_tones(want)]
        if hit:
            # cùng cách đọc nhưng khác hoa/thường (大学 dàxué vs sách Dàxué): ưu tiên đúng kiểu chữ
            hit.sort(key=lambda f: f["transcriptions"]["pinyin"][:1].islower() != official_py[:1].islower())
            return hit[0]
    common = norm_py("".join(lazy_pinyin(word, style=Style.TONE)))
    hit = [f for f in pool if norm_py(f["transcriptions"]["pinyin"]) == common]
    if hit:
        return hit[0]
    lower = [f for f in pool if f["transcriptions"]["pinyin"][:1].islower()]
    return (lower or pool)[0]


def merge_erhua(py: list[str], tn: list[int]) -> tuple[list[str], list[int]]:
    """['yī','diǎn','r'] -> ['yī','diǎnr'] để hiển thị đúng cách viết pinyin."""
    rp, rt = [], []
    for s, t in zip(py, tn):
        if s == "r" and rp:
            rp[-1] += "r"
        else:
            rp.append(s)
            rt.append(t)
    return rp, rt


_seg_cache: dict = {}
KNOWN: dict[str, str] = {}  # từ -> pinyin viết liền theo nguồn chuẩn (giữ đúng thanh nhẹ: míngzi, zhīdao)


def set_lexicon(lex: dict[str, str]) -> None:
    KNOWN.clear()
    KNOWN.update(lex)
    _seg_cache.clear()


NUM_CH = set("零一二三四五六七八九十百千万两")


def _sandhi(chars: str, syl: list[str], i: int) -> str:
    """Biến điệu 一/不 theo cách ghi của giáo trình (chỉ áp dụng cho chữ không nằm trong từ đã có pinyin chuẩn)."""
    c, nxt = chars[i], (syl[i + 1] if i + 1 < len(syl) else None)
    nt = tone_of(nxt) if nxt else None
    if c == "不":
        return "bú" if nt == 4 else "bù"
    if c == "一":
        prev = chars[i - 1] if i else ""
        nch = chars[i + 1] if i + 1 < len(chars) else ""
        if nxt is None or prev == "第" or prev in NUM_CH or nch in NUM_CH:
            return "yī"
        return "yí" if nt in (4, 5) else "yì"
    return syl[i]


def _tokens_pinyin(tok: str, syl: list[str]) -> list[str]:
    """Pinyin cho một cụm jieba (syl: âm tiết theo ngữ cảnh của từng chữ trong cụm).
    Cụm có trong từ điển chuẩn -> pinyin chuẩn; cụm lạ -> tách tham lam theo từ điển, phần còn lại dùng syl."""
    if tok in KNOWN:
        return [KNOWN[tok]]
    out, i = [], 0
    while i < len(tok):
        for n in range(min(4, len(tok) - i), 1, -1):
            seg = tok[i:i + n]
            if seg in KNOWN:
                out.append(KNOWN[seg])
                i += n
                break
        else:
            out.append(KNOWN.get(tok[i]) or syl[i])
            i += 1
    return out


def sentence_pinyin(text: str, cap: bool = True) -> str:
    """Pinyin có dấu, gom theo từ như cách viết trong sách: 'Wǒ xiǎng xué Zhōngwén.'
    Từ có trong từ điển giữ đúng cách ghi chuẩn (thanh nhẹ, biến điệu đã ghi sẵn); 一/不 lẻ được biến điệu."""
    key = (text, cap)
    if key in _seg_cache:
        return _seg_cache[key]
    chars = "".join(re.findall(r"[\u3400-\u9fff]", text))
    base = lazy_pinyin(chars, style=Style.TONE, errors="ignore") if chars else []
    if len(base) != len(chars):
        base = [lazy_pinyin(c, style=Style.TONE)[0] for c in chars]
    syl = [_sandhi(chars, base, i) if c in "一不" else base[i] for i, c in enumerate(chars)]
    parts, pos = [], 0
    for tok in jieba.cut(text):
        if re.fullmatch(r"[\u3400-\u9fff]+", tok):
            parts.extend(_tokens_pinyin(tok, syl[pos:pos + len(tok)]))
            pos += len(tok)
        else:
            parts.append(tok.translate(str.maketrans("，。！？：；、（）“”", ",.!?:;,()\"\"")))
    s = ""
    for p in parts:
        if not p.strip():
            continue
        if s and not re.match(r"[,.!?:;)\"]", p) and not s.endswith(("(", "\"")):
            s += " "
        s += p
    if cap and s:
        s = s[:1].upper() + s[1:]
        s = re.sub(r"([.!?]\s+)(\w)", lambda m: m.group(1) + m.group(2).upper(), s)
    _seg_cache[key] = s
    return s


def load_vi(p: Path) -> dict[str, str]:
    """TSV 2 cột: khoá<TAB>giá trị. Dòng bắt đầu bằng # là chú thích."""
    if not p.exists():
        return {}
    out = {}
    with p.open(encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="\t"):
            if not row or row[0].startswith("#") or len(row) < 2:
                continue
            out[row[0].strip()] = row[1].strip()
    return out


# --------------------------------------------------------------------------- builders
def build_words(src: Path, hv: dict, vi_words: dict) -> list[dict]:
    dk = json.loads((src / "complete-hsk-vocabulary/complete.json").read_text(encoding="utf-8"))
    by_simp: dict[str, dict] = {}
    for e in dk:
        by_simp.setdefault(e["simplified"], e)  # mục đầu tiên = cách đọc phổ biến nhất

    def min_level(e, prefix):
        xs = [int(l.split("-")[1]) for l in e.get("level", []) if l.split("-")[0] == prefix]
        return min(xs) if xs else None

    # cấp 2021 theo danh sách chính thức
    official: dict[str, int] = {}
    order: list[str] = []
    base = src / "HSK-3.0/New HSK (2021)"
    for name in LEVELS:
        for w in read_lines(base / f"HSK List/HSK {name}.txt"):
            w = WORD_FIXES.get(w, w)
            if w not in official:
                official[w] = LEVEL_NUM[name]
                order.append(w)
    # nghĩa dự phòng từ bảng TSV của nguồn chính thức
    fallback: dict[str, tuple[str, str]] = {}
    for name in LEVELS:
        f = base / f"HSK List (Meaning)/HSK {name}.tsv"
        if f.exists():
            for row in csv.reader(f.open(encoding="utf-8"), delimiter="\t"):
                if len(row) >= 4:
                    fallback.setdefault(row[1], (row[2], row[3]))

    # cộng thêm các từ chỉ có trong đề cương 2025 hoặc chỉ có trong HSK 2.0 (đề cương cũ 6 cấp)
    in_order = set(order)
    for e in dk:
        if (min_level(e, "newest") or min_level(e, "old")) and e["simplified"] not in in_order:
            order.append(e["simplified"])
            in_order.add(e["simplified"])

    words, missing_detail, py_mismatch = [], 0, []
    for idx, s in enumerate(order, 1):
        e = by_simp.get(s)
        rec = {"id": idx, "s": s, "l21": official.get(s), "l25": min_level(e, "newest") if e else None,
               "l20": min_level(e, "old") if e else None}
        if e:
            off_py = fallback.get(s, (None, None))[0] if s in official else None
            if s in PY_OVERRIDE and PY_OVERRIDE[s][0]:
                off_py = PY_OVERRIDE[s][0]
            form = pick_form(e, off_py, s)
            common = "".join(lazy_pinyin(s, style=Style.TONE))
            if len(e["forms"]) > 1 and strip_tones(norm_py(form["transcriptions"]["pinyin"])) != strip_tones(norm_py(common)):
                py_mismatch.append((s, off_py or "-", form["transcriptions"]["pinyin"], common,
                                    str(official.get(s) or ""), form["meanings"][0][:50]))
            py = unicodedata.normalize("NFC", form["transcriptions"]["pinyin"])
            num = form["transcriptions"]["numeric"].split()
            syls, tones = merge_erhua(py.split(), [int(x[-1]) if x[-1].isdigit() else 5 for x in num])
            ov_py, ov_en = PY_OVERRIDE.get(s, (None, None))
            target = ov_py or off_py
            if target:  # ưu tiên cách ghi thanh nhẹ của bảng chính thức / bảng đính chính
                aligned = align_official(syls, target)
                if aligned:
                    syls, tones = aligned, [tone_of(x) for x in aligned]
            rec.update({
                "t": form["traditional"] if form["traditional"] != s else None,
                "py": syls,
                "tn": tones,
                "pos": e.get("pos") or None,
                "r": e.get("radical") or None,
                "q": e.get("frequency"),
                "en": PY_OVERRIDE.get(s, (None, None))[1]
                      or "; ".join(m for m in form["meanings"] if not JUNK_MEANING.match(m))[:140]
                      or "; ".join(form["meanings"][:2])[:140],
                "hv": hanviet_for(form["traditional"], num, hv),
            })
        else:
            missing_detail += 1
            py, en = fallback.get(s, ("", ""))
            syl = lazy_pinyin(s, style=Style.TONE)
            rec.update({"t": None, "py": syl, "tn": [tone_of(x) for x in syl], "pos": None, "r": None,
                        "q": None, "en": en[:140], "hv": hanviet_for(s, lazy_pinyin(s, style=Style.TONE3, neutral_tone_with_five=True), hv)})
        rec["vi"] = vi_words.get(s)
        words.append({k: v for k, v in rec.items() if v not in (None, [], "")})
    print(f"  từ vựng: {len(words)} mục ({missing_detail} mục dùng dữ liệu dự phòng, "
          f"{len(py_mismatch)} mục cần rà soát cách đọc)", file=sys.stderr)
    (Path(__file__).parent / "pinyin_mismatch.tsv").write_text(
        "\n".join("\t".join(x) for x in py_mismatch), encoding="utf-8")
    return words


def s2t_map(words: list[dict]) -> dict[str, str]:
    """Bảng giản -> phồn theo từng chữ, rút từ các cặp (s, t) cùng độ dài trong từ vựng."""
    m: dict[str, str] = {}
    for w in words:
        t = w.get("t")
        if t and len(t) == len(w["s"]):
            for a, b in zip(w["s"], t):
                if a != b:
                    m.setdefault(a, b)
    return m


def build_hanzi(src: Path, hv: dict, strokes_dir: Path, s2t: dict[str, str]) -> list[dict]:
    out, seen = [], set()
    for name in LEVELS:
        for c in read_lines(src / f"HSK-3.0/New HSK (2021)/HSK Hanzi/HSK {name}.txt"):
            if c in seen:
                continue
            seen.add(c)
            sfile = strokes_dir / f"{c}.json"
            n_strokes = len(json.loads(sfile.read_text(encoding="utf-8"))["strokes"]) if sfile.exists() else None
            py = lazy_pinyin(c, style=Style.TONE)[0]
            entry = hv.get(s2t.get(c, c)) or hv.get(c) or {}
            reading = next((v[0] for v in entry.values() if v), None)
            out.append({k: v for k, v in {"c": c, "l21": LEVEL_NUM[name], "py": py, "tn": tone_of(py),
                                          "sc": n_strokes, "hv": reading}.items() if v is not None})
    print(f"  chữ Hán: {len(out)} chữ", file=sys.stderr)
    return out


def build_grammar(src: Path, vi_gram: dict, vi_ex: dict) -> list[dict]:
    points = []
    for name in LEVELS:
        path: list[str] = []
        cur = None
        for line in read_lines(src / f"HSK-3.0/New HSK (2021)/HSK Grammar/HSK {name}.txt"):
            m_cat = re.match(r"^A\.(\d+(?:\.\d+)*)\s+(.+)$", line)
            m_pt = RE_POINT.match(norm_code_line(line))
            m_sub = re.match(r"^[（(]\d+[）)]\s*(.+)$", line)
            if m_cat:
                depth = m_cat.group(1).count(".")
                if depth == 0:          # "A.1 一级语法点" = tiêu đề cấp, bỏ qua
                    continue
                path = path[: depth - 1] + [m_cat.group(2).strip()]
                continue
            if m_pt:
                code = f"{m_pt.group(1).replace('—', '').replace('-', '')}{m_pt.group(2)}"
                title = m_pt.group(3).strip()
                if code in GRAMMAR_FIXES:
                    title = title.replace(*GRAMMAR_FIXES[code])
                cur = {"code": code, "l21": LEVEL_NUM[name], "cat": list(path), "zh": title, "ex": []}
                if code in vi_gram:
                    t, _, note = vi_gram[code].partition("||")
                    cur["vi"] = t.strip()
                    if note.strip():
                        cur["note"] = note.strip()
                points.append(cur)
                continue
            if cur is None:
                continue
            if m_sub:  # tiểu mục trong một điểm ngữ pháp, ví dụ "（1）复合量词：人次"
                cur["ex"].append({"zh": m_sub.group(1).strip(), "k": "h"})
                continue
            if line.startswith("※"):  # chú thích tham chiếu chéo trong văn bản gốc
                continue
            # tiểu mục: không có dấu kết câu và mang dấu hiệu của tiêu đề/công thức
            if not SENT_END.search(line) and not line.endswith(("”", "\"")) and RE_SUBHEAD.search(line):
                cur["ex"].append({"zh": line, "k": "h"})
                continue
            # dòng ví dụ: câu hoàn chỉnh, hoặc danh sách cụm từ cách nhau bởi khoảng trắng
            if " " in line and not SENT_END.search(line):
                for phrase in line.split():
                    ex = {"zh": phrase, "py": sentence_pinyin(phrase, cap=False), "k": "p"}
                    if phrase in vi_ex:
                        ex["vi"] = vi_ex[phrase]
                    cur["ex"].append(ex)
            elif not SENT_END.search(line) and not line.endswith(("”", "\"")):
                ex = {"zh": line, "py": sentence_pinyin(line, cap=False), "k": "p"}
                if line in vi_ex:
                    ex["vi"] = vi_ex[line]
                cur["ex"].append(ex)
            else:
                ex = {"zh": line, "py": sentence_pinyin(line)}
                if line in vi_ex:
                    ex["vi"] = vi_ex[line]
                cur["ex"].append(ex)
    per = {}
    for p in points:
        per[p["l21"]] = per.get(p["l21"], 0) + 1
    print(f"  ngữ pháp: {len(points)} điểm, theo cấp {per}", file=sys.stderr)
    return points


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, required=True, help="thư mục chứa các repo nguồn")
    ap.add_argument("--vi", type=Path, default=Path(__file__).parent.parent / "content/vi")
    ap.add_argument("--out", type=Path, default=Path(__file__).parent.parent / "content/build")
    args = ap.parse_args()

    strokes_dir = args.src / "hanzi-writer-data/package"
    hv = load_hanviet(args.src / "hv/package/src/hanvietData.js")
    vi_words = load_vi(args.vi / "words.tsv")
    vi_gram = load_vi(args.vi / "grammar.tsv")
    vi_ex = load_vi(args.vi / "examples.tsv")

    args.out.mkdir(parents=True, exist_ok=True)
    words = build_words(args.src, hv, vi_words)
    set_lexicon({w["s"]: "".join(w["py"]) for w in words if len(w["s"]) > 1 and "…" not in w["s"]})
    hanzi = build_hanzi(args.src, hv, strokes_dir, s2t_map(words))
    grammar = build_grammar(args.src, vi_gram, vi_ex)
    for name, data in [("words", words), ("hanzi", hanzi), ("grammar", grammar)]:
        (args.out / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # thống kê độ phủ để theo dõi tiến độ biên soạn tiếng Việt
    report = {"words": {}, "grammar": {}}
    for lv in range(1, 8):
        w = [x for x in words if x.get("l21") == lv]
        w25 = [x for x in words if x.get("l25") == lv]
        report["words"][lv] = {"l21": len(w), "l25": len(w25), "l20": sum(1 for x in words if x.get("l20") == lv), "vi_l21": sum(1 for x in w if "vi" in x),
                               "hv": sum(1 for x in w if "hv" in x)}
        g = [x for x in grammar if x["l21"] == lv]
        report["grammar"][lv] = {"points": len(g), "vi": sum(1 for x in g if "vi" in x),
                                 "examples": sum(len(x["ex"]) for x in g),
                                 "ex_vi": sum(1 for x in g for e in x["ex"] if "vi" in e)}
    (args.out / "coverage.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False), file=sys.stderr)


if __name__ == "__main__":
    main()
