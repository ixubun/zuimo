#!/usr/bin/env python3
"""Biên dịch nội dung tiếng Việt từ content/vi/src/{words,grammar,examples}_*.txt (định dạng `khoá ‖ giá trị`)
thành content/vi/{words,grammar,examples}.tsv cho build_content.py.

Tách file nguồn theo cấp (words_hsk1.txt, words_hsk2.txt...) để biên soạn và review từng cấp độc lập.
Script dừng với mã lỗi 1 nếu có khoá trùng mà giá trị khác nhau (tránh ghi đè âm thầm)."""
import sys
from pathlib import Path

VI = Path(__file__).parent.parent / "content/vi"
SEP = "‖"


def main() -> int:
    ok = True
    for kind in ("words", "grammar", "examples"):
        merged: dict[str, str] = {}
        for src in sorted((VI / "src").glob(f"{kind}_*.txt")):
            for n, raw in enumerate(src.read_text(encoding="utf-8").splitlines(), 1):
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if SEP not in line:
                    print(f"{src.name}:{n}: thiếu dấu phân cách {SEP}", file=sys.stderr); ok = False; continue
                key, val = (x.strip() for x in line.split(SEP, 1))
                if "\t" in key or "\t" in val:
                    print(f"{src.name}:{n}: không được chứa TAB", file=sys.stderr); ok = False; continue
                if key in merged and merged[key] != val:
                    print(f"{src.name}:{n}: khoá trùng khác giá trị: {key}", file=sys.stderr); ok = False
                merged[key] = val
        out = VI / f"{kind}.tsv"
        out.write_text("# sinh tự động bởi compile_vi.py – không sửa tay\n" +
                       "".join(f"{k}\t{v}\n" for k, v in merged.items()), encoding="utf-8")
        print(f"{kind}: {len(merged)} mục -> {out.name}", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
