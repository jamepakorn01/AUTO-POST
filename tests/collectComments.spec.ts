/**
 * เก็บเบอร์จาก Comment — มี session แล้วรัน headless; ยังไม่มี session เปิด Chrome (headed)
 */
import { test } from '@playwright/test';
import * as fs from 'fs';
import {
  loadDynamicConfig,
  facebookLogin,
  buildExcludedPhoneSet,
  filterPhonesForCollect,
  normalizeThaiPhoneDigits,
  runLog,
  safePageWait,
  scrapeCommentsAndPhones,
} from '../src/helpers';

type CollectPlan = {
  user_id: string;
  posts: Array<{
    post_log_id: string;
    post_link: string;
    job_id?: string;
    job_title?: string;
    owner?: string;
    company?: string;
    poster_name?: string;
    group_name?: string;
    posted_date_bangkok?: string;
    created_at?: string;
  }>;
};

function readPlan(): CollectPlan {
  const p = process.env.COLLECT_PLAN_PATH || '';
  if (!p || !fs.existsSync(p)) {
    throw new Error(`COLLECT_PLAN_PATH missing or file not found: ${p}`);
  }
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as CollectPlan;
}

async function patchCollectResult(
  postLogId: string,
  body: { comment_count: number; customer_phone: string }
): Promise<void> {
  const base = (process.env.RUN_LOG_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const token = process.env.COLLECT_PATCH_TOKEN || '';
  const res = await fetch(`${base}/api/post-logs/${encodeURIComponent(postLogId)}/collect-result`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-collect-token': token },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`collect-result ${res.status}: ${t}`);
  }
}

test('collectComments', async ({ page }) => {
  test.setTimeout(90 * 60 * 1000);
  const plan = readPlan();
  if (process.env.COLLECT_USE_HEADED === '1') {
    await runLog({
      level: 'info',
      message:
        'โหมดเปิด Chrome — ยังไม่มีไฟล์ session ใน .auth ให้ล็อกอิน/ยืนยันตัวตนในหน้าต่างนี้',
      user_id: plan.user_id,
    });
  } else {
    await runLog({
      level: 'info',
      message: 'โหมดไม่โชว์หน้าต่าง (พบ session ใน .auth แล้ว)',
      user_id: plan.user_id,
    });
  }
  const config = await loadDynamicConfig();
  const user = config.users.find((u) => String(u.id) === String(plan.user_id));
  if (!user) {
    await runLog({ level: 'error', message: `ไม่พบ user ${plan.user_id} ใน config`, user_id: plan.user_id });
    throw new Error(`User not found: ${plan.user_id}`);
  }
  if (!user.email || !user.password) {
    await runLog({
      level: 'error',
      message: `User ${user.id} ไม่มี email/password (DB หรือ USER_*_EMAIL/PASSWORD)`,
      user_id: user.id,
    });
    throw new Error('Missing Facebook credentials for user');
  }

  await runLog({
    level: 'info',
    message: `เริ่มเก็บ Comment (Headless) ${plan.posts.length} โพสต์ — ${user.poster_name || user.name || user.id}`,
    user_id: user.id,
  });

  let active = await facebookLogin(page, user.email, user.password, {
    userLabel: user.name || user.id,
    sessionKey: String(user.env_key || user.id || user.email || 'default'),
  });
  const excludedPhones = buildExcludedPhoneSet((user as { contact_phone?: string }).contact_phone);
  const pendingByPost = new Map<
    string,
    { commentCount: number; phones: string[]; item: CollectPlan['posts'][number] }
  >();
  const CUSTOMER_PHONE_MAX_LEN = Math.min(2000, Math.max(100, Number(process.env.COLLECT_CUSTOMER_PHONE_MAX_LEN) || 2000));

  let idx = 0;
  for (const item of plan.posts) {
    idx += 1;
    const label = item.job_title || item.post_log_id;
    await runLog({
      level: 'info',
      message: `[${idx}/${plan.posts.length}] กำลังเปิดโพสต์: ${label}`,
      user_id: user.id,
      meta: { post_log_id: item.post_log_id, post_link: item.post_link },
    });
    try {
      if (active.isClosed()) {
        active = await active.context().newPage();
        active = await facebookLogin(active, user.email, user.password, {
          userLabel: user.name || user.id,
          sessionKey: String(user.env_key || user.id || user.email || 'default'),
        });
      }
      const ownerNames = [user.poster_name || '', user.name || '', item.owner || '', item.company || '', item.poster_name || '']
        .map((x) => String(x || '').trim())
        .filter(Boolean);
      const { phones, commentCount, postBodyPhones } = await scrapeCommentsAndPhones(active, item.post_link, {
        excludeAuthorNames: ownerNames,
      });
      const excludedForThisPost = new Set(excludedPhones);
      postBodyPhones
        .map((x) => normalizeThaiPhoneDigits(x))
        .filter((x): x is string => !!x)
        .forEach((x) => excludedForThisPost.add(x));
      // ตัดเบอร์จาก metadata งาน (owner/company/job title) กันเบอร์เจ้าของงานหลุดจากข้อความคอมเมนต์
      buildExcludedPhoneSet([item.owner, item.company, item.job_title].filter(Boolean).join(' '))
        .forEach((x) => excludedForThisPost.add(x));
      // ด่านแรก: ตัดเบอร์ต้องห้าม (เจ้าของงาน/โพสต์/caption)
      const kept = filterPhonesForCollect(phones, { excluded: excludedForThisPost, seenToday: new Set<string>() });
      pendingByPost.set(item.post_log_id, { commentCount, phones: kept, item });
      await runLog({
        level: 'success',
        message: `[${idx}/${plan.posts.length}] สแกนเสร็จ — Comment ${commentCount}, พบเบอร์ผู้สนใจ ${kept.length} รายการ`,
        user_id: user.id,
        meta: { post_log_id: item.post_log_id, phones: kept.slice(0, 5) },
      });
    } catch (e) {
      const msg = (e as Error).message;
      await runLog({
        level: 'error',
        message: `[${idx}/${plan.posts.length}] ล้มเหลว: ${msg.slice(0, 200)}`,
        user_id: user.id,
        meta: { post_log_id: item.post_log_id },
      });
    }
    /** ถ้าแท็บถูกปิดระหว่างสแกน อย่าเรียก waitForTimeout — เดิมจะ throw แล้วหยุดทั้งคิว */
    if (active.isClosed()) {
      try {
        const ctx = page.context();
        active = await ctx.newPage();
        active = await facebookLogin(active, user.email, user.password, {
          userLabel: user.name || user.id,
          sessionKey: String(user.env_key || user.id || user.email || 'default'),
        });
        await runLog({
          level: 'warn',
          message: `[${idx}/${plan.posts.length}] แท็บปิดกลางทาง — เปิดแท็บใหม่และล็อกอินแล้ว (ทำโพสต์ถัดไปต่อ)`,
          user_id: user.id,
        });
      } catch (reopenErr) {
        await runLog({
          level: 'error',
          message: `Browser/context ใช้งานไม่ได้หลังแท็บปิด: ${String((reopenErr as Error).message).slice(0, 180)}`,
          user_id: user.id,
        });
        throw reopenErr;
      }
    }
    await safePageWait(active, 800);
  }

  for (const item of plan.posts) {
    const st = pendingByPost.get(item.post_log_id) || { commentCount: 0, phones: [], item };
    const phonesFinal = st.phones || [];
    const phoneStr = phonesFinal.length ? phonesFinal.join(', ').slice(0, CUSTOMER_PHONE_MAX_LEN) : '';
    await patchCollectResult(item.post_log_id, {
      comment_count: st.commentCount,
      customer_phone: phoneStr,
    });
  }
  await runLog({
    level: 'info',
    message: 'จบรอบเก็บ Comment ทั้งหมด (เบอร์ต่อโพสต์ — ตัดเฉพาะเบอร์ใน caption/โพสต์และซ้ำในคอมเมนต์เดียวกัน)',
    user_id: user.id,
  });
});
