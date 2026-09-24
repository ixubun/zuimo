#!/usr/bin/env bash
# init-secrets.sh – sinh POSTGRES_PASSWORD và AUTH_SECRET vào deploy/.env nếu còn trống.
# Chạy MỘT lần trước khi khởi động lần đầu. Đổi AUTH_SECRET sẽ làm mọi phiên đăng nhập hết hiệu lực.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] || cp .env.example .env

fill() {                       # fill TÊN_BIẾN <giá trị>
  local key="$1" val="$2"
  if grep -q "^${key}=.\\+" .env; then
    echo "  giữ nguyên ${key} (đã có giá trị)"
  else
    # xoá dòng cũ (nếu rỗng) rồi ghi lại, tránh trùng khoá
    sed -i.bak "/^${key}=/d" .env && rm -f .env.bak
    printf '%s=%s\n' "$key" "$val" >> .env
    echo "  đã sinh ${key}"
  fi
}
fill POSTGRES_PASSWORD "$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)"
fill AUTH_SECRET "$(openssl rand -base64 32)"
chmod 600 .env
echo "Xong. Kiểm tra lại: grep -E '^(POSTGRES_PASSWORD|AUTH_SECRET)=' .env | cut -c1-30"
