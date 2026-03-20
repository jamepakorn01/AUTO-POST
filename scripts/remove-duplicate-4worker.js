/**
 * ลบ User 4worker ที่ซ้ำกับ User 4 (รวม Assignments เข้า User 4 ก่อน)
 * รัน: node scripts/remove-duplicate-4worker.js
 */
require('dotenv').config();
const db = require('../server/db');

async function run() {
  console.log('🔍 ตรวจสอบ User 4worker...\n');

  const users = await db.getUsers();
  const user4 = users.find((u) => String(u.env_key) === '4');
  const user4worker = users.find((u) => String(u.env_key) === '4worker');

  if (!user4worker) {
    console.log('✅ ไม่พบ User 4worker - ไม่ต้องทำอะไร');
    process.exit(0);
    return;
  }

  if (!user4) {
    console.log('⚠️ พบ 4worker แต่ไม่พบ User 4 - เปลี่ยน env_key ของ 4worker เป็น 4 แทน');
    await db.updateUser(user4worker.id, { env_key: '4', name: 'User 4' });
    console.log('✅ อัปเดต env_key เป็น 4 แล้ว');
    process.exit(0);
    return;
  }

  // ย้าย Assignments จาก 4worker → User 4
  const assignments = await db.getAssignmentsByUserId(user4worker.id);
  if (assignments.length > 0) {
    console.log(`📌 ย้าย ${assignments.length} Assignments จาก 4worker → User 4`);
    for (const a of assignments) {
      await db.updateAssignment(a.id, { user_id: user4.id });
    }
  }

  await db.deleteUser(user4worker.id);
  console.log('✅ ลบ User 4worker ที่ซ้ำแล้ว');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ เกิดข้อผิดพลาด:', err.message);
  process.exit(1);
});
