#!/usr/bin/env bash
# =============================================================================
# bootstrap-vps.sh – chuẩn bị VPS Debian 13 (trixie) cho ZUIMO. Chạy MỘT lần bằng root.
#
#   scp -P 22 scripts/bootstrap-vps.sh root@<IP>:/root/
#   ssh -p 22 root@<IP> 'DEPLOY_USER=zuimo SSH_PORT=1812 bash /root/bootstrap-vps.sh'
#
# Làm gì:
#   1. Cập nhật hệ thống, cài gói cơ bản, bật unattended-upgrades (vá bảo mật tự động)
#   2. Tạo user deploy (sudo + docker), chép SSH key của root sang
#   3. SSH: đổi cổng, tắt đăng nhập mật khẩu và root – GIỮ cổng 22 mở cho tới khi bạn tự xác nhận
#   4. Tường lửa nftables: chỉ mở SSH, 80, 443 (tcp+udp cho HTTP/3)
#   5. Cài Docker Engine + Compose plugin từ repo chính thức của Docker
#   6. Cài fail2ban cho SSH
#
# Thiết kế an toàn:
#   - Script idempotent: chạy lại không gây hỏng.
#   - Không tự đóng cổng 22: tránh tự khoá mình ngoài. Đóng bằng: bash bootstrap-vps.sh --close-22
#   - Dùng nftables trực tiếp thay cho ufw vì Docker ghi rule iptables-nft riêng; hai bên
#     cùng tồn tại được, còn ufw hay gây hiểu nhầm "đã chặn" trong khi Docker vẫn mở cổng.
# =============================================================================
set -Eeuo pipefail

DEPLOY_USER="${DEPLOY_USER:-zuimo}"
SSH_PORT="${SSH_PORT:-1812}"
APP_DIR="${APP_DIR:-/opt/zuimo}"

log()  { printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
trap 'die "Lỗi ở dòng $LINENO: $BASH_COMMAND"' ERR

[[ $EUID -eq 0 ]] || die "Cần chạy bằng root."
. /etc/os-release
[[ "$ID" == "debian" ]] || warn "Script viết cho Debian, hệ điều hành hiện tại: $PRETTY_NAME"

write_nft() {
  local extra_22="$1"
  cat > /etc/nftables.conf <<EOF
#!/usr/sbin/nft -f
# Quản lý bởi bootstrap-vps.sh (ZUIMO). Chỉ định nghĩa bảng inet filter;
# không flush toàn bộ ruleset để không xoá chain do Docker tạo.
table inet filter
delete table inet filter
table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    ct state established,related accept
    ct state invalid drop
    iif "lo" accept
    ip protocol icmp icmp type { echo-request, destination-unreachable, time-exceeded } limit rate 10/second accept
    ip6 nexthdr icmpv6 accept
    tcp dport ${SSH_PORT} ct state new limit rate 30/minute accept
${extra_22}
    tcp dport { 80, 443 } accept
    udp dport 443 accept
  }
  chain forward {
    type filter hook forward priority 0; policy accept;   # Docker tự quản lý forward cho container
  }
  chain output {
    type filter hook output priority 0; policy accept;
  }
}
EOF
  nft -c -f /etc/nftables.conf           # kiểm tra cú pháp trước khi áp dụng
  systemctl enable --now nftables >/dev/null
  nft -f /etc/nftables.conf
}

# --- Chế độ đóng cổng 22 sau khi đã xác nhận SSH cổng mới hoạt động ---------
if [[ "${1:-}" == "--close-22" ]]; then
  rm -f /etc/ssh/sshd_config.d/05-zuimo-keep22.conf
  systemctl restart ssh
  write_nft ""
  log "Đã đóng cổng 22. SSH chỉ còn cổng ${SSH_PORT}."
  exit 0
fi

# --- 1. Hệ thống --------------------------------------------------------------
log "Cập nhật hệ thống"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get -y -qq upgrade
apt-get -y -qq install ca-certificates curl gnupg nftables fail2ban unattended-upgrades \
  apt-listchanges sudo rsync htop jq tzdata

timedatectl set-timezone Asia/Ho_Chi_Minh || true
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# Swap 2 GB nếu VPS chưa có (tránh OOM khi build hoặc chạy AI sau này)
if ! swapon --show | grep -q .; then
  log "Tạo swap 2G"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- 2. User deploy -----------------------------------------------------------
if ! id "$DEPLOY_USER" &>/dev/null; then
  log "Tạo user $DEPLOY_USER"
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"
visudo -cf "/etc/sudoers.d/90-$DEPLOY_USER" >/dev/null

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
if [[ -s /root/.ssh/authorized_keys ]]; then
  cat /root/.ssh/authorized_keys >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
  sort -u -o "/home/$DEPLOY_USER/.ssh/authorized_keys" "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
else
  die "root chưa có SSH key (/root/.ssh/authorized_keys). Chép key lên trước: ssh-copy-id root@<IP>"
fi

# --- 3. SSH -------------------------------------------------------------------
log "Cấu hình SSH: cổng $SSH_PORT (giữ tạm cổng 22)"
cat > /etc/ssh/sshd_config.d/10-zuimo.conf <<EOF
Port ${SSH_PORT}
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
AllowUsers ${DEPLOY_USER}
X11Forwarding no
EOF
# Giữ cổng 22 song song cho tới khi chạy --close-22
echo "Port 22" > /etc/ssh/sshd_config.d/05-zuimo-keep22.conf
sshd -t
# Debian có thể dùng socket activation (ssh.socket); nếu có thì tắt để sshd tự nghe theo cấu hình
if systemctl is-enabled ssh.socket &>/dev/null; then
  systemctl disable --now ssh.socket
  systemctl enable ssh.service
fi
systemctl restart ssh

# --- 4. Tường lửa -------------------------------------------------------------
log "Tường lửa nftables"
write_nft "    tcp dport 22 ct state new limit rate 30/minute accept"

cat > /etc/fail2ban/jail.d/sshd.local <<EOF
[sshd]
enabled  = true
port     = ${SSH_PORT},22
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban

# --- 5. Docker ----------------------------------------------------------------
if ! command -v docker &>/dev/null; then
  log "Cài Docker Engine"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  CODENAME="$VERSION_CODENAME"
  # Nếu repo Docker chưa có bản cho codename hiện tại thì dùng bookworm (tương thích)
  if ! curl -fsI "https://download.docker.com/linux/debian/dists/${CODENAME}/Release" >/dev/null; then
    warn "Repo Docker chưa hỗ trợ ${CODENAME}, dùng bookworm"
    CODENAME=bookworm
  fi
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get -y -qq install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$DEPLOY_USER"

# Giới hạn log container toàn cục, tránh đầy ổ đĩa
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
systemctl enable --now docker >/dev/null
systemctl restart docker

# --- 6. Thư mục ứng dụng ------------------------------------------------------
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/site" "$APP_DIR/logs" "$APP_DIR/releases"

log "Xong. Kiểm tra ngay trong MỘT CỬA SỔ TERMINAL MỚI (đừng đóng phiên hiện tại):"
echo "    ssh -p ${SSH_PORT} ${DEPLOY_USER}@$(curl -fs4 https://ifconfig.me || hostname -I | awk '{print $1}')"
echo "Nếu vào được, đóng cổng 22 bằng:  sudo bash /root/bootstrap-vps.sh --close-22"
