/**
 * Migration: เพิ่ม fb_access_token ใน users (เก็บ token ตาม User)
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
    console.log('เพิ่ม fb_access_token ใน users...');
    await pool.query(`
      ALTER TABLE ${schemaName}.users
      ADD COLUMN IF NOT EXISTS fb_access_token TEXT
    `);
    console.log('✅ Migration เสร็จสิ้น');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
