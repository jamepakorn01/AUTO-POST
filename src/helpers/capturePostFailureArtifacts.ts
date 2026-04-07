import * as fs from 'fs/promises';
import * as path from 'path';
import type { Page } from '@playwright/test';

const HTML_MAX = 1_500_000;

export interface CapturePostFailureArtifactsArgs {
  page: Page;
  userLabel: string;
  groupId: string;
  reason: string;
  jobId?: string;
  assignmentId?: string;
}

/**
 * บันทึก screenshot + HTML (ตัดความยาว) เมื่อโพสต์ล้ม — ไว้ไล่ selector / UI
 */
export async function capturePostFailureArtifacts(
  args: CapturePostFailureArtifactsArgs
): Promise<{ screenshot?: string; html?: string }> {
  const { page, userLabel, groupId, reason, jobId, assignmentId } = args;
  if (page.isClosed()) {
    console.log(`⚠️ [${userLabel}] ข้ามบันทึกภาพหน้าจอ (หน้าถูกปิดแล้ว) reason=${reason}`);
    return {};
  }
  const safeReason = String(reason)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 80);
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(process.cwd(), 'artifacts', day);
  await fs.mkdir(dir, { recursive: true });
  const stamp = Date.now();
  const base = `${stamp}_${groupId}_${safeReason}`;
  const pngPath = path.join(dir, `${base}.png`);
  const htmlPath = path.join(dir, `${base}.html`);

  try {
    await page.screenshot({ path: pngPath, fullPage: true });
  } catch (e) {
    console.log(`⚠️ [${userLabel}] screenshot ล้มเหลว: ${(e as Error).message}`);
  }

  try {
    let html = await page.content();
    if (html.length > HTML_MAX) {
      html = `${html.slice(0, HTML_MAX)}\n<!-- truncated (${html.length} bytes) -->`;
    }
    await fs.writeFile(htmlPath, html, 'utf8');
  } catch (e) {
    console.log(`⚠️ [${userLabel}] บันทึก HTML ล้มเหลว: ${(e as Error).message}`);
  }

  const payload = {
    userLabel,
    groupId,
    reason,
    jobId,
    assignmentId,
    screenshot: pngPath,
    html: htmlPath,
  };
  console.log(`📎 บันทึกหลักฐานโพสต์ล้ม: ${JSON.stringify(payload)}`);
  return { screenshot: pngPath, html: htmlPath };
}
