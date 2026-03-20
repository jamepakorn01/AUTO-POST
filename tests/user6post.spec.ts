import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('Master Bot User 6: Post & Link Collector', async ({ page, request }) => {
  // 1. โหลด Config
  const configPath = path.join(process.cwd(), 'user6.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const { email, password, poster_name, sheet_url, blacklist_groups } = config.account; 
  const allPosts = config.content.posts || [];

  // 2. ไปที่ Facebook
  await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle' });

  // --- Login Section ---
  const emailInput = page.locator('input[id="email"], input[name="email"]');
  const passInput = page.locator('input[id="pass"], input[name="pass"]');

  if (await emailInput.isVisible({ timeout: 7000 })) {
    console.log("🔑 [User 6] กำลังดำเนินการ Login...");
    await emailInput.fill(email);
    await passInput.fill(password);
    const loginBtn = page.locator('button[name="login"], [data-testid="royal_login_button"]').first();
    if (await loginBtn.isVisible()) { 
      await loginBtn.click(); 
    } else { 
      await passInput.press('Enter'); 
    }
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
  }

  console.log("⏸️ Pause: ตรวจสอบหน้าจอ User 6 ให้เรียบร้อยแล้วกด Resume");
  await page.pause(); 

  // 3. เริ่มวนลูปโพสต์
  for (const postItem of allPosts) {
    for (const groupID of (postItem.groupID || [])) {
      if (page.isClosed()) return;
      const gID = groupID.trim();
      
      try {
        console.log(`🚀 [User 6] เข้ากลุ่ม: ${gID}`);
        await page.goto(`https://www.facebook.com/groups/${gID}`, { waitUntil: 'domcontentloaded' });
        
        const groupName = await page.locator('h1').first().innerText({ timeout: 5000 }).catch(() => "กลุ่มส่วนตัว");
        const memberCount = await page.evaluate(() => {
          const m = document.body.innerText.match(/([\d,.]+[MK]?)\s*(สมาชิก|members)/i);
          return m ? m[1] : "0";
        }).catch(() => "0");

        const postTrigger = page.locator('div[role="button"]:has-text("เขียนอะไรสักหน่อย"), div[role="button"]:has-text("Write something"), div[role="button"]:has-text("สร้างโพสต์สาธารณะ")').first();

        if (await postTrigger.isVisible({ timeout: 10000 })) {
          await postTrigger.click();
          
          // เลือกช่อง Caption โดยบล็อก input และเน้น div ที่พิมพ์ได้
          const captionEditor = page.locator('div[contenteditable="true"][role="textbox"]').filter({ hasNot: page.locator('input') }).first();

          await captionEditor.waitFor({ state: 'visible', timeout: 10000 });
          await captionEditor.focus();
          await page.waitForTimeout(2000);

          let fullCaption = postItem.caption;
          if (postItem.apply_link && blacklist_groups && !blacklist_groups.includes(gID)) {
            fullCaption += `\n\n👉 หรือสมัครงานได้ที่: ${postItem.apply_link}`;
          }

          // --- 🛠️ พิมพ์ทีละบรรทัด (Line-by-Line Typing) เพื่อความเสถียร ---
          console.log(`✍️ [User 6] กำลังพิมพ์ Caption...`);
          const lines = fullCaption.split('\n');
          for (const line of lines) {
            if (line.trim() !== "") {
              await page.keyboard.type(line);
            }
            await page.keyboard.press('Shift+Enter'); 
            await page.waitForTimeout(150); 
          }

          await page.waitForTimeout(3000);

          // --- 🎯 ตรวจสอบเนื้อหาก่อนกดโพสต์ ---
          const currentText = await captionEditor.innerText();
          if (currentText.length < (fullCaption.length * 0.5)) {
            console.log("⚠️ [User 6] ข้อความขาด! กำลังใช้ระบบสำรอง (InsertText)...");
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Backspace');
            await page.keyboard.insertText(fullCaption);
            await page.waitForTimeout(2000);
          }

          const postBtn = page.locator('div[aria-label="โพสต์"][role="button"], div[role="button"]:has-text("โพสต์")').last();
          
          if (await postBtn.isEnabled() && (await captionEditor.innerText()).length > 10) {
            await postBtn.click();
            console.log(`✅ [User 6] โพสต์สำเร็จ: ${postItem.title}`);
            await page.waitForTimeout(10000); // รอให้ Facebook ประมวลผลก่อนไปเช็คลิงก์

            await saveToSheet(page, request, gID, poster_name, postItem, groupName, memberCount, sheet_url);
          }
        }
      } catch (e) { 
        console.log(`❌ [User 6] พลาดกลุ่ม ${gID}: ${e.message}`); 
      }
      await page.waitForTimeout(3000);
    }
  }
});

async function saveToSheet(page, request, gID, poster_name, postItem, groupName, memberCount, sheet_url) {
  const checkUrls = [
    { url: `https://www.facebook.com/groups/${gID}/my_posted_content`, status: "อนุมัติเเล้ว" },
    { url: `https://www.facebook.com/groups/${gID}/my_pending_content`, status: "รออนุมัติ" }
  ];

  for (const item of checkUrls) {
    try {
      console.log(`🔍 [User 6] เช็คหน้า: ${item.status}`);
      await page.goto(item.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000); 

      const recentPost = page.locator('div[role="article"]').filter({ hasText: poster_name }).filter({ 
        has: page.locator('a[role="link"]').filter({ hasText: /วินาที|นาที|เมื่อสักครู่|just now|secs|mins/i }) 
      }).first();

      if (await recentPost.count() > 0) {
        const timeLink = recentPost.locator('a[role="link"]').filter({ hasText: /วินาที|นาที|เมื่อสักครู่|just now|secs|mins/i }).first();
        const href = await timeLink.getAttribute('href');
        
        if (href) {
          const finalLink = href.startsWith('http') ? href.split('?')[0] : `https://www.facebook.com${href.split('?')[0]}`;
          console.log(`📌 [User 6] พบลิงก์ล่าสุด [${item.status}]: ${finalLink}`);

          await request.post(sheet_url, {
            data: { action: 'NEW_POST', posterName: poster_name, owner: postItem.owner, jobTitle: postItem.title, company: postItem.company, groupName: groupName.trim(), memberCount, postLink: finalLink, status: item.status }
          }).catch(() => {});
          return; 
        }
      }
    } catch (err) {}
  }
}