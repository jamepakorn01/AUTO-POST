import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('Master Bot User 3: Post & Link Collector', async ({ page, request }) => {
  const configPath = path.join(process.cwd(), 'user3.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const { email, password, poster_name, sheet_url, blacklist_groups } = config.account; 
  const allPosts = config.content.posts || [];

  await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle' });

  // --- Login Section ---
  const emailInput = page.locator('input[id="email"], input[name="email"]');
  const passInput = page.locator('input[id="pass"], input[name="pass"]');

  if (await emailInput.isVisible({ timeout: 7000 })) {
    console.log("🔑 [User 3] กำลังเริ่มกรอกข้อมูล Login...");
    await emailInput.fill(email);
    await passInput.fill(password);
    const loginBtn = page.locator('button[name="login"], [data-testid="royal_login_button"]').first();
    if (await loginBtn.isVisible()) { await loginBtn.click(); } 
    else { await passInput.press('Enter'); }
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
  }

  console.log("⏸️ Pause: ตรวจสอบหน้า Feed ให้เรียบร้อยแล้วกด Resume");
  await page.pause(); 

  for (const postItem of allPosts) {
    for (const groupID of (postItem.groupID || [])) {
      if (page.isClosed()) return;
      const gID = groupID.trim();
      
      try {
        console.log(`🚀 [User 3] เข้ากลุ่ม: ${gID}`);
        await page.goto(`https://www.facebook.com/groups/${gID}`, { waitUntil: 'domcontentloaded' });
        
        const groupName = await page.locator('h1').first().innerText({ timeout: 5000 }).catch(() => "กลุ่มส่วนตัว");
        const memberCount = await page.evaluate(() => {
          const m = document.body.innerText.match(/([\d,.]+[MK]?)\s*(สมาชิก|members)/i);
          return m ? m[1] : "0";
        }).catch(() => "0");

        const postTrigger = page.locator('div[role="button"]:has-text("เขียนอะไรสักหน่อย"), div[role="button"]:has-text("Write something"), div[role="button"]:has-text("สร้างโพสต์สาธารณะ")').first();

        if (await postTrigger.isVisible({ timeout: 10000 })) {
          await postTrigger.click();
          
          const captionEditor = page.locator('div[contenteditable="true"][role="textbox"]')
            .filter({ hasNot: page.locator('input') }) 
            .first();

          await captionEditor.waitFor({ state: 'visible', timeout: 10000 });
          await captionEditor.focus();
          await page.waitForTimeout(2000);

          let fullCaption = postItem.caption; 
          if (postItem.apply_link && blacklist_groups && !blacklist_groups.includes(gID)) {
            fullCaption += `\n\n👉 หรือสมัครงานได้ที่: ${postItem.apply_link}`;
          }

          console.log(`✍️ [User 3] กำลังพิมพ์ Caption...`);
          const lines = fullCaption.split('\n');
          for (const line of lines) {
            if (line.trim() !== "") { await page.keyboard.type(line); }
            await page.keyboard.press('Shift+Enter'); 
            await page.waitForTimeout(150); 
          }
          
          // ⏳ เพิ่มเวลารอให้ Preview ลิงก์ขึ้นมาเต็มที่
          await page.waitForTimeout(5000);

          // --- 🎯 ส่วนที่แก้ไข: กดปิด Link Preview (ตาม HTML ที่คุณส่งมา) ---
          const closePreviewBtn = page.locator('div[aria-label="ลบพรีวิวลิงก์ออกจากโพสต์ของคุณ"], div[aria-label="Remove link preview from your post"]').first();
          
          if (await closePreviewBtn.isVisible()) {
            console.log("🎯 [User 3] พบ Link Preview! กำลังกดปิด...");
            await closePreviewBtn.click();
            await page.waitForTimeout(2000);
          } else {
            console.log("ℹ️ [User 3] ไม่พบปุ่มปิด Preview หรือ Preview ไม่แสดง");
          }

          // ตรวจเช็คความครบถ้วนของข้อความ
          const currentText = await captionEditor.innerText();
          if (currentText.length < (fullCaption.length * 0.5)) { 
             console.log("⚠️ ข้อความหล่นหาย พิมพ์ใหม่ด้วย InsertText...");
             await page.keyboard.press('Control+A');
             await page.keyboard.press('Backspace');
             await page.keyboard.insertText(fullCaption);
             await page.waitForTimeout(2000);
          }

          const postBtn = page.locator('div[aria-label="โพสต์"][role="button"], div[role="button"]:has-text("โพสต์")').last();
          
          if (await postBtn.isEnabled()) {
            await postBtn.click();
            console.log(`✅ [User 3] โพสต์สำเร็จ: ${postItem.title}`);
            await page.waitForTimeout(10000); 
            await saveToSheet(page, request, gID, poster_name, postItem, groupName, memberCount, sheet_url);
          }
        }
      } catch (e) { 
        console.log(`❌ [User 3] พลาดกลุ่ม ${gID}: ${e.message}`); 
      }
      await page.waitForTimeout(3000);
    }
  }
});

// ฟังก์ชัน saveToSheet (ดึงลิงก์จาก aria-label ล่าสุด)
async function saveToSheet(page, request, gID, poster_name, postItem, groupName, memberCount, sheet_url) {
  try {
    const checkUrls = [
      { url: `https://www.facebook.com/groups/${gID}/my_posted_content`, status: "อนุมัติเเล้ว" },
      { url: `https://www.facebook.com/groups/${gID}/my_pending_content`, status: "รออนุมัติ" }
    ];
    for (const item of checkUrls) {
      await page.goto(item.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(8000); 
      
      const articles = page.locator('div[role="article"]').filter({ hasText: poster_name });
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
            await request.post(sheet_url, {
              data: { action: 'NEW_POST', posterName: poster_name, owner: postItem.owner, jobTitle: postItem.title, company: postItem.company, groupName: groupName.trim(), memberCount, postLink: finalLink, status: item.status }
            }).catch(() => {});
            return; 
          }
        }
      }
    }
  } catch (err) {}
}