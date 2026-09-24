#!/usr/bin/env bash
# restore-db.sh <file.sql.gz> – khôi phục database từ bản sao lưu.
# CẢNH BÁO: xoá sạch dữ liệu hiện tại. Dừng API trước để không có ghi mới xen vào.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
f="${1:?Cách dùng: scripts/restore-db.sh backups/zuimo-YYYYmmdd-HHMMSS.sql.gz}"
[[ -s "$f" ]] || { echo "Không thấy file $f"; exit 1; }
read -r -p "Xoá dữ liệu hiện tại và khôi phục từ $f? (nhập YES để tiếp tục) " ans
[[ "$ans" == "YES" ]] || { echo "Đã huỷ."; exit 1; }

docker compose stop api
docker compose exec -T db psql -U zuimo -d postgres -c "DROP DATABASE IF EXISTS zuimo WITH (FORCE);"
docker compose exec -T db psql -U zuimo -d postgres -c "CREATE DATABASE zuimo OWNER zuimo;"
gunzip -c "$f" | docker compose exec -T db psql -U zuimo -d zuimo -v ON_ERROR_STOP=1
docker compose start api
echo "Đã khôi phục xong. Kiểm tra: curl -s https://\$SITE_DOMAIN/api/health"
