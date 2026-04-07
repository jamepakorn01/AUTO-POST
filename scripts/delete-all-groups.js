/**
 * ลบแถวทั้งหมดในตาราง groups (ใช้ครั้งเดียวเมื่อต้องการเริ่มใหม่)
 * รัน: node scripts/delete-all-groups.js
 */
require('dotenv').config();
const db = require('../server/db');

(async () => {
  try {
    const n = await db.deleteAllGroups();
    console.log(`ลบ groups แล้ว ${n} แถว`);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
