# Triển khai Zuimó lên VPS

Thông tin đã cấu hình sẵn:

| | |
|---|---|
| IP VPS | `45.66.128.86` |
| Domain | `zuimo.io.vn` (kèm `www.zuimo.io.vn`) |
| SSH | cổng `1812`, user `zuimo` |
| Thư mục ứng dụng | `/opt/zuimo` |

Tài liệu này dành cho bản web hiện tại: trang `site/index.html` cùng icon và manifest, chạy sau Caddy trong Docker.
Backend (API Node + PostgreSQL, đăng nhập mật khẩu và Google) chạy cùng khung này
và chỉ bổ sung thêm service vào `docker-compose.yml`.

```
deploy/
├── docker-compose.yml      Caddy 2 (alpine), chỉ đọc, bỏ hết capability trừ mở cổng
├── Caddyfile               chế độ domain: HTTPS cho zuimo.io.vn, www và IP chuyển 301 về domain
├── Caddyfile.ip            chế độ IP: chỉ HTTP, dùng tạm khi DNS chưa trỏ xong
├── site.caddy              phần cấu hình dùng chung (CSP, nén, cache, log)
├── .env                    CADDYFILE, SITE_DOMAIN, SERVER_IP, ACME_EMAIL (đã điền sẵn)
├── ssh_config.example      mẫu ~/.ssh/config
├── site/                   index.html, favicon, icon PWA, manifest, ảnh chia sẻ, robots, sitemap
└── scripts/
    ├── bootstrap-vps.sh    chuẩn bị VPS Debian 13 (chạy 1 lần bằng root)
    ├── check-dns.sh        kiểm tra bản ghi A/AAAA/CAA trước khi xin chứng chỉ
    ├── deploy.sh           đẩy bản mới lên VPS
    └── rollback.sh         quay về bản trước (chạy trên VPS)
```

## 0. Cấu hình VPS

| Giai đoạn | vCPU | RAM | Ổ đĩa | Ghi chú |
|---|---|---|---|---|
| Trang tĩnh hiện tại | 1 | 1 GB | 20 GB | Caddy dùng khoảng 30–50 MB RAM |
| Giai đoạn 1–4 (Next.js + PostgreSQL) | 2 | 4 GB | 40 GB NVMe | |
| Giai đoạn 5 (AI chạy CPU) | 8 | 16 GB | 100 GB NVMe | CPU model `host-passthrough` để lộ AVX2/AVX-512 |

Hệ điều hành: **Debian 13 (trixie)** bản minimal, có IPv4 tĩnh.

## 1. Cấu hình DNS cho zuimo.io.vn

Vào trang quản lý DNS tại nhà đăng ký tên miền `.io.vn` và tạo các bản ghi sau:

| Loại | Tên | Giá trị | TTL |
|---|---|---|---|
| A | `@` | `45.66.128.86` | 300 |
| A | `www` | `45.66.128.86` | 300 |

Ngoài ra cần kiểm tra:

- **Bản ghi AAAA:** xoá mọi bản ghi `AAAA` của `@` và `www`, trừ khi VPS thật sự dùng IPv6 đó. Let's Encrypt ưu tiên kiểm tra qua IPv6, nên chỉ cần AAAA trỏ sai là chứng chỉ không cấp được.
- **Bản ghi CAA:** nếu tên miền có bản ghi `CAA`, phải cho phép `letsencrypt.org`.
- **Bản ghi PTR (tuỳ chọn):** nếu bạn quản lý khối IP (GreenCloud), đặt PTR của `45.66.128.86` về `zuimo.io.vn`.

Kiểm tra từ máy của bạn (cần `dig`):

```bash
cd deploy && ./scripts/check-dns.sh
#   OK   zuimo.io.vn        A    = 45.66.128.86     (1.1.1.1)
#   OK   www.zuimo.io.vn    A    = 45.66.128.86     (8.8.8.8)
```

Nếu DNS chưa cập nhật xong, bạn vẫn làm tiếp được các bước 2–3 và triển khai tạm ở chế độ IP (mục 4a).

## 2. Chuẩn bị trên máy của bạn

```bash
# SSH key riêng cho Zuimó (bỏ qua nếu đã có key dùng cho fleet)
ssh-keygen -t ed25519 -C "zuimo-deploy" -f ~/.ssh/zuimo_ed25519
# Chép key lên root của VPS mới (lần duy nhất dùng mật khẩu root)
ssh-copy-id -i ~/.ssh/zuimo_ed25519.pub root@45.66.128.86
# Thêm alias "zuimo" để các lệnh sau ngắn gọn
cat deploy/ssh_config.example >> ~/.ssh/config
```

## 3. Chuẩn bị VPS (một lần)

```bash
cd deploy
scp -i ~/.ssh/zuimo_ed25519 scripts/bootstrap-vps.sh root@45.66.128.86:/root/
ssh -i ~/.ssh/zuimo_ed25519 root@45.66.128.86 'DEPLOY_USER=zuimo SSH_PORT=1812 bash /root/bootstrap-vps.sh'
```

Script sẽ:

- **Hệ thống:** cập nhật, bật vá bảo mật tự động (unattended-upgrades), đặt múi giờ Asia/Ho_Chi_Minh, tạo swap 2 GB.
- **Tài khoản:** tạo user `zuimo` (thuộc nhóm sudo và docker), chép SSH key của root sang.
- **SSH:** chuyển sang cổng 1812, tắt đăng nhập root và đăng nhập bằng mật khẩu, **vẫn giữ cổng 22** để bạn không tự khoá mình ở ngoài.
- **Tường lửa nftables:** chỉ mở SSH, 80/tcp, 443/tcp, 443/udp (HTTP/3).
- **Bảo vệ SSH:** cài fail2ban.
- **Docker:** cài Docker Engine và Compose plugin từ repo chính thức.

**Kiểm tra trước khi đóng cổng 22.** Mở **một cửa sổ terminal mới** và giữ nguyên phiên root cũ:

```bash
ssh zuimo                    # phải vào được qua cổng 1812
docker version               # user zuimo chạy được docker, không cần sudo
sudo nft list table inet filter
```

Khi đã vào được bằng cổng 1812, đóng cổng 22:

```bash
ssh zuimo 'sudo SSH_PORT=1812 bash /root/bootstrap-vps.sh --close-22'
```

> Nếu VPS nằm sau firewall của nhà cung cấp (security group của VirtFusion hoặc panel), mở thêm 80, 443/tcp, 443/udp và 1812/tcp ở đó.

## 4. Triển khai

Trước tiên, mở `deploy/.env` và đổi `ACME_EMAIL` sang hộp thư bạn thực sự đọc.

### 4a. DNS chưa sẵn sàng: chạy tạm theo IP

```bash
cd deploy
sed -i 's/^CADDYFILE=.*/CADDYFILE=Caddyfile.ip/' .env      # macOS: sed -i '' ...
./scripts/deploy.sh
```

Mở `http://45.66.128.86/` để xem thử. Ở chế độ này:

- **Giọng đọc và lưu tiến độ** vẫn hoạt động bình thường.
- **Micro và cài PWA** không dùng được, vì trình duyệt yêu cầu HTTPS.
- **Chỉ nên dùng để thử nghiệm.** Dữ liệu truyền đi không được mã hóa.

### 4b. DNS đã trỏ đúng: bật HTTPS cho zuimo.io.vn

```bash
cd deploy
sed -i 's/^CADDYFILE=.*/CADDYFILE=Caddyfile/' .env
./scripts/deploy.sh
```

`deploy.sh` tự chạy `check-dns.sh` trước, và dừng lại nếu DNS chưa đúng, để Caddy không xin chứng chỉ thất bại liên tục. Khi thành công, script in ra:

```
[+] OK: https://zuimo.io.vn/ trả về 200
    https://www.zuimo.io.vn/         -> 301 https://zuimo.io.vn/
    http://45.66.128.86/             -> 301 https://zuimo.io.vn/
```

Caddy tự xin chứng chỉ Let's Encrypt cho cả `zuimo.io.vn` và `www.zuimo.io.vn`, tự gia hạn, và gửi header HSTS (1 năm). Chứng chỉ nằm trong volume `zuimo_caddy_data`. **Không xoá volume này**, vì xin cấp lại nhiều lần sẽ bị giới hạn số lượt.

Kiểm tra sau khi lên HTTPS:

- **Ảnh xem trước khi chia sẻ link:** dán `https://zuimo.io.vn` vào Zalo hoặc Facebook, hoặc dùng công cụ Sharing Debugger của Facebook.
- **Manifest PWA:** mở DevTools → Application → Manifest, phải thấy tên Zuimó và đủ 3 icon.
- **Chấm điểm TLS:** kiểm tra trên SSL Labs, kỳ vọng hạng A.

Sau khi có HTTPS, bạn đăng ký hai dịch vụ đăng nhập (làm ở giai đoạn 1, khi đã có backend):

- **Google OAuth:** redirect URI dự kiến `https://zuimo.io.vn/api/auth/callback/google`.

## 4c. Bật backend (tài khoản thật, đồng bộ tiến độ)

```bash
cd /opt/zuimo/deploy
bash scripts/init-secrets.sh      # sinh POSTGRES_PASSWORD và AUTH_SECRET vào .env
docker compose up -d --build      # dựng thêm 2 service: db (PostgreSQL 16) và api (Node)
docker compose ps                 # web, api, db đều phải healthy
curl -s https://zuimo.io.vn/api/health
```

Sau khi API chạy, giao diện tự chuyển sang chế độ máy chủ: đăng ký và đăng nhập lưu trong PostgreSQL,
tiến độ đồng bộ giữa các thiết bị. Không có API thì web vẫn chạy ở chế độ lưu trình duyệt.

Bật đăng nhập Google: điền `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` vào `deploy/.env` rồi `docker compose up -d`. Chi tiết trong `docs/auth-oauth.md`.

Sao lưu database (nên đặt cron hằng ngày):

```bash
bash scripts/backup-db.sh
echo '15 3 * * * /opt/zuimo/deploy/scripts/backup-db.sh >> /var/log/zuimo-backup.log 2>&1' | crontab -
```

## 4d. Nạp từ điển (một lần, và khi muốn cập nhật dữ liệu)

```bash
cd /opt/zuimo/deploy
docker compose up -d --build              # api có migration 002 (bảng từ điển) và script nạp
docker compose exec api node tools/import-dict.mjs   # ~30 giây, tải 3 file từ GitHub rồi ghi vào PostgreSQL
curl -s "https://zuimo.io.vn/api/dict/search?q=nihao" | head -c 200
```

Database tăng khoảng 250 MB (bảng và chỉ mục trigram). Script chạy lại an toàn.

## 4e. Âm thanh cho Luyện nghe (Azure Neural TTS, gói miễn phí)

1. Tạo tài nguyên **Speech** trên portal.azure.com (gói F0 miễn phí), lấy `Key` và `Region` (ví dụ `southeastasia`).
2. Sinh MP3 (một lần, khoảng 5–10 phút cho 2.600 câu):

```bash
cd /opt/zuimo/deploy
docker compose up -d --build                                   # api có migration 003 + script gen-audio
docker compose exec api node tools/import-dict.mjs             # nạp lại để câu ví dụ có cấp độ
chown -R 1000:1000 media                                       # api chạy bằng user node (uid 1000)
# điền AZURE_SPEECH_KEY / AZURE_SPEECH_REGION vào .env rồi docker compose up -d
docker compose exec api node tools/gen-audio.mjs
ls media/audio/s | wc -l                                       # ≈ 5.200 file (mỗi câu 2 tốc độ)
curl -sI https://zuimo.io.vn/media/audio/s/1.mp3 | head -3     # 200, audio/mpeg (media gắn tại /media trong container web)
```

Thư mục `deploy/media/` nằm ngoài `site/` nên `rsync --delete site/` không đụng tới. Nhớ thêm `--exclude 'media/'` khi đồng bộ `deploy/`.

Đặt quyền admin cho tài khoản của bạn để thêm clip YouTube:

```bash
docker compose exec api node tools/admin.mjs grant <tên đăng nhập>      # rồi đăng xuất, đăng nhập lại để thấy menu Quản trị
```

## 4f. Luyện thi HSK (v17)

```bash
cd /opt/zuimo/deploy
docker compose up -d --build                        # migration 006
docker compose exec api node tools/import-dict.mjs  # cặp hỏi-đáp cho đề nghe
docker compose exec api node tools/gen-audio.mjs    # thêm âm thanh ~1.231 từ đơn + cụm chuẩn (~10.000 ký tự Azure)
```

## 4g. Ảnh thật cho đề thi (Pexels, miễn phí)

1. Đăng ký key tại pexels.com/api (không cần thẻ), điền `PEXELS_API_KEY=...` vào `.env`, `docker compose up -d`.
2. Vào Công cụ → Quản trị → Thư viện ảnh từ vựng: chọn HSK 1, lọc "Chưa có ảnh", bấm từng từ, chọn ảnh phù hợp. Sau khi chọn,
   công cụ tự nhảy sang từ chưa có ảnh kế tiếp. Khoảng 180 từ HSK 1 mất chừng 30 phút.
3. Kiểm tra: `ls media/img | wc -l`; thi thử HSK 1 sẽ thấy ảnh thật thay emoji.

## 4h. Ngân hàng đề thi (v19)

```bash
cd /opt/zuimo/deploy
docker compose up -d --build                                    # migration 008
docker compose exec api node tools/gen-audio.mjs                # số câu n1–n50 + câu hỏi chuẩn (nếu chưa có)
docker compose exec api node tools/build-exam-bank.mjs --per 10 --replace   # 10 đề mỗi cấp, cả HSK 2.0 và 3.0
```

Chạy lại `build-exam-bank.mjs --replace` sau khi thêm ảnh thật để đề dùng ảnh mới (đề đã làm của người dùng vẫn giữ nguyên nội dung cũ).

## 4i. Nhập đề thật (v21: làm trên web)

Công cụ → Quản trị → **Nhập đề thật**: chọn file PDF + MP3 cùng tên (H20901.pdf, H20901.mp3), chờ tải xong, bấm **Nhập**.
Log chạy hiện ngay dưới, 2–5 phút mỗi đề (có Azure thì lâu hơn vì nhận dạng băng). Nhập lại thì ghi đè đề cùng mã.
Cách dòng lệnh dưới đây vẫn dùng được.

## 4i'. Nhập đề thật bằng dòng lệnh (v20)

```bash
cd /opt/zuimo/deploy
mkdir -p media/import && chown -R 1000:1000 media
# chép PDF + MP3 của đề vào media/import/ (ví dụ H20901.pdf, H20901.mp3), rồi:
docker compose up -d --build            # image mới có ffmpeg, python3, PyMuPDF (build lâu hơn lần đầu, ~2 phút)
docker compose exec api node tools/import-exam.mjs /app/media/import/H20901.pdf /app/media/import/H20901.mp3 --level 2
```

Có `AZURE_SPEECH_KEY` trong `.env` thì băng được căn theo nhận dạng giọng nói (chính xác; tốn ~26 phút hạn mức STT cho một đề,
kết quả cache trong `media/import/import-2/stt.json`). Không có key thì căn theo khoảng lặng: vào Quản trị → Đề thật đã nhập,
nghe từng câu, lệch thì sửa mốc rồi bấm Cắt lại.

## 5. Cập nhật bản mới

Mỗi lần có bản build mới:

```bash
# build.py tự ghi deploy/site/ (index.html + icon + manifest)
cd prototype && python3 build.py
cd ../deploy && ./scripts/deploy.sh
```

Script tự thực hiện các bước sau:

1. Ghi file tạm rồi đổi tên, nên người dùng không bao giờ tải phải file dở dang.
2. Lưu 10 bản gần nhất để rollback.
3. Kéo image Caddy mới nhất.
4. Reload Caddy nóng, không ngắt kết nối.
5. Kiểm tra trang trả về HTTP 200.

HTML được gửi kèm `Cache-Control: no-cache`, nên người dùng nhận bản mới ngay.

## 6. Quay về bản trước

```bash
ssh zuimo 'bash /opt/zuimo/scripts/rollback.sh'      # liệt kê các bản đã lưu
ssh zuimo 'bash /opt/zuimo/scripts/rollback.sh 2'    # quay về bản ngay trước bản hiện tại
```

## 7. Vận hành hằng ngày

```bash
ssh zuimo
cd /opt/zuimo
docker compose ps                         # trạng thái, kèm healthcheck
docker compose logs -f --tail 100         # log Caddy (khởi động, cấp chứng chỉ, lỗi)
tail -f logs/access.log | jq -c '{t:.ts, ip:.request.remote_ip, uri:.request.uri, s:.status}'
docker compose exec web caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker stats --no-stream
```

**Sao lưu.** Nội dung web đã có sẵn trong `releases/`. Thứ duy nhất cần sao lưu thêm là volume chứng chỉ:

```bash
docker run --rm -v zuimo_caddy_data:/data -v /opt/zuimo:/backup alpine \
  tar czf /backup/caddy_data-$(date +%F).tgz -C /data .
```

**Giám sát.** Nên có một uptime check bên ngoài gọi `https://zuimo.io.vn/` mỗi phút (ví dụ Uptime Kuma trên node khác trong fleet). Healthcheck trong compose chỉ biết Caddy còn chạy, không biết trang có truy cập được từ Internet hay không.

## 8. Xử lý sự cố

| Triệu chứng | Kiểm tra | Cách xử lý |
|---|---|---|
| `deploy.sh` dừng ở bước kiểm tra DNS | `./scripts/check-dns.sh` | Sửa bản ghi A/AAAA, chờ TTL hết (5 phút), hoặc tạm dùng `CADDYFILE=Caddyfile.ip` |
| `deploy.sh` báo không trả về 200 | `docker compose logs --tail 50` | Thường do Caddyfile sai: chạy `caddy validate` như ở mục 7 |
| Truy cập theo IP bị treo | `sudo nft list ruleset`, `ss -ltnp` | Mở 80/443 ở firewall của nhà cung cấp |
| Caddy không cấp được chứng chỉ | log có `challenge failed` | DNS chưa trỏ đúng, hoặc cổng 80 bị chặn (Let's Encrypt cần cổng 80 hoặc 443 từ Internet) |
| Mất kết nối container sau `systemctl restart nftables` | `sudo nft list ruleset \| grep -c DOCKER` | `sudo systemctl restart docker` để Docker ghi lại rule |
| Lỡ tự khóa SSH | Console VNC của VirtFusion | Xóa `/etc/ssh/sshd_config.d/10-zuimo.conf`, rồi `systemctl restart ssh` |
| Trang trắng, console báo `Refused to …` | DevTools → Console | CSP đang chặn một tài nguyên mới: thêm nguồn đó vào `Content-Security-Policy` trong Caddyfile |

## 9. Dựng lại giao diện và nội dung

Mã giao diện nằm ở `web/src/` (Vite, ES module). Nội dung học được xuất thành file JSON tải theo nhu cầu.

```bash
# nội dung (khi sửa từ vựng, hội thoại, ngữ pháp)
pip install pypinyin jieba
cd content-pipeline && python3 compile_vi.py && python3 build_content.py --src <thư-mục-nguồn> && python3 build_books.py

# giao diện
cd ../web
npm ci
npm run data          # content/build -> public/data
npm run build         # -> dist/
rm -rf ../deploy/site && cp -r dist ../deploy/site
```

Trên VPS chỉ cần chép `deploy/site/` mới lên `/opt/zuimo/deploy/site/`. Caddy phục vụ file tĩnh nên không phải khởi động lại;
JS/CSS có hash trong tên nên trình duyệt tự lấy bản mới, còn `data/*.json` cache 1 giờ.

## 10. Nhận diện thương hiệu

Asset web được tạo từ bộ logo gốc bằng `brand/build_brand.py`:

- **Logo nền sáng/tối:** logo nền tối được đổi màu nét sang trắng và giữ nguyên chấm cam.
- **Favicon SVG:** tự đổi theo giao diện của hệ điều hành.
- **Icon PWA:** kích thước 192, 512 và bản maskable 512.
- **Ảnh chia sẻ:** kích thước 1200×630.

Các file `.svg` gốc chỉ bọc ảnh PNG nhỏ (tối đa 236 px), nên icon lớn sẽ hơi mềm. Khi có bản xuất vector thật hoặc PNG từ 1024 px trở lên, đặt vào `brand/src/` cùng tên, rồi chạy lại:

```bash
python3 brand/build_brand.py && cd prototype && python3 build.py && cd ../deploy && ./scripts/deploy.sh
```
