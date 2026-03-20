/**
 * Migration: สร้างตาราง post_logs (รูปแบบ Log File)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_jobs';

async function run() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL ไม่ได้ตั้งค่า');
    process.exit(1);
  }
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });
  const schemaName = SCHEMA.includes('-') ? `"${SCHEMA}"` : SCHEMA;

  const sql = `
CREATE TABLE IF NOT EXISTS ${schemaName}.post_logs (
  id VARCHAR(50) PRIMARY KEY,
  run_id VARCHAR(50),
  assignment_id VARCHAR(50),
  user_id VARCHAR(50),
  job_id VARCHAR(50),
  group_id VARCHAR(50),
  poster_name VARCHAR(255),
  owner VARCHAR(255),
  job_title VARCHAR(500),
  company VARCHAR(255),
  group_name VARCHAR(255),
  member_count VARCHAR(50) DEFAULT '0',
  post_link TEXT,
  post_status VARCHAR(50),
  comment_count INT DEFAULT 0,
  customer_phone VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_logs_run ON ${schemaName}.post_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_post_logs_created ON ${schemaName}.post_logs(created_at DESC);
`;

  try {
    await pool.query(sql);
    console.log('✅ ตาราง post_logs พร้อมใช้งาน');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
