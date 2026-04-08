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

const KRUNGSRI_PREFIX = 'พนักงานขับรถผู้จัดการธนาคารกรุงศรี - ';

function norm(v) {
  return String(v || '').trim();
}

function isSameIdSet(a, b) {
  const sa = [...new Set((a || []).map(String))].sort();
  const sb = [...new Set((b || []).map(String))].sort();
  if (sa.length !== sb.length) return false;
  return sa.every((v, i) => v === sb[i]);
}

async function main() {
  await db.initSchema();

  const users = await db.getUsers();
  const user = users.find((u) => norm(u.name) === 'Pakorn Kanchanachai' || norm(u.poster_name) === 'Pakorn Kanchanachai');
  if (!user) throw new Error('ไม่พบ User: Pakorn Kanchanachai');

  const groups = await db.getGroups();
  const targetGroups = groups.filter(
    (g) =>
      norm(g.job_type) === 'Driver' &&
      norm(g.province) === 'กรุงเทพมหานคร' &&
      norm(g.province_note) === '' &&
      norm(g.added_by) === 'เจมส์'
  );
  if (!targetGroups.length) throw new Error('ไม่พบโฟลเดอร์กลุ่ม Driver/กรุงเทพมหานคร/เจมส์');
  const targetGroupIds = targetGroups.map((g) => String(g.id));

  const jobs = await db.getJobs();
  const targetJobs = jobs.filter(
    (j) => METRO_PROVINCES.has(norm(j.province)) && norm(j.title).startsWith(KRUNGSRI_PREFIX)
  );
  const targetJobIdSet = new Set(targetJobs.map((j) => String(j.id)));

  const allAssignments = await db.getAssignments();
  const userAssignments = allAssignments.filter((a) => String(a.user_id) === String(user.id));

  // cleanup ที่เพิ่งสร้างผิดเงื่อนไข (งานไม่ใช่กรุงศรี) ใน 45 นาทีล่าสุด
  let cleaned = 0;
  const now = Date.now();
  for (const a of userAssignments) {
    const jids = Array.isArray(a.job_ids) ? a.job_ids.map(String) : [];
    if (jids.length !== 1) continue;
    const jid = jids[0];
    if (targetJobIdSet.has(jid)) continue;
    const createdAt = a.created_at ? new Date(a.created_at).getTime() : 0;
    const recent = createdAt > 0 && now - createdAt <= 45 * 60 * 1000;
    if (!recent) continue;
    if (!isSameIdSet(a.group_ids || [], targetGroupIds)) continue;
    await db.deleteAssignment(a.id);
    cleaned += 1;
    console.log(`[cleanup] delete ${a.id}`);
  }

  // upsert เฉพาะงานกรุงศรีในกทม./ปริมณฑล
  const latestAssignments = await db.getAssignments();
  const bySingleJob = new Map();
  latestAssignments
    .filter((a) => String(a.user_id) === String(user.id))
    .forEach((a) => {
      const ids = Array.isArray(a.job_ids) ? a.job_ids.map(String) : [];
      if (ids.length === 1) bySingleJob.set(ids[0], a);
    });

  const doer = norm(user.poster_name) || norm(user.name) || 'Pakorn Kanchanachai';
  let created = 0;
  let updated = 0;
  for (const job of targetJobs) {
    const payload = {
      user_id: user.id,
      doer_name: doer,
      department: norm(job.department) || 'LBD',
      job_ids: [job.id],
      group_ids: targetGroupIds,
    };
    const ex = bySingleJob.get(String(job.id));
    if (ex) {
      await db.updateAssignment(ex.id, payload);
      updated += 1;
      console.log(`[update] ${ex.id} -> ${job.title}`);
    } else {
      const row = await db.createAssignment(payload);
      created += 1;
      console.log(`[create] ${row.id} -> ${job.title}`);
    }
  }

  console.log('\nสรุป');
  console.log(`ล้าง assignment ผิดเงื่อนไข: ${cleaned}`);
  console.log(`เป้าหมายงานกรุงศรี (กทม./ปริมณฑล): ${targetJobs.length}`);
  console.log(`สร้างใหม่: ${created}`);
  console.log(`อัปเดต: ${updated}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

