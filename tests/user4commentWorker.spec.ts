import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('User4Worker: Check Comments & Reply', async ({ page, request }) => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../User4Worker.json'), 'utf-8'));
  const googleSheetUrl = 'https://script.google.com/macros/s/AKfycbzT1TOHYvh-c9q76Q8qvDo3iYgHwEvXN9zNLnFbzT_8-CvTyd4X_pr1RweO4ZRGa4FE/exec';

  await page.goto('https://www.facebook.com/');
  console.log('⚠️ User4Worker: Login ให้เรียบร้อยแล้วกด [Resume]');
  await page.pause();

  for (const task of config.tasks) {
    console.log(`\n🔎 เริ่มเช็กคอมเมนต์จังหวัด: ${task.province}`);
    for (const id of task.groupID) {
      try {
        await page.goto(`https://www.facebook.com/groups/${id}/user_post_status/`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000);

        const searchText = task.post_content.caption.substring(0, 30).replace(/\n/g, "");
        const post = page.locator(`div[role="article"]:has-text("${searchText}")`).first();

        if (await post.isVisible()) {
          const isPending = await post.locator('text="กำลังรอการอนุมัติ", text="Pending"').isVisible();
          if (!isPending) {
            await post.locator('a[role="link"]').first().click();
            await page.waitForTimeout(5000);

            // ดูดเบอร์โทร
            const comments = page.locator('div[role="article"]');
            const count = await comments.count();
            for (let i = 0; i < count; i++) {
              const txt = await comments.nth(i).innerText();
              const phone = txt.match(/0[0-9]{1,2}[-\s]?[0-9]{3}[-\s]?[0-9]{4}/);
              if (phone) {
                await request.post(googleSheetUrl, {
                  data: { action: 'LEAD_COLLECTED', fbName: `User4Worker (${task.province})`, phone: phone[0], groupLink: `https://www.facebook.com/groups/${id}` }
                }).catch(() => {});
              }
            }

            // ตอบกลับ & ดันโพสต์
            const replyBtns = page.locator('div[role="button"]:has-text("ตอบกลับ"), div[role="button"]:has-text("Reply")');
            for (let k = 0; k < await replyBtns.count(); k++) {
              await replyBtns.nth(k).click();
              await page.keyboard.insertText(task.post_content.comment_reply);
              await page.keyboard.press('Enter');
              await page.waitForTimeout(2000);
            }
          }
        }
      } catch (e) { console.log(`❌ ไม่พบโพสต์ในกลุ่ม ${id}`); }
    }
  }
});