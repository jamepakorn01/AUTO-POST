/**
 * Migration: Assignment เลือก Job ได้หลายตัว (job_id -> job_ids)
 */
require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_jobs';

async function run() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL ไม่ได้ตั้งค่า');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });
  const schemaName = SCHEMA.includes('-') ? `"${SCHEMA}"` : SCHEMA;

  try {
    console.log('1. เพิ่ม job_ids ใน assignments...');
    await pool.query(`
      ALTER TABLE ${schemaName}.assignments
      ADD COLUMN IF NOT EXISTS job_ids JSONB DEFAULT '[]'
    `);

    const { rows: colCheck } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'assignments' AND column_name = 'job_id'`,
      [SCHEMA]
    );
    if (colCheck.length > 0) {
      console.log('2. Copy job_id ไป job_ids...');
      await pool.query(`
        UPDATE ${schemaName}.assignments
        SET job_ids = jsonb_build_array(job_id::text)
        WHERE job_id IS NOT NULL AND (job_ids IS NULL OR job_ids = '[]')
      `);
      console.log('3. ลบ column job_id...');
      await pool.query(`
        ALTER TABLE ${schemaName}.assignments
        DROP COLUMN IF EXISTS job_id
      `);
    } else {
      console.log('2. ไม่มี job_id (ใช้ job_ids อยู่แล้ว) ข้าม');
    }

    console.log('✅ Migration เสร็จสิ้น');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
