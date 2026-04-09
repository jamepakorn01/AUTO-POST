/**
 * เวลาเทสต์โพสต์ (postAll) — ใช้ร่วมกันใน playwright.config + postAll.spec
 * ตั้ง PLAYWRIGHT_GLOBAL_TIMEOUT_MS (ms) ได้; ค่าเริ่มต้น 6 ชม.; สูงสุด 12 ชม.; ต่ำสุด 1 ชม.
 */
const MS_PER_HOUR = 60 * 60 * 1000;

export function getPlaywrightTestTimeoutMs(): number {
  return Math.min(
    12 * MS_PER_HOUR,
    Math.max(1 * MS_PER_HOUR, Number(process.env.PLAYWRIGHT_GLOBAL_TIMEOUT_MS) || 6 * MS_PER_HOUR)
  );
}
