/**
 * Migration: User ผูก Groups, Assignment เหลือแค่ User + Job
 * - เพิ่ม group_ids ใน users
 * - ย้าย group_ids จาก assignments ไป merge เข้า users
 * - ลบ group_ids ออกจาก assignments
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
    console.log('1. เพิ่ม group_ids ใน users (ถ้ายังไม่มี)...');
    await pool.query(`
      ALTER TABLE ${schemaName}.users
      ADD COLUMN IF NOT EXISTS group_ids JSONB DEFAULT '[]'
    `);

    console.log('2. Merge group_ids จาก assignments เข้า users (ถ้ามี column)...');
    let assignments = [];
    try {
      const r = await pool.query(
        `SELECT user_id, group_ids FROM ${schemaName}.assignments WHERE group_ids IS NOT NULL AND jsonb_array_length(group_ids) > 0`
      );
      assignments = r.rows;
    } catch (e) {
      if (e.message && e.message.includes('group_ids')) {
        console.log('   (assignments ไม่มี group_ids - ข้ามขั้นตอนนี้)');
      } else throw e;
    }
    for (const a of assignments) {
      const gids = a.group_ids || [];
      if (gids.length === 0) continue;
      const { rows: [u] } = await pool.query(
        `SELECT group_ids FROM ${schemaName}.users WHERE id = $1`,
        [a.user_id]
      );
      if (!u) continue;
      const existing = new Set((u.group_ids || []).map(String));
      for (const g of gids) {
        if (g && !existing.has(String(g))) existing.add(String(g));
      }
      const merged = Array.from(existing).filter(Boolean);
      await pool.query(
        `UPDATE ${schemaName}.users SET group_ids = $2, updated_at = NOW() WHERE id = $1`,
        [a.user_id, JSON.stringify(merged)]
      );
    }

    console.log('3. ลบ column group_ids จาก assignments (ถ้ามี)...');
    try {
      await pool.query(`
        ALTER TABLE ${schemaName}.assignments
        DROP COLUMN IF EXISTS group_ids
      `);
    } catch (e) {
      console.log('   (ข้าม - column อาจไม่มีอยู่แล้ว)');
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
