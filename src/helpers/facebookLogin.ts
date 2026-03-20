import type { Page } from '@playwright/test';

/**
 * Login Facebook (กรณียังไม่ได้ login)
 * รองรับทั้ง royal_email และ input#email
 */
export async function facebookLogin(
  page: Page,
  email: string,
  password: string,
  options?: { userLabel?: string }
): Promise<void> {
  await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle' });

  const emailInput = page.locator(
    'input[data-testid="royal-email"], input[id="email"], input[name="email"]'
  ).first();
  const passInput = page.locator(
    'input[data-testid="royal-pass"], input[id="pass"], input[name="pass"]'
  ).first();

  const isLoginFormVisible = await emailInput.isVisible({ timeout: 7000 }).catch(() => false);

  if (isLoginFormVisible) {
    const label = options?.userLabel ? ` [${options.userLabel}]` : '';
    console.log(`🔑${label} กำลังกรอกข้อมูล Login...`);
    await emailInput.fill(email);
    await passInput.fill(password);

    const loginBtn = page.locator(
      'button[data-testid="royal-login-button"], button[name="login"], [data-testid="royal_login_button"]'
    ).first();

    if (await loginBtn.isVisible().catch(() => false)) {
      await loginBtn.click();
    } else {
      await passInput.press('Enter');
    }
    await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
  }
}
