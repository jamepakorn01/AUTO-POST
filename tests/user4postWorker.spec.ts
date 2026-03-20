import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('User 4: Provincial Tasks Posting', async ({ page, request }) => {
  // --- ส่วนที่ 1: การโหลดไฟล์ข้อมูล (ใช้ชื่อ User4Worker.json ตามที่คุณแจ้ง) ---
  const configPath = path.join(process.cwd(), 'User4Worker.json');
  
  // เช็คก่อนว่าไฟล์มีอยู่จริงไหม ถ้าไม่เจอจะแจ้งเตือนในจอ
  if (!fs.existsSync(configPath)) {
    console.error('--------------------------------------------------');
    console.error(`❌ หาไฟล์ไม่เจอที่: ${configPath}`);
    console.error('กรุณาเช็คว่าชื่อไฟล์ User4Worker.json สะกดถูกต้องและวางถูกที่');
    console.error('--------------------------------------------------');
    return;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const { email, password } = config.account;
  const googleSheetUrl = 'https://script.google.com/macros/s/AKfycbzT1TOHYvh-c9q76Q8qvDo3iYgHwEvXN9zNLnFbzT_8-CvTyd4X_pr1RweO4ZRGa4FE/exec';

  // --- ส่วนที่ 2: การ Login ---
  console.log('🚀 กำลังเปิด Facebook...');
  await page.goto('https://www.facebook.com/');
  
  const emailInput = page.locator('input[data-testid="royal-email"], input[name="email"]').first();
  const isLoggedIn = !(await emailInput.isVisible().catch(() => false));
  
  if (!isLoggedIn) {
    console.log('🔑 กำลังกรอกข้อมูล Login...');
    await emailInput.fill(email);
    await page.locator('input[data-testid="royal-pass"], input[name="pass"]').first().fill(password);
    await page.locator('button[data-testid="royal-login-button"], button[name="login"]').first().click();
    await page.waitForNavigation().catch(() => {});
  }
  
  console.log('⚠️ กรุณายืนยัน 2FA (ถ้ามี) จากนั้นกด [Resume] ในหน้าต่าง Inspector');
  await page.pause();

  // --- ส่วนที่ 3: เริ่มการโพสต์ตาม Tasks ---
  const tasks = config.tasks || [];
  console.log(`📋 พบข้อมูลทั้งหมด ${tasks.length} จังหวัด`);

  for (const task of tasks) {
    const { province, groupID, post_content } = task;
    console.log(`\n📢 เริ่มทำงานจังหวัด: ${province} (${post_content.title})`);

    for (let i = 0; i < groupID.length; i++) {
      const gID = groupID[i].trim();
      const groupURL = `https://www.facebook.com/groups/${gID}`;
      
      console.log(`   [${i + 1}/${groupID.length}] กำลังไปที่กลุ่ม: ${groupURL}`);

      try {
        await page.goto(groupURL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000); // รอหน้าเว็บนิ่ง

        // พยายามหาปุ่มโพสต์หลายๆ แบบ (กัน Facebook เปลี่ยนดีไซน์)
        const postTrigger = page.locator('div[role="button"]:has(span:has-text("เขียนอะไรสักหน่อย")), div[role="button"]:has(span:has-text("เขียนอะไรสักหน่อ")), div[role="button"]:has(span:has-text("สร้างโพสต์สาธารณะ"))').first();

        if (await postTrigger.isVisible({ timeout: 10000 })) {
          await postTrigger.click();
          
          const dialog = page.getByRole('dialog').first();
          await dialog.waitFor({ state: 'visible' });

          const editor = dialog.locator('div[contenteditable="true"][role="textbox"]').first();
          await editor.click();
          
          // ใส่ Caption จากไฟล์ JSON
          await page.keyboard.insertText(post_content.caption);
          await page.waitForTimeout(2000);

          // คลิกปุ่มโพสต์
          const postButton = dialog.locator('div[aria-label="โพสต์"][role="button"], div[aria-label="Post"][role="button"]').first();
          
          if (await postButton.isEnabled()) {
            await postButton.click();
            console.log(`      ✅ โพสต์สำเร็จ!`);
            
            // รอให้ Dialog ปิดตัวลง
            await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

            // ส่งข้อมูลไป Google Sheet
            await request.post(googleSheetUrl, {
              data: {
                action: 'POSTED',
                fbName: 'User 4',
                jobType: post_content.jobType,
                owner: post_content.owner,
                company: post_content.company,
                jobTitle: post_content.title,
                groupLink: groupURL
              }
            }).catch(() => {});
          }
        } else {
          console.log(`      ✗ ไม่พบปุ่มโพสต์ในกลุ่มนี้ (อาจยังไม่ได้เข้ากลุ่ม)`);
        }
      } catch (err: any) {
  console.error(`      ✗ เกิดข้อผิดพลาดที่กลุ่ม ${gID}:`, err.message);
}
      
      // สุ่มเวลาพักระหว่างโพสต์
      const delay = Math.floor(Math.random() * (config.post_settings.delay_between_posts_max - config.post_settings.delay_between_posts_min + 1) + config.post_settings.delay_between_posts_min);
      console.log(`      ⏳ พักรอ ${delay} วินาที...`);
      await page.waitForTimeout(delay * 1000);
    }
  }

  console.log('\n🌟 งานทั้งหมดเสร็จสิ้นแล้วครับคุณเจมส์!');
  await page.pause();
});