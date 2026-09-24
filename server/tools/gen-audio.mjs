#!/usr/bin/env node
/**
 * gen-audio.mjs – sinh file MP3 cho các câu luyện nghe/shadowing bằng Azure Neural TTS.
 *
 * Mỗi câu sinh 2 tốc độ: thường (giọng nữ zh-CN-XiaoxiaoNeural) và chậm (rate -25%), lưu:
 *   <MEDIA_DIR>/audio/s/<id>.mp3        thường
 *   <MEDIA_DIR>/audio/s/<id>-slow.mp3   chậm
 * rồi ghi cột dict_sentences.audio. Chạy lại chỉ sinh câu chưa có file (an toàn, tiết kiệm hạn mức).
 *
 * Biến môi trường:
 *   DATABASE_URL, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (vd: southeastasia), MEDIA_DIR (mặc định /app/media)
 *   TTS_VOICE (mặc định zh-CN-XiaoxiaoNeural), TTS_LIMIT (số câu tối đa mỗi lần chạy, mặc định không giới hạn)
 *   DRY_RUN=1  không gọi Azure, chỉ ghi file MP3 rỗng để thử luồng
 *
 * Hạn mức miễn phí Azure: 500.000 ký tự/tháng. 2.600 câu x 2 tốc độ ≈ 60.000 ký tự, chạy một lần là đủ.
 * Trên VPS: docker compose exec -e AZURE_SPEECH_KEY=... -e AZURE_SPEECH_REGION=... api node tools/gen-audio.mjs
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const MEDIA = process.env.MEDIA_DIR || '/app/media';
const VOICE = process.env.TTS_VOICE || 'zh-CN-XiaoxiaoNeural';
const KEY = process.env.AZURE_SPEECH_KEY, REGION = process.env.AZURE_SPEECH_REGION;
const DRY = process.env.DRY_RUN === '1';
const LIMIT = Number(process.env.TTS_LIMIT || 0);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (!DRY && (!KEY || !REGION)) { console.error('Thiếu AZURE_SPEECH_KEY / AZURE_SPEECH_REGION (hoặc đặt DRY_RUN=1 để thử).'); process.exit(1); }

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ssml = (text, rate) => `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${VOICE}"><prosody rate="${rate}">${esc(text)}</prosody></voice></speak>`;

let tokenCache = { value: null, exp: 0 };
async function token() {
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;
  const r = await fetch(`https://${REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': KEY } });
  if (!r.ok) throw new Error(`Không lấy được token Azure: ${r.status} ${await r.text()}`);
  tokenCache = { value: await r.text(), exp: Date.now() + 8 * 60 * 1000 };   // token sống 10 phút
  return tokenCache.value;
}

async function synth(text, rate) {
  if (DRY) return Buffer.alloc(0);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'zuimo' },
      body: ssml(text, rate)
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 429) { await new Promise(ok => setTimeout(ok, 1500 * attempt)); continue; }   // vượt tần suất: chờ rồi thử lại
    throw new Error(`TTS ${r.status}: ${await r.text()}`);
  }
  throw new Error('TTS bị giới hạn tần suất liên tục');
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const dir = join(MEDIA, 'audio', 's');
  await mkdir(dir, { recursive: true });
  const { rows } = await pool.query('SELECT id, zh FROM dict_sentences WHERE audio IS NULL ORDER BY lvl NULLS LAST, id' + (LIMIT ? ` LIMIT ${LIMIT}` : ''));
  log(`cần sinh ${rows.length} câu${DRY ? ' (chạy thử, không gọi Azure)' : ''}`);
  let n = 0, chars = 0;
  for (const s of rows) {
    const rel = `/media/audio/s/${s.id}.mp3`;
    const f = join(dir, `${s.id}.mp3`), fs = join(dir, `${s.id}-slow.mp3`);
    try { await access(f); await access(fs); }                       // đã có file (chạy dở lần trước): chỉ cập nhật DB
    catch {
      await writeFile(f, await synth(s.zh, '0%'));
      await writeFile(fs, await synth(s.zh, '-25%'));
      chars += s.zh.length * 2;
    }
    await pool.query('UPDATE dict_sentences SET audio = $2 WHERE id = $1', [s.id, rel]);
    n++;
    if (n % 100 === 0) log(`  ${n}/${rows.length}`);
  }
  // ---- từ đơn HSK 1–3 (cả hai đề cương): dùng cho phần nghe chọn hình
  const wdir = join(MEDIA, 'audio', 'w'); await mkdir(wdir, { recursive: true });
  const { rows: words } = await pool.query(`SELECT id, simp FROM dict_entries WHERE audio IS NULL AND (hsk20 BETWEEN 1 AND 3 OR hsk30 BETWEEN 1 AND 3) AND simp !~ '[A-Za-z0-9]' ORDER BY id`);
  log(`cần sinh ${words.length} từ`);
  let wn = 0;
  for (const w of words) {
    const f = join(wdir, `${w.id}.mp3`);
    try { await access(f); } catch { await writeFile(f, await synth(w.simp, '-10%')); chars += w.simp.length; }
    await pool.query('UPDATE dict_entries SET audio = $2 WHERE id = $1', [w.id, `/media/audio/w/${w.id}.mp3`]);
    wn++;
    if (wn % 200 === 0) log(`  ${wn}/${words.length}`);
  }
  // ---- câu hỏi chuẩn dùng trong đề nghe (số thứ tự, câu lệnh): tên file cố định
  const PHRASES = { q_word: '问：对话里说到了什么？', q_meaning: '问：说话人是什么意思？', q_where: '问：他们在哪儿？', q_do: '问：他们在做什么？', q_who: '问：说话人在说谁？',
    intro_1: '第一部分', intro_2: '第二部分', intro_3: '第三部分', intro_4: '第四部分', listen_end: '听力考试现在结束。', example: '例如' };
  const pdir = join(MEDIA, 'audio', 'p'); await mkdir(pdir, { recursive: true });
  for (const [k, text] of Object.entries(PHRASES)) {
    const f = join(pdir, `${k}.mp3`);
    try { await access(f); } catch { await writeFile(f, await synth(text, '-10%')); chars += text.length; }
  }
  for (let i = 1; i <= 50; i++) { const f = join(pdir, `n${i}.mp3`); try { await access(f); } catch { await writeFile(f, await synth(`${i}`, '0%')); chars += 2; } }
  log(`xong: ${n} câu, ${wn} từ, ${chars} ký tự đã gửi Azure`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
