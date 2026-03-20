import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('Master Bot User 3: Auto Comment & Link Control', async ({ page }) => {
  const configPath = path.join(process.cwd(), 'user3.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const { email, password, blacklist_groups } = config.account;
  const allPosts = config.content.posts || [];

  await page.goto('https://www.facebook.com/');
  const emailField = page.locator('input#email, input[name="email"]');
  if (await emailField.isVisible({ timeout: 5000 })) {
    await emailField.fill(email);
    await page.locator('input#pass, input[name="pass"]').fill(password);
    await page.keyboard.press('Enter');
  }
  await page.pause(); // รอคุณ Resume

  for (const postItem of allPosts) {
    const groupIDs = postItem.groupID || [];

    for (const groupID of groupIDs) {
      const gID = groupID.trim();
      try {
        // ไปที่หน้า "โพสต์ของฉัน" ในกลุ่มนั้นๆ เพื่อหาโพสต์ล่าสุด
        await page.goto(`https://www.facebook.com/groups/${gID}/my_posted_content`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);

        // หาโพสต์ที่เป็นของ Owner คนนั้น
        const postRow = page.locator('div[role="article"]').filter({ hasText: postItem.owner }).first();
        
        if (await postRow.isVisible()) {
          // คลิกช่องคอมเมนต์
          const commentBox = postRow.locator('div[role="textbox"], div[aria-label="เขียนคอมเมนต์..."], div[aria-label="Write a comment..."]').first();
          
          if (await commentBox.isVisible()) {
            await commentBox.click();
            await page.waitForTimeout(2000);

            // --- Logic การเลือกคอมเมนต์ ---
            let commentText = postItem.comment_reply; // คอมเมนต์ปกติจาก JSON
            const isBlacklisted = blacklist_groups && blacklist_groups.includes(gID);
            const hasApplyLink = postItem.apply_link && postItem.apply_link !== "";

            if (!isBlacklisted && hasApplyLink) {
              // ถ้าไม่อยู่ใน Blacklist ให้เติมประโยคชวนกดลิงก์
              commentText += `\n📝 สมัครผ่านลิงก์ได้ที่นี่: ${postItem.apply_link}`;
              console.log(`💬 กลุ่ม ${gID}: คอมเมนต์พร้อมแปะลิงก์สมัคร`);
            } else {
              console.log(`💬 กลุ่ม ${gID}: คอมเมนต์ทักทายปกติ (ไม่แปะลิงก์)`);
            }
            // ---------------------------

            await page.keyboard.type(commentText);
            await page.keyboard.press('Enter');
            console.log(`✅ [User 3] คอมเมนต์สำเร็จในกลุ่ม ${gID}`);
          }
        } else {
          console.log(`⏭️ ไม่พบโพสต์ในกลุ่ม ${gID} (อาจยังไม่ผ่านการอนุมัติ)`);
        }
      } catch (e) {
        console.log(`❌ ผิดพลาดที่กลุ่ม ${gID}: ${e.message}`);
      }

      // รอสักครู่ก่อนไปกลุ่มถัดไป
      await page.waitForTimeout(5000);
    }
  }
});