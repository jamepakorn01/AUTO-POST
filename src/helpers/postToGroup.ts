import type { Page } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import type { PostItem } from '../types/config';
import { saveToSheet } from './saveToSheet';

export interface PostToGroupOptions {
  userLabel: string;
  posterName: string;
  sheetUrl: string;
  blacklistGroups?: string[];
  /** User 8 มี error popup handling พิเศษ */
  handleErrorPopup?: boolean;
  /** สำหรับ runLog */
  assignmentId?: string;
  userId?: string;
  jobId?: string;
  groupId?: string;
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
  const {
    userLabel,
    posterName,
    sheetUrl,
    blacklistGroups = [],
    handleErrorPopup = false,
  } = options;

  try {
    await page.goto(`https://www.facebook.com/groups/${gID}`, { waitUntil: 'domcontentloaded' });

    const groupName = await page.locator('h1').first().innerText({ timeout: 5000 }).catch(() => 'กลุ่มส่วนตัว');
    const memberCount = await page
      .evaluate(() => {
        const m = document.body.innerText.match(/([\d,.]+[MK]?)\s*(สมาชิก|members)/i);
        return m ? m[1] : '0';
      })
      .catch(() => '0');

    const postTrigger = page
      .locator(
        'div[role="button"]:has-text("เขียนอะไรสักหน่อย"), div[role="button"]:has-text("Write something"), div[role="button"]:has-text("สร้างโพสต์สาธารณะ")'
      )
      .first();

    if (!(await postTrigger.isVisible({ timeout: 10000 }))) {
      return false;
    }

    await postTrigger.click();

    const captionEditor = page
      .locator('div[contenteditable="true"][role="textbox"]')
      .filter({ hasNot: page.locator('input') })
      .first();

    // User 8: รอจน error popup หาย (ถ้ามี)
    if (handleErrorPopup) {
      let editorReady = false;
      for (let attempt = 1; attempt <= 10; attempt++) {
        const errorPopup = page
          .locator('div:has-text("เกิดข้อผิดพลาดขึ้น"), div:has-text("ข้อผิดพลาดทางเทคนิค")')
          .first();

        if (await errorPopup.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log(`⚠️ [${userLabel}] พบ Pop-up Error (ครั้งที่ ${attempt}) รอ 15 วินาที...`);
          const closeBtn = page.locator('[aria-label="ปิด"], [aria-label="Close"]').last();
          if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await closeBtn.click();
          }
          await page.waitForTimeout(15000);
          continue;
        }

        if (await captionEditor.isVisible({ timeout: 3000 }).catch(() => false)) {
          await captionEditor.click({ force: true });
          await page.waitForTimeout(1000);
          await captionEditor.focus();
          await page.waitForTimeout(1000);

          const isFocused = await captionEditor.evaluate((el: Element) => el === document.activeElement);
          if (isFocused) {
            editorReady = true;
            break;
          }
        }
        await page.waitForTimeout(3000);
      }

      if (!editorReady) {
        console.log(`❌ [${userLabel}] กล่องพิมพ์ไม่พร้อม ข้ามกลุ่ม ${gID}`);
        await page.keyboard.press('Escape');
        return false;
      }
      await page.waitForTimeout(1000);
    } else {
      await captionEditor.waitFor({ state: 'visible', timeout: 10000 });
      await captionEditor.focus();
      await page.waitForTimeout(2000);
    }

    let fullCaption = postItem.caption;
    if (postItem.apply_link && blacklistGroups.length > 0 && !blacklistGroups.includes(gID)) {
      fullCaption += `\n\n👉 หรือสมัครงานได้ที่: ${postItem.apply_link}`;
    }

    console.log(`✍️ [${userLabel}] กำลังพิมพ์ Caption...`);
    const lines = fullCaption.split('\n');
    for (const line of lines) {
      if (line.trim() !== '') {
        await page.keyboard.type(line);
      }
      await page.keyboard.press('Shift+Enter');
      await page.waitForTimeout(150);
    }

    await page.waitForTimeout(5000);

    const closePreviewBtn = page
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
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.insertText(fullCaption);
      await page.waitForTimeout(2000);
    }

    const postBtn = page
      .locator('div[aria-label="โพสต์"][role="button"], div[role="button"]:has-text("โพสต์")')
      .last();

    if (await postBtn.isEnabled()) {
      await postBtn.click();
      console.log(`✅ [${userLabel}] โพสต์สำเร็จ: ${postItem.title}`);
      await page.waitForTimeout(10000);
      const postLogOpts =
        options.assignmentId || options.jobId
          ? {
              assignmentId: options.assignmentId,
              userId: options.userId,
              jobId: options.jobId,
              groupId: options.groupId || gID,
            }
          : undefined;
      await saveToSheet(page, request, gID, posterName, postItem, groupName, memberCount, sheetUrl, postLogOpts);
      return true;
    }

    return false;
  } catch (e) {
    console.log(`❌ [${userLabel}] พลาดกลุ่ม ${gID}: ${(e as Error).message}`);
    return false;
  }
}
