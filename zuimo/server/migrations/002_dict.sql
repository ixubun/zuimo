-- Từ điển: CC-CEDICT (nghĩa Anh) + CVDICT (nghĩa Việt) ghép theo (phồn thể, giản thể, pinyin),
-- cộng dữ liệu chữ từ Make Me a Hanzi và câu ví dụ tự soạn.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS dict_entries (
  id            serial PRIMARY KEY,
  trad          text NOT NULL,
  simp          text NOT NULL,
  pinyin        text NOT NULL,          -- dạng số: "ni3 hao3" (khoá ghép hai nguồn)
  pinyin_marks  text NOT NULL,          -- dạng dấu: "nǐ hǎo"
  pinyin_plain  text NOT NULL,          -- không dấu, không cách: "nihao" (để gõ nhanh)
  en            text[] NOT NULL DEFAULT '{}',
  vi            text[] NOT NULL DEFAULT '{}',
  hv            text,                   -- âm Hán Việt
  cls           text[] NOT NULL DEFAULT '{}',   -- lượng từ đi kèm (CL: trong CEDICT)
  tags          text[] NOT NULL DEFAULT '{}',   -- ghi chú cách dùng: khẩu ngữ, văn viết, phương ngữ, cũ…
  pos           text[] NOT NULL DEFAULT '{}',   -- loại từ (từ bộ HSK, chỉ có với từ HSK)
  hsk20         smallint,
  hsk30         smallint,
  nchar         smallint NOT NULL,
  vi_text       text NOT NULL DEFAULT '',       -- vi nối lại, phục vụ tìm ngược
  en_text       text NOT NULL DEFAULT '',
  UNIQUE (trad, simp, pinyin)
);
CREATE INDEX IF NOT EXISTS dict_entries_simp_idx   ON dict_entries (simp);
CREATE INDEX IF NOT EXISTS dict_entries_trad_idx   ON dict_entries (trad);
CREATE INDEX IF NOT EXISTS dict_entries_plain_idx  ON dict_entries (pinyin_plain text_pattern_ops);
CREATE INDEX IF NOT EXISTS dict_entries_simp_trgm  ON dict_entries USING gin (simp gin_trgm_ops);
CREATE INDEX IF NOT EXISTS dict_entries_vi_trgm    ON dict_entries USING gin (vi_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS dict_entries_en_trgm    ON dict_entries USING gin (en_text gin_trgm_ops);

-- Chữ đơn: bộ thủ, cấu tạo (IDS như ⿰女子), nguồn gốc (Make Me a Hanzi), số nét, Hán Việt
CREATE TABLE IF NOT EXISTS dict_chars (
  ch            text PRIMARY KEY,
  definition    text,
  pinyin        text[] NOT NULL DEFAULT '{}',
  decomposition text,
  radical       text,
  etym_type     text,                   -- pictographic | ideographic | pictophonetic
  etym_hint     text,
  etym_semantic text,
  etym_phonetic text,
  strokes       smallint,
  hv            text
);
CREATE INDEX IF NOT EXISTS dict_chars_radical_idx ON dict_chars (radical);

-- Câu ví dụ tự soạn (hội thoại, ví dụ ngữ pháp của Zuimó và ví dụ chuẩn GF0025-2021)
CREATE TABLE IF NOT EXISTS dict_sentences (
  id   serial PRIMARY KEY,
  zh   text NOT NULL,
  py   text,
  vi   text,
  src  text,                            -- "book:hsk20_1:3" | "grammar:一36"
  UNIQUE (zh)
);
CREATE INDEX IF NOT EXISTS dict_sentences_zh_trgm ON dict_sentences USING gin (zh gin_trgm_ops);
