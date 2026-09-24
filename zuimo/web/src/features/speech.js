import { $ } from '../core/dom.js';
import { tr } from '../core/util.js';

/* ---------- Phát âm: Web Speech API (bản chính thức: file audio TTS tự sinh) ---------- */
let zhVoice = null, voicesLoaded = false, warnedVoice = false;
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  if (vs.length) voicesLoaded = true;
  zhVoice = vs.find(v => /^zh[-_](CN|Hans)/i.test(v.lang)) || vs.find(v => /^(zh|cmn)/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function utter(text, pitch = 1) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN'; u.rate = 0.82; u.pitch = pitch;
  if (zhVoice) u.voice = zhVoice;
  return u;
}
function voiceCheck() {
  if (!('speechSynthesis' in window)) { toast(tr('Trình duyệt này chưa hỗ trợ đọc văn bản.', 'This browser cannot read text aloud.')); return false; }
  if (voicesLoaded && !zhVoice && !warnedVoice) {
    warnedVoice = true;
    toast(tr('Máy chưa có giọng đọc tiếng Trung nên âm có thể sai. Bản chính thức sẽ dùng audio chuẩn.', 'No Chinese voice on this device, so audio may be off. The full version uses recorded audio.'));
  }
  return true;
}
function speak(text) { if (!voiceCheck()) return; speechSynthesis.cancel(); speechSynthesis.speak(utter(text)); }
function stopSpeech() { try { speechSynthesis.cancel(); } catch (e) {} }

let toastT = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
}

export { loadVoices, speak, stopSpeech, toast, toastT, utter, voiceCheck, zhVoice };
