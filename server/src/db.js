/** Pool PostgreSQL dùng chung + tiện ích truy vấn và giao dịch. */
import pg from 'pg';
import { cfg } from './config.js';

// timestamptz trả về chuỗi ISO cho gọn khi đưa ra JSON
pg.types.setTypeParser(1184, (v) => (v === null ? null : new Date(v).toISOString()));
pg.types.setTypeParser(1082, (v) => v); // date giữ nguyên dạng YYYY-MM-DD

export const pool = new pg.Pool({
  connectionString: cfg.databaseUrl,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Câu lệnh treo quá lâu sẽ bị huỷ để không giữ kết nối của cả pool
  statement_timeout: 10_000
});

pool.on('error', (err) => console.error(JSON.stringify({ lvl: 'error', msg: 'pool error', err: err.message })));

export const q = (text, params) => pool.query(text, params);

/** Chạy nhiều câu lệnh trong một giao dịch, tự ROLLBACK khi có lỗi. */
export async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
