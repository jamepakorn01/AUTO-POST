import type { Page } from '@playwright/test';

/** ดึงเบอร์ไทยจากข้อความ (รูปแบบหลากหลาย) */
export function extractPhonesFromText(text: string): string[] {
  const raw = String(text || '');
  const found = new Set<string>();
  const patterns: RegExp[] = [
    /0[689]\d[\s.-]?\d{3}[\s.-]?\d{4}/g,
    /0[689]\d{8}/g,
    /\+66[\s.-]?[689]\d[\s.-]?\d{3}[\s.-]?\d{4}/g,
    /66[\s.-]?[689]\d[\s.-]?\d{3}[\s.-]?\d{4}/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(raw)) !== null) {
      let d = m[0].replace(/\D/g, '');
      if (d.startsWith('66') && d.length >= 11) d = '0' + d.slice(2);
      if (d.length === 9 && d.startsWith('9')) d = '0' + d;
      if (d.length >= 9 && d.length <= 10 && d.startsWith('0')) found.add(d);
    }
  }
  return [...found];
}

/** แปลงเบอร์เป็นตัวเลขล้วนรูปแบบไทย 0XXXXXXXXX เพื่อใช้เทียบซ้ำ */
export function normalizeThaiPhoneDigits(phone: string): string | null {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('66') && d.length >= 11) d = '0' + d.slice(2);
  if (d.length === 9 && d.startsWith('9')) d = '0' + d;
  if (d.length < 9 || d.length > 10) return null;
  if (!d.startsWith('0')) return null;
  return d;
}

export function buildExcludedPhoneSet(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  const text = String(raw || '');
  // 1) Extract phone-like patterns from full text first, so "+66 8x xxxx xxxx" survives spaces.
  extractPhonesFromText(text)
    .map((x) => normalizeThaiPhoneDigits(x))
    .filter((x): x is string => !!x)
    .forEach((x) => out.add(x));
  // 2) Fallback token split for tightly formatted values.
  text
    .split(/[\s,;|]+/)
    .map((x) => normalizeThaiPhoneDigits(x))
    .filter((x): x is string => !!x)
    .forEach((x) => out.add(x));
  return out;
}

export function filterPhonesForCollect(
  phones: string[],
  opts: { excluded: Set<string>; seenToday: Set<string> }
): string[] {
  const kept: string[] = [];
  for (const p of phones) {
    const n = normalizeThaiPhoneDigits(p);
    if (!n) continue;
    if (opts.excluded.has(n)) continue;
    if (opts.seenToday.has(n)) continue;
    opts.seenToday.add(n);
    kept.push(n);
  }
  return kept;
}

type PhoneHit = {
  postLogId: string;
  jobId: string;
  createdAtMs: number;
  phone: string;
};

/**
 * ถ้าเบอร์ซ้ำในชุดที่เลือกเก็บ ให้คงไว้เฉพาะ "โพสต์ล่าสุด"
 * เพื่อตัดซ้ำข้ามงาน/ข้ามโพสต์ในรอบเดียวกัน
 */
export function keepLatestPhonePerSelection(hits: PhoneHit[]): Map<string, string[]> {
  const winnerByPhone = new Map<string, PhoneHit>();
  for (const h of hits) {
    const phone = normalizeThaiPhoneDigits(h.phone);
    if (!phone) continue;
    const cur = winnerByPhone.get(phone);
    if (!cur) {
      winnerByPhone.set(phone, { ...h, phone });
      continue;
    }
    // เลือกโพสต์ที่ใหม่กว่า; ถ้าเวลาเท่ากันให้ preference งานเดียวกันก่อน
    if (h.createdAtMs > cur.createdAtMs || (h.createdAtMs === cur.createdAtMs && h.jobId && h.jobId === cur.jobId)) {
      winnerByPhone.set(phone, { ...h, phone });
    }
  }
  const out = new Map<string, string[]>();
  for (const [phone, owner] of winnerByPhone.entries()) {
    const arr = out.get(owner.postLogId) || [];
    arr.push(phone);
    out.set(owner.postLogId, arr);
  }
  return out;
}

/**
 * เปิดลิงก์โพสต์ ขยาย/เลื่อน comment แล้วรวมข้อความจาก article
 */
export async function scrapeCommentsAndPhones(
  page: Page,
  postUrl: string,
  opts?: { excludeAuthorNames?: string[] }
): Promise<{ phones: string[]; commentCount: number; postBodyPhones: string[] }> {
  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(2000);
  await page
    .locator('[role="article"]')
    .first()
    .waitFor({ state: 'visible', timeout: 45_000 })
    .catch(() => {});

  for (let round = 0; round < 14; round++) {
    const moreRe = new RegExp(
      [
        'View more comments',
        'more comments',
        'See more comments',
        'Previous comments',
        'View previous comments',
        'ความคิดเห็นเพิ่ม',
        'ความคิดเห็นเพิ่มเติม',
        'แสดงความคิดเห็น',
        'ดูความคิดเห็น',
        'ความคิดเห็นก่อนหน้า',
        'ดูเพิ่มเติม',
        'See more',
      ].join('|'),
      'i'
    );
    const moreSelectors = [
      page.getByRole('button', { name: /View more comments|more comments|See more|Previous comments/i }),
      page.getByRole('link', { name: moreRe }),
      page.getByText(moreRe).first(),
    ];
    let clicked = false;
    for (const loc of moreSelectors) {
      const el = loc.first();
      if (await el.isVisible({ timeout: 600 }).catch(() => false)) {
        await el.click({ timeout: 2500 }).catch(() => {});
        clicked = true;
        await page.waitForTimeout(1200);
        break;
      }
    }
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(350);
    if (!clicked && round > 5) break;
  }

  const articles = page.locator('[role="article"]');
  const n = await articles.count();
  const maxN = Math.min(Math.max(n, 0), 140);
  // article แรกมักเป็นโพสต์หลัก
  const postBodyText = maxN > 0 ? await articles.nth(0).innerText().catch(() => '') : '';
  const excludedNames = new Set(
    (Array.isArray(opts?.excludeAuthorNames) ? opts.excludeAuthorNames : [])
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const commentTexts = await page
    .evaluate((names) => {
      const excluded = new Set((Array.isArray(names) ? names : []).map((x) => String(x || '').trim().toLowerCase()));
      const out: string[] = [];
      const seen = new Set<string>();

      const pushBlock = (raw: string) => {
        const text = String(raw || '').trim();
        if (text.length < 2) return;
        const first = text.split('\n').map((s) => s.trim()).find(Boolean) || '';
        if (first && excluded.has(first.toLowerCase())) return;
        const key = text.slice(0, 240);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(text);
      };

      // ลำดับแรก: aria ที่ Facebook มักใช้กับบล็อกคอมเมนต์ (ไม่ใช้ data-ad-preview — มักชนโฆษณา/ข้อความโพสต์)
      const primarySelectors = [
        '[aria-label*="Comment by" i]',
        '[aria-label*="ความคิดเห็นโดย" i]',
        '[aria-label*="ความคิดเห็นของ" i]',
        '[aria-label*="Commenter" i]',
        '[aria-label*="comment by" i]',
      ];
      for (const sel of primarySelectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => pushBlock((el as HTMLElement).innerText));
        } catch {
          /* ignore invalid selector in old engines */
        }
      }

      // รองรับ UI ที่ไม่มี aria ชัด — ใช้ article ถัดจากโพสต์หลัก
      if (out.length === 0) {
        const articles = Array.from(document.querySelectorAll('[role="article"]'));
        for (let i = 1; i < articles.length; i++) {
          pushBlock((articles[i] as HTMLElement).innerText);
        }
      }
      return out;
    }, [...excludedNames])
    .catch(() => []);
  let commentBlob = '';
  if (Array.isArray(commentTexts) && commentTexts.length > 0) {
    commentBlob = commentTexts.join('\n');
  } else {
    // fallback เดิม ถ้าจับคอมเมนต์บล็อกไม่ได้
    for (let i = 1; i < maxN; i++) {
      commentBlob += '\n' + (await articles.nth(i).innerText().catch(() => ''));
    }
  }
  // เก็บเบอร์จากคอมเมนต์เท่านั้น
  const phones = extractPhonesFromText(commentBlob);
  // กันพลาด: เก็บเบอร์ที่พบในโพสต์หลักไว้ให้ caller เอาไป exclude เพิ่ม
  const postBodyPhones = extractPhonesFromText(postBodyText);
  // นับจากบล็อกคอมเมนต์จริงก่อน fallback
  const commentCount = Array.isArray(commentTexts) && commentTexts.length > 0 ? commentTexts.length : Math.max(0, n - 1);
  return { phones, commentCount, postBodyPhones };
}
