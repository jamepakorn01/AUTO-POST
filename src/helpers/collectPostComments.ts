import type { Page } from '@playwright/test';

/** รอโดยไม่ throw เมื่อแท็บ/Browser ถูกปิดระหว่างเก็บ Comment (กันหยุดทั้งงาน 142 โพสต์) */
export async function safePageWait(page: Page, ms: number): Promise<void> {
  if (page.isClosed()) return;
  try {
    await page.waitForTimeout(ms);
  } catch {
    /* Target closed */
  }
}

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

/** คลิก See more / ดูเพิ่มเติม ในโพสต์และในคอมเมนต์ — กันตัด caption/คอมเมนต์ทิ้ง */
async function expandTruncatedFacebookContent(page: Page) {
  const nameRe = /See more|See More|ดูเพิ่มเติม|แสดงเพิ่มเติม|แสดงต่อ|Read more|View more text/i;
  for (let i = 0; i < 10; i++) {
    if (page.isClosed()) return;
    const btn = page.getByRole('button', { name: nameRe }).first();
    if (await btn.isVisible({ timeout: 450 }).catch(() => false)) {
      await btn.click({ timeout: 2500 }).catch(() => {});
      await safePageWait(page, 450);
    } else {
      break;
    }
  }
}

function normalizedPhoneSetFromText(text: string): Set<string> {
  const s = new Set<string>();
  for (const p of extractPhonesFromText(text)) {
    const n = normalizeThaiPhoneDigits(p);
    if (n) s.add(n);
  }
  return s;
}

/**
 * เปิดลิงก์โพสต์ ขยาย/เลื่อน comment แล้วรวมข้อความจาก article
 */
export async function scrapeCommentsAndPhones(
  page: Page,
  postUrl: string,
  opts?: { excludeAuthorNames?: string[] }
): Promise<{ phones: string[]; commentCount: number; postBodyPhones: string[] }> {
  if (page.isClosed()) {
    throw new Error('Target page, context or browser has been closed');
  }
  try {
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  } catch (e) {
    if (page.isClosed()) {
      throw new Error('Target page, context or browser has been closed');
    }
    throw e;
  }
  if (page.isClosed()) {
    throw new Error('Target page, context or browser has been closed');
  }
  await safePageWait(page, 2000);
  const firstArticle = page.locator('[role="article"]').first();
  await firstArticle.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {});
  await expandTruncatedFacebookContent(page);

  for (let round = 0; round < 20; round++) {
    if (page.isClosed()) break;
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
        await safePageWait(page, 1200);
        break;
      }
    }
    if (page.isClosed()) break;
    await page.mouse.wheel(0, 900).catch(() => {});
    await safePageWait(page, 400);
    if (!clicked && round > 8) break;
  }

  if (page.isClosed()) {
    throw new Error('Target page, context or browser has been closed');
  }

  const articles = page.locator('[role="article"]');
  const n = await articles.count();
  const maxN = Math.min(Math.max(n, 0), 200);
  const postBodyText = maxN > 0 ? await articles.nth(0).innerText().catch(() => '') : '';
  const excludedNames = new Set(
    (Array.isArray(opts?.excludeAuthorNames) ? opts.excludeAuthorNames : [])
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean)
  );

  type EvalOut = { commentBlocks: string[]; captionExclusionText: string };
  const evaluated = await page
    .evaluate((names) => {
      const excluded = new Set((Array.isArray(names) ? names : []).map((x) => String(x || '').trim().toLowerCase()));
      const out: string[] = [];
      const seen = new Set<string>();

      const insideCommentThread = (el: Element | null) =>
        !!el?.closest(
          '[aria-label*="Comment by" i], [aria-label*="ความคิดเห็นโดย" i], [aria-label*="ความคิดเห็นของ" i], [aria-label*="Commenter" i]'
        );

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

      const rootArticle = document.querySelector('[role="article"]');
      let captionExclusionText = '';
      if (rootArticle) {
        const storyMsgs = Array.from(rootArticle.querySelectorAll('[data-ad-preview="message"], [data-testid="post_message"]')).filter(
          (el) => !insideCommentThread(el)
        );
        captionExclusionText = storyMsgs.map((el) => (el as HTMLElement).innerText).join('\n');
        // เผื่อ selector เฉพาะไม่เจอ: ใช้สำเนา rootArticle แล้วตัดส่วนคอมเมนต์ออกก่อนอ่านข้อความ
        if (!captionExclusionText.trim()) {
          try {
            const clone = rootArticle.cloneNode(true) as HTMLElement;
            const dropSel = [
              '[aria-label*="Comment by" i]',
              '[aria-label*="ความคิดเห็นโดย" i]',
              '[aria-label*="ความคิดเห็นของ" i]',
              '[aria-label*="Commenter" i]',
              '[role="article"] [role="article"]',
              '[data-testid*="UFI2Comment" i]',
              '[data-testid*="comment" i]',
            ].join(',');
            clone.querySelectorAll(dropSel).forEach((n) => n.remove());
            captionExclusionText = (clone as HTMLElement).innerText || '';
          } catch {
            /* ignore */
          }
        }
      }

      const primarySelectors = [
        '[aria-label*="Comment by" i]',
        '[aria-label*="ความคิดเห็นโดย" i]',
        '[aria-label*="ความคิดเห็นของ" i]',
        '[aria-label*="Commenter" i]',
        '[aria-label*="comment by" i]',
      ];
      for (const sel of primarySelectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => {
            pushBlock((el as HTMLElement).innerText);
          });
        } catch {
          /* ignore */
        }
      }

      if (out.length === 0) {
        const arts = Array.from(document.querySelectorAll('[role="article"]'));
        for (let i = 1; i < arts.length; i++) {
          pushBlock((arts[i] as HTMLElement).innerText);
        }
      }

      return { commentBlocks: out, captionExclusionText };
    }, [...excludedNames])
    .catch((): EvalOut => ({ commentBlocks: [], captionExclusionText: '' }));

  const commentBlocks = Array.isArray(evaluated?.commentBlocks) ? evaluated.commentBlocks : [];
  let commentBlob = commentBlocks.length > 0 ? commentBlocks.join('\n') : '';
  if (!commentBlob) {
    for (let i = 1; i < maxN; i++) {
      commentBlob += '\n' + (await articles.nth(i).innerText().catch(() => ''));
    }
  }

  const postBodyPhones = extractPhonesFromText(postBodyText);
  const captionExclusionPhones = normalizedPhoneSetFromText(String(evaluated?.captionExclusionText || ''));
  const postBodyPhoneSet = normalizedPhoneSetFromText(postBodyText);
  for (const p of postBodyPhones) {
    const n0 = normalizeThaiPhoneDigits(p);
    if (n0) postBodyPhoneSet.add(n0);
  }
  const excludeFromComments = new Set<string>([...captionExclusionPhones, ...postBodyPhoneSet]);

  const phonesRaw = extractPhonesFromText(commentBlob);
  const phonesDedup: string[] = [];
  const seenNorm = new Set<string>();
  for (const p of phonesRaw) {
    const norm = normalizeThaiPhoneDigits(p);
    if (!norm || excludeFromComments.has(norm) || seenNorm.has(norm)) continue;
    seenNorm.add(norm);
    phonesDedup.push(norm);
  }
  const phones = phonesDedup;

  const commentCount =
    commentBlocks.length > 0 ? commentBlocks.length : Math.max(0, n - 1);
  return { phones, commentCount, postBodyPhones };
}
