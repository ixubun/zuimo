# Giao diện Zuimó (web/)

Dự án Vite, ES module, không framework. Từ phiên bản này **mã nguồn giao diện là `web/src/`**;
thư mục `prototype/` chỉ còn là bản lưu của giai đoạn một-file và không dùng để build nữa.

## Cấu trúc

```
web/
├── index.html              vỏ trang: <head>, khung sidebar, #view
├── vite.config.js          build, tách chunk hanzi-writer, proxy /api khi dev
├── public/                 file tĩnh chép nguyên: brand/, icon, manifest, trang chính sách, data/
│   └── data/               dữ liệu học đã tách nhỏ (sinh bởi tools/export_data.py)
├── src/
│   ├── main.js             khởi động: nạp index.json rồi vẽ, dò backend
│   ├── styles/app.css
│   ├── core/               dom.js ($, esc), state.js (S, store), util.js (tr, num…), icons.js, sync.js (API, đồng bộ)
│   ├── content/            data.js (tải theo nhu cầu), books.js (tra cứu sách), sample.js (bài mẫu)
│   ├── features/           session.js, level-session.js, pinyin.js, speech.js, xp.js, writer.js
│   ├── ui/nav.js           menu dọc có submenu, thanh trên
│   ├── views/              home, book, library, practice, cards, stats, profile (kèm đăng nhập), about
│   └── app/                router.js (điều hướng + lịch sử), actions.js (bảng hành động, event delegation)
└── tools/
    ├── export_data.py      content/build/*.json -> public/data/**
    └── split_to_modules.py công cụ đã dùng MỘT LẦN để tách prototype; giữ lại để đối chiếu
```

## Dữ liệu tải theo nhu cầu

| File | Khi nào tải | Kích thước |
|---|---|---|
| `data/index.json` | lúc mở trang (mục lục sách, bảng đếm, danh sách chữ có nét) | 18 KB |
| `data/words/{ver}-{cấp}.json` | mở Thư viện hoặc luyện tập theo cấp | 12–200 KB |
| `data/books/{id}.json` | mở một quyển giáo trình | ~100 KB |
| `data/hanzi.json` | mở tab Chữ Hán hoặc Tập viết | 86 KB |
| `data/grammar/{cấp}.json` | mở tab Ngữ pháp | 20–60 KB |
| `data/strokes/{chữ}.json` | vẽ một chữ | 2–4 KB |

Logic nằm ở `src/content/data.js`: `needsFor(route)` trả về promise khi trang còn thiếu dữ liệu,
`render()` chờ xong rồi vẽ. Dữ liệu đã tải được giữ trong bộ nhớ, không tải lại.

Kết quả đo: trang chủ tải 260 KB chưa nén (khoảng 90 KB nén), trước đây là 3,18 MB.

## Lệnh

```bash
cd web
npm ci                       # cài phụ thuộc (vite, hanzi-writer)
npm run data                 # xuất lại dữ liệu khi content/build đổi
npm run dev                  # http://localhost:5173, /api chuyển tiếp sang API cổng 3100
npm run build                # ra dist/, chép vào deploy/site/
```

## Quy ước khi thêm tính năng

- Mỗi trang là một file trong `views/`, export hàm `renderX()` và đăng ký trong `VIEWS` (router.js).
- Hành động của nút đặt trong bảng `ACT` (actions.js) hoặc bảng riêng của view (`LIB_ACT`, `BOOK_ACT`, `AUTH_ACT`), gắn qua `data-act`/`data-arg`.
- Trang cần dữ liệu mới thì khai báo trong `needsFor()`; không fetch trực tiếp trong view.
- Biến phiên (`P` luyện tập, `C` thẻ nhớ) chỉ đổi trong module chủ; module khác gọi `curP()`/`resetPractice()`.
- Công thức cấp độ trong `views/home.js` phải khớp `server/src/level.js`.
