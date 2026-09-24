-- Luyện tập: câu nghe có cấp độ và file âm thanh, clip YouTube do admin thêm, kết quả từng lần luyện.

-- cấp độ của câu ví dụ (suy từ nguồn: sách -> quyển, ví dụ ngữ pháp -> cấp của điểm ngữ pháp)
ALTER TABLE dict_sentences ADD COLUMN IF NOT EXISTS lvl smallint;          -- 1..7 (theo HSK 3.0; sách 2.0 quyển n -> cấp n)
ALTER TABLE dict_sentences ADD COLUMN IF NOT EXISTS ver text;              -- '20' | '30' | NULL (ví dụ ngữ pháp chuẩn: dùng cho cả hai)
ALTER TABLE dict_sentences ADD COLUMN IF NOT EXISTS audio text;            -- đường dẫn MP3 đã sinh: /media/audio/s/<id>.mp3, NULL khi chưa có
ALTER TABLE dict_sentences ADD COLUMN IF NOT EXISTS nchar smallint;        -- số chữ Hán, để chọn câu ngắn/dài
CREATE INDEX IF NOT EXISTS dict_sentences_lvl_idx ON dict_sentences (lvl, nchar);

-- Clip YouTube công khai do admin thêm; transcript chia đoạn có mốc thời gian để chấm nghe và shadowing
CREATE TABLE IF NOT EXISTS media_clips (
  id          serial PRIMARY KEY,
  youtube_id  text NOT NULL UNIQUE,
  title       text NOT NULL,
  lvl         smallint,                  -- cấp gợi ý
  kind        text NOT NULL DEFAULT 'listening' CHECK (kind IN ('listening','shadowing','both')),
  segments    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{start, end, zh, py, vi}]
  enabled     boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Kết quả mỗi lần luyện (nghe, viết, phát âm, thi thử): phục vụ lịch sử, thống kê, XP
CREATE TABLE IF NOT EXISTS practice_attempts (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('listening','writing','speaking','exam')),
  item_ref   text NOT NULL,              -- 'sent:123' | 'clip:5:2' | 'exam:20-3:<uuid>'
  score      smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_attempts_user_idx ON practice_attempts (user_id, kind, created_at DESC);
