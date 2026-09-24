-- Ngân hàng đề cố định: sinh sẵn N đề mỗi cấp, mỗi lần thi chọn ngẫu nhiên (đề giống nhau cho mọi người, so sánh được điểm)
ALTER TABLE exam_sets ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'custom';   -- 'bank' (sinh sẵn) | 'custom' (admin nhập)
ALTER TABLE exam_sets ADD COLUMN IF NOT EXISTS seq integer;                            -- số thứ tự trong ngân hàng
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'exam';    -- 'exam' (tính giờ) | 'practice' (xem đáp án ngay)
CREATE INDEX IF NOT EXISTS exam_sets_bank_idx ON exam_sets (ver, lvl, kind, enabled);
