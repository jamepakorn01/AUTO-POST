import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';
import path from 'path';
import { getPlaywrightTestTimeoutMs } from './playwright-test-timeout';
dotenv.config({ path: path.resolve(__dirname, '.env') });

const testTimeoutMs = getPlaywrightTestTimeoutMs();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /** โพสต์ FB ใช้เวลานาน — กัน Playwright timeout แล้วปิด Chrome ก่อนโพสต์ครบ (ดู playwright-test-timeout.ts) */
  timeout: testTimeoutMs,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* รันทีละไฟล์ (workers: 1) เพราะแต่ละ test ต้อง login Facebook แยกกัน */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Trace เมื่อเทสต์ล้ม — เปิดด้วย npx playwright show-trace */
    trace: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
 projects: [
  {
    name: 'Google Chrome',
    use: { ...devices['Desktop Chrome'], channel: 'chrome' }, // ใช้ Google Chrome ในเครื่อง
  },
  {
    name: 'ChromiumCollect',
    /** ใช้ Chrome จริงแบบ headless — ลดปัญหา session / ตรวจจับบอทเมื่อเทียบกับ Chromium ที่ bundle มา */
    use: {
      ...devices['Desktop Chrome'],
      channel: 'chrome',
      headless: true,
    },
  },
  // { name: 'firefox', use: { ...devices['Desktop Firefox'] } }, <-- ปิดพวกนี้ไว้
],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
