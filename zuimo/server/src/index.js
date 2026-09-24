/** Điểm khởi động API: chạy migration, dựng router, bật HTTP server, tắt êm khi nhận tín hiệu. */
import http from 'node:http';
import { cfg } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { createRouter, json } from './http.js';
import { mountAuth } from './auth.js';
import { mountOAuth } from './oauth.js';
import { mountProgress } from './progress.js';
import { mountProfile } from './profile.js';
import { mountDict } from './dict.js';
import { mountPractice } from './practice.js';
import { mountSpeech } from './speech.js';
import { mountExam } from './exam.js';
import { mountImages } from './images.js';
import { mountExamImport } from './exam-import.js';

const router = createRouter();
router.get('/api/health', async (req, res) => {
  const t0 = Date.now();
  await pool.query('SELECT 1');
  json(res, 200, { ok: true, env: cfg.env, dbMs: Date.now() - t0, version: process.env.APP_VERSION || 'dev' });
});
mountAuth(router);
mountOAuth(router);
mountProgress(router);
mountProfile(router);
mountDict(router);
mountPractice(router);
mountSpeech(router);
mountExam(router);
mountImages(router);
mountExamImport(router);

const server = http.createServer((req, res) => router.handle(req, res));
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;

const start = async () => {
  await migrate();                                   // migration chạy trước khi nhận request đầu tiên
  server.listen(cfg.port, () => console.log(JSON.stringify({ lvl: 'info', msg: 'API sẵn sàng', port: cfg.port, publicUrl: cfg.publicUrl })));
};

// Tắt êm: ngừng nhận kết nối mới, chờ request đang chạy xong, rồi đóng pool
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(JSON.stringify({ lvl: 'info', msg: 'đang tắt', sig }));
    server.close(async () => { await pool.end().catch(() => {}); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
start().catch((e) => { console.error(e); process.exit(1); });
