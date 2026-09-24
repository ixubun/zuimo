-- Thư viện ảnh thật cho từ vựng (đề thi, thẻ nhớ). Ảnh giấy phép mở (Pexels), tải về lưu cục bộ kèm ghi nguồn.
CREATE TABLE IF NOT EXISTS word_images (
  word         text PRIMARY KEY,                 -- từ giản thể
  path         text NOT NULL,                    -- /media/img/<id>.jpg (bản 350px)
  source       text NOT NULL DEFAULT 'pexels',
  source_id    text,
  source_url   text,                             -- trang gốc để ghi nguồn
  photographer text,
  query        text,                             -- từ khoá đã tìm (tiếng Anh)
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
