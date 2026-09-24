# Backend Zuimó

API viết bằng Node 22 thuần (chỉ một phụ thuộc là `pg`), dữ liệu lưu PostgreSQL 16, đứng sau Caddy.
Chọn Node thuần thay vì framework để ít bề mặt tấn công, dễ đọc lại toàn bộ luồng và không phải chạy theo
vòng đời nâng cấp của framework. Khi cần thêm tính năng lớn (trang quản trị, hàng đợi), có thể bổ sung sau.

```
Trình duyệt ──HTTPS──> Caddy ──/api/*──> api (Node, cổng 3000, không mở ra ngoài)
                         │                      └──> db (PostgreSQL 16, volume pgdata)
                         └──/ (mọi thứ còn lại) ──> file tĩnh trong /srv
```

## 1. Bảng dữ liệu

| Bảng | Vai trò |
|---|---|
| `users` | Danh tính: tên, username, email, avatar, cờ khoá tài khoản |
| `accounts` | Cách đăng nhập: `password` / `google`. Một user có nhiều dòng |
| `sessions` | Phiên đăng nhập; chỉ lưu **SHA-256 của token**, kèm IP và user agent |
| `progress` | Tiến độ học dạng JSONB + `version` để xử lý xung đột nhiều thiết bị |
| `activity_days` | XP theo ngày, phục vụ lịch nhiệt, chuỗi ngày, xếp hạng |
| `audit_log` | Đăng nhập, đăng ký, đổi mật khẩu; dùng khi điều tra sự cố |
| `dict_entries` | 123.412 mục từ: CC-CEDICT (Anh) + CVDICT (Việt) ghép theo (phồn, giản, pinyin); có Hán Việt, lượng từ, nhãn ngữ vực, loại từ và cấp HSK |
| `dict_chars` | 9.574 chữ từ Make Me a Hanzi: bộ thủ, cấu tạo (IDS), nguồn gốc, số nét |
| `dict_sentences` | 2.616 câu ví dụ tự soạn (hội thoại, ví dụ ngữ pháp) |

Tách `users` khỏi `accounts` là điểm quan trọng: người dùng đăng ký bằng mật khẩu rồi liên kết Google
vẫn là **một tài khoản**, không tạo thành hai hồ sơ trùng nhau.

## 2. Các endpoint

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/health` | Kiểm tra API và kết nối DB |
| GET | `/api/auth/providers` | Cho giao diện biết nút nào nên hiện |
| POST | `/api/auth/register` | 5 lần/giờ/IP |
| POST | `/api/auth/login` | Nhận username hoặc email; 10 lần/10 phút theo IP **và** theo tài khoản |
| POST | `/api/auth/logout` | Xoá phiên trong DB |
| GET | `/api/auth/me` | Trả về user và danh sách provider đã liên kết |
| GET | `/api/auth/google` | Bắt đầu OAuth (state ký HMAC + PKCE) |
| GET | `/api/auth/callback/google` | Nhận code, tạo phiên, chuyển về web |
| GET / PUT | `/api/progress` | Đọc và lưu tiến độ, có hợp nhất |
| GET | `/api/stats` | XP 90 ngày tính bằng SQL |
| GET | `/api/dict/search?q=` | Tra theo chữ Hán, pinyin (có/không dấu), tiếng Việt, tiếng Anh; 120 lượt/phút/IP, không cần đăng nhập |
| GET | `/api/dict/entry?w=` | Chi tiết: nghĩa, loại từ, lượng từ, chữ và bộ thủ, mẹo nhớ, từ ghép, ví dụ, đồng âm, dễ nhầm, gần nghĩa |
| GET | `/api/dict/char?c=` | Một chữ: bộ thủ, cấu tạo, nguồn gốc, số nét |
| GET | `/api/dict/segment?text=` | Tách từ trong câu theo khớp dài nhất |
| GET | `/api/practice/listening/items` | Câu luyện nghe theo phiên bản, cấp, độ dài; ưu tiên câu đã có MP3 (cần đăng nhập) |
| POST | `/api/practice/attempt` | Chấm (nghe/viết: khoảng cách chỉnh sửa, trả dãy so khớp từng chữ) và lưu; trả XP |
| GET | `/api/practice/history` | Lịch sử và thống kê luyện theo loại |
| GET/POST/DELETE | `/api/practice/clips` | Clip YouTube có transcript; thêm/xoá chỉ admin |
| GET | `/api/practice/topics` | Chủ đề clip kèm số lượng |
| GET | `/api/practice/writing/items` | Đề luyện viết: câu có nghĩa Việt (mode=sentence) hoặc từ HSK (mode=word) |
| GET | `/api/practice/ime?q=` | Gợi ý chữ cho bộ gõ pinyin: từ HSK, khớp đúng, tần suất, độ dài |
| GET | `/api/practice/speech/config` | Có Azure không, còn bao nhiêu lượt chấm hôm nay |
| POST | `/api/practice/speech/assess` | Chấm phát âm Azure: nhận WAV base64 16 kHz mono ≤ 25 s, trả điểm tổng, từng từ, từng âm vị |
| GET | `/api/exam/blueprints` | Khung đề các cấp |
| POST | `/api/exam/start` | Sinh đề (hoặc lấy bộ đề admin), trả bản không có đáp án |
| POST | `/api/exam/answer` | Lưu dần câu trả lời |
| POST | `/api/exam/submit` | Chấm theo thang chính thức, lưu kết quả, trả đề đầy đủ để xem lại |
| GET | `/api/exam/paper?id`, `/api/exam/history` | Xem lại / danh sách đề đã làm |
| GET/POST/DELETE | `/api/exam/sets` | Bộ đề admin |
| GET | `/api/profile` | Hồ sơ + cấp độ + thống kê học tập |
| POST | `/api/account/profile` | Đổi tên hiển thị, đổi hoặc xoá ảnh đại diện |
| POST | `/api/account/password` | Đổi mật khẩu, huỷ mọi phiên khác |
| GET | `/api/account/export` | Xuất toàn bộ dữ liệu người dùng |
| DELETE | `/api/account` | Xoá tài khoản (cascade toàn bộ dữ liệu) |

## 3. Bảo mật

- **Mật khẩu:** scrypt với N=16384, r=8 (16 MB mỗi lần băm), salt 16 byte ngẫu nhiên, so sánh bằng `timingSafeEqual`.
  Tham số N cao hơn sẽ vượt hạn mức `maxmem` mặc định của Node và khiến nhiều request đăng nhập cùng lúc ngốn hết RAM.
- **Phiên:** token 32 byte ngẫu nhiên, cookie `HttpOnly; Secure; SameSite=Lax`, DB chỉ giữ bản băm.
  Phiên tự gia hạn khi đã dùng quá nửa thời hạn (sliding session).
- **CSRF:** cookie SameSite=Lax cộng kiểm tra `Origin` cho mọi request thay đổi dữ liệu.
- **OAuth:** `state` ký HMAC kèm hạn 10 phút, PKCE S256 cho luồng Google.
- **Rate limit:** theo IP và theo tài khoản, chặn dò mật khẩu từ nhiều IP.
- **Thông báo lỗi đăng nhập:** luôn chung một câu, không tiết lộ tài khoản nào có thật.
- **Container:** `cap_drop: ALL`, `no-new-privileges`, chạy bằng user `node`, API không publish cổng ra ngoài.

## 3b. Cấp độ và ảnh đại diện

- **Cấp độ** (`server/src/level.js`): cấp 1→2 cần 100 XP, mỗi cấp sau cộng thêm 50 XP.
  Mốc: cấp 5 = 700 XP, cấp 10 = 2.700 XP, cấp 20 = 10.450 XP. Danh hiệu theo mốc cấp:
  Nhập môn → Sơ cấp (3) → Trung cấp (8) → Nâng cao (15) → Thành thạo (25) → Cao thủ (40).
  Công thức này được lặp lại y hệt trong giao diện; sửa một bên phải sửa cả hai, nếu không số hiển thị sẽ nhảy khi đồng bộ.
- **Ảnh đại diện** lưu thành data URL trong `users.avatar_url`. Client thu nhỏ còn 256×256 và xuất WebP trước khi gửi
  (ảnh 600×600 PNG 5 KB → WebP 18 KB). Server kiểm tra định dạng khai báo, dung lượng tối đa 200 KB **và chữ ký file**,
  nên đổi đuôi để nhét nội dung khác sẽ bị từ chối.
  Khi số người dùng lớn, chuyển sang object storage và chỉ lưu URL; phần còn lại không phải sửa.
- **Ảnh từ Google** được server tải về ngay lúc đăng nhập và lưu thành data URL, thay vì lưu URL của
  lh3.googleusercontent.com. Lý do: CSP của trang chỉ cho `img-src 'self' data: blob:`, nên URL ngoài sẽ bị chặn;
  nới CSP cho host ngoài còn khiến mỗi lần xem hồ sơ là trình duyệt người dùng lại gọi sang Google.
- **CSP phải có `blob:`** trong `img-src`, vì phần thu nhỏ ảnh dùng `URL.createObjectURL` trước khi vẽ lên canvas.

## 4. Đồng bộ tiến độ nhiều thiết bị

Client giữ số `version` đang có. Khi lưu:

1. Server khoá dòng `progress` (`SELECT … FOR UPDATE`) để hai thiết bị không ghi đè nhau.
2. Hợp nhất: XP và số đếm lấy giá trị lớn hơn, XP theo ngày lấy max từng ngày, thẻ ghi nhớ giữ lịch ôn mới hơn.
3. Nếu client gửi kèm version cũ, server vẫn lưu bản đã hợp nhất nhưng trả **409** kèm tài liệu chuẩn để client nạp lại.

Nhờ vậy học trên điện thoại và máy tính trong cùng một ngày không mất điểm của bên nào.
Client gom thay đổi 2,5 giây một lần, và đẩy nốt khi đóng tab (`visibilitychange`, `pagehide`).

## 5. Giao diện khi không có backend

Trang web vẫn chạy được ở chế độ tĩnh. Lúc mở trang, app gọi `/api/health`:

- **Có API:** đăng nhập thật, đồng bộ tiến độ, nút Google chỉ hiện khi đã cấu hình khoá.
- **Không có API:** giữ nguyên chế độ lưu trình duyệt như bản demo.

## 6. Vận hành

```bash
cd /opt/zuimo/deploy
bash scripts/init-secrets.sh          # sinh POSTGRES_PASSWORD và AUTH_SECRET vào .env
docker compose up -d --build          # dựng cả web, api, db
docker compose ps                     # cả ba phải healthy
curl -s https://zuimo.io.vn/api/health

docker compose logs -f api            # log JSON mỗi dòng một request
docker compose exec db psql -U zuimo -d zuimo -c '\dt'

bash scripts/backup-db.sh             # sao lưu, giữ 14 bản gần nhất
bash scripts/restore-db.sh backups/zuimo-20260918-031500.sql.gz
```

Đặt sao lưu định kỳ:

```cron
15 3 * * * /opt/zuimo/deploy/scripts/backup-db.sh >> /var/log/zuimo-backup.log 2>&1
```

Migration tự chạy khi API khởi động, có advisory lock nên nhiều bản sao khởi động cùng lúc vẫn an toàn.
Thêm thay đổi lược đồ bằng cách tạo file mới trong `server/migrations/` theo thứ tự tên, ví dụ `002_....sql`.

## 7. Việc còn lại trước khi mở cho người dùng thật

1. **Đăng ký Google** rồi điền khoá vào `deploy/.env` (xem `docs/auth-oauth.md`).
2. **Quên mật khẩu qua email:** cần máy chủ thư hoặc dịch vụ gửi mail; hiện chưa có nên nút chỉ hiện hướng dẫn.
3. **Sao lưu ra máy khác:** hiện backup nằm cùng VPS; nên đẩy sang object storage hoặc node khác trong fleet.
4. **Giám sát:** thêm uptime check gọi `/api/health` và cảnh báo khi 5xx tăng.

## 8. Từ điển

Dữ liệu nạp bằng `node tools/import-dict.mjs` (tự tải CC-CEDICT, CVDICT, Make Me a Hanzi từ GitHub, chạy lại an toàn nhờ UPSERT).
Trên VPS: `docker compose exec api node tools/import-dict.mjs`, mất khoảng 30 giây, cần mạng ra `raw.githubusercontent.com`.

Cách tìm kiếm (`src/dict.js`):
- Chữ Hán: khớp đúng → bắt đầu bằng → chứa (chỉ mục trigram), từ HSK và từ ngắn lên trước.
- Pinyin: chuẩn hoá về không dấu, không cách (`nǐ hǎo`, `ni3hao3`, `nihao` đều ra 你好). Chuỗi có dấu như "yuàn" được thử cả pinyin lẫn tiếng Việt.
- Tiếng Việt và tiếng Anh: khớp trọn một nghĩa → nghĩa bắt đầu bằng → chứa; chỉ mục trigram trên cột nghĩa nối.
- Dễ nhầm: từ nhiều chữ → cùng độ dài, khác một chữ; chữ đơn → cùng bộ thủ chênh ≤1 nét, hoặc chung bộ phận (bỏ bộ phận quá phổ biến như 一 口) chênh ≤2 nét.
- Mẹo nhớ sinh theo quy tắc từ cấu tạo chữ và nghĩa Việt của từng bộ phận; không thay được mẹo do người viết.

Giấy phép: CC-CEDICT và CVDICT theo CC BY-SA 4.0 (phải ghi nguồn, dữ liệu sửa đổi chia sẻ cùng giấy phép; đã ghi nguồn dưới mỗi mục từ).
Make Me a Hanzi theo Arphic PL/LGPL. Bộ nhận dạng chữ viết HanziLookupJS theo **GPL-3**: được nạp như file riêng trong `public/vendor/`,
không đóng gói chung với mã của Zuimó.

## 9. Luyện tập

- `migrations/003_practice.sql`: câu ví dụ thêm `lvl`, `ver`, `nchar`, `audio`; bảng `media_clips` (clip YouTube của admin) và `practice_attempts`.
- **Âm thanh:** `tools/gen-audio.mjs` sinh MP3 hai tốc độ bằng Azure Neural TTS (giọng zh-CN-XiaoxiaoNeural), ghi vào `deploy/media/audio/s/`
  (mount `/app/media` trong api, Caddy phục vụ tại `/media/*` với cache 30 ngày). Chạy lại chỉ sinh câu chưa có file.
  Khi câu chưa có MP3, giao diện dùng giọng trình duyệt. Hạn mức miễn phí Azure 500.000 ký tự/tháng; toàn bộ 2.600 câu x 2 tốc độ ≈ 60.000 ký tự.
- **Chấm nghe/viết** (`src/practice.js` → `scoreText`): chỉ so chữ Hán và chữ số, bỏ dấu câu/khoảng trắng; điểm = 1 − Levenshtein/độ dài đáp án;
  dãy thao tác ok/sub/miss/extra cho giao diện tô màu. XP: ≥95% được 10, ≥80% được 7, ≥60% được 4, dưới 60% không có.
- **Bắt buộc đăng nhập:** mọi endpoint `/api/practice/*` gọi `requireUser`; giao diện mở cửa sổ đăng nhập (`showAuthModal`) khi chưa đăng nhập,
  đăng nhập xong tự đi tiếp tới mục đã chọn.
- **Clip YouTube:** admin (`users.is_admin = true`) dán link và transcript dạng `giây bắt đầu | giây kết thúc | chữ Hán | pinyin | nghĩa`.
  Trình phát dùng YouTube IFrame API, phát đúng đoạn rồi dừng; CSP đã mở `script-src`/`frame-src` cho youtube.com.
