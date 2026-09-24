import { $, esc, view } from '../core/dom.js';
import { tr } from '../core/util.js';

/* ---------- Nguồn dữ liệu và giấy phép ---------- */
function renderAbout() {
  const src = [
    ['complete-hsk-vocabulary', 'MIT', tr('Từ vựng HSK 3.0 (cả hai phiên bản), pinyin, bộ thủ, từ loại', 'HSK 3.0 vocabulary, pinyin, radicals, parts of speech'), 'https://github.com/drkameleon/complete-hsk-vocabulary'],
    ['CC-CEDICT', 'CC BY-SA 4.0', tr('Nghĩa tiếng Anh, qua complete-hsk-vocabulary', 'English meanings, via complete-hsk-vocabulary'), 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict'],
    ['krmanik/HSK-3.0', tr('Theo từng nguồn gốc', 'Per upstream source'), tr('Danh sách từ, chữ Hán và 572 điểm ngữ pháp theo chuẩn GF0025-2021', 'Word, character and grammar lists of GF0025-2021'), 'https://github.com/krmanik/HSK-3.0'],
    ['hanviet-pinyin-words', 'MIT', tr('Âm Hán Việt theo từng cách đọc', 'Sino-Vietnamese readings'), 'https://github.com/ph0ngp/hanviet-pinyin-words'],
    ['Hanzi Writer', 'MIT', tr('Hoạt ảnh và chấm thứ tự nét', 'Stroke animation and quizzes'), 'https://github.com/chanind/hanzi-writer'],
    ['Make Me a Hanzi', 'Arphic Public License', tr('Dữ liệu nét chữ', 'Stroke data'), 'https://github.com/skishore/makemeahanzi'],
    ['pypinyin, jieba', 'MIT', tr('Sinh pinyin cho câu ví dụ', 'Pinyin for example sentences'), 'https://github.com/mozillazg/python-pinyin']
  ];
  view.innerHTML = `<div class="lhead"><h1>${tr('Nguồn dữ liệu và giấy phép', 'Data sources and licences')}</h1></div>
  <p class="lead">${tr('Nghĩa tiếng Việt, giải thích ngữ pháp, bản dịch ví dụ và bài học do ZUIMO tự biên soạn. Dữ liệu dưới đây đến từ các dự án mở; phần có nguồn gốc CC BY-SA được chia sẻ lại theo cùng giấy phép.', 'Vietnamese meanings, grammar notes, translations and lessons are written by ZUIMO. The data below comes from open projects; CC BY-SA derived parts are shared under the same licence.')}</p>
  <div class="credits">${src.map(([n, l, d, u]) => `<div class="card"><a href="${u}" target="_blank" rel="noopener noreferrer">${esc(n)}</a><span class="lic">${esc(l)}</span><div class="hint">${esc(d)}</div></div>`).join('')}</div>`;
}

export { renderAbout };
