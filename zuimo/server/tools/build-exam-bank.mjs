#!/usr/bin/env node
/**
 * build-exam-bank.mjs – sinh sẵn ngân hàng đề cho từng cấp và lưu vào exam_sets (kind='bank').
 *   node tools/build-exam-bank.mjs [--per 10] [--ver 20,30] [--lvl 1-6] [--replace]
 * Mặc định 10 đề mỗi cấp, cả hai đề cương, giữ đề cũ (thêm số thứ tự tiếp theo). --replace xoá đề bank cũ của cấp đó trước.
 * Chạy lại sau khi thêm ảnh thật / câu hội thoại mới để đề dùng dữ liệu mới.
 * Trên VPS: docker compose exec api node tools/build-exam-bank.mjs --replace
 */
import pg from 'pg';
import { generatePaper } from '../src/exam-gen.js';
import { pool } from '../src/db.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PER = Number(arg('--per', 10));
const VERS = arg('--ver', '20,30').split(',');
const [l1, l2] = arg('--lvl', '1-6').split('-').map(Number);
const REPLACE = process.argv.includes('--replace');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

for (const ver of VERS) for (let lvl = l1; lvl <= (l2 || l1); lvl++) {
  if (REPLACE) await pool.query(`DELETE FROM exam_sets WHERE kind = 'bank' AND ver = $1 AND lvl = $2`, [ver, lvl]);
  const { rows: [{ n }] } = await pool.query(`SELECT coalesce(max(seq), 0) AS n FROM exam_sets WHERE kind = 'bank' AND ver = $1 AND lvl = $2`, [ver, lvl]);
  let made = 0;
  for (let k = 1; k <= PER; k++) {
    const seq = Number(n) + k;
    const paper = await generatePaper(ver, lvl);
    const short = paper.sections.flatMap(s => s.parts).filter(p => p.short);
    if (short.length) log(`  cảnh báo HSK ${ver} L${lvl} đề ${seq}: thiếu câu ở ${short.map(p => p.key).join(', ')}`);
    await pool.query(`INSERT INTO exam_sets (ver, lvl, title, paper, enabled, kind, seq) VALUES ($1,$2,$3,$4,true,'bank',$5)`,
      [ver, lvl, `Đề số ${seq}`, JSON.stringify(paper), seq]);
    made++;
  }
  log(`HSK ${ver === '30' ? '3.0' : '2.0'} cấp ${lvl}: +${made} đề (tổng ${Number(n) + made})`);
}
await pool.end();
