-- Tần suất xuất hiện của từ trong kho câu ví dụ: dùng để xếp gợi ý của bộ gõ pinyin
ALTER TABLE dict_entries ADD COLUMN IF NOT EXISTS freq integer NOT NULL DEFAULT 0;
