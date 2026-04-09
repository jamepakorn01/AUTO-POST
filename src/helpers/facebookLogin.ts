import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const FB_STATE_LOCK_WAIT_MS = Math.min(600_000, Math.max(60_000, Number(process.env.FB_STATE_LOCK_WAIT_MS) || 180_000));
const FB_STATE_LOCK_POLL_MS = 500;

/** ล็อกข้ามโปรเซส — กันหลาย Playwright แย่งอ่าน/เขียน facebook-*.json พร้อมกัน */
async function acquireFacebookStateLock(statePath: string): Promise<() => Promise<void>> {
  const lockPath = `${statePath}.lock`;
  /** ล็อกค้างเมื่อ worker/Chrome เด้ง — กันค้างที่หน้าโหลดนานเกิน 15 นาที */
  try {
    const st = await fs.promises.stat(lockPath).catch(() => null);
    if (st && Date.now() - st.mtimeMs > 15 * 60 * 1000) {
      await fs.promises.unlink(lockPath).catch(() => {});
      console.warn(`[fb-session] ลบไฟล์ล็อกค้าง: ${path.basename(lockPath)} (เกิน 15 นาที)`);
    }
  } catch {
    /* ignore */
  }
  const start = Date.now();
  for (;;) {
    try {
      const fh = await fs.promises.open(lockPath, 'wx');
      try {
        await fh.writeFile(`${process.pid}\n${Date.now()}`, 'utf8');
      } finally {
        await fh.close();
      }
      return async () => {
        await fs.promises.unlink(lockPath).catch(() => {});
      };
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code !== 'EEXIST') throw e;
      if (Date.now() - start > FB_STATE_LOCK_WAIT_MS) {
        throw new Error(
          `รอล็อก session Facebook (${path.basename(lockPath)}) นานเกินไป — อาจมีบอท/Chrome อีกตัวใช้บัญชีเดียวกัน หรือลบไฟล์ ${lockPath} ถ้าค้าง`
        );
      }
      await new Promise((r) => setTimeout(r, FB_STATE_LOCK_POLL_MS));
    }
  }
}

/**
 * Login Facebook (กรณียังไม่ได้ login)
 * รองรับทั้ง royal_email และ input#email
 */
export async function facebookLogin(
  page: Page,
  email: string,
  password: string,
  options?: { userLabel?: string; sessionKey?: string; interactiveCheckpoint?: boolean }
): Promise<Page> {
  const keyBase = String(options?.sessionKey || options?.userLabel || email || 'default')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .toLowerCase();
  const authDir = path.join(process.cwd(), '.auth');
  const statePath = path.join(authDir, `facebook-${keyBase}.json`);

  const releaseLock = await acquireFacebookStateLock(statePath);
  try {
  let workingPage = page;
  if (workingPage.isClosed()) {
    workingPage = await workingPage.context().newPage();
  }

  console.log(
    `[fb-session] ${path.basename(statePath)} ${fs.existsSync(statePath) ? '→ โหลด cookies/localStorage' : '→ ยังไม่มีไฟล์ จะล็อกอินด้วยรหัส'}`
  );
  await restoreFacebookStorageState(workingPage, statePath);
  try {
    await workingPage.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  } catch (e) {
    if (workingPage.isClosed()) {
      workingPage = await workingPage.context().newPage();
      await workingPage.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    } else {
      throw e;
    }
  }
  await dismissCommonFacebookPopups(workingPage);

  const emailInput = workingPage.locator(
    'input[data-testid="royal-email"], input[id="email"], input[name="email"]'
  ).first();
  const passInput = workingPage.locator(
    'input[data-testid="royal-pass"], input[id="pass"], input[name="pass"]'
  ).first();

  const isLoginFormVisible = await emailInput.isVisible({ timeout: 7000 }).catch(() => false);

  if (isLoginFormVisible) {
    const label = options?.userLabel ? ` [${options.userLabel}]` : '';
    console.log(`🔑${label} กำลังกรอกข้อมูล Login...`);
    await emailInput.fill(email);
    await passInput.fill(password);

    const loginBtn = workingPage.locator(
      'button[data-testid="royal-login-button"], button[name="login"], [data-testid="royal_login_button"]'
    ).first();

    if (await loginBtn.isVisible().catch(() => false)) {
      await Promise.all([
        workingPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {}),
        loginBtn.click(),
      ]);
    } else {
      await Promise.all([
        workingPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {}),
        passInput.press('Enter'),
      ]);
    }
    await workingPage.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
    /** รอ redirect / โหลดหน้ายืนยันตัวตน — ถ้าเช็คเร็วเกินไปจะได้ unknown แล้ว throw ปิด Chrome ทันที */
    await workingPage.waitForTimeout(5000);
    await dismissCommonFacebookPopups(workingPage);

    const authState = await waitForAuthState(workingPage, 120_000);
    if (authState === 'logged_in') {
      /* พร้อมบันทึก session */
    } else if (await hasFacebookLoginErrorVisible(workingPage)) {
      throw new Error(
        'Facebook แจ้งว่าอีเมลหรือรหัสผ่านไม่ถูกต้อง — แก้ไขใน User แล้วลองใหม่'
      );
    } else {
      const waitMin = options?.interactiveCheckpoint ? 40 : 28;
      console.log(
        `⚠️${label} หลังล็อกอินยังไม่เข้าฟีด — อาจเป็นหน้ายืนยันตัวตน/ความปลอดภัย (ดูใน Chrome)\n` +
          `   รอสูงสุด ~${waitMin} นาที กรุณาทำขั้นตอนในเบราว์เซอร์ให้ครบ อย่าปิดหน้าต่าง`
      );
      const ok = await waitUntilLoggedIn(workingPage, waitMin * 60_000);
      if (!ok) {
        throw new Error(
          'ยังไม่ผ่านการยืนยันตัวตนหรือล็อกอินไม่สำเร็จ — ทำในหน้าต่าง Chrome ให้จบแล้วกดล็อกอิน Facebook อีกครั้ง'
        );
      }
    }
  }
  else {
    const label = options?.userLabel ? ` [${options.userLabel}]` : '';
    console.log(`✅${label} พบ session เดิมแล้ว ตรวจสอบสถานะก่อนโพสต์...`);
    let authState = await waitForAuthState(workingPage, 45_000);
    if (authState === 'checkpoint') {
      const waitMin = options?.interactiveCheckpoint ? 40 : 25;
      console.log(
        `⚠️${label} พบหน้า verify/checkpoint (session) — ทำใน Chrome ให้ครบ (รอสูงสุด ~${waitMin} นาที)`
      );
      const ok = await waitUntilLoggedIn(workingPage, waitMin * 60_000);
      if (!ok) {
        throw new Error('ยังไม่ผ่านการยืนยันตัวตน (verify/checkpoint) กรุณายืนยันให้เสร็จก่อน');
      }
    } else if (authState !== 'logged_in') {
      await workingPage.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
      await dismissCommonFacebookPopups(workingPage);
      await workingPage.waitForTimeout(3000);
      authState = await waitForAuthState(workingPage, 45_000);
      if (authState === 'logged_in') {
        /* ok */
      } else if (await hasFacebookLoginErrorVisible(workingPage)) {
        throw new Error('session หมดหรือบัญชีต้องล็อกอินใหม่ — ใช้ปุ่มล็อกอิน Facebook ใน Users');
      } else {
        const waitMin = options?.interactiveCheckpoint ? 40 : 25;
        console.log(
          `⚠️${label} session เดิมไม่พร้อม — อาจต้องยืนยันตัวตน (รอ ~${waitMin} นาที)`
        );
        const ok = await waitUntilLoggedIn(workingPage, waitMin * 60_000);
        if (!ok) {
          throw new Error(
            'session หมดอายุหรือยังไม่ผ่านการยืนยัน — ใช้ปุ่มล็อกอิน Facebook ใน Users แล้วทำขั้นตอนใน Chrome ให้ครบ'
          );
        }
      }
    }
    console.log(`✅${label} พร้อมโพสต์ต่อ`);
  }

  await fs.promises.mkdir(authDir, { recursive: true }).catch(() => {});
  await workingPage.context().storageState({ path: statePath }).catch(() => {});
  return workingPage;
  } finally {
    await releaseLock();
  }
}

async function dismissCommonFacebookPopups(page: Page): Promise<void> {
  const selectors = [
    'button:has-text("ไม่ใช่ตอนนี้")',
    'button:has-text("Not now")',
    'button:has-text("ตกลง")',
    'button:has-text("OK")',
    '[aria-label="ปิด"]',
    '[aria-label="Close"]',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 1200 }).catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
}

type PlaywrightStorageStateFile = {
  cookies?: Array<Record<string, unknown>>;
  origins?: Array<{ origin?: string; localStorage?: Array<{ name: string; value: string }> }>;
};

function isFacebookRelatedCookieDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return (
    d.includes('facebook.com') ||
    d.includes('fbcdn.net') ||
    d.includes('fb.com') ||
    d.includes('messenger.com')
  );
}

function isFacebookRelatedOrigin(origin: string): boolean {
  return /facebook\.com|messenger\.com|fb\.com/i.test(origin);
}

/**
 * คืนค่า session จากไฟล์ที่บันทึกด้วย context.storageState()
 * ต้องใส่ทั้ง cookies และ localStorage (เช่น key Session) — ถ้าใส่แค่ cookies มักโดนหน้า Login แม้ session ยังใช้ได้
 */
async function restoreFacebookStorageState(page: Page, statePath: string): Promise<void> {
  try {
    if (!fs.existsSync(statePath)) return;
    const raw = await fs.promises.readFile(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as PlaywrightStorageStateFile;
    const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : [];
    const fbCookies = cookies.filter((c) => isFacebookRelatedCookieDomain(String(c.domain || ''))) as any[];
    if (fbCookies.length > 0) {
      await page.context().addCookies(fbCookies);
    }
    const origins = Array.isArray(parsed.origins) ? parsed.origins : [];
    for (const o of origins) {
      const origin = String(o.origin || '').trim();
      const items = Array.isArray(o.localStorage) ? o.localStorage : [];
      if (!origin || items.length === 0 || !isFacebookRelatedOrigin(origin)) continue;
      const url = origin.endsWith('/') ? origin : `${origin}/`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
      await page.evaluate((entries) => {
        for (const it of entries) {
          try {
            localStorage.setItem(String(it.name), String(it.value));
          } catch {
            /* quota / sandbox */
          }
        }
      }, items);
      /** ไม่ใช้ reload — บางเครื่องค้าง; โหลด URL ใหม่ให้ FB อ่าน localStorage */
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
    }
  } catch {
    // ignore invalid state file
  }
}

type AuthState = 'logged_in' | 'checkpoint' | 'login_form' | 'unknown';

/** ข้อความที่มักโผล่เมื่อรหัสผิด — ใช้กันหลงกับหน้ายืนยันตัวตน */
async function hasFacebookLoginErrorVisible(page: Page): Promise<boolean> {
  const t = await page.locator('body').innerText().catch(() => '');
  return /incorrect password|wrong password|doesn'?t match|รหัสผ่านที่คุณป้อนไม่ถูกต้อง|รหัสผ่านไม่ถูกต้อง|password you entered is incorrect|find your account|couldn'?t find your account/i.test(
    t
  );
}

async function getAuthState(page: Page): Promise<AuthState> {
  const url = page.url();
  /** หน้า checkpoint / 2FA / ยืนยันตัวตน — ขยาย pattern กันพลาดแล้วไปถือว่า logged_in หรือ unknown แล้วปิด Chrome */
  if (
    /checkpoint|two_step|two-step|approvals_code|login\/device-based|device-based|recover\/|auth_platform|captcha|submit[_-]?identification|account[_-]?quality|login\/notif|cookie|session[_-]?audit|security\/|privacy\/checkpoint|help\/contact|confirm|verification/i.test(
      url
    )
  ) {
    return 'checkpoint';
  }
  if (/\/login\/?(\?|$)|login\.php/i.test(url)) return 'login_form';
  const snippet = await page
    .evaluate(() => (document.body?.innerText || '').slice(0, 1200))
    .catch(() => '');
  if (
    /ยืนยันตัวตน|ยืนยันว่าเป็น|ตรวจสอบความปลอดภัย|รหัสยืนยัน|ส่งรหัส|verify your identity|security check|two-factor|authentication code|Enter login code|Approve from another device|Check your notifications/i.test(
      snippet
    )
  ) {
    return 'checkpoint';
  }
  const loginVisible = await page
    .locator('input[data-testid="royal-email"], input[id="email"], input[name="email"]')
    .first()
    .isVisible({ timeout: 800 })
    .catch(() => false);
  const passVisible = await page
    .locator('input[data-testid="royal-pass"], input[id="pass"], input[name="pass"]')
    .first()
    .isVisible({ timeout: 600 })
    .catch(() => false);
  /** มีทั้งอีเมล+รหัส มักเป็นฟอร์มล็อกอินจริง ไม่ใช่แค่ช่องยืนยัน */
  if (loginVisible && passVisible) return 'login_form';
  if (loginVisible && /facebook\.com\/login/i.test(url)) return 'login_form';

  // ถือว่า login แล้ว เมื่อไม่อยู่หน้า login/checkpoint และไม่เห็นฟอร์ม login แบบสมบูรณ์
  if (/facebook\.com|fbcdn\.net/i.test(url)) return 'logged_in';
  return 'unknown';
}

async function waitForAuthState(page: Page, timeoutMs: number): Promise<AuthState> {
  /** เฉพาะหน้าโหลดภายใน (about:blank / data:) — อย่าตัดทุก URL ที่ไม่ใช่ facebook เดี๋ยว logic หลัง goto เพี้ยน */
  const u = page.url();
  if (u === 'about:blank' || u.startsWith('data:')) {
    return 'unknown';
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getAuthState(page);
    if (state === 'checkpoint' || state === 'logged_in') return state;
    await page.waitForTimeout(2000);
  }
  return 'unknown';
}

async function waitUntilLoggedIn(page: Page, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getAuthState(page);
    if (state === 'logged_in') return true;
    /** checkpoint / login_form / unknown ยังรอให้ผู้ใช้ทำขั้นตอนในเบราว์เซอร์ */
    await page.waitForTimeout(2500);
  }
  return false;
}

