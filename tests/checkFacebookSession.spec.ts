/**
 * เรียกจาก Admin: POST /api/users/:id/check-session
 * ตั้งค่า CHECK_SESSION_EMAIL, CHECK_SESSION_PASSWORD, CHECK_SESSION_KEY, CHECK_SESSION_LABEL ผ่าน env
 */
import { test } from '@playwright/test';
import { facebookLogin } from '../src/helpers';

test('Check Facebook session (บันทึก .auth)', async ({ page }) => {
  /** ยืนยันตัวตนอาจใช้เวลานาน — อย่าให้ Playwright ปิดก่อน */
  test.setTimeout(50 * 60 * 1000);

  const email = String(process.env.CHECK_SESSION_EMAIL || '').trim();
  const password = String(process.env.CHECK_SESSION_PASSWORD || '').trim();
  const sessionKey = String(process.env.CHECK_SESSION_KEY || 'default').trim();
  const userLabel = String(process.env.CHECK_SESSION_LABEL || 'Session check').trim();

  if (!email || !password) {
    test.skip(true, 'ไม่มี CHECK_SESSION_EMAIL/PASSWORD — ใช้เฉพาะเมื่อสั่งจาก Admin (ปุ่มเช็ค Session)');
    return;
  }

  await facebookLogin(page, email, password, {
    userLabel,
    sessionKey,
    interactiveCheckpoint: true,
  });
  console.log(`✅ [${userLabel}] บันทึก session แล้ว (key: ${sessionKey}) — ปิด Chrome ได้หรือรอให้กระบวนการจบ`);
});
