import { meaning } from '../content/data.js';
import { shuffle } from '../core/util.js';
import { py } from '../features/pinyin.js';

/* ---------- Phiên luyện tập: mỗi bài = type + dữ liệu, dùng chung 1 engine ---------- */
const KIND = {
  mcq: { vi: 'Trắc nghiệm nghĩa', en: 'Meaning' }, tone: { vi: 'Chọn thanh điệu', en: 'Tones' },
  listen: { vi: 'Nghe và chọn', en: 'Listening' }, order: { vi: 'Sắp xếp câu', en: 'Word order' },
  match: { vi: 'Ghép cặp', en: 'Matching' }, type: { vi: 'Điền pinyin', en: 'Type the pinyin' },
  rewrite: { vi: 'Viết lại câu', en: 'Rewrite' }
};
function buildSession() {
  const opts = (list, correct, zh, py) => ({ options: shuffle(list.map((o, i) => ({ o, ok: i === correct }))), optZh: !!zh, optPy: !!py });
  return [
    Object.assign({ type: 'mcq', prompt: { vi: 'Từ này nghĩa là gì?', en: 'What does this word mean?' }, hanzi: '谢谢',
      explain: { vi: '谢谢 xièxie là lời cảm ơn, âm tiết thứ hai đọc thanh nhẹ.', en: '谢谢 xièxie means thank you; the second syllable is neutral tone.' } },
      opts([{ vi: 'cảm ơn', en: 'thank you' }, { vi: 'tạm biệt', en: 'goodbye' }, { vi: 'xin chào', en: 'hello' }, { vi: 'giáo viên', en: 'teacher' }], 0)),
    Object.assign({ type: 'tone', prompt: { vi: 'Chọn pinyin đúng của chữ này', en: 'Pick the correct pinyin' }, hanzi: '好',
      explain: { vi: '好 đọc thanh 3 (hǎo): xuống thấp rồi lên.', en: '好 is 3rd tone (hǎo): dip, then rise.' } },
      opts(['hǎo', 'hāo', 'háo', 'hào'], 0, false, true)),
    Object.assign({ type: 'listen', prompt: { vi: 'Nghe và chọn từ bạn nghe được', en: 'Listen and pick what you hear' }, audio: '再见', ansZh: true,
      explain: { vi: '再见 zàijiàn: hai thanh 4 liền nhau, dứt khoát.', en: '再见 zàijiàn: two crisp 4th tones.' } },
      opts(['再见', '谢谢', '你好', '老师'], 0, true)),
    { type: 'order', prompt: { vi: 'Sắp xếp thành câu đúng', en: 'Build the sentence' }, quote: { vi: 'Tôi là học sinh.', en: 'I am a student.' },
      tiles: ['学生', '我', '老师', '是'], answer: ['我', '是', '学生'], ansZh: true,
      explain: { vi: 'Trật tự cơ bản: chủ ngữ + 是 + danh từ. 老师 là từ gây nhiễu.', en: 'Basic order: subject + 是 + noun. 老师 is a distractor.' } },
    { type: 'match', prompt: { vi: 'Ghép chữ Hán với nghĩa', en: 'Match each character to its meaning' },
      pairs: [['你', { vi: 'bạn', en: 'you' }], ['我', { vi: 'tôi', en: 'I' }], ['好', { vi: 'tốt', en: 'good' }], ['人', { vi: 'người', en: 'person' }], ['是', { vi: 'là', en: 'to be' }]],
      explain: { vi: 'Mẹo: 你 có bộ nhân đứng 亻, gợi ý nghĩa liên quan đến người.', en: 'Tip: 你 has the person radical 亻.' } },
    { type: 'type', prompt: { vi: 'Gõ pinyin có thanh điệu', en: 'Type the pinyin with tones' }, hanzi: '你好', letters: 'nihao', tones: [3, 3], display: 'nǐ hǎo',
      explain: { vi: 'Viết theo thanh gốc là nǐ hǎo, còn khi nói thì đọc thành ní hǎo.', en: 'Written with base tones nǐ hǎo, spoken as ní hǎo.' } },
    Object.assign({ type: 'mcq', prompt: { vi: 'Chọn chữ Hán có nghĩa này', en: 'Pick the characters for this meaning' }, quote: { vi: 'giáo viên', en: 'teacher' }, ansZh: true,
      explain: { vi: '老师 lǎoshī: giáo viên. 学生 xuésheng mới là học sinh.', en: '老师 lǎoshī is teacher; 学生 xuésheng is student.' } },
      opts(['老师', '学生', '名字', '中国'], 0, true)),
    { type: 'type', prompt: { vi: 'Gõ pinyin có thanh điệu', en: 'Type the pinyin with tones' }, hanzi: '中国', letters: 'zhongguo', tones: [1, 2], display: 'Zhōngguó',
      explain: { vi: '中 thanh 1, 国 thanh 2. Tên riêng viết hoa chữ cái đầu.', en: '中 is tone 1, 国 is tone 2. Proper nouns are capitalised.' } },
    { type: 'rewrite', prompt: { vi: 'Viết lại thành câu hỏi có/không', en: 'Rewrite as a yes/no question' }, quote: '你是学生。', quoteZh: true,
      tiles: ['吗', '你', '是', '学生', '呢'], answer: ['你', '是', '学生', '吗'], ansZh: true,
      explain: { vi: 'Giữ nguyên câu, chỉ thêm 吗 vào cuối. 呢 dùng để hỏi ngược lại nên không hợp ở đây.', en: 'Keep the statement and add 吗 at the end. 呢 bounces a question back, so it does not fit.' } }
  ];
}

export { KIND, buildSession };
