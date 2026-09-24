#!/usr/bin/env python3
"""
export_data.py – xuất dữ liệu học từ content/build thành các file JSON nhỏ trong web/public/data.

Nguyên tắc: trang đầu chỉ tải index.json (mục lục sách, bảng đếm, danh sách chữ có nét).
Mọi thứ khác tải khi người dùng mở tới:
  words/{ver}-{level}.json   từ vựng của một cấp trong một phiên bản đề cương
  hanzi.json                 3.000 chữ (chỉ thông tin gọn: pinyin, số nét, Hán Việt)
  grammar/{level}.json       điểm ngữ pháp của một cấp (chuẩn 2021)
  books/{id}.json            một quyển giáo trình đầy đủ
  strokes/{chữ}.json         nét của một chữ cho hanzi-writer
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
ROOT = WEB.parent
BUILD = ROOT / "content/build"
OUT = WEB / "public/data"
HW = Path("/home/claude/data/hanzi-writer-data/package")   # kho nét chữ; đổi đường dẫn nếu nằm chỗ khác


def dump(path: Path, obj) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(s, encoding="utf-8")
    return len(s.encode("utf-8"))


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    words = json.loads((BUILD / "words.json").read_text(encoding="utf-8"))
    hanzi = json.loads((BUILD / "hanzi.json").read_text(encoding="utf-8"))
    grammar = json.loads((BUILD / "grammar.json").read_text(encoding="utf-8"))
    books = json.loads((BUILD / "books.json").read_text(encoding="utf-8"))
    total = 0

    # ---- từ vựng theo (phiên bản, cấp). Định dạng mảng gọn, thứ tự cột giống prototype cũ + chỉ số gốc ở đầu
    row = lambda i, w: [i, w["s"], " ".join(w["py"]), "".join(str(t) for t in w["tn"]), w.get("l21") or 0, w.get("l25") or 0,
                        "; ".join(w.get("en", "").split("; ")[:2])[:80], w.get("vi", ""), w.get("hv", ""), w.get("l20") or 0]
    by = {}
    for i, w in enumerate(words):
        if w.get("l20"):
            by.setdefault(("20", w["l20"]), []).append(row(i, w))
        if w.get("l25"):
            by.setdefault(("30", w["l25"]), []).append(row(i, w))
    counts = {"20": {}, "30": {}}
    for (ver, lv), rows in sorted(by.items()):
        total += dump(OUT / f"words/{ver}-{lv}.json", rows)
        counts[ver].setdefault(lv, {})["w"] = len(rows)

    # ---- chữ Hán (một file) và ngữ pháp theo cấp
    total += dump(OUT / "hanzi.json", [[h["c"], h["l21"], h["py"], h["tn"], h["sc"], h.get("hv", "")] for h in hanzi])
    for lv in range(1, 8):
        total += dump(OUT / f"grammar/{lv}.json", [g for g in grammar if g["l21"] == lv])
        for ver in ("20", "30"):
            counts[ver].setdefault(lv, {})["g"] = sum(1 for g in grammar if g["l21"] == lv)
            counts[ver][lv]["h"] = sum(1 for h in hanzi if h["l21"] == lv)

    # ---- sách: mục lục gọn cho trang đầu, file đầy đủ cho từng quyển
    index_books = {}
    for bid, b in books.items():
        total += dump(OUT / f"books/{bid}.json", b)
        index_books[bid] = {
            "id": b["id"], "ver": b["ver"], "level": b["level"], "title": b["title"],
            "lessons": [{"n": L["n"], "zh": L["zh"], "vi": L.get("vi", ""), "en": L.get("en", ""),
                         "nCore": sum(1 for w in L["words"] if w["k"] == "core"),
                         "nExtra": len(L.get("extra", [])), "grammar": [{"zh": g["zh"]} for g in L["grammar"]]}
                        for L in b["lessons"]],
        }

    # ---- nét chữ: mọi chữ trong HSK 1 (cả hai đề cương) và trong các giáo trình, mỗi chữ một file
    chars = {h["c"] for h in hanzi if h["l21"] == 1}
    for w in words:
        if w.get("l21") == 1 or w.get("l25") == 1 or w.get("l20") == 1:
            chars.update(c for c in w["s"] if "\u3400" <= c <= "\u9fff")
    for b in books.values():
        for L in b["lessons"]:
            for w in L["words"] + L.get("extra", []) + L.get("proper", []):
                chars.update(c for c in w["s"] if "\u3400" <= c <= "\u9fff")
            chars.update(L.get("chars", []))
            for h in L.get("hanzi", []):
                for r in h.get("rad", []):
                    chars.update(r["ex"].split())
    chars.add("中")
    have = []
    for c in sorted(chars):
        src = HW / f"{c}.json"
        if src.exists():
            total += dump(OUT / f"strokes/{c}.json", json.loads(src.read_text(encoding="utf-8")))
            have.append(c)

    # ---- từ của bài mẫu (你好…) để bộ thẻ bài mẫu tra được ngay
    sample = [row(i, w) for i, w in enumerate(words) if w.get("l20") == 1][:0]   # bài mẫu tự khai báo từ riêng, không cần thêm
    total += dump(OUT / "index.json", {"books": index_books, "counts": counts, "strokes": have, "sampleWords": sample})

    n = sum(1 for _ in OUT.rglob("*.json"))
    print(f"đã xuất {n} file, tổng {total / 1e6:.2f} MB; index.json = {(OUT / 'index.json').stat().st_size / 1024:.0f} KB; nét chữ: {len(have)} chữ")


if __name__ == "__main__":
    main()
