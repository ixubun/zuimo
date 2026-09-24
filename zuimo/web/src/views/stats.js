import { backBtn } from '../app/router.js';
import { $, view } from '../core/dom.js';
import { ic } from '../core/icons.js';
import { S } from '../core/state.js';
import { dayKey, num, tr } from '../core/util.js';
import { liveStreak } from '../features/xp.js';

/* ---------- Thống kê ---------- */
function renderStats() {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); days.push({ k: dayKey(d), d }); }
  const vals = days.map(x => S.p.days[x.k] || 0), max = Math.max(30, ...vals);
  const wd = S.lang === 'vi' ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const learned = Object.values(S.srs).filter(s => s.reps > 0).length;
  const acc = S.p.answered ? Math.round(S.p.correct / S.p.answered * 100) + '%' : '–';
  const stat = (i, c, v, l) => `<div class="card stat"><div class="badge-ic ${c}">${ic(i)}</div><div><div class="big">${v}</div><div class="sub">${l}</div></div></div>`;
  const done = Object.keys(S.p.charsDone);
  view.innerHTML = `
  <div class="lhead">${backBtn()}<h1>${tr('Thống kê học tập', 'Your progress')}</h1></div>
  <div class="sgrid">
    ${stat('flame', 'bi-verm', liveStreak(), tr('ngày học liên tiếp', 'day streak'))}
    ${stat('bolt', 'bi-sun', S.p.xp, tr('tổng XP', 'total XP'))}
    ${stat('cards', 'bi-jade', num(learned), tr('từ đã ôn qua thẻ', 'words reviewed'))}
    ${stat('target', 'bi-blue', acc, tr('độ chính xác bài tập', 'practice accuracy'))}
  </div>
  <div class="card">
    <h2 class="sec">${tr('XP trong 7 ngày qua', 'XP over the last 7 days')}</h2>
    <div class="chart" role="img" aria-label="${tr('Biểu đồ XP 7 ngày', '7-day XP chart')}: ${vals.join(', ')}">
      ${days.map((x, i) => `<div class="colb ${i === 6 ? 'today' : ''}"><span class="v">${vals[i]}</span><div class="bw"><div class="b" style="height:${Math.max(3, vals[i] / max * 100)}%"></div></div><span class="d">${i === 6 ? tr('Nay', 'Today') : wd[x.d.getDay()]}</span></div>`).join('')}
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <h2 class="sec">${tr('Chữ đã tự viết đúng', 'Characters written')}</h2>
    ${done.length ? `<div class="chars-done">${done.map(c => `<span lang="zh-CN">${c}</span>`).join('')}</div>` : `<p class="muted">${tr('Chưa có chữ nào. Vào phần Tập viết của bài 1 để bắt đầu.', 'None yet. Open Writing in lesson 1 to start.')}</p>`}
    <button class="btn btn-ghost btn-sm" data-act="reset">${tr('Xóa dữ liệu học thử', 'Reset demo progress')}</button>
  </div>`;
}

export { renderStats };
