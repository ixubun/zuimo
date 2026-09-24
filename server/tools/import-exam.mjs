#!/usr/bin/env node
/**
 * import-exam.mjs – nhập một đề HSK thật (PDF + MP3 của CTI) vào ngân hàng đề.
 *
 *   node tools/import-exam.mjs <đề.pdf> <băng.mp3> [--level 2] [--title "HSK 2 – H20901"] [--dry]
 *
 * Các bước:
 *   1. parse_paper.py: cắt ảnh từng câu / kho hình, trích câu hỏi, phương án, lời băng, đáp án -> paper.json
 *   2. Chia băng theo khoảng lặng (ffmpeg silencedetect).
 *   3. Căn từng câu vào băng:
 *        - có AZURE_SPEECH_KEY: nhận dạng từng đoạn tiếng, so với lời băng, khớp theo thứ tự (chính xác);
 *        - không có: dựa vào khoảng lặng dài ≥ 6 s (thời gian trả lời) và số câu mỗi phần (gần đúng, nên nghe kiểm tra).
 *   4. Cắt MP3 từng câu (chế độ luyện tập), giữ nguyên băng đầy đủ (chế độ thi) kèm mốc thời gian từng câu.
 *   5. Chép vào MEDIA_DIR/exams/<mã đề>/, ghi exam_sets (kind='real').
 * Kết quả nhận dạng Azure được cache trong <thư mục đề>/stt.json để chạy lại không tốn hạn mức.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, cp, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MEDIA = process.env.MEDIA_DIR || '/app/media';
const KEY = process.env.AZURE_SPEECH_KEY, REGION = process.env.AZURE_SPEECH_REGION;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const CJK = /[\u3400-\u9fff]/g;

const [pdf, mp3] = process.argv.slice(2);
if (!pdf || !mp3) { console.error('Cách dùng: node tools/import-exam.mjs <đề.pdf> <băng.mp3> [--level 2]'); process.exit(1); }
const levelArg = arg('--level', 'auto');
const work = resolve(arg('--work', join(dirname(resolve(pdf)), 'import-' + resolve(pdf).split('/').pop().replace(/\.pdf$/i, ''))));
await mkdir(work, { recursive: true });

/* ---------------------------------------------------------------- 1. phân tích PDF */
log('phân tích PDF');
const py = spawnSync('python3', [join(HERE, 'hsk-import', 'parse_paper.py'), resolve(pdf), work, '--level', String(levelArg)], { encoding: 'utf8' });
if (py.status !== 0) { console.error(py.stdout, py.stderr); process.exit(1); }
console.log(py.stdout.trim().split('\n').map(l => '  ' + l).join('\n'));
const paper = JSON.parse(await readFile(join(work, 'paper.json'), 'utf8'));
const level = paper.lvl;
const listening = paper.sections.find(s => s.key === 'listening');
const items = listening.parts.flatMap(p => p.items);

/* ---------------------------------------------------------------- 2. khoảng lặng */
const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], { encoding: 'utf8' }).stdout);
const det = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', mp3, '-af', 'silencedetect=noise=-40dB:d=0.7', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const sil = []; let cur = null;
for (const m of det.matchAll(/silence_(start|end): ([\d.]+)/g)) { if (m[1] === 'start') cur = +m[2]; else if (cur != null) { sil.push([cur, +m[2]]); cur = null; } }
const segs = []; let prev = 0;
for (const [s, e] of sil) { if (s - prev > 0.3) segs.push({ start: prev, end: s }); prev = e; }
if (dur - prev > 0.3) segs.push({ start: prev, end: dur });
log(`băng ${Math.round(dur)}s, ${segs.length} đoạn tiếng, ${sil.length} khoảng lặng`);

/* ---------------------------------------------------------------- 3a. nhận dạng Azure (cache) */
const sttPath = join(work, 'stt.json');
let stt = null;
try { stt = JSON.parse(await readFile(sttPath, 'utf8')); log('dùng kết quả nhận dạng đã cache'); } catch { /* chưa có */ }
if (!stt && KEY && REGION) {
  log('nhận dạng từng đoạn bằng Azure STT (zh-CN)…');
  stt = [];
  for (let i = 0; i < segs.length; i++) {
    const { start, end } = segs[i];
    if (end - start < 0.3 || end - start > 59) { stt.push(''); continue; }
    const wav = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(start), '-to', String(end), '-i', mp3, '-ac', '1', '-ar', '16000', '-f', 'wav', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 }).stdout;
    let text = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(`https://${REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-CN&format=simple`,
        { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000' }, body: wav });
      if (r.status === 429) { await new Promise(ok => setTimeout(ok, 2000)); continue; }
      const d = r.ok ? await r.json() : {};
      text = d.DisplayText || ''; break;
    }
    stt.push(text);
    if ((i + 1) % 20 === 0) log(`  ${i + 1}/${segs.length}`);
  }
  await writeFile(sttPath, JSON.stringify(stt, null, 1));
}

/* ---------------------------------------------------------------- 3b. căn câu vào băng */
const norm = s => (String(s || '').match(CJK) || []).join('');
const sim = (a, b) => { const A = norm(a), B = norm(b); if (!A || !B) return 0; let hit = 0; const bs = new Set([...B]); for (const c of A) if (bs.has(c)) hit++; return hit / Math.max(A.length, 1); };
let spans;
if (stt) {
  // duyệt đoạn theo thứ tự, con trỏ câu chỉ tiến; đoạn ngắn (số câu) gắn vào câu sau
  spans = items.map(() => null);
  let k = 0;
  for (let i = 0; i < segs.length && k < items.length; i++) {
    const text = stt[i];
    const target = items[k], next = items[k + 1];
    const tt = target.lines.map(l => l.zh).concat(target.question ? [target.question.zh] : []).join('');
    const nt = next ? next.lines.map(l => l.zh).join('') : '';
    const sT = sim(text, tt), sN = nt ? sim(text, nt) : 0;
    if (sN > sT && sN >= 0.5) { k++; i--; continue; }           // đã sang câu kế tiếp
    if (sT >= 0.45) {
      if (!spans[k]) { const numSeg = i > 0 && segs[i - 1].end - segs[i - 1].start < 1.2 && segs[i].start - segs[i - 1].end < 2 ? segs[i - 1] : null; spans[k] = { t0: (numSeg || segs[i]).start, t1: segs[i].end }; }
      else spans[k].t1 = segs[i].end;
    }
  }
} else {
  // dự phòng: khối ngăn bởi lặng ≥ 6 s; bỏ khối giới thiệu đầu mỗi phần
  const blocks = []; let b0 = 0;
  for (const [s, e] of sil) if (e - s >= 6) { blocks.push({ t0: b0, t1: s }); b0 = e; }
  blocks.push({ t0: b0, t1: dur });
  spans = []; let bi = 1;                                       // khối 0 = nhạc + giới thiệu + ví dụ phần 1
  for (const part of listening.parts) {
    if (spans.length) bi++;                                     // khối giới thiệu + ví dụ của phần sau
    for (const it of part.items) { spans.push(blocks[bi] ? { t0: blocks[bi].t0, t1: blocks[bi].t1 } : null); bi++; }
  }
  log('CẢNH BÁO: căn theo khoảng lặng (không có Azure) – hãy nghe kiểm tra từng câu trong trang Quản trị');
}
const missing = spans.map((s, i) => (s ? null : items[i].id)).filter(Boolean);
if (missing.length) log(`  chưa căn được ${missing.length} câu: ${missing.join(', ')}`);

/* ---------------------------------------------------------------- 4–5. cắt clip, chép media, ghi DB */
const code = paper.code;
const outDir = join(MEDIA, 'exams', code);
await mkdir(join(outDir, 'audio'), { recursive: true });
await cp(join(work, 'img'), join(outDir, 'img'), { recursive: true });
await cp(mp3, join(outDir, 'listening.mp3'));
items.forEach((it, i) => {
  const sp = spans[i]; if (!sp) return;
  const f = join(outDir, 'audio', `${it.id}.mp3`);
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.max(0, sp.t0 - 0.2)), '-to', String(sp.t1 + 0.4), '-i', mp3, '-c:a', 'libmp3lame', '-q:a', '5', f]);
  it.audio = `/media/exams/${code}/audio/${it.id}.mp3`; it.t0 = Math.round(sp.t0 * 10) / 10; it.t1 = Math.round(sp.t1 * 10) / 10;
});
paper.audio = `/media/exams/${code}/listening.mp3`; paper.audioDuration = Math.round(dur);
const fixImg = o => { if (o && typeof o === 'object') { if (o.img && !o.img.startsWith('/')) o.img = `/media/exams/${code}/${o.img}`; Object.values(o).forEach(fixImg); } else if (Array.isArray(o)) o.forEach(fixImg); };
fixImg(paper);
await writeFile(join(outDir, 'paper.json'), JSON.stringify(paper, null, 1));
log(`đã ghi media vào ${outDir}`);

if (!DRY) {
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const title = arg('--title', `HSK ${level} – ${code}`);
  await pool.query(`DELETE FROM exam_sets WHERE kind = 'real' AND title = $1`, [title]);
  const { rows } = await pool.query(`INSERT INTO exam_sets (ver, lvl, title, paper, enabled, kind, seq) VALUES ('20', $1, $2, $3, true, 'real', (SELECT coalesce(max(seq),0)+1 FROM exam_sets WHERE kind='real' AND lvl=$1)) RETURNING id`, [level, title, JSON.stringify(paper)]);
  log(`đã lưu bộ đề #${rows[0].id}: ${title}`);
  await pool.end();
} else log('--dry: không ghi DB');
