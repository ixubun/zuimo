# ZUIMO – nội dung HSK 3.0

```
content-pipeline/
  build_books.py       # dựng 2 giáo trình tách biệt -> content/build/books.json
  build_content.py     # gộp nguồn mở -> content/build/{words,hanzi,grammar,coverage}.json
  compile_vi.py        # content/vi/src/*.txt (khoá ‖ giá trị) -> content/vi/*.tsv
  pinyin_mismatch.tsv  # từ đa âm cần rà soát tay (sinh tự động)
content/
  vi/src/              # NỘI DUNG TIẾNG VIỆT DO ZUIMO BIÊN SOẠN – tách file theo cấp
  build/               # dữ liệu đã gộp, đầu vào cho seed PostgreSQL (giai đoạn 2)
prototype/             # template + script vá + build ra 1 file HTML
```

## Chạy lại

```bash
pip install pypinyin jieba
# nguồn: complete-hsk-vocabulary, HSK-3.0, hanzi-writer-data, hanviet-pinyin-words (xem CREDITS.md)
python3 content-pipeline/compile_vi.py
python3 content-pipeline/build_content.py --src /path/to/sources
```

## Thêm nội dung tiếng Việt cho cấp mới

Tạo `content/vi/src/words_hsk2.txt`, `grammar_hsk2.txt`, `examples_hsk2.txt` theo đúng định dạng của HSK 1,
chạy lại hai lệnh trên rồi xem `content/build/coverage.json` để biết độ phủ.

## Độ phủ hiện tại

| Cấp (chuẩn 2021) | Từ | Nghĩa VI | Hán Việt | Ngữ pháp | Giải thích VI | Ví dụ đã dịch |
|---|---|---|---|---|---|---|
| HSK 1 | 497 (+31 từ chỉ có ở đề 2026) | 100% | 100% | 48 | 48 | 100% |
| HSK 2–6 | 4.845 | EN | ~99% | 376 | đang soạn | đang soạn |
| HSK 7–9 | 5.601 | EN | ~99% | 148 | đang soạn | đang soạn |

## Giáo trình HSK 1 (đọc thủ công từ bản scan)

| | HSK 2.0 (HSK标准教程 1) | HSK 3.0 (新HSK教程 1) |
|---|---|---|
| Bài | 15 | 15 |
| Từ mới chính | 169 (148 + 21 từ ghép từ chữ đã học) | 299 |
| Mở rộng, không bắt buộc | 10 từ vượt cấp + 21 từ bổ sung | 8 từ vượt cấp |
| Tên riêng | 8 | 12 |
| Điểm ngữ pháp | 45 | 40 |
| Phát âm, chữ Hán, bộ thủ | có, theo từng bài | không có trong mục lục |

Nguồn thô: `content/books/*.tsv`, `content/books/toc_raw.json` (chỉ dữ kiện: danh sách từ, pinyin, số bài, tên mục).
Không chép hội thoại, lời giảng, bài tập hay nghĩa tiếng Việt của nhà xuất bản.

Kiểm tra chéo HSK 2.0: bảng từ phụ lục khớp 100% với danh sách từ trong mục lục từng bài.

## Hội thoại và bài tập (ZUIMO biên soạn)

- `content/vi/src/dialogues_hsk20.txt`, `dialogues_hsk30.txt`: 30 bài, mỗi bài 1–2 đoạn hội thoại và 5 bài tập
  (điền từ, sắp xếp câu, dịch câu, đọc hiểu, và bài tập tự sinh từ từ vựng).
- `content-pipeline/dialogues.py` kiểm tra mọi chữ Hán chỉ thuộc từ đã học tới bài đó; `build_books.py` gọi tự động.
- `content/vi/src/bookmeta.txt`: mục tiêu từng bài (HSK 3.0) và nội dung văn hóa, diễn đạt lại bằng tiếng Việt.

## Triển khai

Xem `deploy/README-DEPLOY.md`.

## Giáo trình quyển 2 (cập nhật)

| | HSK 2.0 quyển 2 (HSK标准教程 2) | HSK 3.0 quyển 2 (新HSK教程 2) |
|---|---|---|
| Bài | 15 | 15 |
| Từ mới chính | 157 (147 + 10 từ ghép từ chữ đã học) | 197 |
| Mở rộng, không bắt buộc | 15 từ vượt cấp + 21 từ bổ sung | 10 từ vượt cấp |
| Tên riêng | 2 | 3 |
| Điểm ngữ pháp | 44 | 45 |
| Ngữ âm, chữ Hán, bộ thủ | có (trọng âm, ngữ điệu; 30 bộ thủ) | không có trong sách |
| Mục tiêu, văn hóa | văn hóa bài 5, 10, 15 | mục tiêu 15 bài, văn hóa 6 bài |
| Hội thoại, bài tập (ZUIMO) | 15 bài | 15 bài |

- Khoá nội dung: quyển 1 giữ dạng `20-5`, quyển 2 dùng `20b2-5` (tiến độ quyển 1 của người dùng không bị ảnh hưởng).
- Chỗ lệch trong sách HSK 2.0 quyển 2: phụ lục ghi 意思 ở bài 5, mục lục và bảng từ ghép ghi bài 14 -> dùng bài 14.
  以后 không có dấu * trong mục lục nhưng nằm trong bảng từ vượt cấp -> xếp vào mở rộng.
- Kiểm tra hội thoại cộng dồn theo phiên bản: quyển 2 được dùng mọi từ của quyển 1.

## Điều hướng và trang chủ (v6)

- `prototype/patch_v6.py`: menu dọc có submenu và trang chủ dạng bảng tổng hợp.
- Menu: mục Bài học mở ra hai lộ trình (HSK 2.0 – 6 cấp, HSK 3.0 – 9 cấp), mỗi cấp là một mục.
  Cấp có giáo trình mở thẳng danh sách bài; cấp chưa có mở Thư viện ở đúng cấp đó.
  Thêm quyển mới vào BOOKS là submenu tự cập nhật, không cần sửa giao diện.
- Mỗi lần chỉ mở một nhóm menu; thanh bên cuộn được khi submenu dài.
- Trang chủ: mục tiêu ngày, chuỗi ngày, cấp người học (150 XP/cấp), ôn tập nhanh, thẻ Học tiếp,
  8 bài gợi ý theo ngày, lịch nhiệt 90 ngày (từ `S.p.days`) và mốc chuỗi ngày. Phần lộ trình đã chuyển vào menu.

## Đăng nhập (v7)

- `prototype/patch_v7.py`: bỏ mã mời, thêm nút đăng nhập mạng xã hội và nút hiện/ẩn mật khẩu.
- Đăng ký: tên hiển thị, tên đăng nhập, email (không bắt buộc), mật khẩu + nhập lại. Đăng nhập nhận tên đăng nhập hoặc email.
- Google cần backend và domain đã xác minh: xem `docs/auth-oauth.md`. Đăng nhập Zalo đã gỡ ở bản v9.

## Backend và cơ sở dữ liệu (v8)

- `server/`: API Node 22 thuần (một phụ thuộc `pg`), PostgreSQL 16, migration tự chạy khi khởi động.
- Tài khoản (mật khẩu scrypt, Google), phiên cookie HttpOnly, đồng bộ tiến độ nhiều thiết bị,
  xuất và xoá dữ liệu người dùng. Chi tiết: `docs/backend.md`.
- `prototype/patch_v8.py`: giao diện tự dò `/api/health`; có backend thì dùng tài khoản thật và đồng bộ,
  không có thì giữ chế độ lưu trình duyệt.
- `deploy/docker-compose.yml`: thêm service `db` và `api`; Caddy chuyển tiếp `/api/*` sang API.
- Scripts mới: `init-secrets.sh`, `backup-db.sh`, `restore-db.sh`.

## Gỡ đăng nhập Zalo (v9)

- `prototype/patch_v9.py`: bỏ nút Zalo, CSS và nhánh xử lý trên giao diện.
- Backend: bỏ route `/api/auth/zalo`, callback, biến `ZALO_*` trong compose và file .env mẫu.
- Lược đồ DB giữ nguyên giá trị `provider='zalo'` để dữ liệu cũ không lỗi ràng buộc.

## Quản lý hồ sơ và cấp độ (v10)

- `server/src/level.js`: công thức cấp độ và danh hiệu, dùng chung cho API.
- `server/src/profile.js`: `GET /api/profile` (hồ sơ + cấp + thống kê), `POST /api/account/profile` (tên hiển thị, ảnh đại diện).
- `prototype/patch_v10.py`: trang Hồ sơ hai cột — thẻ tài khoản, thanh cấp độ, thống kê học tập,
  và tiến độ bài học chia tab Đã hoàn thành / Đang học. Ảnh được thu nhỏ bằng canvas ngay trên trình duyệt.
- Chế độ tĩnh (không backend) vẫn xem và sửa hồ sơ được, dữ liệu lưu trong trình duyệt.

## Chuyển sang cấu trúc module (v12)

- Giao diện chuyển thành dự án Vite trong `web/`: 26 module chia theo core / content / features / ui / views / app.
  Từ nay sửa mã ở `web/src/`; `prototype/` chỉ là bản lưu, không build từ đó nữa.
- Dữ liệu học tách thành 482 file JSON trong `web/public/data`, tải theo nhu cầu (`src/content/data.js`).
  Trang chủ tải 260 KB chưa nén thay vì 3,18 MB; mở quyển nào tải quyển đó.
- Caddy: `assets/*` cache vĩnh viễn (tên có hash), `data/*` cache 1 giờ.
- Backend giữ nguyên Node, đã chia module theo chức năng: `auth`, `oauth`, `profile`, `progress`, `http`, `db`, `level`.
- Chi tiết: `web/README.md`.

## Công cụ → Từ điển (v13)

- Backend: `server/migrations/002_dict.sql`, `server/src/dict.js`, `server/tools/import-dict.mjs`.
- Giao diện: `web/src/views/dict.js`, nhóm menu Công cụ, nút tra từ ở thanh trên, link sâu `#dict/<từ>`.
- Tra theo chữ Hán, pinyin, tiếng Việt, tiếng Anh, dán câu để tách từ, vẽ chữ để tra (HanziLookupJS trong `web/public/vendor`).
- Mỗi mục từ: nghĩa Việt và Anh, loại từ, lượng từ, ngữ vực, Hán Việt, phồn thể, cấp HSK; chữ và bộ thủ với nét viết,
  thành phần, nguồn gốc, mẹo nhớ; bản đồ liên kết bấm được; từ ghép và ví dụ; dễ nhầm, đồng âm, gần nghĩa.
- Nút "Thêm vào thẻ nhớ" tạo bộ thẻ "Từ đã lưu từ Từ điển" trong mục Thẻ nhớ.
- v13.1: gợi ý ngay khi gõ trong ô tra từ (debounce 250 ms, tối đa 8 gợi ý, phím mũi tên + Enter, Escape để ẩn).

## Luyện tập theo kỹ năng (v14): Luyện nghe

- Menu Luyện tập thành nhóm: Từ vựng, Luyện nghe, Luyện phát âm, Luyện viết, Luyện thi HSK (ba mục sau đang làm).
- Cửa sổ đăng nhập bật lên khi người chưa đăng nhập bấm vào mục luyện; đăng nhập xong tự đi tiếp.
- Luyện nghe: câu theo phiên bản/cấp/độ dài (MP3 Azure TTS, có tốc độ chậm, gợi ý pinyin), clip YouTube do admin thêm,
  chấm từng chữ, cộng XP, lịch sử. Backend: `server/src/practice.js`, `server/tools/gen-audio.mjs`.

## v14.3: Luyện nghe làm lại phần clip + trang Quản trị

- Sửa treo trang khi mở tab Clip: dữ liệu chỉ tải một lần cho mỗi bộ tham số (`loadedKey`), không tải lại mỗi lần vẽ.
- Thư viện clip theo chủ đề (kids, daily, hsk, story, news, culture, music, travel, business, tech, food, podcast, ted),
  thẻ có ảnh YouTube, thời lượng, cấp HSK, thẻ tag; lọc theo chủ đề và cấp.
- Trang clip: video trái, bản chép từng đoạn phải (mặt nạ chấm, tiến độ %), ba mức Dễ/Thường/Khó, phát đúng đoạn,
  xem đáp án ghi 0 điểm cho đoạn đó; khi YouTube không tải được thì hiện nút mở ngoài.
- Trang Quản trị (menu Công cụ, chỉ admin): thêm/sửa/ẩn/xoá clip; transcript nhận SRT, WebVTT, dạng ống, dạng "m:ss câu".
- Cấp quyền admin bằng shell: `docker compose exec api node tools/admin.mjs grant <username>` (list / revoke).

## Luyện viết (v15)

- Ba chế độ: Việt → Hán (dịch câu), Chép câu Hán (không pinyin, tuỳ chọn ẩn sau 5 giây), Từ vựng (gõ từ theo nghĩa).
- Bộ gõ pinyin trên trang (`/api/practice/ime`): gợi ý từ từ điển, từ HSK và từ hay gặp lên trước;
  Space hoặc số 1–9 chọn, Enter chèn chữ Latin, Backspace khi trống xoá chữ cuối. Bật/tắt nhớ theo người dùng.
- Tần suất từ (`dict_entries.freq`, migration 005) tính từ kho câu ví dụ khi chạy `import-dict.mjs`.
- Giao diện: `web/src/views/write.js`; endpoint: `/api/practice/writing/items`, `/api/practice/ime`.

## Luyện phát âm (v16)

- Shadowing: nghe mẫu (MP3 hoặc đoạn clip YouTube), chữ + pinyin màu thanh điệu, ghi âm bằng MediaRecorder, nghe lại giọng mình.
- Chấm: Azure Pronunciation Assessment (`server/src/speech.js`, `/api/practice/speech/assess`) với điểm chính xác/trôi chảy/đầy đủ/ngữ điệu,
  từng từ và từng âm vị; trình duyệt chuyển bản ghi sang WAV 16 kHz mono trước khi gửi. Hạn mức 80 lượt/ngày/người (≈6 phút) để giữ trong 5 giờ miễn phí.
- Dự phòng: Web Speech API (Chrome/Edge/Safari) so từng chữ; tự dùng khi không có key, hết lượt, hoặc Azure lỗi.
- Giới hạn body API nâng lên 2 MB cho bản ghi âm 25 giây.

## v16.1: cách ly dữ liệu giữa các tài khoản trên cùng trình duyệt

- Lỗi: tiến độ, thẻ nhớ, lịch sử tra cứu nằm trong localStorage không gắn tài khoản; đăng xuất chỉ xoá thông tin đăng nhập,
  nên tài khoản đăng nhập sau thấy và **hợp nhất** luôn dữ liệu của người trước rồi đẩy lên máy chủ.
- Sửa: `clearPersonalData()` (core/state.js) xoá progress, srs, dictHist, deck, bài đang học khi đăng xuất hoặc phiên hết hạn;
  `progressOwner` ghi chủ của dữ liệu cục bộ, `pullProgress` chỉ hợp nhất khi cùng chủ hoặc là dữ liệu khách chưa gắn ai
  (khách học rồi đăng ký thì được giữ, đúng chủ ý). Đã kiểm thử A → đăng xuất → B → A quay lại → khách → C.

## Luyện thi HSK (v17)

- Đề mô phỏng tự sinh theo cấu trúc chính thức HSK 2.0 cấp 1–6 (số phần, số câu, phút, thang 200/300, ngưỡng đỗ 120/180,
  nghe 2 lần ở cấp 1–2, 1 lần từ cấp 3); HSK 3.0 cấp 1–6 dùng cùng khung với kho từ 3.0. Cấp 4–6 là bản rút gọn (bài đọc đoạn văn
  thay bằng câu hỏi theo câu/hội thoại). Bộ sinh: `server/src/exam-gen.js`; hình minh hoạ: `server/data/emoji-map.json` (197 từ).
- 15 dạng câu: đúng/sai hình, chọn hình, hội thoại chọn hình, chọn câu trả lời, đúng/sai phát biểu (đổi một từ), ghép hình/ghép hỏi-đáp
  (kho A–F), điền từ, chọn đáp án, sắp xếp cụm, viết chữ theo pinyin, viết câu theo hình, viết đoạn (chấm rút gọn).
- Phòng thi: đồng hồ từng phần, tự chuyển phần khi hết giờ, nút nghe có đếm lần, kho hình/kho từ chung, lưu câu trả lời dần,
  cảnh báo khi rời trang. Kết quả: điểm từng phần quy về 100, tổng, đỗ/trượt, xem lại từng câu có đáp án và lời giải; lịch sử.
- Dữ liệu: `dict_dialog_pairs` (190 cặp hỏi-đáp), âm thanh từ đơn HSK 1–3 (`gen-audio.mjs` sinh thêm ~1.231 từ + cụm chuẩn).
- Admin nhập bộ đề riêng bằng JSON trong trang Quản trị (`/api/exam/sets`), có ví dụ sẵn.
- Migration 006; chạy lại `import-dict.mjs` (cặp hỏi-đáp, bỏ tiền tố người nói) và `gen-audio.mjs` (từ đơn).

## v18: đề thi khớp đề mẫu chính thức + thư viện ảnh thật

- Bộ sinh đề HSK 1–3 bám đề mẫu CTI: HSK 1 nghe P1 từ đơn + hình ✓✗, P2 chọn hình A–C, P3 hội thoại ↔ kho 6 hình A–F,
  P4 hội thoại + câu hỏi với 3 đáp án là từ; đọc P1 từ + hình, P2 câu ↔ hình A–F, P3 hỏi ↔ đáp A–F, P4 điền từ A–F.
  HSK 2/3 tương tự theo đề mẫu. Mỗi phần có ví dụ mẫu (例如) in kèm đáp án; HSK 1–2 hiện pinyin trên chữ Hán.
- Sảnh thi có nút tải đề mẫu chính thức từ chinesetest.cn (liên kết ra ngoài, không đăng lại đề của CTI).
- Thư viện ảnh (`server/src/images.js`, migration 007): admin tìm ảnh Pexels theo từ khoá tiếng Anh, bấm chọn là tải bản 350px
  về `deploy/media/img/` kèm nguồn; đề tự dùng ảnh thật khi có, chưa có thì emoji. Cần `PEXELS_API_KEY` trong `.env`
  và CSP `img-src` thêm images.pexels.com (ảnh xem trước).

## v19: ngân hàng đề, băng nghe liên tục, chế độ luyện tập

- `tools/build-exam-bank.mjs` sinh sẵn N đề mỗi cấp (mặc định 10, cả hai đề cương) vào `exam_sets` (kind=bank); mỗi lần thi chọn
  ngẫu nhiên một đề của cấp; có thể chọn đề cụ thể, đề đã làm hiện điểm. Migration 008.
- Phòng thi: băng nghe chạy liên tục (đọc số câu → nội dung × số lần quy định → nghỉ trả lời), tạm dừng, tua theo câu, tô sáng
  câu đang phát; bảng tiến độ 40/60/80 câu có trạng thái đã trả lời/đánh dấu; nút Thoát (bài dở lưu lại, tiếp tục từ lịch sử).
- Chế độ Luyện tập: không tính giờ, nghe lại từng câu không giới hạn, đúng/sai và lời giải hiện ngay sau mỗi câu.

## v20: nhập đề thật (PDF + MP3 của CTI)

- `server/tools/hsk-import/parse_paper.py`: cắt ảnh từng câu và kho hình từ trang PDF (dựng trang rồi cắt vùng, xử lý ảnh bị chia dải),
  trích câu hỏi/phương án/kho chữ (lọc pinyin), lời băng, đáp án → paper.json. Bố cục HSK 1 và 2 (2.0).
- `server/tools/import-exam.mjs`: chia băng theo khoảng lặng, căn từng câu bằng Azure STT (khớp lời băng) hoặc dự phòng theo lặng dài,
  cắt clip từng câu (luyện tập), giữ băng đầy đủ kèm mốc (thi thử), chép vào `media/exams/<mã>/`, ghi `exam_sets` kind=real.
- Phòng thi: băng thật `<audio>` với tô sáng câu theo mốc, nhảy câu từ bảng tiến độ; luyện tập dùng clip từng câu; xem lại có clip.
- Quản trị: bảng kiểm tra băng từng câu, sửa mốc t0/t1 và Cắt lại (`/api/exam/recut`, ffmpeg trong container).
- Image api thêm ffmpeg, python3, PyMuPDF. Ký hiệu đúng/sai chuẩn hoá √/× ↔ ✓/✗ khi chấm.
- v20.1: sửa băng dừng khi bấm đáp án — trả lời/đánh dấu/sắp xếp cụm cập nhật DOM tại chỗ (`updateItemDom`), không vẽ lại phòng thi
  (vẽ lại tạo mới `<audio>` làm mất phát). Cũng hết giật cuộn khi trả lời.
- v20.2: thi thử với băng thật — không tự cuộn theo băng (chỉ tô sáng, có nút "Tới câu đang phát"), bảng tiến độ chỉ cuộn tới câu,
  khoá tua trên trình phát (kéo thanh tua bị trả về vị trí đang phát, vẫn tạm dừng được); luyện tập giữ tua tự do và Câu trước/Câu sau.
- v20.3: kho hình/chữ hiển thị theo từng nhóm 5 câu (đề thật 11–15 và 16–20 có hai kho khác nhau; trước chỉ hiện kho nhóm đầu);
  gỡ cơ chế ép `currentTime` khi tua (nghi gây nhảy băng), quy tắc không nghe lại giữ ở bảng tiến độ và nút.
- v20.4: ảnh đề thi hiển thị trọn (object-fit: contain, nền trắng) thay vì xén theo khung; khung ảnh to hơn (kho 150×112, chọn hình 180×135, câu đơn 260×195).

## v21: nhập đề thật ngay trong trang Quản trị

- `server/src/exam-import.js`: tải PDF/MP3 lên (luồng thẳng ra `media/import/`, tối đa 200 MB, không qua giới hạn JSON),
  liệt kê cặp cùng tên, chạy `import-exam.mjs` ở nền với log `media/import/jobs/<mã>.log`, theo dõi tiến trình.
- Tự nhận cấp từ trang bìa PDF ("HSK（二级）"); có thể chỉ định `--level` khi cần.
- Quản trị → Nhập đề thật: chọn nhiều file, xem phần trăm tải, bấm Nhập, log hiện tại chỗ; xong tự làm mới danh sách ngân hàng.
