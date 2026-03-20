import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('Bot 2: User 2 (คุณเล็ก) Data Sync', async ({ page, request }) => {
  // อ่านจากไฟล์ user2.json
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'user2.json'), 'utf-8'));
  const { email, password, poster_name, sheet_url } = config.account;

  const response = await request.get(sheet_url);
  const jobsToCheck = await response.json();
  if (!jobsToCheck || jobsToCheck.length === 0) return console.log("❌ ไม่มีรายการงานให้ตรวจ");

  // --- Login Facebook ---
  await page.goto('https://www.facebook.com/');
  const emailField = page.locator('input#email, input[name="email"]');
  if (await emailField.isVisible({ timeout: 5000 })) {
    await emailField.fill(email);
    await page.locator('input#pass, input[name="pass"]').fill(password);
    await page.keyboard.press('Enter');
  }
  await page.pause(); 

  for (const job of jobsToCheck) {
    try {
      console.log(`\n🔍 [User 2] ตรวจสอบโพสต์: ${job.jobTitle}`);

      if (job.url.includes('pending_posts')) continue;

      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(7000); 

      const commentBox = page.locator('div[aria-label="เขียนความคิดเห็น..."], div[role="textbox"], div[aria-label="Write a comment"]').first();
      if (!(await commentBox.isVisible({ timeout: 7000 }))) continue;

      const postText = await page.locator('div[role="main"]').first().innerText().catch(() => "");
      const ownerPhoneMatch = postText.match(/0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}/);
      const ownerPhoneOriginal = ownerPhoneMatch ? ownerPhoneMatch[0] : "เบอร์ในโพสต์";
      const ownerPhoneClean = ownerPhoneMatch ? ownerPhoneMatch[0].replace(/[^\d]/g, '') : "NO_PHONE";
      const displayOwnerName = job.owner || "เจ้าหน้าที่";

      // --- 1. ดันโพสต์ (Bump) ---
      await commentBox.click();
      const bumpText = `ยังรับสมัครอยู่นะครับ สนใจสอบถามรายละเอียดเพิ่มเติม หรือโทรสมัครได้ที่เบอร์ ${ownerPhoneOriginal} (${displayOwnerName})`;
      await page.keyboard.type(bumpText);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);

      // --- 2. ตรวจสอบและตอบกลับคอมเมนต์ ---
      const commentItems = page.locator('div[role="article"]').filter({ has: page.locator('div[dir="auto"]') });
      const totalCount = await commentItems.count();
      
      let customerPhones: string[] = [];
      let actualCommentCount = 0;

      for (let i = 0; i < totalCount; i++) {
        const comment = commentItems.nth(i);
        const commentContent = await comment.innerText().catch(() => "");
        
        // ไม่นับคอมเมนต์ของตัวเอง (คุณเล็ก)
        if (commentContent.includes(poster_name) || commentContent.includes(displayOwnerName) || commentContent.includes("ยังรับสมัครอยู่")) continue;

        actualCommentCount++; 
        const cleanDigits = commentContent.replace(/[^\d]/g, '');
        const phoneMatches = cleanDigits.match(/0\d{9}/g);

        if (phoneMatches) {
          phoneMatches.forEach(p => { if (p !== ownerPhoneClean) customerPhones.push(p); });
        }

        // เช็คว่าเคยตอบหรือยัง
        const alreadyReplied = await comment.innerText().then(t => t.includes("ติดต่อกลับ") || t.includes("ทิ้งเบอร์")).catch(() => false);
        
        if (!alreadyReplied) {
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

      // 3. ส่งข้อมูลกลับไปที่ Sheet เดียวกัน
      await request.post(sheet_url, {
        data: { 
          action: "UPDATE_COMMENTS", 
          postLink: job.url, 
          extractedPhones: [...new Set(customerPhones)].join(', '), 
          commentCount: actualCommentCount 
        }
      });
      console.log(`✅ [User 2] บันทึกสำเร็จ: ${job.jobTitle}`);

    } catch (e) { console.log(`❌ [User 2] พลาด: ${e.message}`); }
  }
});