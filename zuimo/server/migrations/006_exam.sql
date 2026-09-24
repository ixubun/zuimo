-- Luyện thi HSK: âm thanh cho từ đơn, cặp hỏi-đáp từ hội thoại, đề thi đã sinh và kết quả

ALTER TABLE dict_entries ADD COLUMN IF NOT EXISTS audio text;   -- /media/audio/w/<id>.mp3 (từ HSK cấp 1–3, dùng cho đề nghe)

-- Cặp hỏi-đáp liền nhau trong hội thoại giáo trình: nguồn cho phần "chọn câu trả lời" và "ghép câu hỏi – câu đáp"
CREATE TABLE IF NOT EXISTS dict_dialog_pairs (
  id     serial PRIMARY KEY,
  q_id   integer NOT NULL REFERENCES dict_sentences(id) ON DELETE CASCADE,
  a_id   integer NOT NULL REFERENCES dict_sentences(id) ON DELETE CASCADE,
  lvl    smallint,
  ver    text,
  UNIQUE (q_id, a_id)
);
CREATE INDEX IF NOT EXISTS dict_dialog_pairs_lvl_idx ON dict_dialog_pairs (lvl, ver);

-- Đề thi: sinh một lần rồi lưu nguyên (kèm đáp án) để chấm và xem lại đúng đề đã làm
CREATE TABLE IF NOT EXISTS exam_papers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ver         text NOT NULL,
  lvl         smallint NOT NULL,
  source      text NOT NULL DEFAULT 'generated',   -- generated | set:<id>
  paper       jsonb NOT NULL,                      -- { sections: [{ key, title, minutes, parts: [{ key, title, instr, items: [...] }] }] }
  answers     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "<itemId>": "A" | "✓" | "text" }
  result      jsonb,                               -- { sections: {...}, total, pass }
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS exam_papers_user_idx ON exam_papers (user_id, created_at DESC);

-- Bộ đề do admin nhập (JSON theo cùng cấu trúc paper)
CREATE TABLE IF NOT EXISTS exam_sets (
  id         serial PRIMARY KEY,
  ver        text NOT NULL,
  lvl        smallint NOT NULL,
  title      text NOT NULL,
  paper      jsonb NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
