'use strict';

/* =====================================================================
   ZUIMO – Prototype (giai đoạn 0, bản mở rộng nội dung HSK 3.0)
   - SPA thuần JS (bản chính thức dùng Next.js); router trạng thái nội bộ,
     không dùng hash để chạy ổn trong iframe của trang đã publish.
   - Mọi tương tác dùng event delegation qua data-act → không mất listener
     khi render lại innerHTML.
   - Tiến độ lưu localStorage (bọc try/catch); bản chính thức lưu PostgreSQL.
   ===================================================================== */


const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');

export { $, $$, esc, view };
