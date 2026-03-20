import type { Page } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import type { WorkerTask } from '../types/config';

/** Sheet URL สำหรับ User4Worker (ถ้า config ไม่มี ให้ใช้ค่าจาก env หรือ default) */
const DEFAULT_WORKER_SHEET_URL =
  process.env.USER4_WORKER_SHEET_URL ||
  'https://script.google.com/macros/s/AKfycbzT1TOHYvh-c9q76Q8qvDo3iYgHwEvXN9zNLnFbzT_8-CvTyd4X_pr1RweO4ZRGa4FE/exec';

/**
 * โพสต์งานลงกลุ่ม (Worker Bot - รูปแบบ dialog, insertText)
 */
export async function postToGroupWorker(
  page: Page,
  request: APIRequestContext,
  task: WorkerTask,
  gID: string,
  options?: { sheetUrl?: string; posterName?: string }
): Promise<boolean> {
  const sheetUrl = options?.sheetUrl ?? DEFAULT_WORKER_SHEET_URL;
  const posterName = options?.posterName ?? 'User 4';
  const groupURL = `https://www.facebook.com/groups/${gID}`;
  const { post_content } = task;

  try {
    await page.goto(groupURL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const postTrigger = page
      .locator(
        'div[role="button"]:has(span:has-text("เขียนอะไรสักหน่อย")), div[role="button"]:has(span:has-text("เขียนอะไรสักหน่อ")), div[role="button"]:has(span:has-text("สร้างโพสต์สาธารณะ"))'
      )
      .first();

    if (!(await postTrigger.isVisible({ timeout: 10000 }))) {
      return false;
    }

    await postTrigger.click();

    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ state: 'visible' });

    const editor = dialog.locator('div[contenteditable="true"][role="textbox"]').first();
    await editor.click();
    await page.keyboard.insertText(post_content.caption);
    await page.waitForTimeout(2000);

    const postButton = dialog
      .locator('div[aria-label="โพสต์"][role="button"], div[aria-label="Post"][role="button"]')
      .first();

    if (!(await postButton.isEnabled())) {
      return false;
    }

    await postButton.click();
    await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

    await request.post(sheetUrl, {
      data: {
        action: 'POSTED',
        fbName: posterName,
        jobType: post_content.jobType,
        owner: post_content.owner,
        company: post_content.company,
        jobTitle: post_content.title,
        groupLink: groupURL,
      },
    }).catch((err) => {
      console.error('[postToGroupWorker] บันทึก Sheet ไม่สำเร็จ:', (err as Error).message);
    });

    return true;
  } catch {
    return false;
  }
}
