/**
 * Migrate User1.json - User8.json to PostgreSQL
 * รัน: node scripts/migrate-from-json.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../server/db');

const CWD = process.cwd();

function loadUserFile(num) {
  const names = [`user${num}.json`, `User${num}.json`];
  for (const name of names) {
    const p = path.join(CWD, name);
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (data.tasks && !data.content?.posts) {
        return normalizeWorkerToStandard(data);
      }
      return data;
    }
  }
  if (num === 4) {
    const workerPaths = [path.join(CWD, 'user4worker.json'), path.join(CWD, 'User4Worker.json')];
    for (const p of workerPaths) {
      if (fs.existsSync(p)) {
        return normalizeWorkerToStandard(JSON.parse(fs.readFileSync(p, 'utf-8')));
      }
    }
  }
  return null;
}

function normalizeWorkerToStandard(workerData) {
  const posts = (workerData.tasks || []).map((task) => ({
    ...task.post_content,
    groupID: task.groupID || [],
    apply_link: task.post_content?.apply_link || '',
  }));
  return {
    account: {
      ...workerData.account,
      poster_name: workerData.account?.poster_name || 'User 4',
      sheet_url: workerData.account?.sheet_url || '',
      blacklist_groups: workerData.account?.blacklist_groups || [],
    },
    post_settings: workerData.post_settings || {},
    content: { posts },
  };
}

async function migrate() {
  console.log('🔄 เริ่ม Migrate User1-8.json → PostgreSQL...\n');

  await db.initSchema();
  await db.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type VARCHAR(100)`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT`);
  console.log('✅ Schema พร้อม\n');

  // ลบ User 4worker ที่ซ้ำ (ถ้ามี) - รวมเข้า User 4
  const users = await db.getUsers();
  const user4 = users.find((x) => x.env_key === '4');
  const user4worker = users.find((x) => x.env_key === '4worker');
  if (user4worker && user4) {
    const assignments = await db.getAssignmentsByUserId(user4worker.id);
    for (const a of assignments) {
      await db.updateAssignment(a.id, { user_id: user4.id });
    }
    await db.deleteUser(user4worker.id);
    console.log('🧹 ลบ User 4worker ที่ซ้ำแล้ว\n');
  }

  const allGroupIds = new Set();
  const groupIdToDbId = new Map();
  const userMap = new Map(); // envKey -> user

  // Phase 1: รวบรวม groups ทั้งหมด (จาก User1-8 และ User4Worker)
  for (let i = 1; i <= 8; i++) {
    const data = loadUserFile(i);
    if (!data) continue;
    for (const post of data.content?.posts || []) {
      for (const gid of post.groupID || []) {
        allGroupIds.add(String(gid).trim());
      }
    }
  }
  const worker4 = loadUserFile(4);
  if (worker4?.content?.posts) {
    for (const post of worker4.content.posts) {
      for (const gid of post.groupID || []) {
        allGroupIds.add(String(gid).trim());
      }
    }
  }

  // Phase 2: สร้าง Groups
  for (const fbGroupId of allGroupIds) {
    const g = await db.upsertGroupByFbId(fbGroupId, `Group ${fbGroupId}`, null);
    groupIdToDbId.set(fbGroupId, g.id);
  }
  console.log(`✅ สร้าง Groups ${groupIdToDbId.size} รายการ\n`);

  // Phase 3: สร้าง Users, Jobs, Assignments
  for (let i = 1; i <= 8; i++) {
    const data = loadUserFile(i);
    if (!data) {
      console.log(`⏭️ ข้าม User${i}: ไม่พบไฟล์`);
      continue;
    }

    const { account, content } = data;
    const posts = content?.posts || [];

    const envKey = String(i);
    const existingUsers = await db.getUsers();
    let user = existingUsers.find((x) => x.env_key === envKey);
    if (!user) {
      user = await db.createUser({
        env_key: envKey,
        name: `User ${i}`,
        poster_name: account.poster_name,
        sheet_url: account.sheet_url,
        email: account.email || null,
        password: account.password || null,
        blacklist_groups: account.blacklist_groups || [],
        post_settings: data.post_settings || {},
      });
      console.log(`✅ สร้าง User ${i} (id: ${user.id})`);
    } else {
      console.log(`⏭️ User ${i} มีอยู่แล้ว`);
      if (account.email || account.password) {
        await db.updateUser(user.id, {
          email: account.email || undefined,
          password: account.password || undefined,
        });
        console.log(`   📝 อัปเดต email/password จาก JSON`);
      }
    }
    userMap.set(envKey, user);

    for (const post of posts) {
      const job = await db.createJob({
        title: post.title,
        owner: post.owner,
        company: post.company,
        caption: post.caption,
        apply_link: post.apply_link || '',
        comment_reply: post.comment_reply || '',
        job_type: post.jobType || null,
        status: 'pending',
      });

      const groupIds = (post.groupID || []).map((gid) => groupIdToDbId.get(gid.trim())).filter(Boolean);

      if (groupIds.length > 0) {
        await db.createAssignment({
          job_id: job.id,
          user_id: user.id,
          group_ids: groupIds,
        });
        console.log(`   📌 Job "${post.title.slice(0, 40)}..." → ${groupIds.length} กลุ่ม`);
      }
    }
  }

  console.log('\n✅ Migrate เสร็จสิ้น');
  console.log('\n📌 Email/Password เก็บในฐานข้อมูลแล้ว - เพิ่ม/แก้ไขได้จาก Web Admin');
  console.log('   (หรือใช้ .env เป็น fallback: USER_1_EMAIL, USER_1_PASSWORD)');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ เกิดข้อผิดพลาด:', err.message);
  process.exit(1);
});
