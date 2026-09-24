import { TABS, VOCAB } from '../content/sample.js';
import { S, saveP } from '../core/state.js';
import { dayKey } from '../core/util.js';
import { renderTopRight } from '../ui/nav.js';

/* ---------- XP, chuỗi ngày ---------- */
function addXP(x) {
  if (x <= 0) return;
  const k = dayKey();
  S.p.days[k] = (S.p.days[k] || 0) + x;
  S.p.xp += x;
  if (S.p.lastDay !== k) {
    const y = dayKey(new Date(Date.now() - 864e5));
    S.p.streak = S.p.lastDay === y ? S.p.streak + 1 : 1;
    S.p.lastDay = k;
  }
  saveP(); renderTopRight();
}
/* Chuỗi bị đứt nếu hôm qua không học: hiển thị 0 nhưng không xoá lịch sử */
const liveStreak = () => {
  const k = dayKey(), y = dayKey(new Date(Date.now() - 864e5));
  return (S.p.lastDay === k || S.p.lastDay === y) ? S.p.streak : 0;
};
const isDue = h => !S.srs[h] || S.srs[h].due <= Date.now();
const dueCount = () => Object.values(S.srs).filter(x => x.due <= Date.now()).length + VOCAB.filter(v => !S.srs[v.h]).length;
const unitPct = () => Math.round(Object.keys(S.p.seen).length / TABS.length * 60 + (S.p.practiced ? 40 : 0));

export { addXP, dueCount, isDue, liveStreak, unitPct };
