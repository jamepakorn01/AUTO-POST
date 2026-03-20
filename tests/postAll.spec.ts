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

function getJobIds(a: { job_ids?: string[]; job_id?: string }): string[] {
  if (Array.isArray(a.job_ids) && a.job_ids.length > 0) return a.job_ids;
  if (a.job_id) return [a.job_id];
  return [];
}

test('Dynamic Post: รันโพสต์ตาม Assignments', async ({ page, request }) => {
  const config = await loadDynamicConfig();

  if (config.users.length === 0) {
    console.log('❌ ไม่มี User (ตรวจสอบ data/users.json หรือฐานข้อมูล)');
    return;
  }
  let assignments = config.assignments;
  const filterIds = process.env.ASSIGNMENT_IDS?.split(',').map((s) => s.trim()).filter(Boolean);
  if (filterIds && filterIds.length > 0) {
    assignments = assignments.filter((a) => filterIds.includes(a.id));
    console.log(`📌 โพสต์เฉพาะ Assignments: ${filterIds.join(', ')}`);
  }
  if (assignments.length === 0) {
    console.log('❌ ไม่มี Assignment (ตรวจสอบ data/assignments.json หรือฐานข้อมูล)');
    return;
  }

  const groupMap = new Map<string, string>();
  for (const g of config.groups) {
    groupMap.set(g.id, g.fb_group_id);
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

    const fbGroupIds = (user.group_ids || [])
      .map((gid) => groupMap.get(gid))
      .filter((id): id is string => !!id);

    if (fbGroupIds.length === 0) {
      console.log(`⏭️ ข้าม assignment ${assignment.id}: User ${user.id} ยังไม่ผูก Groups (ไปตั้งค่าในหน้า Users)`);
      continue;
    }

    if (currentUserId !== user.id) {
      await facebookLogin(page, user.email, user.password, {
        userLabel: user.name || user.id,
      });
      console.log('⏸️ Pause: ตรวจสอบหน้า Feed แล้วกด Resume');
      await page.pause();
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
        console.log(`🚀 [${user.name || user.id}] โพสต์งาน "${job.title}" ไปกลุ่ม ${gID}`);
        const ok = await postToGroup(page, request, postItem, gID, {
          userLabel: user.name || user.id,
          posterName: user.poster_name || user.name || 'Poster',
          sheetUrl: user.sheet_url || '',
          blacklistGroups: user.blacklist_groups,
          assignmentId: assignment.id,
          userId: user.id,
          jobId,
          groupId: gID,
        });
        if (ok) {
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
            message: `โพสต์ไม่สำเร็จ: ${job.title} → กลุ่ม ${gID}`,
            assignment_id: assignment.id,
            user_id: user.id,
            job_id: jobId,
            group_id: gID,
          });
        }
        await page.waitForTimeout(3000);
      }
    }
  }

  console.log('✅ โพสต์ครบตาม Assignments แล้ว');
});
