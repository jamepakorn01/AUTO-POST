require('dotenv').config();
const db = require('../server/db');

const METRO_PROVINCES = new Set([
  'กรุงเทพมหานคร',
  'นนทบุรี',
  'ปทุมธานี',
  'สมุทรปราการ',
  'สมุทรสาคร',
  'นครปฐม',
]);
const TITLE_PREFIX = 'พนักงานขับรถผู้จัดการธนาคารกรุงศรี - ';

const norm = (v) => String(v || '').trim();

async function main() {
  await db.initSchema();

  const users = await db.getUsers();
  const user = users.find(
    (u) => norm(u.poster_name) === 'Pakorn Kanchanachai' || norm(u.name) === 'Pakorn Kanchanachai'
  );
  if (!user) throw new Error('ไม่พบ User: Pakorn Kanchanachai');

  const groups = await db.getGroups();
  const targetGroups = groups.filter(
    (g) =>
      norm(g.job_type) === 'Driver' &&
      norm(g.province) === 'กรุงเทพมหานคร' &&
      norm(g.province_note) === '' &&
      norm(g.added_by) === 'เจมส์'
  );
  if (!targetGroups.length) {
    throw new Error('ไม่พบกลุ่มโฟลเดอร์: Driver / กรุงเทพมหานคร / เจมส์');
  }
  const targetGroupIds = targetGroups.map((g) => String(g.id));

  const jobs = await db.getJobs();
  const targetJobs = jobs
    .filter((j) => METRO_PROVINCES.has(norm(j.province)) && norm(j.title).startsWith(TITLE_PREFIX))
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  if (!targetJobs.length) throw new Error('ไม่พบงานกรุงศรีในกรุงเทพ/ปริมณฑล');
  const targetJobIds = targetJobs.map((j) => String(j.id));
  const targetJobIdSet = new Set(targetJobIds);

  const assignments = await db.getAssignmentsByUserId(user.id);
  let keeper = null;
  for (const a of assignments) {
    const ids = Array.isArray(a.job_ids) ? a.job_ids.map(String) : [];
    if (ids.some((id) => targetJobIdSet.has(id))) {
      keeper = a;
      break;
    }
  }

  const payload = {
    user_id: user.id,
    doer_name: norm(user.poster_name) || norm(user.name) || 'Pakorn Kanchanachai',
    department: 'LBD',
    job_ids: targetJobIds,
    group_ids: targetGroupIds,
  };

  if (keeper) {
    await db.updateAssignment(keeper.id, payload);
    console.log(`[update] keeper=${keeper.id} -> jobs=${targetJobIds.length}`);
  } else {
    const row = await db.createAssignment(payload);
    keeper = row;
    console.log(`[create] keeper=${keeper.id} -> jobs=${targetJobIds.length}`);
  }

  let deleted = 0;
  for (const a of assignments) {
    if (String(a.id) === String(keeper.id)) continue;
    const ids = Array.isArray(a.job_ids) ? a.job_ids.map(String) : [];
    if (ids.length > 0 && ids.every((id) => targetJobIdSet.has(id))) {
      await db.deleteAssignment(a.id);
      deleted += 1;
      console.log(`[delete] ${a.id}`);
    }
  }

  console.log('\nสรุป');
  console.log(`User: ${payload.doer_name} (${user.id})`);
  console.log(`รวมงานกรุงศรี กทม./ปริมณฑล: ${targetJobIds.length} งาน`);
  console.log(`ใช้กลุ่มเป้าหมาย: ${targetGroupIds.length} กลุ่ม`);
  console.log(`Assignment หลัก: ${keeper.id}`);
  console.log(`ลบ Assignment ย่อยที่ซ้ำ: ${deleted}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

