import { $ } from '../core/dom.js';
import { check } from '../views/practice.js';

/* ---------- Icon (vẽ tay, stroke) ---------- */
const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  book: 'M4 19V6a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8M12 11.5v1',
  cards: 'M8 4h11a2 2 0 0 1 2 2v11M4 8h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z',
  chart: 'M5 20V11M11 20V5M17 20v-6M3 20h18',
  flame: 'M12 3c1 3.5 6 5.5 6 11a6 6 0 0 1-12 0c0-2.5 1.2-4 2.5-5 0 2.2 1 3.5 2.5 3.5 0-3.5-1-6.5 1-9.5z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  volume: 'M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11',
  x: 'M6 6l12 12M18 6L6 18',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  check: 'M5 12.5l4.5 4.5L19 7',
  play: 'M7 5l12 7-12 7z',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6',
  back: 'M15 5l-7 7 7 7',
  chev: 'M9 5l7 7-7 7',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM15.5 5.2l3.4-.9 3.1 14.8-3.4.9z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 1 0 0 8M4 21a8 8 0 0 1 16 0',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14M20 20l-4.2-4.2'
};
const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;

export { ICONS, ic };
