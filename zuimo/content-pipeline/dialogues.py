#!/usr/bin/env python3
"""Phân tích và kiểm tra hội thoại, bài tập tự biên soạn (content/vi/src/dialogues_*.txt).

Kiểm tra: mọi chữ Hán trong hội thoại và bài tập phải thuộc từ đã học ở bài hiện tại hoặc các bài trước
(từ chính, từ gặp lại, từ mở rộng, tên riêng) hoặc tên nhân vật được phép.
Chạy độc lập để xem lỗi: python3 dialogues.py"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content/vi/src"
CJK = re.compile(r"[\u3400-\u9fff]")
# tên nhân vật dùng trong hội thoại (lấy từ tên bài / nhân vật của sách), được phép từ bài ghi kèm
# tên nhân vật được phép dùng từ (quyển, bài) ghi kèm
NAMES = {"20": {"李月": (1, 3), "王方": (1, 10), "谢朋": (1, 10), "大卫": (1, 13), "张": (1, 14), "花花": (2, 1), "杨笑笑": (2, 13)},
         "30": {"小语": (1, 1), "王老师": (1, 1), "李文": (1, 2), "小雪": (2, 6)}}


def parse(path: Path) -> dict[str, dict]:
    lessons: dict[str, dict] = {}
    cur = scene = None
    for no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#") and not line.startswith("## "):
            continue
        if line.startswith("## "):
            cur = {"scenes": [], "ex": []}
            lessons[line[3:].strip()] = cur
            continue
        if cur is None:
            raise SystemExit(f"{path.name}:{no}: nội dung nằm ngoài bài")
        if line.startswith("@"):
            scene = {"desc": line[1:].strip(), "lines": []}
            cur["scenes"].append(scene)
        elif line.startswith(">"):
            kind, _, rest = line[1:].partition(" ")
            parts = [p.strip() for p in rest.split("||")]
            if kind == "order":
                tiles = parts[0].split()
                cur["ex"].append({"t": "order", "answer": [x for x in tiles if not x.startswith("+")],
                                  "extra": [x[1:] for x in tiles if x.startswith("+")], "vi": parts[1]})
            elif kind in ("fill", "trans", "q"):
                opts = [o.strip() for o in parts[-1].split("|")]
                ex = {"t": kind, "main": parts[0], "opts": opts}
                if kind == "fill":
                    ex["vi"] = parts[1]
                    if "___" not in parts[0]:
                        raise SystemExit(f"{path.name}:{no}: câu điền thiếu ___")
                cur["ex"].append(ex)
            else:
                raise SystemExit(f"{path.name}:{no}: loại bài tập lạ {kind}")
        else:
            m = re.match(r"^(\S+?):\s*(.+?)\s*\|\s*(.+)$", line)
            if not m or scene is None:
                raise SystemExit(f"{path.name}:{no}: dòng hội thoại sai cú pháp")
            scene["lines"].append({"sp": m.group(1), "zh": m.group(2), "vi": m.group(3)})
    return lessons


def zh_texts(les: dict) -> list[str]:
    out = [l["zh"] for s in les["scenes"] for l in s["lines"]]
    for e in les["ex"]:
        if e["t"] == "order":
            out += e["answer"] + e["extra"]
        elif e["t"] == "fill":
            out += [e["main"].replace("___", o) for o in e["opts"]]
        elif e["t"] == "trans":
            out += e["opts"]
        else:
            out += [o for o in e["opts"] if CJK.search(o)]
    return out


def check(books: dict) -> list[str]:
    """Mỗi phiên bản: từ đã học cộng dồn qua các quyển theo thứ tự (quyển 1 rồi quyển 2...)."""
    issues = []
    files = {}
    for f in sorted(SRC.glob("dialogues_hsk*.txt")):
        files.update(parse(f))
    for ver in ("20", "30"):
        known: set[str] = set()
        for B in sorted((b for b in books.values() if b["ver"] == ver), key=lambda b: b["level"]):
            pre = ver if B["level"] == 1 else f"{ver}b{B['level']}"
            for L in B["lessons"]:
                for w in L["words"] + L["extra"] + L["proper"]:
                    known.update(CJK.findall(w["s"]))
                for name, (lvl, frm) in NAMES[ver].items():
                    if (lvl, frm) <= (B["level"], L["n"]):
                        known.update(name)
                key = f"{pre}-{L['n']}"
                les = files.get(key)
                if not les:
                    issues.append(f"{key}: chưa có hội thoại")
                    continue
                if len(les["ex"]) < 5:
                    issues.append(f"{key}: chỉ có {len(les['ex'])} bài tập")
                for t in zh_texts(les):
                    bad = sorted({c for c in CJK.findall(t) if c not in known})
                    if bad:
                        issues.append(f"{key}: chữ chưa học {''.join(bad)} trong 「{t}」")
    return issues


if __name__ == "__main__":
    books = json.loads((ROOT / "content/build/books.json").read_text(encoding="utf-8"))
    probs = check(books)
    print("\n".join(probs) or "OK: mọi hội thoại và bài tập chỉ dùng từ đã học")
    sys.exit(1 if probs else 0)
