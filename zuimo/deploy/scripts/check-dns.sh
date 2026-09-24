#!/usr/bin/env bash
# check-dns.sh – kiểm tra bản ghi DNS của domain đã trỏ đúng về VPS chưa (chạy trên máy bạn hoặc trên VPS).
# Let's Encrypt kiểm tra cả IPv4 lẫn IPv6: nếu domain có bản ghi AAAA trỏ sai chỗ, việc cấp chứng chỉ sẽ thất bại.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
[[ -f .env ]] && { set -a; . ./.env; set +a; }
DOMAIN="${SITE_DOMAIN:-zuimo.io.vn}"
IP="${SERVER_IP:-45.66.128.86}"
command -v dig >/dev/null || { echo "Cần cài dig: sudo apt install dnsutils (Debian) hoặc bind (macOS có sẵn)"; exit 2; }

ok=0
for name in "$DOMAIN" "www.$DOMAIN"; do
  for resolver in 1.1.1.1 8.8.8.8; do
    a=$(dig +short A "$name" @"$resolver" | grep -E '^[0-9.]+$' | sort | tr '\n' ' ')
    if [[ "$a" == "$IP " ]]; then
      printf '  OK   %-18s A    = %-16s (%s)\n' "$name" "$IP" "$resolver"
    else
      printf '  LỖI  %-18s A    = %-16s cần %s (%s)\n' "$name" "${a:-<trống>}" "$IP" "$resolver"; ok=1
    fi
  done
  aaaa=$(dig +short AAAA "$name" @1.1.1.1 | tr '\n' ' ')
  if [[ -n "$aaaa" ]]; then
    printf '  CHÚ Ý %-17s AAAA = %s -> xoá bản ghi này nếu VPS không dùng IPv6 đó\n' "$name" "$aaaa"
  fi
done
caa=$(dig +short CAA "$DOMAIN" @1.1.1.1 | tr '\n' ' ')
if [[ -n "$caa" && "$caa" != *letsencrypt.org* ]]; then
  echo "  LỖI  CAA của $DOMAIN không cho phép Let's Encrypt: $caa"; ok=1
fi
exit $ok
