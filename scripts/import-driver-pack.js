/**
 * นำเข้า Jobs + Groups จากไฟล์ในโฟลเดอร์ data/
 *
 * รัน: node scripts/import-driver-pack.js [ชื่อไฟล์]
 * ค่าเริ่มต้น: krungsri-driver-bank-pack.json
 * ตัวอย่าง: node scripts/import-driver-pack.js tum-driver-pack.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../server/db');

const packBasename = (process.argv[2] || 'krungsri-driver-bank-pack.json').replace(/^[/\\]+/, '');
const PACK_PATH = path.join(__dirname, '..', 'data', packBasename);

function normNote(s) {
  const t = String(s || '').trim();
  return t || null;
}

function groupIdsOf(it) {
  if (Array.isArray(it.group_ids)) return it.group_ids;
  if (Array.isArray(it.groupID)) return it.groupID;
  return [];
}

async function main() {
  if (!fs.existsSync(PACK_PATH)) {
    console.error('ไม่พบไฟล์:', PACK_PATH);
    process.exit(1);
  }

  const pack = JSON.parse(fs.readFileSync(PACK_PATH, 'utf8'));
  const meta = pack.meta || {};
  const items = Array.isArray(pack.items) ? pack.items : [];

  const addedBy = String(meta.added_by || '').trim() || 'เจมส์';
  const department = String(meta.department || 'LBD').trim();
  const jobType = String(meta.job_type || 'Driver').trim();
  const jobPosition = String(meta.job_position || 'พนักงานขับรถ').trim();

  await db.initSchema();

  let jobsCreated = 0;
  let groupsUpserted = 0;

  for (const it of items) {
    const province = String(it.province || '').trim();
    if (!province) {
      console.warn('ข้ามรายการที่ไม่มี province:', it.title);
      continue;
    }

    const applyRaw = it.apply_link;
    const applyLink =
      applyRaw == null || String(applyRaw).trim() === '' ? null : String(applyRaw).trim();

    const job = await db.createJob({
      title: it.title,
      job_position: jobPosition,
      owner: it.owner,
      company: it.company,
      department,
      province,
      province_note: normNote(it.province_note),
      caption: it.caption || '',
      apply_link: applyLink,
      comment_reply: it.comment_reply || null,
      job_type: jobType,
      status: 'pending',
    });
    jobsCreated += 1;
    console.log(`[job] ${job.id} — ${job.title}`);

    const gids = groupIdsOf(it);
    for (const raw of gids) {
      const fb = String(raw || '').trim();
      if (!fb) continue;
      await db.createGroup({
        name: `Group ${fb}`,
        fb_group_id: fb,
        province,
        province_note: normNote(it.province_note),
        job_type: jobType,
        added_by: addedBy,
        department,
        blacklist_groups: [],
        job_positions: [],
      });
      groupsUpserted += 1;
    }
  }

  console.log('\nสรุป:');
  console.log(`  แพ็ก: ${packBasename}`);
  console.log(`  Jobs สร้างใหม่: ${jobsCreated}`);
  console.log(`  Groups upsert (ตาม fb_group_id): ${groupsUpserted}`);
  console.log(`  added_by กลุ่ม: ${addedBy}, แผนก: ${department}, job_type: ${jobType}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
