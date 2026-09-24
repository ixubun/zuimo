#!/usr/bin/env node
/**
 * admin.mjs – quản lý quyền quản trị viên.
 *   node tools/admin.mjs list                 liệt kê tài khoản (admin đánh dấu *)
 *   node tools/admin.mjs grant <username|email>
 *   node tools/admin.mjs revoke <username|email>
 * Trên VPS: docker compose exec api node tools/admin.mjs grant marry
 * Không có endpoint web để tự cấp quyền admin: cấp quyền là thao tác của người vận hành, làm qua shell.
 */
import pg from 'pg';
const [cmd, who] = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (cmd === 'list') {
    const { rows } = await pool.query('SELECT username, email, name, is_admin, created_at FROM users ORDER BY created_at');
    for (const r of rows) console.log(`${r.is_admin ? '*' : ' '} ${(r.username || '-').padEnd(20)} ${(r.email || '-').padEnd(30)} ${r.name}`);
  } else if ((cmd === 'grant' || cmd === 'revoke') && who) {
    const { rowCount, rows } = await pool.query(
      'UPDATE users SET is_admin = $2 WHERE username = $1 OR lower(email) = lower($1) RETURNING username, name', [who, cmd === 'grant']);
    if (!rowCount) { console.error('Không thấy tài khoản', who); process.exit(1); }
    console.log(`${cmd === 'grant' ? 'Đã cấp' : 'Đã thu'} quyền quản trị: ${rows[0].username} (${rows[0].name}). Người dùng đăng nhập lại để thấy menu Quản trị.`);
  } else {
    console.log('Cách dùng: node tools/admin.mjs list | grant <username> | revoke <username>'); process.exit(1);
  }
} finally { await pool.end(); }
