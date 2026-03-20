import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('Bot 2: High Precision Data Sync - Fixed Reply & Phone', async ({ page, request }) => {
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'user1.json'), 'utf-8'));
  const { email, password, poster_name, sheet_url } = config.account;

  const response = await request.get(sheet_url);
  const jobsToCheck = await response.json();
  if (!jobsToCheck || jobsToCheck.length === 0) return console.log("❌ ไม่มีรายการงานให้ตรวจ");

  // --- 1. Login Facebook ---
  await page.goto('https://www.facebook.com/');
  const emailField = page.locator('input#email, input[name="email"]');
  if (await emailField.isVisible({ timeout: 5000 })) {
    await emailField.fill(email);
    await page.locator('input#pass, input[name="pass"]').fill(password);
    await page.keyboard.press('Enter');
  }
  await page.pause(); // รอคุณเจมส์กด Resume

  for (const job of jobsToCheck) {
    try {
      console.log(`\n🔍 กำลังตรวจสอบโพสต์: ${job.jobTitle}`);

      if (job.url.includes('pending_posts')) {
        console.log(`   ⏭️ ข้าม: โพสต์นี้ยังไม่ได้รับอนุมัติ`);
        continue;
      }

      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(7000); 

      const commentBox = page.locator('div[aria-label="เขียนความคิดเห็น..."], div[role="textbox"], div[aria-label="Write a comment"]').first();
      if (!(await commentBox.isVisible({ timeout: 7000 }))) {
        console.log(`   ⏭️ ข้าม: ไม่พบช่องคอมเมนต์`);
        continue;
      }

      const postText = await page.locator('div[role="main"]').first().innerText().catch(() => "");
      const ownerPhoneMatch = postText.match(/0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}/);
      const ownerPhoneOriginal = ownerPhoneMatch ? ownerPhoneMatch[0] : "เบอร์ในโพสต์";
      const ownerPhoneClean = ownerPhoneMatch ? ownerPhoneMatch[0].replace(/[^\d]/g, '') : "NO_PHONE";
      const displayOwnerName = job.owner || "เจ้าหน้าที่";

      // --- [ดันโพสต์ (Bump)] ---
      console.log(`   ⬆️ กำลังดันโพสต์...`);
      await commentBox.click();
      const bumpText = `ยังรับสมัครอยู่นะครับ สนใจสอบถามรายละเอียดเพิ่มเติม หรือโทรสมัครได้ที่เบอร์ ${ownerPhoneOriginal} (${displayOwnerName})`;
      await page.keyboard.type(bumpText);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);

      // --- [แก้ไขส่วนการหาคอมเมนต์ให้แม่นยำขึ้น] ---
      // ใช้ Selector ที่กว้างขึ้นเพื่อให้เจอคอมเมนต์ทุกรูปแบบ
      const commentItems = page.locator('div[role="article"]').filter({ has: page.locator('div[dir="auto"]') });
      const totalCount = await commentItems.count();
      
      let customerPhones: string[] = [];
      let actualCommentCount = 0;

      for (let i = 0; i < totalCount; i++) {
        const comment = commentItems.nth(i);
        const commentContent = await comment.innerText().catch(() => "");
        
        if (commentContent.trim() !== "") {
          // 🛑 กรองคอมเมนต์ตัวเอง
          if (commentContent.includes(displayOwnerName) || commentContent.includes(poster_name) || commentContent.includes("ยังรับสมัครอยู่")) continue;

          actualCommentCount++; 
          
          // สแกนหาเบอร์โทร (หาได้ทั้งแบบมีขีดและไม่มีขีด)
          const cleanDigits = commentContent.replace(/[^\d]/g, '');
          const phoneMatches = cleanDigits.match(/0\d{9}/g);

          if (phoneMatches) {
            for (const phone of phoneMatches) {
              if (phone !== ownerPhoneClean) {
                customerPhones.push(phone);
              }
            }
          }

          // --- [ลอจิกตอบกลับคอมเมนต์] ---
          // เช็คว่าเคยตอบกลับไปหรือยัง
          const replySectionText = await comment.innerText();
          if (replySectionText.includes("ติดต่อกลับ") || replySectionText.includes("ทิ้งเบอร์")) continue;

          const replyBtn = comment.getByRole('button', { name: /ตอบกลับ|Reply/i }).first();
          if (await replyBtn.isVisible()) {
             await replyBtn.click({ force: true });
             await page.waitForTimeout(2000);

             if (phoneMatches && phoneMatches.length > 0) {
               await page.keyboard.type("รับทราบครับ ขอบคุณที่สนใจงานครับ เดี๋ยวเจ้าหน้าที่จะรีบติดต่อกลับไปให้ข้อมูลโดยเร็วที่สุดนะครับ 🙏");
             } else {
               await page.keyboard.type(`ยินดีครับ สนใจสมัครงานรบกวนทิ้งเบอร์ติดต่อกลับไว้ในคอมเมนต์ หรือโทรตรงที่เบอร์ ${ownerPhoneOriginal} (${displayOwnerName}) ได้เลยนะครับ เจ้าหน้าที่รอให้ข้อมูลอยู่ครับ`);
             }
             await page.keyboard.press('Enter');
             await page.waitForTimeout(3000);
          }
        }
      }

      // 6. ส่งข้อมูลกลับไปบันทึก
      await request.post(sheet_url, {
        data: { 
          action: "UPDATE_COMMENTS", 
          postLink: job.url, 
          extractedPhones: [...new Set(customerPhones)].join(', '), 
          commentCount: actualCommentCount 
        }
      });
      console.log(`✅ บันทึกแล้ว: พบลูกค้าจริง ${actualCommentCount} ราย, เบอร์ลูกค้า: ${customerPhones.length > 0 ? customerPhones.join(',') : 'ไม่มี'}`);

    } catch (e) { 
      console.log(`❌ ผิดพลาด: ${e.message}`); 
    }
  }
});