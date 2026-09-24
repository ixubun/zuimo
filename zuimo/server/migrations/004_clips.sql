-- Thư viện clip theo chủ đề: thêm chủ đề, thẻ, thời lượng, mô tả cho media_clips
ALTER TABLE media_clips ADD COLUMN IF NOT EXISTS topic text NOT NULL DEFAULT 'general';   -- khoá chủ đề: kids, daily, hsk, story, news…
ALTER TABLE media_clips ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE media_clips ADD COLUMN IF NOT EXISTS duration integer;                        -- giây, để hiện thời lượng trên thẻ
ALTER TABLE media_clips ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE media_clips ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS media_clips_topic_idx ON media_clips (topic, lvl);
