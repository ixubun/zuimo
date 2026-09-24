import { $, esc } from '../core/dom.js';

/* ---------- Pinyin: chấp nhận cả dấu thanh, số thanh và kiểu gõ Telex (ả = thanh 3) ---------- */
const MARKS = {};
[['a', 'āáǎà'], ['e', 'ēéěè'], ['i', 'īíǐì'], ['o', 'ōóǒò'], ['u', 'ūúǔù'], ['ü', 'ǖǘǚǜ']].forEach(([b, s]) => [...s].forEach((ch, i) => { MARKS[ch] = [b, i + 1]; }));
[['a', 'ả'], ['e', 'ẻ'], ['i', 'ỉ'], ['o', 'ỏ'], ['u', 'ủ']].forEach(([b, ch]) => { MARKS[ch] = [b, 3]; });
function parsePinyin(input) {
  const s = input.normalize('NFC').toLowerCase().replace(/v/g, 'ü');
  let letters = ''; const tones = [];
  for (const ch of s) {
    if (MARKS[ch]) { letters += MARKS[ch][0]; tones.push(MARKS[ch][1]); }
    else if (/[1-4]/.test(ch)) tones.push(+ch);
    else if (/[a-zü]/.test(ch)) letters += ch;
  }
  return { letters, tones };
}
const py = arr => `<span class="py">${arr.map(([s, t]) => `<span class="t${t}">${esc(s)}</span>`).join('')}</span>`;

export { MARKS, parsePinyin, py };
