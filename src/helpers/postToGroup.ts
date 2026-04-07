import type { Page, Locator } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import type { PostItem } from '../types/config';
import { capturePostFailureArtifacts } from './capturePostFailureArtifacts';
import { saveToSheet } from './saveToSheet';

/** รวม goto my_posted + pending + สำรองฟีด + POST Sheet + postLog */
const SAVE_TO_SHEET_MAX_MS = Math.min(240000, Math.max(30000, Number(process.env.SAVE_TO_SHEET_MAX_MS) || 120000));

/** รอบเปิด composer ใหม่ทั้งดีล (goto กลุ่ม + คลิก + ตรวจ dialog) */
const MAX_COMPOSER_OPEN_ATTEMPTS = Math.min(15, Math.max(2, Number(process.env.GROUP_COMPOSER_OPEN_ATTEMPTS) || 8));

/** หลังคลิกช่องโพสต์แล้วยังขึ้น toast เทคนิค — รีเฟรชซ้ำได้กี่ครั้งก่อนขยับรอบนอก */
const MAX_TOAST_RELOAD_AFTER_CLICK = Math.min(20, Math.max(3, Number(process.env.GROUP_TOAST_RELOAD_MAX) || 12));

export interface PostToGroupOptions {
  userLabel: string;
  posterName: string;
  sheetUrl: string;
  blacklistGroups?: string[];
  /** สำหรับ runLog */
  assignmentId?: string;
  userId?: string;
  jobId?: string;
  groupId?: string;
}

/** ทำให้ชื่อกลุ่มที่อ่านจากหน้าเว็บเป็นข้อความเดียวสม่ำเสมอ (ใช้วิเคราะห์ย้อนหลังได้) */
function normalizeGroupName(raw: string): string {
  return raw
    .replace(/\u200b|\ufeff/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Toast ข้อผิดพลาดทางเทคนิคของ Facebook (รวมข้อความยาวแบบ UI ไทย) */
async function hasTechnicalErrorToast(page: Page): Promise<boolean> {
  const byPhrase = page
    .locator('div')
    .filter({ hasText: /เกิดข้อผิดพลาดขึ้น/ })
    .filter({ hasText: /ข้อผิดพลาดทางเทคนิค/ })
    .first();
  if (await byPhrase.isVisible({ timeout: 600 }).catch(() => false)) return true;
  const en = page.getByText(/technical error|something went wrong/i).first();
  return en.isVisible({ timeout: 400 }).catch(() => false);
}

/** ปิดแถบแจ้งเตือนเหลือง — ลดโอกาสค้าง / โฟกัสผิดก่อนเปิด dialog */
async function dismissTechnicalErrorToast(page: Page): Promise<void> {
  const toast = page
    .locator('div')
    .filter({ hasText: /เกิดข้อผิดพลาดขึ้น/ })
    .filter({ hasText: /ข้อผิดพลาดทางเทคนิค|technical/i })
    .first();
  if (!(await toast.isVisible({ timeout: 500 }).catch(() => false))) return;
  const closeScoped = toast.locator('[aria-label="ปิด"], [aria-label="Close"], [aria-label="Dismiss"]').first();
  if (await closeScoped.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeScoped.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
    return;
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

/** ปุ่มโพสต์ใน dialog สร้างโพสต์ (ไม่ใช่ปุ่มอื่นบนหน้า) */
const POST_BTN_IN_DIALOG_SEL =
  'div[aria-label="โพสต์"][role="button"], [aria-label="Post"][role="button"], div[role="button"]:has-text("โพสต์"), div[role="button"]:has-text("Post")';

/**
 * รอ dialog สร้างโพสต์จริง — ต้องมีทั้งช่องพิมพ์และปุ่มโพสต์
 * ใช้ .last() เพราะ FB มักซ้อน dialog; ไม่ fallback ไปช่อง comment ด้านหลัง
 */
async function waitForCreatePostDialog(page: Page): Promise<Locator> {
  const strict = page
    .locator('[role="dialog"]')
    .filter({ has: page.locator('div[contenteditable="true"][role="textbox"]') })
    .filter({ has: page.locator(POST_BTN_IN_DIALOG_SEL) })
    .last();
  try {
    await strict.waitFor({ state: 'visible', timeout: 14000 });
    return strict;
  } catch {
    /** บางกลุ่มปุ่มโพสต์โผล่ช้า — จับจากหัวข้อ dialog แทน */
    const loose = page
      .locator('[role="dialog"]')
      .filter({ hasText: /สร้างโพสต์|Create post|สาธารณะ|public post|เพิ่มลงในโพสต์|Add to your post/i })
      .filter({ has: page.locator('div[contenteditable="true"][role="textbox"]') })
      .last();
    await loose.waitFor({ state: 'visible', timeout: 14000 });
    return loose;
  }
}

/** เดินขึ้น DOM ว่าเป็นโซน comment (รูปที่ 2 — พิมพ์ใต้โพสต์) หรือไม่ */
async function editorAnchoredInCommentUI(ed: Locator): Promise<boolean> {
  return ed
    .evaluate((el: HTMLElement) => {
      const BAD =
        /แสดงความคิดเห็น|ความคิดเห็น|Write a comment|พิมพ์ความคิดเห็น|Comment as|แสดงความคิดเห็นเป็นสาธารณะ/i;
      let n: HTMLElement | null = el;
      for (let d = 0; d < 45 && n; d++) {
        const lab = n.getAttribute?.('aria-label') || '';
        const aph = n.getAttribute?.('aria-placeholder') || '';
        const dph = n.getAttribute?.('data-placeholder') || '';
        const tid = n.getAttribute?.('data-testid') || '';
        if (BAD.test(lab) || BAD.test(aph) || BAD.test(dph)) return true;
        if (/comment_composer|ufi_composer|composerCommentsInput|UFICommentComposer|story_comment/i.test(tid))
          return true;
        n = n.parentElement;
      }
      return false;
    })
    .catch(() => false);
}

/** เลือกช่อง caption ใน dialog — ข้ามช่องที่ดูเหมือน comment แล้วเลือกช่องที่สูงสุด (มักเป็นกล่องโพสต์หลัก) */
async function pickComposerEditorInDialog(dialog: Locator): Promise<Locator> {
  const editors = dialog.locator('div[contenteditable="true"][role="textbox"]');
  const n = await editors.count();
  const commentLike = /ความคิดเห็น|comment|แสดงความคิด|Write a comment|พิมพ์ความคิดเห็น/i;

  let bestIdx = 0;
  let bestH = -1;
  for (let i = 0; i < n; i++) {
    const ed = editors.nth(i);
    const hint =
      `${(await ed.getAttribute('aria-placeholder')) || ''} ${(await ed.getAttribute('data-placeholder')) || ''} ${(await ed.getAttribute('placeholder')) || ''} ${(await ed.getAttribute('aria-label')) || ''}`;
    if (commentLike.test(hint)) continue;
    if (await editorAnchoredInCommentUI(ed)) continue;
    const visible = await ed.isVisible().catch(() => false);
    if (!visible) continue;
    const box = await ed.boundingBox().catch(() => null);
    const h = box?.height ?? 0;
    if (h > bestH) {
      bestH = h;
      bestIdx = i;
    }
  }
  if (bestH >= 28) return editors.nth(bestIdx);
  return editors.first();
}

/** ยืนยันว่าโฟกัสอยู่ใน element ภายใต้ dialog สร้างโพสต์ */
async function focusComposerSafely(page: Page, dialog: Locator, editor: Locator, userLabel: string): Promise<void> {
  await editor.scrollIntoViewIfNeeded().catch(() => {});
  await editor.click({ force: true, timeout: 8000 });
  await page.waitForTimeout(400);
  await editor.focus();
  await page.waitForTimeout(600);

  const ok = await editor
    .evaluate((el) => {
      let n: HTMLElement | null = el as HTMLElement;
      while (n) {
        if (n.getAttribute?.('role') === 'dialog') return true;
        n = n.parentElement;
      }
      return false;
    })
    .catch(() => false);

  if (!ok) {
    await editor.click({ force: true });
    await page.waitForTimeout(400);
  }

  const activeInDialog = await page
    .evaluate(() => {
      const a = document.activeElement;
      if (!a) return false;
      let n: HTMLElement | null = a as HTMLElement;
      while (n) {
        if (n.getAttribute?.('role') === 'dialog') return true;
        n = n.parentElement;
      }
      return false;
    })
    .catch(() => false);

  if (!activeInDialog) {
    console.log(`⚠️ [${userLabel}] โฟกัสอาจไม่อยู่ใน dialog โพสต์ — คลิกช่อง composer อีกครั้ง`);
    await editor.click({ force: true });
    await editor.focus();
    await page.waitForTimeout(500);
  }
}

async function closeComposerDialogAfterPost(page: Page, dialog: Locator, userLabel: string): Promise<void> {
  try {
    await Promise.race([
      dialog.waitFor({ state: 'hidden', timeout: 8000 }),
      dialog.waitFor({ state: 'detached', timeout: 8000 }),
    ]);
  } catch {
    console.log(`⚠️ [${userLabel}] dialog โพสต์ยังไม่ปิดภายใน 8s — กด Escape ซ้ำ`);
  }
  for (let i = 0; i < 12; i++) {
    const still = await dialog.isVisible().catch(() => false);
    if (!still) break;
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(400);
}

/**
 * ก่อน page.goto ไป my_posted — ต้องไม่มี dialog ค้าง (มิฉะนั้นนำทางอาจไม่เกิด / ค้างหน้าเดิม)
 */
async function dismissPostComposerOverlays(page: Page, userLabel: string): Promise<void> {
  for (let i = 0; i < 14; i++) {
    const postComposerDlg = page
      .locator('[role="dialog"]')
      .filter({ has: page.locator(POST_BTN_IN_DIALOG_SEL) })
      .first();
    const anyDlg = page.locator('[role="dialog"]').first();
    const hasPostDlg = await postComposerDlg.isVisible({ timeout: 400 }).catch(() => false);
    const hasAny = await anyDlg.isVisible({ timeout: 400 }).catch(() => false);
    if (!hasPostDlg && !hasAny) break;
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(300);
  if (await page.locator('[role="dialog"]').first().isVisible({ timeout: 500 }).catch(() => false)) {
    console.log(`⚠️ [${userLabel}] ยังมี dialog ค้างหลังโพสต์ — ลอง Escape เพิ่ม`);
    for (let j = 0; j < 6; j++) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(400);
    }
  }
}

/**
 * โพสต์งานลงกลุ่ม Facebook (Master Bot User 1-8)
 */
export async function postToGroup(
  page: Page,
  request: APIRequestContext,
  postItem: PostItem,
  gID: string,
  options: PostToGroupOptions
): Promise<boolean> {
  const { userLabel, posterName, sheetUrl, blacklistGroups = [] } = options;

  const groupUrl = `https://www.facebook.com/groups/${gID}`;

  try {
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
    await dismissCommonFacebookPopups(page);

    const groupName = await page.locator('h1').first().innerText({ timeout: 5000 }).catch(() => 'กลุ่มส่วนตัว');
    const memberCount = await page
      .evaluate(() => {
        const m = document.body.innerText.match(/([\d,.]+[MK]?)\s*(สมาชิก|members)/i);
        return m ? m[1] : '0';
      })
      .catch(() => '0');

    const postTriggerSel =
      'div[role="button"]:has-text("เขียนอะไรสักหน่อย"), div[role="button"]:has-text("Write something"), div[role="button"]:has-text("สร้างโพสต์สาธารณะ")';

    let composerDialog!: Locator;
    let captionEditor!: Locator;
    let composerReady = false;
    let lastFailReason = 'no_composer_open';

    for (let attempt = 0; attempt < MAX_COMPOSER_OPEN_ATTEMPTS && !composerReady; attempt++) {
      if (attempt > 0) {
        console.log(
          `🔄 [${userLabel}] เปิดช่องโพสต์ใหม่ ครั้งที่ ${attempt + 1}/${MAX_COMPOSER_OPEN_ATTEMPTS} (หน้ากลุ่ม ${gID})`
        );
        await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
        await dismissCommonFacebookPopups(page);
        await page.waitForTimeout(500);
      }

      let clickedWithoutToast = false;
      for (let tr = 0; tr < MAX_TOAST_RELOAD_AFTER_CLICK; tr++) {
        await dismissTechnicalErrorToast(page);
        const postTrigger = page.locator(postTriggerSel).first();
        if (!(await postTrigger.isVisible({ timeout: 12000 }))) {
          lastFailReason = 'no_composer_trigger';
          clickedWithoutToast = false;
          break;
        }
        await postTrigger.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(350);
        await postTrigger.click();
        await dismissCommonFacebookPopups(page);
        await page.waitForTimeout(800);
        await dismissTechnicalErrorToast(page);
        await page.waitForTimeout(400);

        if (await hasTechnicalErrorToast(page)) {
          console.log(
            `⚠️ [${userLabel}] Pop-up ข้อผิดพลาดทางเทคนิค — รีเฟรชหน้ากลุ่ม (${tr + 1}/${MAX_TOAST_RELOAD_AFTER_CLICK})`
          );
          await page.reload({ waitUntil: 'domcontentloaded' });
          await dismissCommonFacebookPopups(page);
          await page.waitForTimeout(700);
          continue;
        }
        clickedWithoutToast = true;
        break;
      }

      if (!clickedWithoutToast) {
        await page.keyboard.press('Escape').catch(() => {});
        continue;
      }

      try {
        composerDialog = await waitForCreatePostDialog(page);
      } catch {
        lastFailReason = 'no_create_post_dialog';
        console.log(`⚠️ [${userLabel}] ยังไม่เห็น dialog สร้างโพสต์ — ลองรอบถัดไป`);
        await page.keyboard.press('Escape').catch(() => {});
        continue;
      }

      captionEditor = await pickComposerEditorInDialog(composerDialog);
      if (await editorAnchoredInCommentUI(captionEditor)) {
        lastFailReason = 'composer_points_to_comment';
        console.log(
          `⚠️ [${userLabel}] ช่องพิมพ์ดูเป็นความคิดเห็นใต้โพสต์ — ปิดแล้วรีเฟรชหน้ากลุ่ม`
        );
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(400);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await dismissCommonFacebookPopups(page);
        await page.waitForTimeout(600);
        continue;
      }

      await captionEditor.waitFor({ state: 'visible', timeout: 12000 });
      await focusComposerSafely(page, composerDialog, captionEditor, userLabel);
      await page.waitForTimeout(500);

      if (await hasTechnicalErrorToast(page)) {
        lastFailReason = 'tech_error_after_dialog';
        console.log(`⚠️ [${userLabel}] ขึ้น toast หลังโฟกัส composer — รีเฟรช`);
        await page.keyboard.press('Escape').catch(() => {});
        await page.reload({ waitUntil: 'domcontentloaded' });
        await dismissCommonFacebookPopups(page);
        await page.waitForTimeout(600);
        continue;
      }

      if (await editorAnchoredInCommentUI(captionEditor)) {
        lastFailReason = 'comment_ui_after_focus';
        await page.keyboard.press('Escape').catch(() => {});
        await page.reload({ waitUntil: 'domcontentloaded' });
        await dismissCommonFacebookPopups(page);
        await page.waitForTimeout(600);
        continue;
      }

      composerReady = true;
    }

    if (!composerReady) {
      console.log(`❌ [${userLabel}] เปิด composer ไม่สำเร็จ (${lastFailReason}) กลุ่ม ${gID}`);
      await page.keyboard.press('Escape').catch(() => {});
      await capturePostFailureArtifacts({
        page,
        userLabel,
        groupId: gID,
        reason: lastFailReason,
        jobId: options.jobId,
        assignmentId: options.assignmentId,
      });
      return false;
    }

    await page.waitForTimeout(200);

    let fullCaption = postItem.caption || '';
    if (postItem.apply_link && blacklistGroups.length > 0 && !blacklistGroups.includes(gID)) {
      const escapedLink = postItem.apply_link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hasSameLink = new RegExp(escapedLink, 'i').test(fullCaption);
      const hasApplyLine = /(?:^|\n)\s*(?:👉\s*)?(?:หรือ)?สมัครงานได้ที่\s*:?\s*/i.test(fullCaption);
      if (!hasSameLink && !hasApplyLine) {
        /** รูปแบบเดียวกับสคริปต์ Master Bot เดิม (user1.json) */
        fullCaption += `\n\n👉 หรือสมัครงานได้ที่: ${postItem.apply_link}`;
      }
    }

    console.log(`✍️ [${userLabel}] กำลังพิมพ์ Caption ใน dialog โพสต์...`);
    await focusComposerSafely(page, composerDialog, captionEditor, userLabel);
    const lines = fullCaption.split('\n');
    for (const line of lines) {
      if (line.trim() !== '') {
        await page.keyboard.type(line);
      }
      await page.keyboard.press('Shift+Enter');
      await page.waitForTimeout(150);
    }

    await page.waitForTimeout(4000);

    const closePreviewBtn = composerDialog
      .locator(
        'div[aria-label="ลบพรีวิวลิงก์ออกจากโพสต์ของคุณ"], div[aria-label="Remove link preview from your post"]'
      )
      .first();

    if (await closePreviewBtn.isVisible()) {
      console.log(`🎯 [${userLabel}] พบ Link Preview! กำลังกดปิด...`);
      await closePreviewBtn.click();
      await page.waitForTimeout(2000);
    }

    const currentText = await captionEditor.innerText();
    if (currentText.length < fullCaption.length * 0.5) {
      console.log('⚠️ ข้อความหล่นหาย พิมพ์ใหม่ด้วย InsertText...');
      await focusComposerSafely(page, composerDialog, captionEditor, userLabel);
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.insertText(fullCaption);
      await page.waitForTimeout(2000);
    }

    const postBtn = composerDialog.locator(POST_BTN_IN_DIALOG_SEL).last();

    let postReady = false;
    const postBtnDeadline = Date.now() + 26000;
    while (Date.now() < postBtnDeadline) {
      if (await postBtn.isEnabled().catch(() => false)) {
        postReady = true;
        break;
      }
      await page.waitForTimeout(450);
    }

    if (postReady) {
      await postBtn.click();
      console.log(`✅ [${userLabel}] กดโพสต์แล้ว: ${postItem.title}`);
      await closeComposerDialogAfterPost(page, composerDialog, userLabel);
      await dismissCommonFacebookPopups(page);
      await dismissPostComposerOverlays(page, userLabel);
      await page.waitForTimeout(2000);
      /** ชื่อกลุ่มจาก h1 ตอนเข้าหน้า — ใช้ก่อน saveToSheet เพื่อไม่ให้ locator หลังโพสต์ค้าง */
      const groupNameForLog = normalizeGroupName(groupName);
      console.log(`🔗 [${userLabel}] เริ่มเก็บลิงก์โพสต์ (Sheet + Log)...`);
      const postLogOpts =
        options.assignmentId || options.jobId || options.userId
          ? {
              assignmentId: options.assignmentId,
              userId: options.userId,
              jobId: options.jobId,
              groupId: options.groupId || gID,
            }
          : undefined;
      try {
        await Promise.race([
          saveToSheet(page, request, gID, posterName, postItem, groupNameForLog, memberCount, sheetUrl, postLogOpts),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error(`เก็บลิงก์/บันทึก Sheet เกิน ${SAVE_TO_SHEET_MAX_MS}ms`)), SAVE_TO_SHEET_MAX_MS)
          ),
        ]);
      } catch (e) {
        console.warn(
          `⚠️ [${userLabel}] ${(e as Error).message} — ข้ามไปกลุ่มถัดไป (โพสต์บน Facebook น่าจะสำเร็จแล้ว)`
        );
      }
      return true;
    }

    console.log(`❌ [${userLabel}] ปุ่มโพสต์ใน dialog ไม่พร้อม — ปิด dialog แล้วไปกลุ่มถัดไป`);
    await closeComposerDialogAfterPost(page, composerDialog, userLabel);
    await capturePostFailureArtifacts({
      page,
      userLabel,
      groupId: gID,
      reason: 'post_button_disabled_or_missing',
      jobId: options.jobId,
      assignmentId: options.assignmentId,
    });
    return false;
  } catch (e) {
    const errMsg = (e as Error).message;
    console.log(`❌ [${userLabel}] พลาดกลุ่ม ${gID}: ${errMsg}`);
    try {
      await capturePostFailureArtifacts({
        page,
        userLabel,
        groupId: gID,
        reason: `exception:${errMsg.slice(0, 120)}`,
        jobId: options.jobId,
        assignmentId: options.assignmentId,
      });
    } catch {
      /* ignore artifact errors */
    }
    return false;
  }
}

async function dismissCommonFacebookPopups(page: Page): Promise<void> {
  const selectors = [
    'button:has-text("ไม่ใช่ตอนนี้")',
    'button:has-text("Not now")',
    'button:has-text("ตกลง")',
    'button:has-text("OK")',
    '[aria-label="ปิด"]',
    '[aria-label="Close"]',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 1200 }).catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
}
