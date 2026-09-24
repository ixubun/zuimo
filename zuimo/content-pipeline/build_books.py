#!/usr/bin/env python3
"""
build_books.py – dựng dữ liệu giáo trình (tách biệt HSK 2.0 / HSK 3.0) cho ZUIMO.

Đầu vào (đọc thủ công từ sách, xem content/books/*.tsv, toc_raw.json):
  - mục lục: tên bài, từ mới theo bài, điểm ngữ pháp, nội dung phát âm/chữ Hán (2.0)
  - phụ lục từ vựng: pinyin theo sách, bài xuất hiện, từ vượt cấp (*), danh từ riêng
Đầu vào do ZUIMO biên soạn: content/vi/src/books_*.txt (tên bài, giải thích ngữ pháp, ví dụ riêng)
Tham chiếu: content/build/words.json (nghĩa EN, Hán Việt), grammar.json (ví dụ chuẩn GF0025-2021)

Nguyên tắc bản quyền: chỉ lấy dữ kiện (danh sách, tên mục); không chép hội thoại, lời giảng,
bài tập hay nghĩa tiếng Việt của nhà xuất bản.
"""
from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

from pypinyin import Style, lazy_pinyin

ROOT = Path(__file__).resolve().parent.parent
BOOKS = ROOT / "content/books"
BUILD = ROOT / "content/build"
VI = ROOT / "content/vi"
sys.path.insert(0, str(Path(__file__).parent))
from build_content import TONE_MARKS, hanviet_for, load_hanviet, tone_of  # noqa: E402

SRC = Path("/home/claude/data")
EX_LIMIT = 4  # số ví dụ chuẩn tối đa cho mỗi điểm ngữ pháp
# (khoá sách, phiên bản, quyển). Thứ tự quan trọng: quyển trước đứng trước (từ vựng cộng dồn theo phiên bản).
BOOK_LIST = [("hsk20_1", "20", 1), ("hsk20_2", "20", 2), ("hsk30_1", "30", 1), ("hsk30_2", "30", 2)]


def prefix(ver: str, level: int) -> str:
    """Tiền tố khoá nội dung: quyển 1 giữ khoá cũ ("20-5"), quyển sau thêm hậu tố ("20b2-5")."""
    return ver if level == 1 else f"{ver}b{level}"


def has(name: str) -> bool:
    return (BOOKS / name).exists()


def rows(name: str) -> list[list[str]]:
    p = BOOKS / name
    return [r for r in csv.reader(p.open(encoding="utf-8"), delimiter="\t") if r and not r[0].startswith("#")]


def src_kv(pattern: str) -> dict[str, list[str]]:
    """Đọc file nguồn `khoá ‖ trường 1 ‖ trường 2 …`."""
    out = {}
    for f in sorted((VI / "src").glob(pattern)):
        for raw in f.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            parts = [x.strip() for x in line.split("‖")]
            out[parts[0]] = parts[1:]
    return out


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def bare(s: str) -> str:
    return "".join(TONE_MARKS[c][0] if c in TONE_MARKS else c for c in nfc(s))


def syllabify(word: str, book_py: str, ref: dict | None) -> tuple[list[str], list[int]]:
    """Tách pinyin của sách thành âm tiết để tô màu thanh điệu.
    'shang/shàng' -> lấy dạng sau; 'bú kèqi' -> căn theo ranh giới âm tiết của từ điển/pypinyin."""
    py = nfc(book_py.split("/")[-1])
    flat = re.sub(r"[\s'’]", "", py)
    base = ref["py"] if ref else lazy_pinyin(word, style=Style.TONE)
    base = [x for x in base if x]
    out, i = [], 0
    if bare(flat).lower() == "".join(bare(x) for x in base).lower():
        for b in base:
            out.append(flat[i:i + len(b)])
            i += len(b)
    else:  # không căn được: giữ nguyên cụm theo dấu cách
        out = py.split()
    return out, [tone_of(x) for x in out]


# Bộ thủ xuất hiện trong giáo trình HSK 2.0 quyển 1: tên gọi tiếng Trung, tên/ý nghĩa tiếng Việt, chữ ví dụ (ZUIMO chọn)
RADICALS = {
    "氵": ("三点水", "bộ thủy: liên quan đến nước", "河 洗 汉"), "讠": ("言字旁", "bộ ngôn: liên quan đến lời nói", "说 话 谢"),
    "钅": ("金字旁", "bộ kim: liên quan đến kim loại", "钱 钟"), "口": ("口字旁", "bộ khẩu: liên quan đến miệng", "吃 喝 叫"),
    "辶": ("走之旁", "bộ sước: liên quan đến đi lại", "这 进 远"), "门": ("门字框", "bộ môn: liên quan đến cửa", "问 间 们"),
    "囗": ("国字框", "bộ vi: vây quanh, bao bọc", "国 回 四"), "礻": ("示字旁", "bộ thị: liên quan đến thần linh, cúng tế", "视 礼"),
    "阝": ("耳刀旁", "bộ phụ/ấp: gò đất, vùng đất", "院 那 都"), "亻": ("单人旁", "bộ nhân đứng: liên quan đến người", "你 他 们"),
    "女": ("女字旁", "bộ nữ: liên quan đến phụ nữ", "妈 姐 她"), "饣": ("食字旁", "bộ thực: liên quan đến ăn uống", "饭 饺 饿"),
    "日": ("日字旁", "bộ nhật: mặt trời, thời gian", "明 时 晚"), "目": ("目字旁", "bộ mục: liên quan đến mắt", "睡 看 眼"),
    "月": ("肉月旁", "bộ nhục: liên quan đến cơ thể", "服 脑 朋"), "扌": ("提手旁", "bộ thủ: động tác của tay", "打 找 接"),
    "艹": ("草字头", "bộ thảo: liên quan đến cây cỏ", "茶 菜 苹"), "宀": ("宝盖头", "bộ miên: mái nhà", "家 字 宝"),
    # quyển 2 (HSK标准教程 2)
    "⺩": ("王字旁", "bộ ngọc: liên quan đến ngọc, đá quý", "球 玩 现"), "⻊": ("足字旁", "bộ túc: liên quan đến chân, đi lại", "踢 跑 路"),
    "⺮": ("竹字头", "bộ trúc: liên quan đến tre trúc", "笔 第 等"), "火": ("火字旁", "bộ hỏa: liên quan đến lửa", "灯 炒 烤"),
    "木": ("木字旁", "bộ mộc: liên quan đến cây, gỗ", "椅 机 楼"), "刂": ("立刀旁", "bộ đao: liên quan đến dao, cắt", "别 到 刻"),
    "纟": ("绞丝旁", "bộ mịch: liên quan đến tơ sợi", "红 纸 绍"), "忄": ("竖心旁", "bộ tâm đứng: liên quan đến tâm trạng", "快 忙 懂"),
    "子": ("子字旁", "bộ tử: liên quan đến trẻ con", "孩 孙"), "广": ("广字头", "bộ nghiễm: liên quan đến nhà cửa, công trình", "店 床 座"),
    "犭": ("反犬旁", "bộ khuyển: liên quan đến loài vật", "猫 狗"), "心": ("心字底", "bộ tâm: liên quan đến suy nghĩ, tình cảm", "想 意 您"),
    "彳": ("双人旁", "bộ xích: liên quan đến đi lại, đường sá", "很 往 得"), "攵": ("反文旁", "bộ phộc: liên quan đến hành động", "教 数 放"),
    "又": ("又字旁", "bộ hựu: nghĩa khá đa dạng", "欢 对 双"), "巾": ("巾字底", "bộ cân: liên quan đến vải vóc", "帮 帽 常"),
    "土": ("提土旁", "bộ thổ: liên quan đến đất đai, công trình", "块 地 场"), "灬": ("四点底", "bộ hỏa (nằm dưới): liên quan đến lửa", "热 黑 点"),
    "走": ("走字旁", "bộ tẩu: liên quan đến đi, chạy", "起 超 越"), "穴": ("穴宝盖", "bộ huyệt: liên quan đến hang, lỗ", "空 穿 窗"),
    "疒": ("病字旁", "bộ nạch: liên quan đến bệnh tật", "病 疼 瘦"), "冫": ("两点水", "bộ băng: liên quan đến băng giá, lạnh", "冷 冰 次"),
    "止": ("止字旁", "bộ chỉ: liên quan đến dừng lại, bước chân", "步 此 正"), "冂": ("同字框", "bộ quynh: khung bao ba mặt", "同 网 周"),
    "斤": ("斤字旁", "bộ cân (rìu): liên quan đến rìu, chặt", "新 近 所"), "页": ("页字旁", "bộ hiệt: liên quan đến đầu, mặt", "题 颜 顾"),
    "⻗": ("雨字头", "bộ vũ: liên quan đến mưa, thời tiết", "雪 零 雷"), "贝": ("贝字旁", "bộ bối: liên quan đến tiền bạc, của cải", "贵 员 货"),
    "山": ("山字旁", "bộ sơn: liên quan đến núi", "岁 岛 峰"), "大": ("大字头", "bộ đại: liên quan đến người, sự to lớn", "天 太 夫"),
}
HANZI_VI = {
    "先横后竖，先撇后捺": "ngang trước sổ sau, phẩy trước mác sau",
    "从上到下，从左到右": "trên trước dưới sau, trái trước phải sau",
    "先外后内，先中间后两边": "ngoài trước trong sau, giữa trước hai bên sau",
    "独体结构与合体结构": "chữ độc thể và chữ hợp thể",
    "左右结构与左中右结构": "trái–phải và trái–giữa–phải",
    "上下结构与上中下结构": "trên–dưới và trên–giữa–dưới",
    "半包围结构": "bao quanh một nửa", "全包围结构": "bao quanh hoàn toàn",
}


def hanzi_item(z: str) -> dict:
    """Dịch mục chữ Hán của mục lục thành tiếng Việt theo quy tắc, kèm thông tin bộ thủ nếu có."""
    m = re.match(r"^汉字的笔画\((\d+)\)$", z)
    if m:
        return {"zh": z, "vi": f"Các nét cơ bản của chữ Hán ({m.group(1)})"}
    if z.startswith("认识独体字"):
        return {"zh": z, "vi": "Làm quen chữ độc thể: " + z.split(":", 1)[1].strip()}
    m = re.match(r"^汉字的笔顺\((\d)\):\s*(.+)$", z)
    if m:
        return {"zh": z, "vi": f"Thứ tự nét ({m.group(1)}): {HANZI_VI.get(m.group(2), m.group(2))}"}
    m = re.match(r"^汉字结构\((\d)\):\s*(.+)$", z)
    if m:
        return {"zh": z, "vi": f"Kết cấu chữ Hán ({m.group(1)}): {HANZI_VI.get(m.group(2), m.group(2))}"}
    if z.startswith("汉字偏旁"):
        rads = z.split(":", 1)[1].split()
        return {"zh": z, "vi": "Bộ thủ: " + ", ".join(rads),
                "rad": [{"r": r, "name": RADICALS[r][0], "vi": RADICALS[r][1], "ex": RADICALS[r][2]} for r in rads]}
    return {"zh": z, "vi": ""}


def main() -> None:
    toc = json.loads((BOOKS / "toc_raw.json").read_text(encoding="utf-8"))
    words = {w["s"]: w for w in json.loads((BUILD / "words.json").read_text(encoding="utf-8"))}
    gram = json.loads((BUILD / "grammar.json").read_text(encoding="utf-8"))
    hv = load_hanviet(SRC / "hv/package/src/hanvietData.js")
    vi_words = src_kv("words_*.txt")
    titles = src_kv("booktitles.txt")
    gnotes = src_kv("bookgrammar.txt")
    topics = src_kv("booktopics.txt")

    missing_vi: set[str] = set()
    from build_content import set_lexicon
    lex = {w["s"]: "".join(w["py"]) for w in words.values() if len(w["s"]) > 1}
    base_lex = dict(lex)

    def book_lex(key: str, ver: str, level: int) -> dict[str, str]:
        """Pinyin theo đúng bộ sách (2.0 ghi xuésheng, 3.0 ghi xuéshēng), cộng dồn các quyển trước cùng phiên bản."""
        out = dict(base_lex)
        for k2, v2, l2 in BOOK_LIST:
            if v2 != ver or l2 > level:
                continue
            extra_rows = [r for f2 in (f"{k2}_derived.tsv", f"{k2}_extra.tsv") if has(f2) for r in rows(f2)]
            for r in rows(f"{k2}_vocab.tsv") + extra_rows:
                if len(r[0]) > 1 and "…" not in r[0]:
                    out[r[0]] = nfc(r[1].split("/")[-1])
        out.update(names)
        return out
    # tên riêng và tên nhân vật giữ khoảng trắng như sách (Lǐ Yuè); đăng ký với jieba để không bị tách đôi
    names = {"小语": "Xiǎoyǔ", "李文": "Lǐ Wén", "王小姐": "Wáng xiǎojiě", "张先生": "Zhāng xiānsheng",
             "同学们": "tóngxuémen", "王老师": "Wáng lǎoshī", "小雪": "Xiǎoxuě"}
    for f in [f"{k}_proper.tsv" for k, _, _ in BOOK_LIST if has(f"{k}_proper.tsv")]:
        for r in rows(f):
            names.setdefault(r[0], nfc(r[1]))
    import jieba
    for k in list(names) + [k for k in lex if len(k) > 1 and any(k == r[0] for f in [f"{b}_vocab.tsv" for b, _, _ in BOOK_LIST] for r in rows(f))]:
        jieba.add_word(k, freq=200000)
    from dialogues import parse as parse_dlg
    from build_content import sentence_pinyin
    dlg = {}
    for f in sorted((VI / "src").glob("dialogues_hsk*.txt")):
        dlg.update(parse_dlg(f))
    meta = src_kv("bookmeta.txt")

    def word_rec(s: str, book_py: str, lessons: list[int], kind: str, extra: dict | None = None) -> dict:
        ref = words.get(s)
        sy, tn = syllabify(s, book_py, ref)
        vi = (vi_words.get(s) or [None])[0]
        if not vi:
            missing_vi.add(s)
        rec = {"s": s, "bp": nfc(book_py), "sy": sy, "tn": tn, "ls": lessons, "k": kind,
               "vi": vi, "en": (ref or {}).get("en"),
               "hv": (ref or {}).get("hv") or hanviet_for(s, lazy_pinyin(s, style=Style.TONE3, neutral_tone_with_five=True), hv)}
        if extra:
            rec.update(extra)
        return {k: v for k, v in rec.items() if v not in (None, "", [])}

    def find_points(refs: str) -> list[dict]:
        """refs: 'một01:từ khoá; 二56' -> ví dụ chuẩn của các điểm khớp mã (và từ khoá nếu có)."""
        ex = []
        for ref in [x.strip() for x in refs.split(";") if x.strip()]:
            code, _, kw = ref.partition(":")
            hit = next((g for g in gram if g["code"] == code and (not kw or kw in g["zh"])), None)
            if not hit:
                print(f"  ! không thấy điểm chuẩn {ref}", file=sys.stderr)
                continue
            ex += [e for e in hit["ex"] if e.get("k") != "h"]
        return ex[:EX_LIMIT]

    def own_examples(spec: str) -> list[dict]:
        out = []
        for pair in [x for x in spec.split("¦") if x.strip()]:
            zh, _, vi = pair.partition("=")
            from build_content import sentence_pinyin
            out.append({"zh": zh.strip(), "py": sentence_pinyin(zh.strip()), "vi": vi.strip(), "own": 1})
        return out

    result = {}
    for key, ver, level in BOOK_LIST:
        pre = prefix(ver, level)
        B = toc[key]
        set_lexicon(book_lex(key, ver, level))
        if ver == "20":
            core = rows(f"{key}_vocab.tsv") + [[r[0], r[1], r[2], r[3], "derived:" + r[4]] for r in rows(f"{key}_derived.tsv")]
            vocab = [(r[0], r[1], [int(r[3])], r[4] if len(r) > 4 else "") for r in core]
            extras = [(r[0], r[1], [int(r[3])], f"HSK 2.0 cấp {r[4]}" if len(r) > 4 and r[4] else "") for r in rows(f"{key}_extra.tsv")]
            proper = [(r[0], r[1], [int(r[2])]) for r in rows(f"{key}_proper.tsv")]
        else:
            allv = rows(f"{key}_vocab.tsv")
            vocab = [(r[0], r[1], [int(x) for x in r[2].split(",")], "") for r in allv if r[3] != "*"]
            extras = [(r[0], r[1], [int(x) for x in r[2].split(",")], "") for r in allv if r[3] == "*"]
            proper = [(r[0], r[1], [int(r[2])]) for r in rows(f"{key}_proper.tsv")]

        lessons = []
        for L in B["lessons"]:
            n = L["n"]
            t = titles.get(f"{pre}-{n}", [""])
            les = {"n": n, "zh": L["zh"], "vi": t[0], "en": t[1] if len(t) > 1 else L.get("en", ""), "page": L["page"],
                   "words": [], "extra": [], "proper": [], "grammar": []}
            for s, py, ls, note in vocab:
                if n in ls:
                    kind = "core" if n == ls[0] else "again"   # xuất hiện lại ở bài sau (thường với nghĩa/cách dùng mới)
                    extra = {"from": note.split(":", 1)[1]} if note.startswith("derived:") else ({"note": note} if note else None)
                    les["words"].append(word_rec(s, py, ls, kind, extra))
            if ver == "20":   # giữ đúng thứ tự từ mới như trong mục lục của sách; từ ghép từ chữ đã học xếp sau
                order = [x.strip().lstrip("*") for x in re.split(r"[、（）()]", L.get("vocab_toc", "")) if x.strip()]
                les["words"].sort(key=lambda w: (w["k"] != "core", order.index(w["s"]) if w["s"] in order else 99))
            for s, py, ls, lvl in extras:
                if n in ls:
                    les["extra"].append(word_rec(s, py, ls, "extra", {"lvl": lvl} if lvl else None))
            for s, py, ls in proper:
                if n in ls:
                    les["proper"].append(word_rec(s, py, ls, "proper"))
            d = dlg.get(f"{pre}-{n}")
            if d:
                les["dlg"] = [{"desc": sc["desc"], "lines": [{**ln, "py": sentence_pinyin(ln["zh"])} for ln in sc["lines"]]}
                              for sc in d["scenes"]]
                les["exr"] = d["ex"]
            m = meta.get(f"{pre}-{n}")
            if m:
                les["goals"] = [g.strip() for g in m[0].split("¦") if g.strip()]
                if len(m) > 1 and m[1]:
                    les["culture_vi"] = m[1]
            for i, gz in enumerate(L["grammar"], 1):
                k = f"{pre}-{n}-{i}"
                g = gnotes.get(k)
                if not g:
                    print(f"  ! thiếu giải thích ngữ pháp {k} {gz}", file=sys.stderr)
                    g = ["", "", "", ""]
                vi_title, _, note = (g[0] if g else "").partition("||")
                exs = own_examples(g[2] if len(g) > 2 else "") + find_points(g[1] if len(g) > 1 else "")
                les["grammar"].append({"id": k, "zh": gz, "vi": vi_title.strip(), "note": note.strip(), "ex": exs})
            if ver == "20":
                items = []
                for z in L.get("pinyin", []):
                    tk = max((k for k in topics if z.startswith(k)), key=len, default=None)
                    if not tk:
                        print(f"  ! thiếu tên mục phát âm: {z}", file=sys.stderr)
                    items.append({"zh": z, "vi": topics[tk][0] if tk else ""})
                les["pinyin"] = items
                les["hanzi"] = [hanzi_item(z) for z in L.get("hanzi", [])]
                chars = []
                for z in L.get("hanzi", []):
                    if z.startswith("认识独体字"):
                        chars = [c for c in z.split(":", 1)[1] if "\u4e00" <= c <= "\u9fff"]
                if not chars:   # quyển 2 từ bài 7 không còn mục chữ độc thể: tập viết chữ đầu tiên của từ mới
                    for w in les["words"]:
                        chars += [c for c in w["s"] if "\u4e00" <= c <= "\u9fff" and c not in chars and w["k"] == "core"]
                    chars = chars[:8]
                    les["chars_from_words"] = True
                les["chars"] = chars
                les["culture"] = L.get("culture", "")
            else:
                seen = []
                for w in les["words"]:
                    for c in w["s"]:
                        if "\u4e00" <= c <= "\u9fff" and c not in seen and w["k"] == "core":
                            seen.append(c)
                les["chars"] = seen[:8]
            lessons.append(les)

        book = {"id": key, "ver": ver, "level": level, "title": B["book"], "lessons": lessons}
        if has(f"{key}_supplement.tsv"):
            book["supplement"] = [word_rec(r[0], "".join(lazy_pinyin(r[0], style=Style.TONE)), [], "supp", {"from": r[1]})
                                  for r in rows(f"{key}_supplement.tsv")]
        result[key] = book
        n_core = sum(1 for L in lessons for w in L["words"] if w["k"] == "core")
        print(f"  {key}: {len(lessons)} bài, {n_core} từ chính, {sum(len(L['extra']) for L in lessons)} từ mở rộng, "
              f"{sum(len(L['grammar']) for L in lessons)} điểm ngữ pháp", file=sys.stderr)

    from dialogues import check as check_dlg
    probs = check_dlg(result)
    if probs:
        print("  ! hội thoại dùng chữ chưa học:\n    " + "\n    ".join(probs), file=sys.stderr)
    (BUILD / "books.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if missing_vi:
        print("  thiếu nghĩa VI:", " ".join(sorted(missing_vi)), file=sys.stderr)


if __name__ == "__main__":
    main()
