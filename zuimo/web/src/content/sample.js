import { py } from '../features/pinyin.js';

/* ---------- Nội dung mẫu HSK 1 – Bài 1 (tự biên soạn, không lấy từ giáo trình) ---------- */
const LEVELS = [
  { n: '1', words: 500, chars: 300 }, { n: '2', words: 772, chars: 300 }, { n: '3', words: 973, chars: 300 },
  { n: '4', words: 1000, chars: 300 }, { n: '5', words: 1071, chars: 300 }, { n: '6', words: 1140, chars: 300 },
  { n: '7–9', words: 5636, chars: 1200 }
];
const UNITS = [
  { id: 1, zh: '你好', title: { vi: 'Chào hỏi và giới thiệu', en: 'Greetings and introductions' }, open: true },
  { id: 2, zh: '家人', title: { vi: 'Gia đình', en: 'Family' } },
  { id: 3, zh: '数字', title: { vi: 'Số đếm và tuổi', en: 'Numbers and age' } },
  { id: 4, zh: '时间', title: { vi: 'Ngày giờ', en: 'Dates and time' } },
  { id: 5, zh: '买东西', title: { vi: 'Mua sắm', en: 'Shopping' } },
  { id: 6, zh: '吃饭', title: { vi: 'Ăn uống', en: 'Food and drink' } }
];
/* Đường nét thanh điệu theo thang 5 bậc (Chao): 55, 35, 214, 51 */
const TONES = [
  { n: 1, syl: 'mā', h: '妈', g: { vi: 'mẹ', en: 'mother' }, nm: { vi: 'Thanh 1: cao và bằng', en: 'Tone 1: high and level' }, pts: '4,6 56,6' },
  { n: 2, syl: 'má', h: '麻', g: { vi: 'tê, cây gai', en: 'numb, hemp' }, nm: { vi: 'Thanh 2: đi lên', en: 'Tone 2: rising' }, pts: '4,24 56,6' },
  { n: 3, syl: 'mǎ', h: '马', g: { vi: 'con ngựa', en: 'horse' }, nm: { vi: 'Thanh 3: xuống thấp rồi lên', en: 'Tone 3: dipping' }, pts: '4,20 26,40 56,14' },
  { n: 4, syl: 'mà', h: '骂', g: { vi: 'mắng', en: 'to scold' }, nm: { vi: 'Thanh 4: rơi mạnh xuống', en: 'Tone 4: sharp fall' }, pts: '4,6 56,40' },
  { n: 5, syl: 'ma', h: '吗', g: { vi: 'trợ từ hỏi', en: 'question particle' }, nm: { vi: 'Thanh nhẹ: ngắn và nhẹ', en: 'Neutral: short and light' }, pts: null }
];
/* py: [âm tiết, thanh] – thanh 5 = thanh nhẹ. Dấu cách nằm trong chuỗi âm tiết khi cần tách từ. */
const VOCAB = [
  { h: '你好', py: [['nǐ ', 3], ['hǎo', 3]], vi: 'xin chào', en: 'hello', hv: 'nhĩ hảo', note: { vi: 'Hai thanh 3 đi liền nhau: âm đầu đọc thành thanh 2, nghe như ní hǎo.', en: 'Two 3rd tones in a row: the first becomes a 2nd tone, sounding like ní hǎo.' } },
  { h: '你', py: [['nǐ', 3]], vi: 'bạn, anh, chị', en: 'you', hv: 'nhĩ' },
  { h: '我', py: [['wǒ', 3]], vi: 'tôi, mình', en: 'I, me', hv: 'ngã' },
  { h: '好', py: [['hǎo', 3]], vi: 'tốt, khỏe', en: 'good, well', hv: 'hảo' },
  { h: '是', py: [['shì', 4]], vi: 'là', en: 'to be', hv: 'thị' },
  { h: '不', py: [['bù', 4]], vi: 'không', en: 'not', hv: 'bất', note: { vi: 'Đứng trước thanh 4 thì đọc thành bú, ví dụ 不是 bú shì.', en: 'Before a 4th tone it is read bú, as in 不是 bú shì.' } },
  { h: '吗', py: [['ma', 5]], vi: '… không? (trợ từ hỏi)', en: 'yes/no question particle', hv: 'ma' },
  { h: '呢', py: [['ne', 5]], vi: 'còn … thì sao?', en: 'and …? (particle)', hv: 'ni' },
  { h: '叫', py: [['jiào', 4]], vi: 'gọi, tên là', en: 'to be called', hv: 'khiếu' },
  { h: '什么', py: [['shén', 2], ['me', 5]], vi: 'cái gì', en: 'what', hv: 'thập ma' },
  { h: '名字', py: [['míng', 2], ['zi', 5]], vi: 'tên', en: 'name', hv: 'danh tự' },
  { h: '老师', py: [['lǎo', 3], ['shī', 1]], vi: 'giáo viên', en: 'teacher', hv: 'lão sư' },
  { h: '学生', py: [['xué', 2], ['sheng', 5]], vi: 'học sinh', en: 'student', hv: 'học sinh' },
  { h: '人', py: [['rén', 2]], vi: 'người', en: 'person', hv: 'nhân' },
  { h: '中国', py: [['Zhōng', 1], ['guó', 2]], vi: 'Trung Quốc', en: 'China', hv: 'Trung Quốc' },
  { h: '谢谢', py: [['xiè', 4], ['xie', 5]], vi: 'cảm ơn', en: 'thank you', hv: 'tạ tạ' },
  { h: '不客气', py: [['bú ', 2], ['kè', 4], ['qi', 5]], vi: 'không có gì', en: "you're welcome", hv: 'bất khách khí' },
  { h: '再见', py: [['zài', 4], ['jiàn', 4]], vi: 'tạm biệt', en: 'goodbye', hv: 'tái kiến' }
];
const RADICALS = [
  { r: '亻', nm: { vi: 'Nhân đứng', en: 'Person (side form)' }, m: { vi: 'người; dạng của 人 khi đứng bên trái', en: 'person; the left-side form of 人' }, ex: ['你', '他', '们'] },
  { r: '女', nm: { vi: 'Nữ', en: 'Woman' }, m: { vi: 'phụ nữ', en: 'woman' }, ex: ['好', '妈', '她'] },
  { r: '子', nm: { vi: 'Tử', en: 'Child' }, m: { vi: 'con, đứa trẻ', en: 'child' }, ex: ['字', '学', '孩'] },
  { r: '口', nm: { vi: 'Khẩu', en: 'Mouth' }, m: { vi: 'miệng; hay gặp ở trợ từ, âm thanh', en: 'mouth; common in particles and sounds' }, ex: ['吗', '呢', '叫'] },
  { r: '讠', nm: { vi: 'Ngôn đứng', en: 'Speech (side form)' }, m: { vi: 'lời nói', en: 'speech, words' }, ex: ['谢', '认', '识'] },
  { r: '日', nm: { vi: 'Nhật', en: 'Sun' }, m: { vi: 'mặt trời, ngày', en: 'sun, day' }, ex: ['是', '明', '早'] }
];
const GRAMMAR = [
  {
    t: { vi: 'Câu với 是: A là B', en: '是 sentences: A is B' },
    d: { vi: '是 nối hai danh từ, giống "là" trong tiếng Việt. Muốn phủ định thì đặt 不 ngay trước 是.', en: '是 links two nouns, like "is". To negate, put 不 right before 是.' },
    f: [[{ vi: 'Khẳng định', en: 'Positive' }, ['A', '是', 'B']], [{ vi: 'Phủ định', en: 'Negative' }, ['A', '不是', 'B']]],
    ex: [
      { h: '我是学生。', p: 'Wǒ shì xuésheng.', vi: 'Tôi là học sinh.', en: 'I am a student.' },
      { h: '我不是老师。', p: 'Wǒ bú shì lǎoshī.', vi: 'Tôi không phải giáo viên.', en: 'I am not a teacher.' }
    ]
  },
  {
    t: { vi: 'Câu hỏi có/không với 吗', en: 'Yes/no questions with 吗' },
    d: { vi: 'Thêm 吗 vào cuối một câu trần thuật là thành câu hỏi. Trật tự các từ khác giữ nguyên.', en: 'Add 吗 to the end of a statement to make a question. Word order stays the same.' },
    f: [[{ vi: 'Cấu trúc', en: 'Pattern' }, [{ vi: 'Câu trần thuật', en: 'Statement' }, '吗', '？']]],
    ex: [
      { h: '你是老师吗？', p: 'Nǐ shì lǎoshī ma?', vi: 'Bạn là giáo viên à?', en: 'Are you a teacher?' },
      { h: '你是中国人吗？', p: 'Nǐ shì Zhōngguó rén ma?', vi: 'Bạn là người Trung Quốc phải không?', en: 'Are you Chinese?' }
    ]
  },
  {
    t: { vi: 'Hỏi bằng 什么: từ để hỏi không đảo lên đầu câu', en: 'Asking with 什么: no word-order change' },
    d: { vi: '什么 đứng đúng vào chỗ của thông tin cần hỏi. Câu trả lời chỉ cần thay 什么 bằng thông tin đó.', en: '什么 sits exactly where the missing information goes. To answer, replace 什么 with that information.' },
    f: [[{ vi: 'Hỏi', en: 'Ask' }, [{ vi: 'Chủ ngữ', en: 'Subject' }, '叫', '什么', '名字']], [{ vi: 'Đáp', en: 'Answer' }, [{ vi: 'Chủ ngữ', en: 'Subject' }, '叫', { vi: 'Tên', en: 'Name' }]]],
    ex: [
      { h: '你叫什么名字？', p: 'Nǐ jiào shénme míngzi?', vi: 'Bạn tên là gì?', en: "What's your name?" },
      { h: '我叫大明。', p: 'Wǒ jiào Dàmíng.', vi: 'Mình tên là Đại Minh.', en: "I'm Daming." }
    ]
  },
  {
    t: { vi: 'Hỏi lại ngắn gọn với 呢', en: 'Bouncing a question back with 呢' },
    d: { vi: 'Sau khi trả lời, dùng "danh từ + 呢？" để hỏi ngược lại cùng câu hỏi đó.', en: 'After answering, use "noun + 呢？" to ask the same question back.' },
    f: [[{ vi: 'Cấu trúc', en: 'Pattern' }, [{ vi: 'Danh từ', en: 'Noun' }, '呢', '？']]],
    ex: [{ h: '我是学生，你呢？', p: 'Wǒ shì xuésheng, nǐ ne?', vi: 'Mình là học sinh, còn bạn?', en: "I'm a student, and you?" }]
  }
];
const DIALOGUE = {
  who: { A: { h: '小月', p: 'Xiǎoyuè' }, B: { h: '大明', p: 'Dàmíng' } },
  lines: [
    { s: 'A', h: '你好！', p: 'Nǐ hǎo!', vi: 'Chào bạn!', en: 'Hi!' },
    { s: 'B', h: '你好！', p: 'Nǐ hǎo!', vi: 'Chào bạn!', en: 'Hi!' },
    { s: 'A', h: '你叫什么名字？', p: 'Nǐ jiào shénme míngzi?', vi: 'Bạn tên là gì?', en: "What's your name?" },
    { s: 'B', h: '我叫大明。你呢？', p: 'Wǒ jiào Dàmíng. Nǐ ne?', vi: 'Mình tên là Đại Minh. Còn bạn?', en: "I'm Daming. And you?" },
    { s: 'A', h: '我叫小月。你是老师吗？', p: 'Wǒ jiào Xiǎoyuè. Nǐ shì lǎoshī ma?', vi: 'Mình là Tiểu Nguyệt. Bạn là giáo viên à?', en: "I'm Xiaoyue. Are you a teacher?" },
    { s: 'B', h: '不是，我是学生。', p: 'Bú shì, wǒ shì xuésheng.', vi: 'Không, mình là học sinh.', en: "No, I'm a student." },
    { s: 'A', h: '再见！', p: 'Zàijiàn!', vi: 'Tạm biệt!', en: 'Bye!' },
    { s: 'B', h: '再见！', p: 'Zàijiàn!', vi: 'Tạm biệt!', en: 'Bye!' }
  ]
};
const WCHARS = [
  { c: '你', py: [['nǐ', 3]], m: { vi: 'bạn', en: 'you' } },
  { c: '好', py: [['hǎo', 3]], m: { vi: 'tốt, khỏe', en: 'good' } },
  { c: '我', py: [['wǒ', 3]], m: { vi: 'tôi', en: 'I, me' } },
  { c: '是', py: [['shì', 4]], m: { vi: 'là', en: 'to be' } },
  { c: '人', py: [['rén', 2]], m: { vi: 'người', en: 'person' } },
  { c: '中', py: [['zhōng', 1]], m: { vi: 'giữa, trung tâm', en: 'middle' } }
];
const TABS = [
  ['pinyin', { vi: 'Pinyin và thanh điệu', en: 'Pinyin and tones' }],
  ['vocab', { vi: 'Từ vựng', en: 'Vocabulary' }],
  ['radicals', { vi: 'Bộ thủ', en: 'Radicals' }],
  ['grammar', { vi: 'Ngữ pháp', en: 'Grammar' }],
  ['dialogue', { vi: 'Hội thoại', en: 'Dialogue' }],
  ['writing', { vi: 'Tập viết', en: 'Writing' }]
];

export { DIALOGUE, GRAMMAR, LEVELS, RADICALS, TABS, TONES, UNITS, VOCAB, WCHARS };
