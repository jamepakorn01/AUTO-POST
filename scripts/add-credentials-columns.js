/**
 * เพิ่มคอลัมน์ email, password ในตาราง users (สำหรับ DB ที่มีอยู่แล้ว)
 * รัน: node scripts/add-credentials-columns.js
 */
require('dotenv').config();
const db = require('../server/db');

async function run() {
  console.log('🔄 เพิ่มคอลัมน์ email, password...');
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT`);
  console.log('✅ เสร็จสิ้น - สามารถเพิ่ม/แก้ไข Email, Password ได้จาก Web Admin');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ เกิดข้อผิดพลาด:', err.message);
  process.exit(1);
});
