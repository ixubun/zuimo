#!/usr/bin/env bash
# rollback.sh – quay về bản web trước (chạy TRÊN VPS).
#   bash /opt/zuimo/scripts/rollback.sh          # liệt kê các bản đã lưu
#   bash /opt/zuimo/scripts/rollback.sh 2        # quay về bản mới thứ 2 (bản ngay trước bản hiện tại)
set -Eeuo pipefail
APP_DIR="${APP_DIR:-/opt/zuimo}"
cd "$APP_DIR"
mapfile -t list < <(ls -1t releases/index-*.html 2>/dev/null)
(( ${#list[@]} )) || { echo "Chưa có bản lưu nào."; exit 1; }
if [[ -z "${1:-}" ]]; then
  for i in "${!list[@]}"; do printf '%2d  %s\n' "$((i + 1))" "${list[$i]}"; done
  exit 0
fi
pick="${list[$(( $1 - 1 ))]:?Số thứ tự không hợp lệ}"
cp "$pick" site/.index.tmp && mv site/.index.tmp site/index.html   # đổi tên nguyên tử
echo "Đã quay về $pick (không cần khởi động lại Caddy)."
