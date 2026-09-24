/**
 * Chạy các file trong migrations/ theo thứ tự tên, mỗi file đúng một lần.
 * Dùng advisory lock để nhiều bản sao API khởi động cùng lúc không chạy đè lên nhau.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, tx } from './db.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const LOCK_ID = 8_912_733; // số tuỳ ý, chỉ cần cố định cho dự án này

export async function migrate() {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await readFile(join(DIR, f), 'utf8');
      await tx(async (t) => {
        await t.query(sql);
        await t.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      });
      console.log(JSON.stringify({ lvl: 'info', msg: 'migration applied', file: f }));
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    c.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
