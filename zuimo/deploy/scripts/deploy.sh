#!/usr/bin/env bash
# =============================================================================
# deploy.sh – đẩy bản web mới lên VPS (chạy trên máy của bạn, từ thư mục deploy/)
#
#   ./scripts/deploy.sh                              # mặc định lên 45.66.128.86, cổng SSH 1812, user zuimo
#   DEPLOY_HOST=zuimo DEPLOY_PORT=1812 ./scripts/deploy.sh   # hoặc dùng alias trong ~/.ssh/config
#
# Luồng: kiểm tra file -> rsync cấu hình + site (ghi tạm rồi đổi tên: người dùng không bao giờ
# nhận file dở dang) -> lưu bản sao để rollback -> docker compose up -d -> reload Caddy -> kiểm tra HTTP.
# =============================================================================
set -Eeuo pipefail

HOST="${DEPLOY_HOST:-45.66.128.86}"
PORT="${DEPLOY_PORT:-1812}"
USER_="${DEPLOY_USER:-zuimo}"
APP_DIR="${APP_DIR:-/opt/zuimo}"
KEEP="${KEEP_RELEASES:-10}"

cd "$(dirname "$0")/.."
die() { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
log() { printf '\033[1;32m[+]\033[0m %s\n' "$*"; }

[[ -s site/index.html ]] || die "Không thấy site/index.html"
[[ -f .env ]] || die "Chưa có .env – chép từ .env.example rồi sửa SITE_ADDRESS/ACME_EMAIL"
# shellcheck disable=SC1091
set -a; . ./.env; set +a
for v in CADDYFILE SITE_DOMAIN SERVER_IP ACME_EMAIL; do [[ -n "${!v:-}" ]] || die ".env thiếu $v"; done
[[ -f "$CADDYFILE" ]] || die "Không có file cấu hình $CADDYFILE"
# Chặn nhầm file hỏng: trang phải là bản build Zuimó
grep -q 'Zuimó' site/index.html || die "site/index.html không giống bản build Zuimó"
if [[ "$CADDYFILE" == "Caddyfile" ]]; then
  log "Chế độ domain: kiểm tra DNS trước khi để Caddy xin chứng chỉ"
  ./scripts/check-dns.sh || die "DNS chưa đúng. Sửa DNS, hoặc tạm đặt CADDYFILE=Caddyfile.ip trong .env"
fi

SSH=(ssh -p "$PORT" -o StrictHostKeyChecking=accept-new "$USER_@$HOST")
RSYNC=(rsync -az --delay-updates -e "ssh -p $PORT -o StrictHostKeyChecking=accept-new")

log "Đồng bộ cấu hình"
"${RSYNC[@]}" docker-compose.yml Caddyfile Caddyfile.ip site.caddy .env "$USER_@$HOST:$APP_DIR/"
"${SSH[@]}" "chmod 600 $APP_DIR/.env && mkdir -p $APP_DIR/logs $APP_DIR/releases $APP_DIR/site $APP_DIR/scripts"
"${RSYNC[@]}" scripts/rollback.sh "$USER_@$HOST:$APP_DIR/scripts/"

log "Đồng bộ nội dung web"
"${RSYNC[@]}" --delete site/ "$USER_@$HOST:$APP_DIR/site/"

log "Khởi động / cập nhật dịch vụ"
"${SSH[@]}" bash -s -- "$APP_DIR" "$KEEP" <<'REMOTE'
set -Eeuo pipefail
APP_DIR="$1"; KEEP="$2"
cd "$APP_DIR"
ts=$(date +%Y%m%d-%H%M%S)
cp site/index.html "releases/index-$ts.html"
# giữ lại KEEP bản gần nhất để rollback
ls -1t releases/index-*.html | tail -n +"$((KEEP + 1))" | xargs -r rm -f
docker compose pull -q
docker compose up -d --remove-orphans
# Caddyfile được bind-mount nên "up -d" không tự nhận thay đổi: reload nóng, không ngắt kết nối
docker compose exec -T web caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose ps
REMOTE

log "Kiểm tra từ bên ngoài"
if [[ "$CADDYFILE" == "Caddyfile" ]]; then URL="https://$SITE_DOMAIN/"; else URL="http://$SERVER_IP/"; fi
for _ in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" || true)
  if [[ "$code" == "200" ]]; then
    log "OK: $URL trả về 200"
    if [[ "$CADDYFILE" == "Caddyfile" ]]; then
      for u in "https://www.$SITE_DOMAIN/" "http://$SERVER_IP/"; do
        printf '    %-32s -> %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 "$u")"
      done
    fi
    exit 0
  fi
  sleep 5   # lần đầu Caddy cần vài giây để xin chứng chỉ
done
die "$URL chưa trả về 200 (mã: ${code:-không phản hồi}). Xem log: ssh -p $PORT $USER_@$HOST 'cd $APP_DIR && docker compose logs --tail 50'"
