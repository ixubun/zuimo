import { $ } from '../core/dom.js';
import { S } from '../core/state.js';

const tr = (vi, en) => (S.lang === 'vi' ? vi : en);
const L = o => (o == null ? '' : typeof o === 'string' ? o : (o[S.lang] ?? o.vi));

/* Ngày theo giờ địa phương (không dùng toISOString vì lệch UTC) */
function dayKey(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#444';
const num = n => n.toLocaleString(S.lang === 'vi' ? 'vi-VN' : 'en-US');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export { L, cssv, dayKey, num, reducedMotion, shuffle, tr };
