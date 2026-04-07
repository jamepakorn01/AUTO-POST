/**
 * คลาย NOT NULL ของ assignments.job_id (ฐานเก่า) — ใช้ค่า DATABASE_URL + DB_SCHEMA จาก .env
 * รัน: npm run migrate:assignment-job-id-nullable
 */
require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_jobs';
const tableRef = SCHEMA.includes('-') ? `"${SCHEMA}".assignments` : `${SCHEMA}.assignments`;

async function main() {
  if (!DATABASE_URL) {
    console.error('ไม่พบ DATABASE_URL ใน .env — ใส่ connection string ของ PostgreSQL ก่อน');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });
  try {
    const sql = `ALTER TABLE ${tableRef} ALTER COLUMN job_id DROP NOT NULL`;
    console.log('รัน:', sql);
    await pool.query(sql);
    console.log('สำเร็จ: job_id อนุญาตให้เป็น NULL แล้ว (หรือคอลัมน์เคย nullable อยู่แล้ว)');
  } catch (err) {
    const m = String(err.message || err);
    if (/column "job_id" .* does not exist/i.test(m) || /does not exist/i.test(m) && /job_id/i.test(m)) {
      console.log('ข้าม: ตารางนี้ไม่มีคอลัมน์ job_id (ใช้แค่ job_ids อยู่แล้ว) — ไม่ต้องทำอะไร');
      process.exit(0);
    }
    console.error('ผิดพลาด:', m);
    console.error('\nถ้าขึ้นว่า permission denied ให้เปิด SQL Editor ของผู้ให้บริการ DB แล้วรันคำสั่งด้วย role ที่เป็นเจ้าของตาราง');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
