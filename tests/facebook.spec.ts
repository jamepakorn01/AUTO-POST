import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('Login to Facebook and post to groups', async ({ page }) => {
  // Load credentials
  const configPath = path.join(__dirname, '../databangkok-indorama.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const email = config.account.email;
  const password = config.account.password;

  // Navigate to Facebook
  await page.goto('https://www.facebook.com/');
  await page.waitForLoadState('networkidle').catch(() => {
    console.log('⚠ Facebook load timed out, continuing...');
  });
  
  // Try to login
  const emailInput = page.locator('input[data-testid="royal-email"], input[name="email"]').first();
  const isLoggedIn = !(await emailInput.isVisible().catch(() => false));
  
  if (!isLoggedIn) {
    console.log('Login form found, attempting to log in...');
    await emailInput.fill(email);
    await page.locator('input[data-testid="royal-pass"], input[name="pass"]').first().fill(password);
    await page.locator('button[data-testid="royal-login-button"], button[name="login"]').first().click();
    await page.waitForNavigation().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {
      console.log('⚠ Login page load timed out, continuing...');
    });
  }
  
  // Pause for 2FA
  console.log('Please verify 2FA if needed...');
  await page.pause();
  await page.waitForTimeout(1000);

  // Load groups and caption
  const groupIDs: string[] = (config.content && config.content.groupID) || [];
  const caption: string = (config.content && config.content.caption) || '';

  console.log(`Will post to ${groupIDs.length} groups`);

  for (let i = 0; i < groupIDs.length; i++) {
    const groupID = groupIDs[i];
    const groupURL = `https://www.facebook.com/groups/${groupID}`;
    console.log(`\n[${i + 1}/${groupIDs.length}] Navigating to ${groupURL}`);

    try {
      // Navigate to group with domcontentloaded (faster than networkidle)
      await page.goto(groupURL, { waitUntil: 'domcontentloaded' }); 

      // Wait for post trigger button to appear
      console.log('  Looking for post trigger...');
      const postTrigger = page.locator('div[role="button"]:has(span:has-text("เขียนอะไรสักหน่อ"))').first();
      
      await postTrigger.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
        console.log('  ⚠ Post trigger not found, skipping...');
      });

      if (!(await postTrigger.isVisible().catch(() => false))) {
        console.log('  ✗ Could not find post trigger. Skipping group...');
        continue;
      }

      // Click to open post composer
      await postTrigger.click();
      console.log('  ✓ Clicked post trigger');

      // Wait for dialog and editor
      console.log('  Waiting for editor...');
      const dialog = page.getByRole('dialog').first();
      await dialog.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
        console.log('  ⚠ Dialog not found');
      });

      // Fill caption
      const editor = dialog.locator('div[contenteditable="true"][role="textbox"]').first();
      await editor.click(); 
      await page.waitForTimeout(500);
      
      try {
        await page.keyboard.type(caption, { delay: 5 });
      } catch (e) {
        await editor.fill(caption);
      }
      
      console.log('  ✓ Caption inserted');
      await page.waitForTimeout(1000);

      // Click post button
      const postButton = dialog.locator('div[aria-label="โพสต์"][role="button"]').first();
      
      if (await postButton.isEnabled().catch(() => false)) {
        await postButton.click();
        console.log('  ✓ Clicked POST button');
        
        // Wait for dialog to close
        await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      } else {
        console.log('  ✗ POST button not enabled');
      }

      await page.waitForTimeout(3000);

    } catch (err) {
      console.error(`  ✗ Error in group ${groupID}:`, (err as Error).message);
    }
    
    // Delay before next group
    await page.waitForTimeout(2000);
  }

  console.log('\nAll groups processed.');
  await page.pause();
});