#!/usr/bin/env python3
"""
build_brand.py – tạo bộ asset web từ logo gốc của Zuimó (brand/src/*.png).

Lưu ý: các file .svg gốc chỉ bọc ảnh PNG (không phải vector), kích thước nhỏ nhất 93x99 px.
Script chỉ cắt viền, đổi màu cho nền tối, ghép nền – KHÔNG vẽ lại hay biến dạng logo.
Icon lớn (192/512 px) là ảnh phóng to từ bản gốc nhỏ nên sẽ hơi mềm; thay bằng bản xuất
>= 1024 px khi có (đặt cùng tên vào brand/src/ rồi chạy lại).

Đầu ra (brand/out/):
  logo-light.png / logo-dark.png      logo ngang (biểu tượng + chữ) cho nền sáng / tối
  mark-light.png / mark-dark.png      biểu tượng Z cho nền sáng / tối
  favicon.svg                         tự đổi màu theo giao diện hệ điều hành
  favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png
  og-image.png                        ảnh xem trước khi chia sẻ link (1200x630)
  manifest.webmanifest
"""
from __future__ import annotations

import base64
import colorsys
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
SRC, OUT = HERE / "src", HERE / "out"
FONTS = Path("/home/claude/fonts")

BRAND_ORANGE = (253, 112, 71)      # #FD7047 đo từ logo
INK = (26, 30, 38)                 # #1A1E26
PAPER = (244, 248, 246)            # nền sáng của web
NIGHT = (15, 23, 29)               # nền tối của web
ON_DARK = (242, 244, 245)          # màu nét khi đặt trên nền tối


def trim(im: Image.Image, pad: int = 0) -> Image.Image:
    """Cắt phần trong suốt thừa quanh logo (bản gốc có lề 8 px)."""
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(box)
    if pad:
        canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
        canvas.alpha_composite(im, (pad, pad))
        im = canvas
    return im


def recolor_for_dark(im: Image.Image) -> Image.Image:
    """Đổi các điểm ảnh màu mực (độ bão hoà thấp) sang gần trắng, giữ nguyên độ trong suốt và chấm cam.
    Giữ nguyên độ sáng tương đối để vân nét cọ vẫn còn."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if (h < 0.1 or h > 0.95) and s > 0.45 and v > 0.55:
                continue  # chấm cam: giữ nguyên
            k = 1 - v * 0.35  # mực càng đậm -> càng sáng trên nền tối
            px[x, y] = (int(ON_DARK[0] * k + 30 * (1 - k)), int(ON_DARK[1] * k + 30 * (1 - k)),
                        int(ON_DARK[2] * k + 30 * (1 - k)), a)
    return out


def fit(im: Image.Image, box: int) -> Image.Image:
    """Thu/phóng giữ tỉ lệ để vừa khung vuông box×box."""
    scale = box / max(im.width, im.height)
    return im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)


def square_icon(mark: Image.Image, size: int, bg: tuple | None, safe: float) -> Image.Image:
    """Biểu tượng nằm giữa khung vuông; safe = tỉ lệ vùng an toàn (maskable cần <= 0.8)."""
    canvas = Image.new("RGBA", (size, size), (*bg, 255) if bg else (0, 0, 0, 0))
    m = fit(mark, int(size * safe))
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas


def b64png(im: Image.Image) -> str:
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    primary = trim(Image.open(SRC / "zuimo-primary.png").convert("RGBA"))
    mark = trim(Image.open(SRC / "zuimo-icon.png").convert("RGBA"))

    logo_dark, mark_dark = recolor_for_dark(primary), recolor_for_dark(mark)
    for name, im in [("logo-light", primary), ("logo-dark", logo_dark), ("mark-light", mark), ("mark-dark", mark_dark)]:
        im.save(OUT / f"{name}.png", optimize=True)

    # favicon SVG: một file, tự đổi theo prefers-color-scheme của trình duyệt
    w, h = mark.size
    side = max(w, h)
    ox, oy = (side - w) / 2, (side - h) / 2
    (OUT / "favicon.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {side} {side}">'
        '<style>.d{display:none}@media (prefers-color-scheme:dark){.l{display:none}.d{display:inline}}</style>'
        f'<image class="l" x="{ox}" y="{oy}" width="{w}" height="{h}" href="data:image/png;base64,{b64png(mark)}"/>'
        f'<image class="d" x="{ox}" y="{oy}" width="{w}" height="{h}" href="data:image/png;base64,{b64png(mark_dark)}"/>'
        "</svg>", encoding="utf-8")

    square_icon(mark, 32, None, 1.0).save(OUT / "favicon-32.png", optimize=True)
    square_icon(mark, 180, (255, 255, 255), 0.72).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    square_icon(mark, 192, None, 0.92).save(OUT / "icon-192.png", optimize=True)
    square_icon(mark, 512, None, 0.92).save(OUT / "icon-512.png", optimize=True)
    square_icon(mark, 512, (255, 255, 255), 0.62).save(OUT / "icon-maskable-512.png", optimize=True)

    # Ảnh chia sẻ 1200x630: logo + khẩu hiệu
    og = Image.new("RGBA", (1200, 630), (*PAPER, 255))
    d = ImageDraw.Draw(og)
    d.rectangle([0, 600, 1200, 630], fill=BRAND_ORANGE)
    logo = primary.resize((primary.width * 3, primary.height * 3), Image.LANCZOS)
    og.alpha_composite(logo, ((1200 - logo.width) // 2, 150))
    f1 = ImageFont.truetype(str(FONTS / "BeVietnamPro-Bold.ttf"), 46)
    f2 = ImageFont.truetype(str(FONTS / "BeVietnamPro-SemiBold.ttf"), 30)
    for text, font, y, col in [("Học tiếng Trung theo HSK 2.0 và HSK 3.0", f1, 420, INK),
                               ("Từ vựng · Ngữ pháp · Hội thoại · Tập viết · Thẻ nhớ", f2, 490, (75, 86, 100))]:
        tw = d.textlength(text, font=font)
        d.text(((1200 - tw) / 2, y), text, font=font, fill=col)
    og.convert("RGB").save(OUT / "og-image.png", optimize=True)

    manifest = {
        "name": "Zuimó – Học tiếng Trung theo HSK",
        "short_name": "Zuimó",
        "description": "Học tiếng Trung theo giáo trình HSK 2.0 và HSK 3.0: từ vựng, ngữ pháp, hội thoại, tập viết, thẻ nhớ.",
        "lang": "vi",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#F4F8F6",
        "theme_color": "#F4F8F6",
        "icons": [
            {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    (OUT / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    for f in sorted(OUT.iterdir()):
        print(f"{f.name:28s} {f.stat().st_size:>8,} bytes")


if __name__ == "__main__":
    main()
