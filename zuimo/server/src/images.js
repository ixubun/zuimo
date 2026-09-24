/**
 * Thư viện ảnh từ vựng (admin) – nguồn Pexels (giấy phép Pexels: dùng miễn phí, kể cả thương mại, không bắt buộc ghi nguồn
 * nhưng ta vẫn lưu tên tác giả và link gốc). Ảnh được TẢI VỀ máy chủ (bản 350px) thay vì hotlink, để đề thi không phụ thuộc
 * dịch vụ ngoài và không lộ IP người học sang Pexels.
 *
 *   GET  /api/admin/images/words?lvl=       danh sách từ nên có ảnh (HSK 1–3, danh từ/động từ cụ thể) kèm trạng thái đã có ảnh chưa
 *   GET  /api/admin/images/search?q=        tìm trên Pexels (server giữ key), trả 12 ảnh nhỏ để chọn
 *   POST /api/admin/images { word, photoId } tải ảnh về, ghi vào word_images
 *   DELETE /api/admin/images?word=
 * Biến môi trường: PEXELS_API_KEY, MEDIA_DIR (mặc định /app/media)
 */
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { q } from './db.js';
import { HttpError, bad, json, readJson } from './http.js';
import { requireUser } from './auth.js';

const KEY = process.env.PEXELS_API_KEY;
const MEDIA = process.env.MEDIA_DIR || '/app/media';

const requireAdmin = async (req, res) => { const s = await requireUser(req, res); if (!s.is_admin) throw new HttpError(403, 'admin_only', 'Chỉ quản trị viên.'); return s; };

/** Từ khoá tiếng Anh cho tìm ảnh: nghĩa Anh đầu tiên, bỏ ngoặc và các từ chức năng. */
const enQuery = en => (en || '').replace(/\([^)]*\)/g, '').split(/[;,/]/)[0].replace(/^(to|a|an|the)\s+/i, '').trim().toLowerCase();

async function pexelsSearch(query) {
  if (!KEY) throw new HttpError(503, 'pexels_disabled', 'Chưa cấu hình PEXELS_API_KEY.');
  const r = await fetch(`https://api.pexels.com/v1/search?${new URLSearchParams({ query, per_page: '12', orientation: 'landscape', size: 'small' })}`,
    { headers: { Authorization: KEY }, signal: AbortSignal.timeout(10000) });
  if (r.status === 429) throw new HttpError(429, 'pexels_rate', 'Pexels giới hạn tần suất, thử lại sau một phút.');
  if (!r.ok) throw new HttpError(502, 'pexels_error', `Pexels trả về ${r.status}.`);
  const d = await r.json();
  return (d.photos || []).map(p => ({ id: p.id, thumb: p.src.tiny, medium: p.src.medium, url: p.url, photographer: p.photographer, alt: p.alt }));
}

export function mountImages(router) {
  router.get('/api/admin/images/words', async (req, res, url) => {
    await requireAdmin(req, res);
    const lvl = Math.min(3, Math.max(1, Number(url.searchParams.get('lvl')) || 1));
    // danh từ / động từ cụ thể của cấp (cả hai đề cương), kèm ảnh đã có
    const { rows } = await q(
      `SELECT DISTINCT ON (e.simp) e.simp AS word, e.pinyin_marks AS py, e.vi[1] AS vi, e.en[1] AS en, e.pos, i.path, i.photographer
       FROM dict_entries e LEFT JOIN word_images i ON i.word = e.simp
       WHERE (e.hsk20 = $1 OR e.hsk30 = $1) AND e.simp !~ '[A-Za-z0-9]' AND e.nchar <= 3
         AND (e.pos && ARRAY['n','v']::text[]) AND e.en <> '{}'
       ORDER BY e.simp`, [lvl]);
    json(res, 200, { words: rows.map(r => ({ ...r, query: enQuery(r.en) })), configured: !!KEY });
  });

  router.get('/api/admin/images/search', async (req, res, url) => {
    await requireAdmin(req, res);
    const qs = String(url.searchParams.get('q') || '').trim().slice(0, 60);
    if (!qs) throw bad('missing_q', 'Thiếu từ khoá.');
    json(res, 200, { photos: await pexelsSearch(qs), query: qs });
  });

  router.post('/api/admin/images', async (req, res) => {
    const s = await requireAdmin(req, res);
    const b = await readJson(req);
    const word = String(b.word || '').trim(), photoId = Number(b.photoId);
    if (!word || !photoId) throw bad('missing_fields', 'Thiếu word hoặc photoId.');
    if (!KEY) throw new HttpError(503, 'pexels_disabled', 'Chưa cấu hình PEXELS_API_KEY.');
    const r = await fetch(`https://api.pexels.com/v1/photos/${photoId}`, { headers: { Authorization: KEY }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new HttpError(502, 'pexels_error', `Pexels trả về ${r.status}.`);
    const p = await r.json();
    const img = await fetch(p.src.medium, { signal: AbortSignal.timeout(15000) });
    if (!img.ok) throw new HttpError(502, 'download_failed', 'Không tải được ảnh.');
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) throw new HttpError(413, 'too_large', 'Ảnh quá 2 MB.');
    await mkdir(join(MEDIA, 'img'), { recursive: true });
    const rel = `/media/img/${photoId}.jpg`;
    await writeFile(join(MEDIA, 'img', `${photoId}.jpg`), buf);
    const { rows } = await q(
      `INSERT INTO word_images (word, path, source, source_id, source_url, photographer, query, created_by) VALUES ($1,$2,'pexels',$3,$4,$5,$6,$7)
       ON CONFLICT (word) DO UPDATE SET path=$2, source_id=$3, source_url=$4, photographer=$5, query=$6 RETURNING *`,
      [word, rel, String(photoId), p.url, p.photographer, String(b.query || '').slice(0, 60), s.user_id]);
    json(res, 200, { image: rows[0] });
  });

  router.del('/api/admin/images', async (req, res, url) => {
    await requireAdmin(req, res);
    const word = String(url.searchParams.get('word') || '');
    const { rows } = await q('DELETE FROM word_images WHERE word = $1 RETURNING path', [word]);
    if (rows[0]) await unlink(join(MEDIA, rows[0].path.replace('/media/', ''))).catch(() => {});
    json(res, 200, { ok: true });
  });
}
