-- Zuimó – lược đồ ban đầu.
-- Nguyên tắc: tách user (danh tính) khỏi account (cách đăng nhập) để một người dùng
-- có thể vừa có mật khẩu, vừa liên kết Google và Zalo.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  username      text        UNIQUE CHECK (username ~ '^[a-z0-9._]{3,24}$'),
  email         text        UNIQUE,                    -- có thể NULL: Zalo không trả về email
  email_verified boolean    NOT NULL DEFAULT false,
  avatar_url    text,
  locale        text        NOT NULL DEFAULT 'vi',
  is_admin      boolean     NOT NULL DEFAULT false,
  disabled_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- so sánh email không phân biệt hoa thường
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('password','google','zalo')),
  provider_uid  text,                                  -- id bên nhà cung cấp; NULL với 'password'
  password_hash text,                                  -- chỉ dùng cho provider='password'
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT accounts_shape CHECK (
    (provider = 'password' AND password_hash IS NOT NULL AND provider_uid IS NULL) OR
    (provider <> 'password' AND provider_uid IS NOT NULL AND password_hash IS NULL)
  )
);
-- mỗi nhà cung cấp chỉ gắn một lần cho mỗi tài khoản bên đó, và mỗi user chỉ một account mỗi provider
CREATE UNIQUE INDEX IF NOT EXISTS accounts_provider_uid_idx ON accounts (provider, provider_uid) WHERE provider_uid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_provider_idx ON accounts (user_id, provider);

CREATE TABLE IF NOT EXISTS sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,                   -- chỉ lưu SHA-256 của token, lộ DB cũng không đăng nhập được
  user_agent  text,
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- Tiến độ học: một tài liệu JSON cho mỗi người dùng + số phiên bản để phát hiện xung đột giữa các thiết bị
CREATE TABLE IF NOT EXISTS progress (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version    integer NOT NULL DEFAULT 1,
  doc        jsonb   NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- XP theo ngày tách riêng để tính chuỗi ngày, bảng xếp hạng và thống kê mà không phải mở JSON
CREATE TABLE IF NOT EXISTS activity_days (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     date NOT NULL,
  xp      integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS activity_days_day_idx ON activity_days (day);

-- Lịch sử đăng nhập và thao tác nhạy cảm, phục vụ điều tra sự cố
CREATE TABLE IF NOT EXISTS audit_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log (user_id, created_at DESC);
