# CLAUDE.md – Zuimó

Web app học tiếng Trung (HSK 2.0 / 3.0) cho người Việt: giáo trình, từ điển, luyện nghe/viết/phát âm, thi thử HSK.
Tài liệu chi tiết: `README.md` (lịch sử phiên bản), `web/README.md`, `docs/backend.md`, `deploy/README-DEPLOY.md`.

## ⛔ Quy tắc bắt buộc về file .env

- **KHÔNG BAO GIỜ tạo, ghi đè, sửa, xoá hay đổi tên bất kỳ file `.env` nào** (`deploy/.env`, `server/.env`…) khi chưa được người dùng cho phép rõ ràng trong đúng lần đó.
  File này chứa key không thể thay đổi (`AUTH_SECRET`, `POSTGRES_PASSWORD`, key Google/Azure/Pexels); đổi `AUTH_SECRET` làm mất mọi phiên đăng nhập,
  đổi `POSTGRES_PASSWORD` làm API không kết nối được DB đã khởi tạo.
- Không chạy lệnh có thể ghi vào `.env` khi chưa hỏi: `scripts/init-secrets.sh`, `sed -i … .env`, `cp … .env`, `echo … >> .env`.
- Không in nội dung `.env` ra màn hình, không chép giá trị key vào code, log, tài liệu hay commit.
- Cần thêm biến môi trường mới: sửa `server/src/config.js`, `deploy/docker-compose.yml`, `server/.env.example`,
  rồi **báo người dùng** tên biến cần tự thêm vào `.env`.

## Cấu trúc thư mục

```
content-pipeline/  Python: gộp nguồn mở + nội dung Việt -> content/build/*.json
content/           vi/src/*.txt (nội dung Zuimó tự soạn, dạng `khoá ‖ giá trị`), books/*.tsv, build/*.json
web/               Giao diện: Vite 6, JS thuần (ES module), không framework
  src/core/        dom.js ($, $$, esc, view), state.js (S, store, saveP), util.js (tr, num…), icons.js, sync.js (API)
  src/content/     data.js (tải dữ liệu theo nhu cầu, needsFor), books.js, sample.js
  src/features/    session, level-session, pinyin, speech, xp, writer
  src/ui/nav.js    menu dọc, thanh trên
  src/views/       mỗi trang một file
  src/app/         router.js (VIEWS, go, render), actions.js (bảng ACT, event delegation)
  public/data/     JSON sinh bởi `npm run data` – không sửa tay
server/            API: Node 22 thuần, chỉ phụ thuộc `pg`
  src/             index.js, http.js (router, HttpError, rateLimit), config.js, db.js (q, tx), mỗi chức năng một module
  migrations/      NNN_ten.sql, tự chạy khi khởi động
  tools/           script .mjs chạy trong container (import-dict, gen-audio, admin, build-exam-bank, import-exam)
deploy/            docker-compose (Caddy + PostgreSQL 16 + api), Caddyfile, site.caddy (CSP), scripts/*.sh
  site/            bản build của web/ – không sửa tay, sinh bằng `npm run build` rồi chép dist/
prototype/         BẢN LƯU giai đoạn một-file. Không sửa, không build từ đây
brand/             logo gốc + build_brand.py
```

## Thư viện và công nghệ

- Frontend: `vite` (dev), `hanzi-writer` (tách chunk riêng); `public/vendor/hanzilookup.min.js` (GPL-3, giữ file riêng, không bundle).
- Backend: Node ≥ 22 dùng `node:http`, `node:crypto`, `fetch` có sẵn; duy nhất `pg`. **Không thêm framework (Express, Fastify…) hay ORM.**
  Thêm phụ thuộc mới phải hỏi người dùng trước.
- DB: PostgreSQL 16 (JSONB, pg_trgm). Dịch vụ ngoài: Azure Speech, Google OAuth, Pexels, YouTube IFrame API.
- Công cụ: ffmpeg, Python 3 + PyMuPDF (trong image api); `pypinyin`, `jieba` cho content-pipeline.

## Quy ước code chung

- Comment, thông báo lỗi, log `msg`, tài liệu: **tiếng Việt**. Comment giải thích *vì sao*, không lặp lại code.
- 2 dấu cách thụt lề, nháy đơn, có dấu chấm phẩy. Không TypeScript, không JSX.
- Đặt tên:
  - biến/hàm `camelCase` (`loadSentences`, `pullProgress`, `clearPersonalData`);
  - hằng số và bảng tra `UPPER_SNAKE` (`MAX_DOC_BYTES`, `SCRYPT`, `TOPIC_VI`, `DEFAULT_P`);
  - trạng thái toàn cục viết tắt một chữ hoa: `S` (state), `P` (phiên luyện tập), `C` (thẻ nhớ), `L` (alias `S.<view>` trong view);
  - tiền tố động từ: `render*`, `load*`, `mount*`, `reset*`, `show*`, `is*`;
  - SQL: bảng/cột `snake_case`; JSON trả về cho client `camelCase` (`updatedAt`, `avatarUrl`).
- Mã HSK: `ver` là `'20'` (HSK 2.0) hoặc `'30'` (HSK 3.0), `lvl` là số cấp. Khoá nội dung sách: `20-5` (quyển 1), `20b2-5` (quyển 2).
- Tách đoạn bằng dòng mốc `/* ---------- Tên đoạn ---------- */`; đầu module lớn có khối comment mô tả mục đích.

## Frontend (web/src)

- Trang mới: tạo `views/x.js`, export `renderX()`, đăng ký trong `VIEWS` (`app/router.js`).
- Vẽ bằng template string gán `view.innerHTML`; **mọi dữ liệu người dùng/API phải qua `esc()`**.
- Chuỗi hiển thị luôn hai thứ tiếng: `tr('Tiếng Việt', 'English')`.
- Hành động nút: `data-act="ten"` + `data-arg="…"`; hàm đặt trong bảng `XXX_ACT` của view rồi spread vào `ACT` (`actions.js`). Không gắn listener trực tiếp vào phần tử bị vẽ lại.
- Trạng thái riêng của view: `S.x = S.x || { … }` ở đầu module; tải dữ liệu API một lần theo `loadedKey`, không fetch trong mỗi lần render (từng gây treo trang).
- Dữ liệu học tĩnh: khai báo trong `needsFor()` (`content/data.js`), không fetch trực tiếp trong view.
- Gọi API: `API.call(path, { method, body })` từ `core/sync.js`; cookie HttpOnly, không giữ token trong JS.
- Lưu trình duyệt qua `store.get/set/del` (tiền tố `zuimo:`). Dữ liệu cá nhân mới phải thêm vào `clearPersonalData()` (core/state.js).
- Cập nhật DOM tại chỗ khi cần giữ `<audio>`/video đang phát (xem `updateItemDom` trong exam), thay vì `render()` lại cả trang.
- Kiểu viết gọn: arrow một tham số không ngoặc (`x => …`), hàm dùng `function`, export gom cuối file `export { … }` (module mới có thể dùng `export const`).
- CSS ở `styles/app.css`: dùng biến màu có sẵn (`--jade`, `--verm`, `--sun`, `--ink*`, `--surface*`, `--t1..t5` màu thanh điệu), phải chạy đúng cả dark mode; class ngắn, kebab-case.
- Công thức cấp độ ở `views/home.js` phải khớp `server/src/level.js`.

## Backend (server/src)

- Module mới export `mountX(router)` và được gọi trong `index.js`. Route khai báo đường dẫn cố định: `router.get/post/put/del('/api/…', async (req, res, url) => …)`.
- Lỗi: `throw bad('ma_loi', 'Thông báo tiếng Việt.')` hoặc `new HttpError(status, code, message)`; không tự `res.end` khi có lỗi.
- Trả JSON bằng `json(res, status, body)`; đọc body bằng `readJson(req)` (giới hạn 2 MB).
- Cần đăng nhập: `const s = await requireUser(req, res)`; admin kiểm tra `is_admin`. Endpoint dễ bị lạm dụng gọi `rateLimit(key, limit, windowMs)`.
- SQL luôn tham số hoá (`$1, $2`) qua `q()`; nhiều câu lệnh liên quan dùng `tx(async c => …)`.
- Log: `console.log(JSON.stringify({ lvl, msg, … }))`, không log mật khẩu, token, key.
- Arrow function trên server có ngoặc tham số (`(v) => …`), export ngay tại khai báo (`export function`, `export const`).
- Cấu hình chỉ đọc qua `cfg` (config.js): `need()` cho biến bắt buộc, `opt()` cho tuỳ chọn.

## Database / migration

- Đổi lược đồ: tạo file mới `server/migrations/NNN_ten.sql` (số kế tiếp). **Không sửa migration đã có.**
- Viết idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`; comment tiếng Việt cho cột có ý nghĩa đặc biệt.
- Giữ giá trị cũ trong ràng buộc để dữ liệu cũ không lỗi (ví dụ `provider='zalo'` vẫn nằm trong CHECK).

## Bảo mật và triển khai

- Nguồn ngoài mới (ảnh, script, iframe, API gọi từ trình duyệt) phải thêm vào CSP trong `deploy/site.caddy`.
- Container: giữ `cap_drop: ALL`, `no-new-privileges`, chạy user `node`; không publish cổng api ra ngoài.
- Không tự chạy lệnh ảnh hưởng máy chủ thật (`deploy.sh`, `rollback.sh`, `restore-db.sh`, `ssh zuimo …`, `docker compose down -v`) khi chưa hỏi.
- Không xoá volume `caddy_data`, `pgdata`, thư mục `deploy/media/`.

## Môi trường

| | Local | Production |
|---|---|---|
| Nơi chạy | `/home/toangthang/Downloads/Zuimó Project/zuimo-v21/zuimo` (gốc repo) | VPS Debian 13, IP `45.66.128.86`, domain `zuimo.io.vn` |
| Thư mục dự án | như trên | `/opt/zuimo` (bản clone git của repo) |
| Compose / .env | `deploy/` | `/opt/zuimo/deploy/` và `/opt/zuimo/deploy/.env` (chỉ nằm trên VPS) |
| SSH | – | người dùng xác nhận cổng 22; tài liệu cũ và `bootstrap-vps.sh` dùng 1812 – hỏi lại nếu SSH lỗi |

## CI/CD (GitHub Actions)

- `.github/workflows/deploy.yml` chạy khi push lên `main` (hoặc bấm tay `workflow_dispatch`), SSH bằng `appleboy/ssh-action@master`.
- Secrets trên GitHub: `ZUIMO_VPS` (IP), `VPS_USER`, `VPS_SSH_KEY`; tuỳ chọn `VPS_PORT` (mặc định 22). Không ghi giá trị secret vào repo.
- Các bước trên VPS: `cd /opt/zuimo` → `git pull --ff-only origin main` → build web bằng container `node:22-alpine` (`npm ci && npm run build`)
  → lưu `site/index.html` cũ vào `deploy/releases/` → `rsync --delete web/dist/ deploy/site/` → `docker compose up -d --build`
  (api tự `npm ci` trong Dockerfile, migration tự chạy) → `caddy reload` → chờ `zuimo-api` healthy.
- `deploy/site/`, `web/dist/`, `node_modules/`, mọi `.env` nằm trong `.gitignore`: VPS tự build, không commit bản build.
- Push lên `main` = deploy production. **Không tự push, commit lên main, hay chạy workflow khi chưa được người dùng cho phép.**
- Workflow không bao giờ ghi `.env`; chỉ kiểm tra `deploy/.env` có tồn tại. Giữ nguyên nguyên tắc này khi sửa workflow.
- Thêm service hoặc bước build mới: cập nhật cả workflow lẫn mục này.
- Rollback bản web: `cd /opt/zuimo/deploy && APP_DIR=/opt/zuimo/deploy bash scripts/rollback.sh [số]`.
  Rollback mã api: `git checkout <commit>` trong `/opt/zuimo` rồi `docker compose up -d --build api` (migration không tự lùi).
- `deploy/scripts/deploy.sh` (rsync từ máy local, bố cục phẳng `/opt/zuimo`) là cách cũ; không dùng song song với CI/CD.

## Lệnh thường dùng

```bash
cd web && npm run dev            # http://localhost:5173, /api proxy sang 127.0.0.1:3100
cd web && npm run data           # content/build -> public/data
cd web && npm run build          # -> dist/, rồi: rm -rf ../deploy/site && cp -r dist ../deploy/site
cd server && npm start           # cần DATABASE_URL, AUTH_SECRET trong môi trường
python3 content-pipeline/compile_vi.py && python3 content-pipeline/build_content.py --src <nguồn> && python3 content-pipeline/build_books.py
```

## Khi hoàn thành tính năng

- Thêm mục phiên bản mới (`## vNN: …`) vào cuối `README.md`: làm gì, file nào, migration/lệnh cần chạy.
- Endpoint mới: thêm vào bảng trong `docs/backend.md`. Bước triển khai mới: thêm vào `deploy/README-DEPLOY.md`.
