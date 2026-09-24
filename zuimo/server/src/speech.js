/**
 * Chấm phát âm (shadowing) bằng Azure Pronunciation Assessment.
 *
 *   GET  /api/practice/speech/config     { azure: true|false, dailyLeft }  giao diện chọn Azure hay Web Speech
 *   POST /api/practice/speech/assess     { itemRef, reference, wav (base64, PCM 16 kHz mono) }
 *        -> điểm tổng (accuracy, fluency, completeness, pron), từng từ và từng âm; lưu practice_attempts (kind=speaking)
 *
 * Gói F0 miễn phí 5 giờ/tháng. Mỗi lần chấm thường 2–6 giây âm thanh, nên giới hạn 80 lần/ngày/người
 * (~ 6 phút/ngày) và 25 giây/lần để một người không dùng hết hạn mức của cả trang.
 * Không có key thì /assess trả 503 và giao diện dùng Web Speech API của trình duyệt.
 */
import { q } from './db.js';
import { HttpError, bad, json, readJson } from './http.js';
import { requireUser } from './auth.js';

const KEY = process.env.AZURE_SPEECH_KEY, REGION = process.env.AZURE_SPEECH_REGION;
const azureOn = () => !!(KEY && REGION);
const DAILY_LIMIT = Number(process.env.SPEECH_DAILY_LIMIT || 80);
const MAX_WAV_BYTES = 16000 * 2 * 25;          // 25 giây PCM16 16 kHz

const CJK = /[\u3400-\u9fff]/;

/** Số lần đã chấm bằng Azure hôm nay (theo giờ Việt Nam, để "ngày" khớp với người dùng). */
async function usedToday(userId) {
  const { rows: [r] } = await q(
    `SELECT count(*)::int AS n FROM practice_attempts
     WHERE user_id = $1 AND kind = 'speaking' AND detail->>'engine' = 'azure'
       AND created_at >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'`, [userId]);
  return r.n;
}

/** Kiểm tra WAV: header RIFF, PCM 16-bit, mono, 16 kHz. Trình duyệt tự chuyển đổi trước khi gửi. */
function checkWav(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw bad('bad_wav', 'Âm thanh không phải WAV.');
  const channels = buf.readUInt16LE(22), rate = buf.readUInt32LE(24), bits = buf.readUInt16LE(34);
  if (channels !== 1 || rate !== 16000 || bits !== 16) throw bad('bad_wav', `Cần WAV mono 16 kHz 16-bit (nhận ${channels} kênh, ${rate} Hz, ${bits} bit).`);
  if (buf.length > MAX_WAV_BYTES + 44) throw new HttpError(413, 'audio_too_long', 'Đoạn ghi âm quá 25 giây.');
}

/** Gọi Azure; trả về đối tượng đã rút gọn cho giao diện. */
async function assess(reference, wav) {
  const params = { ReferenceText: reference, GradingSystem: 'HundredMark', Granularity: 'Phoneme', Dimension: 'Comprehensive', EnableMiscue: true, EnableProsodyAssessment: true };
  const url = `https://${REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-CN&format=detailed`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': KEY,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      'Pronunciation-Assessment': Buffer.from(JSON.stringify(params)).toString('base64'),
      Accept: 'application/json'
    },
    body: wav,
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new HttpError(502, 'azure_error', `Azure trả về ${r.status}.`, { detail: (await r.text()).slice(0, 200) });
  const data = await r.json();
  if (data.RecognitionStatus !== 'Success' || !data.NBest || !data.NBest[0]) {
    return { recognized: '', status: data.RecognitionStatus || 'NoMatch', scores: null, words: [] };
  }
  const best = data.NBest[0], pa = best.PronunciationAssessment || {};
  return {
    recognized: best.Display || best.Lexical || '',
    status: 'Success',
    scores: { accuracy: pa.AccuracyScore, fluency: pa.FluencyScore, completeness: pa.CompletenessScore, prosody: pa.ProsodyScore, pron: pa.PronScore },
    words: (best.Words || []).map(w => ({
      word: w.Word,
      accuracy: w.PronunciationAssessment ? w.PronunciationAssessment.AccuracyScore : null,
      error: w.PronunciationAssessment ? w.PronunciationAssessment.ErrorType : 'None',   // None | Mispronunciation | Omission | Insertion
      phonemes: (w.Phonemes || []).map(p => ({ p: p.Phoneme, score: p.PronunciationAssessment ? p.PronunciationAssessment.AccuracyScore : null }))
    }))
  };
}

export function mountSpeech(router) {
  router.get('/api/practice/speech/config', async (req, res) => {
    const s = await requireUser(req, res);
    const used = azureOn() ? await usedToday(s.user_id) : 0;
    json(res, 200, { azure: azureOn(), dailyLimit: DAILY_LIMIT, dailyLeft: Math.max(0, DAILY_LIMIT - used) });
  });

  router.post('/api/practice/speech/assess', async (req, res) => {
    const s = await requireUser(req, res);
    if (!azureOn()) throw new HttpError(503, 'azure_disabled', 'Chưa cấu hình Azure Speech; hãy dùng nhận dạng của trình duyệt.');
    const b = await readJson(req);
    const reference = String(b.reference || '').trim().slice(0, 300);
    if (!reference || !CJK.test(reference)) throw bad('missing_reference', 'Thiếu câu mẫu.');
    if (!b.wav) throw bad('missing_audio', 'Thiếu âm thanh.');
    const used = await usedToday(s.user_id);
    if (used >= DAILY_LIMIT) throw new HttpError(429, 'daily_limit', `Bạn đã dùng hết ${DAILY_LIMIT} lượt chấm nâng cao hôm nay; vẫn luyện được bằng nhận dạng của trình duyệt.`);
    const wav = Buffer.from(String(b.wav), 'base64');
    checkWav(wav);
    const result = await assess(reference, wav);
    // điểm tổng: PronScore của Azure; không nhận dạng được thì 0
    const score = result.scores ? Math.round(result.scores.pron || 0) : 0;
    const xp = score >= 95 ? 10 : score >= 80 ? 7 : score >= 60 ? 4 : 0;
    await q('INSERT INTO practice_attempts (user_id, kind, item_ref, score, detail) VALUES ($1,$2,$3,$4,$5)',
      [s.user_id, 'speaking', String(b.itemRef || '').slice(0, 80) || 'free', score, { engine: 'azure', ...result, xp, seconds: Math.round((wav.length - 44) / 32000) }]);
    json(res, 200, { ...result, score, xp, dailyLeft: Math.max(0, DAILY_LIMIT - used - 1) });
  });
}
