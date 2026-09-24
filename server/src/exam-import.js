/**
 * Nhập đề thật từ trang Quản trị (admin):
 *   POST /api/admin/exam/upload?name=H20901.pdf   body = nội dung file (octet-stream, tối đa 200 MB), lưu MEDIA/import/
 *   GET  /api/admin/exam/files                    các cặp PDF + MP3 trong MEDIA/import, kèm trạng thái đã nhập / đang chạy
 *   POST /api/admin/exam/import { base }          chạy tools/import-exam.mjs ở nền, log ra MEDIA/import/jobs/<base>.log
 *   GET  /api/admin/exam/job?base=                trạng thái + log
 *   DELETE /api/admin/exam/file?name=
 * Tải lên đọc luồng thẳng ra đĩa (không qua readJson) nên không dính giới hạn 2 MB của API.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, readFile, unlink, access } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { HttpError, bad, json } from './http.js';
import { requireUser } from './auth.js';

const MEDIA = process.env.MEDIA_DIR || '/app/media';
const IMPORT = join(MEDIA, 'import'), JOBS = join(IMPORT, 'jobs');
const MAX_UPLOAD = 200 * 1024 * 1024;
const jobs = new Map();          // base -> { running, code, startedAt, endedAt }
const safe = n => basename(String(n || '')).replace(/[^A-Za-z0-9._-]/g, '_');

const requireAdmin = async (req, res) => { const s = await requireUser(req, res); if (!s.is_admin) throw new HttpError(403, 'admin_only', 'Chỉ quản trị viên.'); return s; };

export function mountExamImport(router) {
  router.post('/api/admin/exam/upload', async (req, res, url) => {
    await requireAdmin(req, res);
    const name = safe(url.searchParams.get('name'));
    if (!/\.(pdf|mp3)$/i.test(name)) throw bad('bad_name', 'Chỉ nhận .pdf và .mp3.');
    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_UPLOAD) throw new HttpError(413, 'too_large', 'File quá 200 MB.');
    await mkdir(IMPORT, { recursive: true });
    const path = join(IMPORT, name);
    await new Promise((ok, fail) => {
      let size = 0; const ws = createWriteStream(path);
      req.on('data', c => { size += c.length; if (size > MAX_UPLOAD) { req.destroy(); ws.destroy(); fail(new HttpError(413, 'too_large', 'File quá 200 MB.')); } });
      req.pipe(ws); ws.on('finish', ok); ws.on('error', fail); req.on('error', fail);
    });
    const st = await stat(path);
    json(res, 200, { name, size: st.size });
  });

  router.get('/api/admin/exam/files', async (req, res) => {
    await requireAdmin(req, res);
    await mkdir(IMPORT, { recursive: true });
    const names = (await readdir(IMPORT)).filter(n => /\.(pdf|mp3)$/i.test(n));
    const bases = {};
    for (const n of names) { const b = n.replace(/\.(pdf|mp3)$/i, ''); (bases[b] = bases[b] || {}); bases[b][n.toLowerCase().endsWith('.pdf') ? 'pdf' : 'mp3'] = n; }
    const out = [];
    for (const [base, f] of Object.entries(bases)) {
      const imported = await access(join(MEDIA, 'exams', base, 'paper.json')).then(() => true, () => false);
      const j = jobs.get(base);
      out.push({ base, pdf: f.pdf || null, mp3: f.mp3 || null, imported, running: !!(j && j.running), lastCode: j ? j.code : null });
    }
    json(res, 200, { files: out.sort((a, b) => a.base.localeCompare(b.base)) });
  });

  router.post('/api/admin/exam/import', async (req, res) => {
    await requireAdmin(req, res);
    const { readJson } = await import('./http.js');
    const b = await readJson(req);
    const base = safe(b.base);
    const pdf = join(IMPORT, base + '.pdf'), mp3 = join(IMPORT, base + '.mp3');
    for (const f of [pdf, mp3]) await access(f).catch(() => { throw bad('missing_file', `Thiếu ${basename(f)} trong thư mục nhập.`); });
    if (jobs.get(base)?.running) throw bad('running', 'Đề này đang được nhập.');
    await mkdir(JOBS, { recursive: true });
    const log = createWriteStream(join(JOBS, base + '.log'));
    const args = ['tools/import-exam.mjs', pdf, mp3, '--work', join(IMPORT, 'import-' + base)];
    if (b.level) args.push('--level', String(Number(b.level)));
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });   // cwd = /app trong container
    const job = { running: true, code: null, startedAt: Date.now(), endedAt: null };
    jobs.set(base, job);
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    child.on('close', code => { job.running = false; job.code = code; job.endedAt = Date.now(); log.end(`\n[kết thúc, mã ${code}]\n`); });
    json(res, 200, { started: true, base });
  });

  router.get('/api/admin/exam/job', async (req, res, url) => {
    await requireAdmin(req, res);
    const base = safe(url.searchParams.get('base'));
    const j = jobs.get(base) || null;
    const log = await readFile(join(JOBS, base + '.log'), 'utf8').catch(() => '');
    json(res, 200, { running: !!(j && j.running), code: j ? j.code : null, log: log.slice(-6000) });
  });

  router.del('/api/admin/exam/file', async (req, res, url) => {
    await requireAdmin(req, res);
    const name = safe(url.searchParams.get('name'));
    await unlink(join(IMPORT, name)).catch(() => {});
    json(res, 200, { ok: true });
  });
}
