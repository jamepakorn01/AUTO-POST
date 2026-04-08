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

function norm(v) {
  return String(v || '').trim();
}

function isEmpty(v) {
  return norm(v) === '';
}

async function main() {
  await db.initSchema();

  const users = await db.getUsers();
  const user = users.find((u) => {
    const name = norm(u.name);
    const poster = norm(u.poster_name);
    const email = norm(u.email);
    return (
      name === 'Pakorn Kanchanachai' ||
      poster === 'Pakorn Kanchanachai' ||
      email.toLowerCase() === 'pakorn kanchanachai'.toLowerCase()
    );
  });
  if (!user) {
    throw new Error('ไม่พบ User: Pakorn Kanchanachai');
  }

  const groups = await db.getGroups();
  const targetGroups = groups.filter(
    (g) =>
      norm(g.job_type) === 'Driver' &&
      norm(g.province) === 'กรุงเทพมหานคร' &&
      isEmpty(g.province_note) &&
      norm(g.added_by) === 'เจมส์'
  );
  if (targetGroups.length === 0) {
    throw new Error('ไม่พบกลุ่มโฟลเดอร์: Driver / กรุงเทพมหานคร / เจมส์');
  }
  const targetGroupIds = targetGroups.map((g) => g.id);

  const jobs = await db.getJobs();
  const metroJobs = jobs.filter((j) => METRO_PROVINCES.has(norm(j.province)));
  if (metroJobs.length === 0) {
    console.log('ไม่พบงานในกรุงเทพและปริมณฑล');
    return;
  }

  const assignments = await db.getAssignments();
  const bySingleJob = new Map();
  assignments
    .filter((a) => norm(a.user_id) === norm(user.id))
    .forEach((a) => {
      const ids = Array.isArray(a.job_ids) ? a.job_ids.map(String) : [];
      if (ids.length === 1) bySingleJob.set(ids[0], a);
    });

  let created = 0;
  let updated = 0;
  const doer = norm(user.poster_name) || norm(user.name) || 'Pakorn Kanchanachai';
  for (const job of metroJobs) {
    const existing = bySingleJob.get(String(job.id));
    const payload = {
      user_id: user.id,
      doer_name: doer,
      department: norm(job.department) || 'LBD',
      job_ids: [job.id],
      group_ids: targetGroupIds,
    };
    if (existing) {
      await db.updateAssignment(existing.id, payload);
      updated += 1;
      console.log(`[update] ${existing.id} -> ${job.title}`);
    } else {
      const row = await db.createAssignment(payload);
      created += 1;
      console.log(`[create] ${row.id} -> ${job.title}`);
    }
  }

  console.log('\nสรุป');
  console.log(`User: ${user.poster_name || user.name} (${user.id})`);
  console.log(`กลุ่มเป้าหมาย: ${targetGroups.length} กลุ่ม`);
  console.log(`งานในกรุงเทพและปริมณฑล: ${metroJobs.length} งาน`);
  console.log(`Assignments สร้างใหม่: ${created}`);
  console.log(`Assignments อัปเดต: ${updated}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

