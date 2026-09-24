#!/usr/bin/env bash
# backup-db.sh – sao lưu PostgreSQL ra file nén, giữ N bản gần nhất (mặc định 14).
# Đặt vào cron: 15 3 * * * /opt/zuimo/deploy/scripts/backup-db.sh >> /var/log/zuimo-backup.log 2>&1
set -Eeuo pipefail
cd "$(dirname "$0")/.."
KEEP="${KEEP:-14}"
DIR="${BACKUP_DIR:-$PWD/backups}"
mkdir -p "$DIR"
ts=$(date +%Y%m%d-%H%M%S)
file="$DIR/zuimo-$ts.sql.gz"

# pg_dump chạy trong container db; -Fp cho file SQL thuần, dễ đọc và dễ khôi phục từng phần
docker compose exec -T db pg_dump -U zuimo -d zuimo --no-owner | gzip -9 > "$file"

# kiểm tra file không rỗng trước khi xoá bản cũ, tránh trường hợp backup hỏng mà vẫn dọn bản tốt
if [[ ! -s "$file" ]] || [[ $(gzip -t "$file"; echo $?) -ne 0 ]]; then
  echo "LỖI: bản sao lưu $file không hợp lệ"; exit 1
fi
ls -1t "$DIR"/zuimo-*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "OK $(date -Is) $file ($(du -h "$file" | cut -f1))"
