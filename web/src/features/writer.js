import HanziWriter from 'hanzi-writer';
import { hasStroke, loadStroke } from '../content/data.js';
import { $ } from '../core/dom.js';
import { S } from '../core/state.js';
import { cssv, reducedMotion } from '../core/util.js';

/* ---------- Hanzi Writer ---------- */
/* hanzi-writer gọi loader khi cần: tải file nét của đúng chữ đó, có cache (content/data.js) */
const loader = (c, onLoad, onErr) => loadStroke(c).then(d => (d ? onLoad(d) : onErr(new Error('Thiếu dữ liệu nét cho ' + c)))).catch(onErr);
const gridSvg = () => '<svg class="grid" viewBox="0 0 100 100" aria-hidden="true"><rect x="1" y="1" width="98" height="98" rx="5"/><line x1="0" y1="50" x2="100" y2="50"/><line x1="50" y1="0" x2="50" y2="100"/><line x1="1" y1="1" x2="99" y2="99"/><line x1="99" y1="1" x2="1" y2="99"/></svg>';
function releaseWriters() {
  try { S.heroW && S.heroW.pauseAnimation(); } catch (e) {}
  try { S.writer && S.writer.cancelQuiz(); } catch (e) {}
  S.heroW = null; S.writer = null;
}
function mountHero() {
  const box = $('#heroW');
  if (!box) return;   /* HanziWriter là import ES module, không còn nằm trên window */
  const size = box.offsetWidth || 200;
  S.heroW = HanziWriter.create(box, '中', {
    width: size, height: size, padding: 22, showOutline: true,
    strokeColor: cssv('--ink'), outlineColor: cssv('--line-2'), radicalColor: cssv('--verm'),
    strokeAnimationSpeed: 0.9, delayBetweenStrokes: 280, delayBetweenLoops: 2600, charDataLoader: loader
  });
  if (!reducedMotion()) S.heroW.loopCharacterAnimation();
}
function mountWriter() { createWriter($('#writeW'), S.wchar, 300); }
function mountLibWriter() { if (S.lib.char && hasStroke(S.lib.char)) createWriter($('#libW'), S.lib.char, 220); }
function createWriter(box, ch, fallback) {
  if (!box) return;   /* HanziWriter là import ES module, không còn nằm trên window */
  box.innerHTML = '';
  const size = box.offsetWidth || fallback;
  S.writerChar = ch;
  S.writer = HanziWriter.create(box, ch, {
    width: size, height: size, padding: 24, showOutline: true, showCharacter: false,
    strokeColor: cssv('--ink'), outlineColor: cssv('--line-2'), radicalColor: cssv('--verm'),
    drawingColor: cssv('--t1'), highlightColor: cssv('--jade'), drawingWidth: Math.max(14, Math.round(size / 18)),
    showHintAfterMisses: 2, strokeAnimationSpeed: 1, delayBetweenStrokes: 320, charDataLoader: loader
  });
}
function wStatus(msg, cls = '') { const el = $('#wStatus'); if (el) { el.textContent = msg; el.className = 'wstatus ' + cls; } }

export { createWriter, gridSvg, loader, mountHero, mountLibWriter, mountWriter, releaseWriters, wStatus };
