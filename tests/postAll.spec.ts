/**
 * Dynamic Post Bot - โพสต์ตาม Assignments จาก Web Admin
 * อ่าน config จาก data/*.json + .env
 */
import { test } from '@playwright/test';
import {
  loadDynamicConfig,
  facebookLogin,
  postToGroup,
  runLog,
} from '../src/helpers';

const DEFAULT_SHEET_URL =
  process.env.DEFAULT_SHEET_URL ||
  'https://script.google.com/macros/s/AKfycbzqB97xnjUC7QZwTq2QnXUI372lxsO9acZTVxXJ3HF9G-T71h-HqccaNyMR6E612MYQ/exec';

function getJobIds(a: { job_ids?: string[]; job_id?: string }): string[] {
  if (Array.isArray(a.job_ids) && a.job_ids.length > 0) return a.job_ids;
  if (a.job_id) return [a.job_id];
  return [];
}

test('Dynamic Post: รันโพสต์ตาม Assignments', async ({ page, request }) => {
  test.setTimeout(90 * 60 * 1000);
  let activePage = page;
  const config = await loadDynamicConfig();
  const ensureActivePageForUser = async (user: {
    id: string;
    name?: string;
    email?: string;
    password?: string;
    env_key?: string;
  }): Promise<boolean> => {
    if (!activePage.isClosed()) return true;
    if (!user.email || !user.password) return false;
    console.log(`♻️ [${user.name || user.id}] ตรวจพบหน้า browser ปิด — กำลัง login ใหม่อัตโนมัติ`);
    activePage = await facebookLogin(activePage, user.email, user.password, {
      userLabel: user.name || user.id,
      sessionKey: String(user.env_key || user.id || user.email || 'default'),
    });
    console.log(`✅ [${user.name || user.id}] กลับมาออนไลน์แล้ว ดำเนินงานต่อ`);
    return true;
  };

  if (config.users.length === 0) {
    throw new Error('ไม่มี User ในระบบ — ตรวจสอบฐานข้อมูล (DATABASE_URL) หรือ data/users.json');
  }
  let assignments = config.assignments;
  const filterIds = process.env.ASSIGNMENT_IDS?.split(',').map((s) => s.trim()).filter(Boolean);
  if (filterIds && filterIds.length > 0) {
    assignments = assignments.filter((a) => filterIds.includes(a.id));
    console.log(`📌 โพสต์เฉพาะ Assignments: ${filterIds.join(', ')}`);
  }
  if (assignments.length === 0) {
    const hint = filterIds?.length
      ? `ไม่พบ Assignment ตาม ASSIGNMENT_IDS=${filterIds.join(',')}`
      : 'ไม่มี Assignment ในระบบ — ตรวจสอบฐานข้อมูลหรือ data/assignments.json';
    throw new Error(hint);
  }

  const groupMap = new Map<string, { fb_group_id: string; sheet_url?: string }>();
  for (const g of config.groups) {
    groupMap.set(g.id, { fb_group_id: g.fb_group_id, sheet_url: g.sheet_url });
  }

  let currentUserId: string | null = null;

  for (const assignment of assignments) {
    const user = config.users.find((u) => u.id === assignment.user_id);
    const jobIds = getJobIds(assignment);

    if (!user || jobIds.length === 0) {
      console.log(`⏭️ ข้าม assignment ${assignment.id}: ไม่พบ user หรือ job`);
      continue;
    }

    if (!user.email || !user.password) {
      console.log(`⏭️ ข้าม user ${user.id}: ไม่มี credentials ใน .env (USER_${user.env_key || user.id}_EMAIL)`);
      continue;
    }

    const selectedGroupIds = Array.isArray(assignment.group_ids) ? assignment.group_ids : [];
    const sourceGroupIds = selectedGroupIds.length > 0 ? selectedGroupIds : (user.group_ids || []);
    const groupsForAssignment = sourceGroupIds
      .map((gid) => groupMap.get(gid))
      .filter((g): g is { fb_group_id: string; sheet_url?: string } => !!g);
    const fbGroupIds = groupsForAssignment.map((g) => g.fb_group_id);

    if (fbGroupIds.length === 0) {
      console.log(`⏭️ ข้าม assignment ${assignment.id}: ไม่พบ Groups ที่ใช้โพสต์ (เช็กหน้า Assignment หรือ Users)`);
      continue;
    }

    if (currentUserId !== user.id) {
      activePage = await facebookLogin(activePage, user.email, user.password, {
        userLabel: user.name || user.id,
        sessionKey: String(user.env_key || user.id || user.email || 'default'),
      });
      console.log('▶️ Login สำเร็จ เริ่มโพสต์อัตโนมัติ (ไม่ต้องกด Resume)');
      currentUserId = user.id;
    }

    for (const jobId of jobIds) {
      const job = config.jobs.find((j) => j.id === jobId);
      if (!job) {
        console.log(`⏭️ ข้าม job ${jobId}: ไม่พบใน config`);
        continue;
      }

      const postItem = {
        title: job.title,
        owner: job.owner,
        company: job.company,
        caption: job.caption,
        apply_link: job.apply_link,
        comment_reply: job.comment_reply,
        groupID: fbGroupIds,
      };

      await runLog({
        level: 'info',
        message: `เริ่มโพสต์งาน "${job.title}"`,
        assignment_id: assignment.id,
        user_id: user.id,
        job_id: jobId,
      });

      for (const gID of fbGroupIds) {
        const groupMeta = groupsForAssignment.find((g) => g.fb_group_id === gID);
        let posted = false;
        const maxAttempts = 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const pageReady = await ensureActivePageForUser(user);
          if (!pageReady) break;
          console.log(
            `🚀 [${user.name || user.id}] โพสต์งาน "${job.title}" ไปกลุ่ม ${gID} (ครั้งที่ ${attempt}/${maxAttempts})`
          );
          posted = await postToGroup(activePage, request, postItem, gID, {
            userLabel: user.name || user.id,
            posterName: user.poster_name || user.name || 'Poster',
            sheetUrl: groupMeta?.sheet_url || DEFAULT_SHEET_URL || user.sheet_url || '',
            blacklistGroups: user.blacklist_groups,
            assignmentId: assignment.id,
            userId: user.id,
            jobId,
            groupId: gID,
          });
          if (posted) break;
          if (!activePage.isClosed()) break;
          if (attempt < maxAttempts) {
            console.log(
              `⚠️ [${user.name || user.id}] browser ปิดระหว่างโพสต์กลุ่ม ${gID} — เตรียม retry อัตโนมัติ`
            );
          }
        }
        if (posted) {
          await runLog({
            level: 'success',
            message: `โพสต์สำเร็จ: ${job.title} → กลุ่ม ${gID}`,
            assignment_id: assignment.id,
            user_id: user.id,
            job_id: jobId,
            group_id: gID,
          });
        } else {
          await runLog({
            level: 'warn',
            message: `โพสต์ไม่สำเร็จ: ${job.title} → กลุ่ม ${gID} (ถ้ามีจะบันทึก screenshot/HTML ไว้ที่โฟลเดอร์ artifacts/)`,
            assignment_id: assignment.id,
            user_id: user.id,
            job_id: jobId,
            group_id: gID,
          });
        }
        await activePage.waitForTimeout(3000);
      }
    }
  }

  console.log('✅ โพสต์ครบตาม Assignments แล้ว');
});
