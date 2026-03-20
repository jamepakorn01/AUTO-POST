import type { Page } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import type { PostItem } from '../types/config';
import { postLog } from './postLog';

export interface SaveToSheetOptions {
  assignmentId?: string;
  userId?: string;
  jobId?: string;
  groupId?: string;
  customerPhone?: string;
}

/**
 * บันทึกลิงก์โพสต์ไปยัง Google Sheet
 * ดึงลิงก์จาก aria-label ล่าสุด (วินาที/นาที/เมื่อสักครู่)
 * และบันทึก Post Log ลง Database (รูปแบบ Log File)
 */
export async function saveToSheet(
  page: Page,
  request: APIRequestContext,
  gID: string,
  posterName: string,
  postItem: PostItem,
  groupName: string,
  memberCount: string,
  sheetUrl: string,
  postLogOpts?: SaveToSheetOptions
): Promise<void> {
  try {
    const checkUrls = [
      { url: `https://www.facebook.com/groups/${gID}/my_posted_content`, status: 'อนุมัติเเล้ว' },
      { url: `https://www.facebook.com/groups/${gID}/my_pending_content`, status: 'รออนุมัติ' },
    ];

    for (const item of checkUrls) {
      await page.goto(item.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(8000);

      const articles = page.locator('div[role="article"]').filter({ hasText: posterName });
      const count = await articles.count();

      for (let i = 0; i < count; i++) {
        const currentArticle = articles.nth(i);
        const allLinks = currentArticle.locator('a[role="link"]');
        const linkCount = await allLinks.count();

        for (let j = 0; j < linkCount; j++) {
          const link = allLinks.nth(j);
          const label = await link.getAttribute('aria-label');
          const href = await link.getAttribute('href');

          if (label && /วินาที|นาที|เมื่อสักครู่|just now|secs|mins/i.test(label) && href) {
            const finalLink = href.split('?')[0];
            await request.post(sheetUrl, {
              data: {
                action: 'NEW_POST',
                posterName,
                owner: postItem.owner,
                jobTitle: postItem.title,
                company: postItem.company,
                groupName: groupName.trim(),
                memberCount,
                postLink: finalLink,
                status: item.status,
              },
            }).catch((err) => {
              console.error('[saveToSheet] POST ไป Sheet ไม่สำเร็จ:', (err as Error).message);
            });
            // บันทึก Post Log ลง Database (รูปแบบ Log File)
            if (postLogOpts) {
              await postLog({
                poster_name: posterName,
                owner: postItem.owner,
                job_title: postItem.title,
                company: postItem.company,
                group_name: groupName.trim(),
                member_count: memberCount,
                post_link: finalLink,
                post_status: item.status,
                comment_count: 0,
                customer_phone: postLogOpts.customerPhone,
                assignment_id: postLogOpts.assignmentId,
                user_id: postLogOpts.userId,
                job_id: postLogOpts.jobId,
                group_id: postLogOpts.groupId,
              });
            }
            return;
          }
        }
      }
    }
  } catch (err) {
    console.error('[saveToSheet] บันทึก Sheet ไม่สำเร็จ:', (err as Error).message);
  }
}
